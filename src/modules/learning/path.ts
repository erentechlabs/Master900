import "server-only";
import { prisma } from "@/lib/db";
import { localizedField } from "@/i18n/translator";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { domainMastery } from "@/modules/analytics/data";

import { orderLessons, progressPercent, recommendedNextLesson, type OrderedLesson } from "@/modules/learning/path-utils";
export { orderLessons, progressPercent, recommendedNextLesson, type OrderedLesson } from "@/modules/learning/path-utils";

function weakDomainIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const ids = (value as { weakDomainIds?: unknown }).weakDomainIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

const moduleVisibleStatuses = ["PUBLISHED", "OUTDATED"] as const;

export async function listMyLearning(userId: string, locale: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: "ACTIVE", certification: { isVisible: true } },
    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
    include: { certification: true },
  });
  return Promise.all(
    enrollments.map(async (enrollment) => {
      const lessons = await prisma.lesson.findMany({
        where: { certificationId: enrollment.certificationId, AND: [learnerVisibleWhere()] },
        orderBy: [{ domain: { sortOrder: "asc" } }, { module: { sortOrder: "asc" } }, { sortOrder: "asc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          domainId: true,
          sortOrder: true,
          moduleId: true,
          domain: { select: { sortOrder: true } },
          module: { select: { sortOrder: true } },
          progress: { where: { userId }, select: { status: true }, take: 1 },
        },
      });
      const ordered = orderLessons(
        lessons.map((lesson) => ({
          id: lesson.id,
          slug: lesson.slug,
          title: lesson.title,
          domainId: lesson.domainId,
          domainSort: lesson.domain.sortOrder,
          moduleId: lesson.moduleId,
          moduleSort: lesson.module.sortOrder,
          sortOrder: lesson.sortOrder,
          progressStatus: lesson.progress[0]?.status ?? null,
        })),
      );
      const completed = ordered.filter((lesson) => lesson.progressStatus === "COMPLETED").length;
      return {
        enrollment,
        certification: {
          id: enrollment.certification.id,
          code: enrollment.certification.code,
          name: localizedField(enrollment.certification.name, enrollment.certification.translations, locale, "name"),
          description: localizedField(enrollment.certification.description, enrollment.certification.translations, locale, "description"),
          icon: enrollment.certification.icon,
          themeColor: enrollment.certification.themeColor,
          status: enrollment.certification.status,
          isDemoContent: await prisma.lesson.count({ where: { certificationId: enrollment.certificationId, isDemo: true } }) > 0,
        },
        totalLessons: ordered.length,
        completedLessons: completed,
        progress: progressPercent(completed, ordered.length),
        nextLesson: recommendedNextLesson(ordered, weakDomainIds(enrollment.diagnosticResult)),
      };
    }),
  );
}

