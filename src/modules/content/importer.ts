/**
 * Imports a validated course package into the database (used by the seed and
 * by CMS bulk import). Works with any PrismaClient (no server-only imports).
 */
import type { AuthorType, ContentStatus, Prisma, PrismaClient, QuestionType } from "@prisma/client";
import { labRuleSchema } from "@/modules/labs/engine/rules";
import { validateLabConfig, type LabTypeValue } from "@/modules/labs/engine/schemas";
import { lessonToBlocks, lessonTranslationBlocks } from "./blocks";
import type { CoursePackage, GlossaryTermInput, LabInput, LessonInput, QuestionInput, SourceRef } from "./package-schema";

type Tx = Prisma.TransactionClient;
type Json = Prisma.InputJsonValue;

export type ImportOptions = {
  status: ContentStatus;
  authorType: AuthorType;
  actorId?: string | null;
  dryRun?: boolean;
  now?: Date;
};

export type ImportReport = {
  certificationCode: string;
  dryRun: boolean;
  created: Record<string, number>;
  updated: Record<string, number>;
  warnings: string[];
  errors: string[];
};

const j = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null)) as Json;

function count(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

// ------------------------------------------------------------------ question payload mapping

export function mapQuestionPayload(q: QuestionInput): { interaction: unknown; answerKey: unknown } {
  switch (q.type) {
    case "MULTIPLE_RESPONSE":
      return { interaction: { selectCount: q.selectCount ?? q.options?.filter((o) => o.correct).length ?? 2 }, answerKey: null };
    case "MATCHING": {
      const m = q.matching!;
      return { interaction: { prompts: m.prompts, answers: m.answers }, answerKey: { pairs: m.pairs, explanations: m.explanations } };
    }
    case "ORDERING": {
      const o = q.ordering!;
      return { interaction: { items: o.items }, answerKey: { correctOrder: o.correctOrder, explanations: o.explanations ?? {} } };
    }
    case "CATEGORIZATION": {
      const c = q.categorization!;
      return {
        interaction: { categories: c.categories, items: c.items.map((i) => ({ id: i.id, text: i.text })) },
        answerKey: {
          placements: Object.fromEntries(c.items.map((i) => [i.id, i.category])),
          explanations: Object.fromEntries(c.items.map((i) => [i.id, i.explanation])),
        },
      };
    }
    case "FILL_IN_BLANK": {
      const f = q.fillInBlank!;
      return {
        interaction: { template: f.template, blanks: f.blanks.map((b) => ({ id: b.id })), wordBank: f.wordBank },
        answerKey: { blanks: Object.fromEntries(f.blanks.map((b) => [b.id, { accepted: b.accepted, explanation: b.explanation }])) },
      };
    }
    case "CASE_STUDY": {
      const cs = q.caseStudy!;
      return {
        interaction: { statements: cs.statements.map((s) => ({ id: s.id, text: s.text })) },
        answerKey: {
          answers: Object.fromEntries(cs.statements.map((s) => [s.id, s.answer])),
          explanations: Object.fromEntries(cs.statements.map((s) => [s.id, s.explanation])),
        },
      };
    }
    case "UI_SIMULATION": {
      const u = q.uiSimulation!;
      return {
        interaction: {
          title: u.title,
          description: u.description,
          fields: u.fields.map((f) => ({ id: f.id, label: f.label, control: f.control, options: f.options })),
        },
        answerKey: {
          values: Object.fromEntries(u.fields.map((f) => [f.id, f.correct])),
          explanations: Object.fromEntries(u.fields.map((f) => [f.id, f.explanation])),
        },
      };
    }
    default:
      return { interaction: null, answerKey: null };
  }
}

export function mapQuestionTranslation(q: QuestionInput) {
  const t = q.translations?.tr;
  if (!t) return null;
  let interaction: unknown = null;
  let answerExplanations: unknown = null;
  switch (q.type) {
    case "MATCHING":
      interaction = { prompts: t.matching?.prompts, answers: t.matching?.answers };
      answerExplanations = { explanations: t.matching?.explanations };
      break;
    case "ORDERING":
      interaction = { items: t.ordering?.items };
      answerExplanations = { explanations: t.ordering?.explanations };
      break;
    case "CATEGORIZATION":
      interaction = { categories: t.categorization?.categories, items: t.categorization?.items };
      answerExplanations = { explanations: t.categorization?.explanations };
      break;
    case "FILL_IN_BLANK":
      interaction = { template: t.fillInBlank?.template, wordBank: t.fillInBlank?.wordBank };
      answerExplanations = { explanations: t.fillInBlank?.explanations, accepted: t.fillInBlank?.accepted };
      break;
    case "CASE_STUDY":
      interaction = { statements: t.caseStudy?.statements };
      answerExplanations = { explanations: t.caseStudy?.explanations };
      break;
    case "UI_SIMULATION":
      interaction = { title: t.uiSimulation?.title, description: t.uiSimulation?.description, fields: t.uiSimulation?.fields };
      answerExplanations = { explanations: t.uiSimulation?.explanations };
      break;
  }
  return {
    locale: "tr",
    stem: t.stem,
    scenario: t.scenario ?? null,
    explanation: t.explanation,
    options: t.options ?? null,
    interaction,
    answerExplanations,
    status: t.status,
  };
}

/** Snapshot of all question content (stored in QuestionVersion). */
export function questionSnapshot(q: QuestionInput) {
  return j(q);
}

// ------------------------------------------------------------------ importer

export async function importCoursePackage(db: PrismaClient, pkg: CoursePackage, opts: ImportOptions): Promise<ImportReport> {
  const report: ImportReport = { certificationCode: pkg.certificationCode, dryRun: !!opts.dryRun, created: {}, updated: {}, warnings: [], errors: [] };
  const now = opts.now ?? new Date();

  const cert = await db.certification.findUnique({ where: { code: pkg.certificationCode } });
  if (!cert && !pkg.certification) {
    report.errors.push(`Certification ${pkg.certificationCode} does not exist. Add it to the catalog first or include a "certification" block.`);
    return report;
  }
  if (opts.dryRun) {
    const lessons = pkg.domains.flatMap((d) => d.modules.flatMap((m) => m.lessons));
    report.created = {
      domains: pkg.domains.length,
      modules: pkg.domains.reduce((s, d) => s + d.modules.length, 0),
      lessons: lessons.length,
      questions: lessons.reduce((s, l) => s + l.knowledgeCheck.length, 0) + pkg.practiceQuestions.length,
      glossary: pkg.glossary.length,
      labs: pkg.labs.length,
    };
    for (const lab of pkg.labs) {
      const v = validateLabConfig(lab.type as LabTypeValue, lab.config);
      if (!v.ok) report.errors.push(...v.errors.map((e) => `lab ${lab.slug}: ${e}`));
    }
    return report;
  }

  await db.$transaction(
    async (tx) => {
      const certId = cert ? cert.id : await createCertificationFromPackage(tx, pkg, report);
      const certification = await tx.certification.findUniqueOrThrow({ where: { id: certId } });
      const sourceCache = new Map<string, string>();
      const sourceId = async (s: SourceRef) => {
        const hit = sourceCache.get(s.url);
        if (hit) return hit;
        const row = await tx.officialSource.upsert({
          where: { url: s.url },
          create: { url: s.url, title: s.title, kind: s.kind ?? "DOCUMENTATION", certificationId: certId, lastVerifiedAt: now },
          update: {},
        });
        sourceCache.set(s.url, row.id);
        return row.id;
      };

      // Domains and objectives
      const domainIds = new Map<string, string>();
      const objectiveIds = new Map<string, string>();
      for (const [di, d] of pkg.domains.entries()) {
        const existing = await tx.examDomain.findUnique({ where: { certificationId_key: { certificationId: certId, key: d.key } } });
        const data = {
          title: d.title,
          description: d.description ?? null,
          weightMin: d.weightMin,
          weightMax: d.weightMax,
          sortOrder: di,
          translations: d.translations ? j(d.translations) : undefined,
        };
        const domain = existing
          ? await tx.examDomain.update({ where: { id: existing.id }, data })
          : await tx.examDomain.create({ data: { ...data, certificationId: certId, key: d.key } });
        count(existing ? report.updated : report.created, "domains");
        domainIds.set(d.key, domain.id);
        for (const [oi, o] of d.objectives.entries()) {
          const obj = await tx.examObjective.upsert({
            where: { domainId_code: { domainId: domain.id, code: o.code } },
            create: { domainId: domain.id, code: o.code, title: o.title, sortOrder: oi, translations: o.translations ? j(o.translations) : undefined },
            update: { title: o.title, sortOrder: oi, translations: o.translations ? j(o.translations) : undefined },
          });
          objectiveIds.set(`${d.key}:${o.code}`, obj.id);
        }
      }

      // Modules and lessons (questions are linked to lessons afterwards)
      const lessonIds = new Map<string, string>();
      const lessonQuestions: { lesson: LessonInput; lessonId: string; domainKey: string }[] = [];
      let moduleOrder = 0;
      for (const d of pkg.domains) {
        const domainId = domainIds.get(d.key)!;
        for (const m of d.modules) {
          const minutes = m.lessons.reduce((s, l) => s + l.estimatedMinutes, 0);
          const existing = await tx.module.findUnique({ where: { certificationId_slug: { certificationId: certId, slug: m.slug } } });
          const data = {
            domainId,
            title: m.title,
            summary: m.summary,
            sortOrder: moduleOrder++,
            estimatedMinutes: minutes,
            status: opts.status,
            curriculumVersion: certification.currentVersion,
            translations: m.translations ? j(m.translations) : undefined,
            isDemo: pkg.isDemo,
          };
          const mod = existing
            ? await tx.module.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
            : await tx.module.create({ data: { ...data, certificationId: certId, slug: m.slug } });
          count(existing ? report.updated : report.created, "modules");

          for (const [li, l] of m.lessons.entries()) {
            const lessonId = await upsertLesson(tx, { lesson: l, certId, domainId, moduleId: mod.id, objectiveId: l.objectiveCode ? objectiveIds.get(`${d.key}:${l.objectiveCode}`) ?? null : null, sortOrder: li, pkg, opts, now, report, sourceId, curriculumVersion: certification.currentVersion });
            lessonIds.set(l.slug, lessonId);
            lessonQuestions.push({ lesson: l, lessonId, domainKey: d.key });
          }
        }
      }

      const ctx = { tx, certId, domainIds, objectiveIds, lessonIds, opts, now, report, sourceId, isDemo: pkg.isDemo };
      for (const { lesson, lessonId } of lessonQuestions) {
        const ids: string[] = [];
        for (const q of lesson.knowledgeCheck) ids.push(await upsertQuestion(ctx, q, lessonId));
        const quiz = await tx.quiz.findFirst({ where: { lessonId, kind: "KNOWLEDGE_CHECK" } });
        const quizRow = quiz
          ? await tx.quiz.update({ where: { id: quiz.id }, data: { title: lesson.title, questionCount: ids.length } })
          : await tx.quiz.create({
              data: { kind: "KNOWLEDGE_CHECK", certificationId: certId, domainId: domainIds.get(lessonQuestions.find((x) => x.lessonId === lessonId)!.domainKey), lessonId, title: lesson.title, questionCount: ids.length, passPercent: 80 },
            });
        await tx.quizQuestion.deleteMany({ where: { quizId: quizRow.id } });
        await tx.quizQuestion.createMany({ data: ids.map((questionId, i) => ({ quizId: quizRow.id, questionId, sortOrder: i })) });
      }
      for (const q of pkg.practiceQuestions) {
        await upsertQuestion(ctx, q, q.lessonSlug ? lessonIds.get(q.lessonSlug) ?? (await findLessonId(tx, certId, q.lessonSlug)) : null);
      }

      // Dynamic quizzes: one domain assessment per domain and one diagnostic per certification.
      for (const d of pkg.domains) {
        const domainId = domainIds.get(d.key)!;
        const existing = await tx.quiz.findFirst({ where: { domainId, kind: "DOMAIN_ASSESSMENT" } });
        if (!existing) {
          await tx.quiz.create({ data: { kind: "DOMAIN_ASSESSMENT", certificationId: certId, domainId, title: d.title, questionCount: 10, passPercent: 75 } });
          count(report.created, "quizzes");
        }
      }
      if (!(await tx.quiz.findFirst({ where: { certificationId: certId, kind: "DIAGNOSTIC" } }))) {
        await tx.quiz.create({ data: { kind: "DIAGNOSTIC", certificationId: certId, title: `${pkg.certificationCode} diagnostic`, questionCount: 10, passPercent: 0 } });
        count(report.created, "quizzes");
      }

      for (const term of pkg.glossary) await upsertGlossaryTerm(tx, term, certId, pkg.certificationCode, sourceId, report, pkg.isDemo);
      for (const lab of pkg.labs) await upsertLab(ctx, lab);

      const hasLessons = lessonIds.size > 0;
      await tx.certification.update({ where: { id: certId }, data: { hasLearningPath: hasLessons || certification.hasLearningPath } });

      if (!(await tx.practiceExam.findFirst({ where: { certificationId: certId, mode: "FULL" } }))) {
        const total = await tx.question.count({ where: { certificationId: certId } });
        await tx.practiceExam.create({
          data: {
            certificationId: certId,
            mode: "FULL",
            title: `${pkg.certificationCode} full practice exam`,
            questionCount: Math.min(40, Math.max(10, total)),
            timeLimitMinutes: 45,
            targetPercent: 75,
            blueprint: j(pkg.domains.map((d) => ({ key: d.key, weightMin: d.weightMin, weightMax: d.weightMax }))),
          },
        });
        count(report.created, "practiceExams");
      }
    },
    { timeout: 300_000, maxWait: 20_000 },
  );
  return report;
}

async function findLessonId(tx: Tx, certificationId: string, slug: string): Promise<string | null> {
  const l = await tx.lesson.findUnique({ where: { certificationId_slug: { certificationId, slug } }, select: { id: true } });
  return l?.id ?? null;
}

async function createCertificationFromPackage(tx: Tx, pkg: CoursePackage, report: ImportReport): Promise<string> {
  const c = pkg.certification!;
  const created = await tx.certification.create({
    data: {
      code: c.code,
      slug: c.code.toLowerCase(),
      name: c.name,
      description: c.description,
      audience: c.audience,
      status: c.status,
      examVersion: c.examVersion,
      officialUrl: c.officialUrl,
      studyGuideUrl: c.studyGuideUrl,
      lastCurriculumReviewAt: c.lastCurriculumReviewAt ? new Date(`${c.lastCurriculumReviewAt}T00:00:00Z`) : null,
      retirementDate: c.retirementDate ? new Date(`${c.retirementDate}T00:00:00Z`) : null,
      estimatedStudyHoursMin: c.estimatedStudyHours?.min,
      estimatedStudyHoursMax: c.estimatedStudyHours?.max,
      recommendedPrerequisites: c.recommendedPrerequisites,
      icon: c.icon,
      themeColor: c.themeColor,
      sortOrder: c.sortOrder ?? 100,
      unverifiedFields: c.unverifiedFields,
      verificationNotes: c.verificationNotes,
      translations: c.translations ? j(c.translations) : undefined,
    },
  });
  count(report.created, "certifications");
  return created.id;
}

type UpsertLessonArgs = {
  lesson: LessonInput;
  certId: string;
  domainId: string;
  moduleId: string;
  objectiveId: string | null;
  sortOrder: number;
  pkg: CoursePackage;
  opts: ImportOptions;
  now: Date;
  report: ImportReport;
  sourceId: (s: SourceRef) => Promise<string>;
  curriculumVersion: number;
};

async function upsertLesson(tx: Tx, a: UpsertLessonArgs): Promise<string> {
  const l = a.lesson;
  const existing = await tx.lesson.findUnique({ where: { certificationId_slug: { certificationId: a.certId, slug: l.slug } } });
  const published = a.opts.status === "PUBLISHED";
  const data = {
    domainId: a.domainId,
    moduleId: a.moduleId,
    objectiveId: a.objectiveId,
    title: l.title,
    summary: l.summary,
    estimatedMinutes: l.estimatedMinutes,
    sortOrder: a.sortOrder,
    status: a.opts.status,
    sourceLocale: a.pkg.sourceLocale,
    authorType: a.opts.authorType,
    authorId: a.opts.actorId ?? null,
    needsVerification: l.needsVerification ?? false,
    verificationNote: l.verificationNote ?? null,
    curriculumVersion: a.curriculumVersion,
    lastReviewedAt: published ? a.now : null,
    publishedAt: published ? a.now : null,
    isDemo: a.pkg.isDemo,
  };
  const lesson = existing
    ? await tx.lesson.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
    : await tx.lesson.create({ data: { ...data, certificationId: a.certId, slug: l.slug } });
  count(existing ? a.report.updated : a.report.created, "lessons");

  await tx.contentBlock.deleteMany({ where: { lessonId: lesson.id } });
  await tx.contentBlock.createMany({
    data: lessonToBlocks(l).map((b) => ({ lessonId: lesson.id, key: b.key, type: b.type as never, sortOrder: b.sortOrder, data: j(b.data) })),
  });

  await tx.lessonSource.deleteMany({ where: { lessonId: lesson.id } });
  const sourceIds = [...new Set(await Promise.all(l.sources.map(a.sourceId)))];
  await tx.lessonSource.createMany({ data: sourceIds.map((sourceId) => ({ lessonId: lesson.id, sourceId })) });

  const tr = l.translations?.tr;
  if (tr) {
    const tData = {
      title: tr.title,
      summary: tr.summary ?? null,
      blocks: j(lessonTranslationBlocks(tr)),
      status: tr.status,
      translatedBy: a.opts.authorType === "SEED_DEMO" ? "seed" : "import",
      sourceVersion: lesson.version,
    };
    await tx.lessonTranslation.upsert({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "tr" } },
      create: { lessonId: lesson.id, locale: "tr", ...tData },
      update: tData,
    });
  }

  await tx.flashcard.deleteMany({ where: { lessonId: lesson.id } });
  await tx.flashcard.createMany({
    data: l.flashcards.map((f, i) => ({
      certificationId: a.certId,
      lessonId: lesson.id,
      front: f.front,
      back: f.back,
      status: a.opts.status,
      sortOrder: i,
      isDemo: a.pkg.isDemo,
      translations: tr?.flashcards?.[i] ? j({ tr: tr.flashcards[i] }) : undefined,
    })),
  });

  await tx.contentRevision.upsert({
    where: { entityType_entityId_version: { entityType: "LESSON", entityId: lesson.id, version: lesson.version } },
    create: { entityType: "LESSON", entityId: lesson.id, version: lesson.version, snapshot: j(l), changeNote: existing ? "Imported update" : "Initial import", createdById: a.opts.actorId ?? null },
    update: { snapshot: j(l) },
  });
  return lesson.id;
}

