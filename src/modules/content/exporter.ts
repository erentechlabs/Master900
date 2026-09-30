import type { PrismaClient } from "@prisma/client";
import { blocksToLessonFields } from "@/modules/content/blocks";
import { validateCoursePackage } from "@/modules/content/package-schema";
import { questionToPackage } from "@/modules/admin/cms";
import { toCsv } from "@/lib/utils";

export async function exportCatalog(db: PrismaClient) {
  return db.certification.findMany({ orderBy: { sortOrder: "asc" }, include: { domains: { orderBy: { sortOrder: "asc" }, include: { objectives: { orderBy: { sortOrder: "asc" } } } } } });
}

export async function exportQuestionsCsv(db: PrismaClient, code: string) {
  const cert = await db.certification.findUnique({ where: { code }, include: { questions: { include: { domain: true, objective: true, options: true, sources: { include: { source: true } } } } } });
  const rows: unknown[][] = [["certification", "domain", "objective", "type", "difficulty", "stem", "correct", "explanation", "source_url"]];
  for (const q of cert?.questions ?? []) {
    rows.push([code, q.domain.key, q.objective?.code ?? "", q.type, q.difficulty, q.stem, q.options.filter((o) => o.isCorrect).map((o) => o.key).join("|"), q.explanation, q.sources[0]?.source.url ?? ""]);
  }
  return toCsv(rows);
}

export async function exportCoursePackage(db: PrismaClient, code: string) {
  const cert = await db.certification.findUnique({
    where: { code },
    include: {
      domains: { orderBy: { sortOrder: "asc" }, include: { objectives: { orderBy: { sortOrder: "asc" } }, modules: { orderBy: { sortOrder: "asc" }, include: { lessons: { orderBy: { sortOrder: "asc" }, include: { blocks: { orderBy: { sortOrder: "asc" } }, sources: { include: { source: true } }, questions: { include: { domain: true, objective: true, lesson: true, options: true, sources: { include: { source: true } }, translations: true } } } } } } } },
      questions: { where: { lessonId: null }, include: { domain: true, objective: true, lesson: true, options: true, sources: { include: { source: true } }, translations: true } },
    },
  });
  if (!cert) throw new Error("certification_not_found");
  const certification = {
      code: cert.code,
      name: cert.name,
      description: cert.description,
      audience: cert.audience ?? undefined,
      status: cert.status,
      examVersion: cert.examVersion,
      officialUrl: cert.officialUrl,
      studyGuideUrl: cert.studyGuideUrl,
      lastCurriculumReviewAt: cert.lastCurriculumReviewAt?.toISOString().slice(0, 10) ?? null,
      retirementDate: cert.retirementDate?.toISOString().slice(0, 10) ?? null,
      estimatedStudyHours: cert.estimatedStudyHoursMin && cert.estimatedStudyHoursMax ? { min: cert.estimatedStudyHoursMin, max: cert.estimatedStudyHoursMax } : null,
      recommendedPrerequisites: cert.recommendedPrerequisites,
      icon: cert.icon,
      themeColor: cert.themeColor,
      unverifiedFields: cert.unverifiedFields,
      verificationNotes: cert.verificationNotes ?? undefined,
      relatedCodes: [],
      domains: cert.domains.map((d) => ({ key: d.key, title: d.title, description: d.description ?? undefined, weightMin: d.weightMin, weightMax: d.weightMax, objectives: d.objectives.map((o) => ({ code: o.code, title: o.title, description: o.description ?? undefined })) })),
    };
  const pkg = {
    schemaVersion: 1,
    certificationCode: cert.code,
    contentVersionLabel: `export-${new Date().toISOString().slice(0, 10)}`,
    sourceLocale: "en",
    isDemo: false,
    certification,
    domains: cert.domains.map((d) => ({
      key: d.key,
      title: d.title,
      description: d.description ?? undefined,
      weightMin: d.weightMin,
      weightMax: d.weightMax,
      objectives: d.objectives.map((o) => ({ code: o.code, title: o.title, description: o.description ?? undefined })),
      modules: d.modules.map((m) => ({
        slug: m.slug,
        title: m.title,
        summary: m.summary ?? "",
        lessons: m.lessons.map((l) => ({
          slug: l.slug,
          title: l.title,
          objectiveCode: l.objectiveId ? d.objectives.find((o) => o.id === l.objectiveId)?.code : undefined,
          estimatedMinutes: l.estimatedMinutes,
          summary: l.summary ?? "",
          ...blocksToLessonFields(l.blocks),
          flashcards: [],
          sources: l.sources.map((s) => ({ title: s.source.title, url: s.source.url })),
          knowledgeCheck: l.questions.map(questionToPackage),
          needsVerification: l.needsVerification,
          verificationNote: l.verificationNote ?? undefined,
        })),
      })),
    })),
    practiceQuestions: cert.questions.map(questionToPackage),
    glossary: [],
    labs: [],
  };
  const validation = validateCoursePackage(pkg);
  if (!validation.ok) throw new Error(validation.issues.map((i) => i.message).join("; "));
  return validation.pkg;
}