export async function getLearningPath(code: string, userId: string, locale: string) {
  const certification = await prisma.certification.findFirst({ where: { code: code.toUpperCase(), isVisible: true } });
  if (!certification) return null;
  const [enrollment, domains, progressRows, quizzes, labs, alerts, mastery] = await Promise.all([
    prisma.enrollment.findUnique({ where: { userId_certificationId: { userId, certificationId: certification.id } } }),
    prisma.examDomain.findMany({
      where: { certificationId: certification.id },
      orderBy: { sortOrder: "asc" },
      include: {
        modules: {
          where: { certificationId: certification.id, status: { in: [...moduleVisibleStatuses] } },
          orderBy: { sortOrder: "asc" },
          include: {
            lessons: {
              where: { AND: [{ certificationId: certification.id }, learnerVisibleWhere()] },
              orderBy: { sortOrder: "asc" },
              include: { quizzes: { where: { kind: "KNOWLEDGE_CHECK" }, select: { id: true, passPercent: true, questionCount: true } } },
            },
          },
        },
      },
    }),
    prisma.lessonProgress.findMany({ where: { userId, lesson: { certificationId: certification.id } } }),
    prisma.quiz.findMany({ where: { certificationId: certification.id, kind: "DOMAIN_ASSESSMENT" }, include: { attempts: { where: { userId, status: "SUBMITTED" }, select: { score: true } } } }),
    prisma.lab.findMany({ where: { certificationId: certification.id, AND: [learnerVisibleWhere()] }, orderBy: [{ domain: { sortOrder: "asc" } }, { sortOrder: "asc" }] }),
    prisma.curriculumAlert.findMany({ where: { certificationId: certification.id, resolvedAt: null }, orderBy: { createdAt: "desc" } }),
    domainMastery(prisma, userId, certification.id),
  ]);
  const progress = new Map(progressRows.map((row) => [row.lessonId, row]));
  const weakIds = weakDomainIds(enrollment?.diagnosticResult);
  const allLessons: OrderedLesson[] = [];
  const localizedDomains = domains.map((domain) => {
    const modules = domain.modules.map((module) => ({
      id: module.id,
      slug: module.slug,
      title: localizedField(module.title, module.translations, locale, "title"),
      summary: module.summary ? localizedField(module.summary, module.translations, locale, "summary") : null,
      lessons: module.lessons.map((lesson) => {
        const status = progress.get(lesson.id)?.status ?? null;
        const item = {
          id: lesson.id,
          slug: lesson.slug,
          title: lesson.title,
          domainId: lesson.domainId,
          domainSort: domain.sortOrder,
          moduleId: lesson.moduleId,
          moduleSort: module.sortOrder,
          sortOrder: lesson.sortOrder,
          progressStatus: status,
        } satisfies OrderedLesson;
        allLessons.push(item);
        return {
          id: lesson.id,
          slug: lesson.slug,
          title: lesson.title,
          summary: lesson.summary,
          estimatedMinutes: lesson.estimatedMinutes,
          status: lesson.status,
          progressStatus: status,
          knowledgeCheckScore: progress.get(lesson.id)?.knowledgeCheckScore ?? null,
          quiz: lesson.quizzes[0] ?? null,
        };
      }),
    }));
    const total = modules.reduce((sum, module) => sum + module.lessons.length, 0);
    const completed = modules.reduce((sum, module) => sum + module.lessons.filter((lesson) => lesson.progressStatus === "COMPLETED").length, 0);
    return {
      id: domain.id,
      key: domain.key,
      title: localizedField(domain.title, domain.translations, locale, "title"),
      description: domain.description ? localizedField(domain.description, domain.translations, locale, "description") : null,
      weightMin: domain.weightMin,
      weightMax: domain.weightMax,
      mastery: mastery.get(domain.id)?.accuracy ?? 0,
      isWeak: weakIds.includes(domain.id),
      progress: progressPercent(completed, total),
      modules,
    };
  });
  return {
    certification: {
      id: certification.id,
      code: certification.code,
      name: localizedField(certification.name, certification.translations, locale, "name"),
      description: localizedField(certification.description, certification.translations, locale, "description"),
      status: certification.status,
      icon: certification.icon,
      themeColor: certification.themeColor,
      isDemoContent: await prisma.lesson.count({ where: { certificationId: certification.id, isDemo: true } }) > 0,
      hasLearningPath: certification.hasLearningPath,
    },
    enrollment,
    domains: localizedDomains,
    alerts,
    quizzes: quizzes.map((quiz) => ({ ...quiz, bestScore: Math.max(0, ...quiz.attempts.map((attempt) => Math.round(attempt.score ?? 0))) })),
    labs: labs.map((lab) => ({ id: lab.id, slug: lab.slug, title: localizedField(lab.title, lab.translations, locale, "title"), summary: localizedField(lab.summary, lab.translations, locale, "summary"), estimatedMinutes: lab.estimatedMinutes })),
    recommendedNext: recommendedNextLesson(allLessons, weakIds),
    focusDomainIds: weakIds,
  };
}