type Ctx = {
  tx: Tx;
  certId: string;
  domainIds: Map<string, string>;
  objectiveIds: Map<string, string>;
  lessonIds: Map<string, string>;
  opts: ImportOptions;
  now: Date;
  report: ImportReport;
  sourceId: (s: SourceRef) => Promise<string>;
  isDemo: boolean;
};

async function upsertQuestion(ctx: Ctx, q: QuestionInput, lessonId: string | null): Promise<string> {
  const { tx } = ctx;
  const domainId = ctx.domainIds.get(q.domainKey);
  if (!domainId) throw new Error(`Unknown domain ${q.domainKey} for ${q.ref}`);
  const { interaction, answerKey } = mapQuestionPayload(q);
  const existing = await tx.question.findUnique({ where: { code: q.ref } });
  const snapshot = questionSnapshot(q);
  const changed = existing ? JSON.stringify((await tx.questionVersion.findFirst({ where: { questionId: existing.id }, orderBy: { version: "desc" } }))?.snapshot) !== JSON.stringify(snapshot) : true;
  const published = ctx.opts.status === "PUBLISHED";
  const data = {
    certificationId: ctx.certId,
    domainId,
    objectiveId: q.objectiveCode ? ctx.objectiveIds.get(`${q.domainKey}:${q.objectiveCode}`) ?? null : null,
    lessonId,
    type: q.type as QuestionType,
    difficulty: q.difficulty,
    stem: q.stem,
    scenario: q.scenario ?? null,
    explanation: q.explanation,
    interaction: interaction === null ? undefined : j(interaction),
    answerKey: answerKey === null ? undefined : j(answerKey),
    shuffleOptions: q.shuffleOptions ?? true,
    status: ctx.opts.status,
    authorType: ctx.opts.authorType,
    authorId: ctx.opts.actorId ?? null,
    generationSource: ctx.opts.authorType === "SEED_DEMO" ? "seed:course-package" : "import:course-package",
    needsVerification: q.needsVerification ?? false,
    lastReviewedAt: published ? ctx.now : null,
    publishedAt: published ? ctx.now : null,
    isDemo: ctx.isDemo,
  };
  const question = existing
    ? await tx.question.update({ where: { id: existing.id }, data: { ...data, version: changed ? { increment: 1 } : undefined } })
    : await tx.question.create({ data: { ...data, code: q.ref } });
  count(existing ? ctx.report.updated : ctx.report.created, "questions");

  await tx.questionOption.deleteMany({ where: { questionId: question.id } });
  if (q.options?.length) {
    await tx.questionOption.createMany({
      data: q.options.map((o, i) => ({ questionId: question.id, key: o.key, text: o.text, isCorrect: o.correct, explanation: o.explanation, sortOrder: i })),
    });
  }

  const t = mapQuestionTranslation(q);
  if (t) {
    const tData = {
      stem: t.stem,
      scenario: t.scenario,
      explanation: t.explanation,
      options: t.options ? j(t.options) : undefined,
      interaction: t.interaction ? j(t.interaction) : undefined,
      answerExplanations: t.answerExplanations ? j(t.answerExplanations) : undefined,
      status: t.status,
      translatedBy: ctx.opts.authorType === "SEED_DEMO" ? "seed" : "import",
      sourceVersion: question.version,
    };
    await tx.questionTranslation.upsert({
      where: { questionId_locale: { questionId: question.id, locale: "tr" } },
      create: { questionId: question.id, locale: "tr", ...tData },
      update: tData,
    });
  }

  await tx.questionSource.deleteMany({ where: { questionId: question.id } });
  const sourceIds = [...new Set(await Promise.all(q.sources.map(ctx.sourceId)))];
  await tx.questionSource.createMany({ data: sourceIds.map((sourceId) => ({ questionId: question.id, sourceId })) });

  if (changed) {
    await tx.questionVersion.upsert({
      where: { questionId_version: { questionId: question.id, version: question.version } },
      create: { questionId: question.id, version: question.version, snapshot, status: ctx.opts.status, changeNote: existing ? "Imported update" : "Initial import", createdById: ctx.opts.actorId ?? null },
      update: { snapshot, status: ctx.opts.status },
    });
  }
  return question.id;
}

async function upsertGlossaryTerm(
  tx: Tx,
  term: GlossaryTermInput,
  certId: string,
  certCode: string,
  sourceId: (s: SourceRef) => Promise<string>,
  report: ImportReport,
  isDemo: boolean,
) {
  const src = term.source ? await sourceId(term.source) : null;
  const existing = await tx.glossaryTerm.findUnique({ where: { slug: term.slug } });
  const data = {
    term: term.term,
    definition: term.definition,
    kind: term.kind,
    attributes: term.attributes ? j(term.attributes) : undefined,
    sourceId: src,
    translations: term.translations ? j(term.translations) : undefined,
    status: "PUBLISHED" as const,
    isDemo,
  };
  const row = existing ? await tx.glossaryTerm.update({ where: { id: existing.id }, data }) : await tx.glossaryTerm.create({ data: { ...data, slug: term.slug } });
  count(existing ? report.updated : report.created, "glossary");
  const codes = [...new Set([certCode, ...(term.certifications ?? [])])];
  const certs = await tx.certification.findMany({ where: { code: { in: codes } }, select: { id: true } });
  for (const c of certs) {
    await tx.glossaryTermCertification.upsert({
      where: { termId_certificationId: { termId: row.id, certificationId: c.id } },
      create: { termId: row.id, certificationId: c.id },
      update: {},
    });
  }
  void certId;
}

async function upsertLab(ctx: Ctx, lab: LabInput) {
  const { tx } = ctx;
  const validation = validateLabConfig(lab.type as LabTypeValue, lab.config);
  if (!validation.ok) throw new Error(`Lab ${lab.slug} has an invalid configuration: ${validation.errors.join("; ")}`);
  for (const rule of [...lab.steps.flatMap((s) => s.rules), ...lab.finalRules]) {
    const parsed = labRuleSchema.safeParse(rule.rule);
    if (!parsed.success) throw new Error(`Lab ${lab.slug} rule ${rule.key} is invalid`);
  }
  const moduleRow = lab.moduleSlug ? await tx.module.findUnique({ where: { certificationId_slug: { certificationId: ctx.certId, slug: lab.moduleSlug } } }) : null;
  const domainId = lab.domainKey ? ctx.domainIds.get(lab.domainKey) ?? null : moduleRow?.domainId ?? null;
  const published = ctx.opts.status === "PUBLISHED";
  const existing = await tx.lab.findUnique({ where: { certificationId_slug: { certificationId: ctx.certId, slug: lab.slug } } });
  const data = {
    domainId,
    moduleId: moduleRow?.id ?? null,
    objectiveId: lab.domainKey && lab.objectiveCode ? ctx.objectiveIds.get(`${lab.domainKey}:${lab.objectiveCode}`) ?? null : null,
    type: lab.type,
    title: lab.title,
    summary: lab.summary,
    scenario: lab.scenario,
    learningObjectives: lab.learningObjectives,
    prerequisites: lab.prerequisites,
    complexity: lab.complexity,
    estimatedMinutes: lab.estimatedMinutes,
    config: j(validation.config),
    solution: lab.solution,
    status: ctx.opts.status,
    translations: lab.translations ? j(lab.translations) : undefined,
    authorType: ctx.opts.authorType,
    lastReviewedAt: published ? ctx.now : null,
    publishedAt: published ? ctx.now : null,
    isDemo: ctx.isDemo,
  };
  const row = existing
    ? await tx.lab.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
    : await tx.lab.create({ data: { ...data, certificationId: ctx.certId, slug: lab.slug } });
  count(existing ? ctx.report.updated : ctx.report.created, "labs");

  await tx.labValidationRule.deleteMany({ where: { labId: row.id } });
  await tx.labStep.deleteMany({ where: { labId: row.id } });
  let ruleOrder = 0;
  for (const [si, step] of lab.steps.entries()) {
    const s = await tx.labStep.create({
      data: { labId: row.id, key: step.key, sortOrder: si, title: step.title, instruction: step.instruction, hint: step.hint, explanation: step.explanation, targetId: step.targetId },
    });
    for (const rule of step.rules) {
      await tx.labValidationRule.create({
        data: { labId: row.id, stepId: s.id, key: rule.key, description: rule.description, rule: j(rule.rule), successFeedback: rule.successFeedback, failureFeedback: rule.failureFeedback, sortOrder: ruleOrder++ },
      });
    }
  }
  for (const rule of lab.finalRules) {
    await tx.labValidationRule.create({
      data: { labId: row.id, key: rule.key, description: rule.description, rule: j(rule.rule), successFeedback: rule.successFeedback, failureFeedback: rule.failureFeedback, sortOrder: ruleOrder++ },
    });
  }
  await tx.labSource.deleteMany({ where: { labId: row.id } });
  const sourceIds = [...new Set(await Promise.all(lab.sources.map(ctx.sourceId)))];
  await tx.labSource.createMany({ data: sourceIds.map((sourceId) => ({ labId: row.id, sourceId })) });
  await tx.contentRevision.upsert({
    where: { entityType_entityId_version: { entityType: "LAB", entityId: row.id, version: row.version } },
    create: { entityType: "LAB", entityId: row.id, version: row.version, snapshot: j(lab), changeNote: existing ? "Imported update" : "Initial import" },
    update: { snapshot: j(lab) },
  });
}
