import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { localizedField, pickTranslated } from "@/i18n/translator";
import { todayISO } from "@/lib/dates";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { XP_RULES } from "@/modules/analytics/gamification";
import { awardBadges, computeAndStoreReadiness } from "@/modules/analytics/data";
import type { CurrentUser } from "@/modules/auth/session";

export type LessonBlockView = { key: string; type: string; data: unknown };

function asBlockMap(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function getLessonPageData(code: string, slug: string, user: CurrentUser, locale: string) {
  const certification = await prisma.certification.findFirst({ where: { code: code.toUpperCase(), isVisible: true } });
  if (!certification) return null;
  const lesson = await prisma.lesson.findFirst({
    where: { certificationId: certification.id, slug, AND: [learnerVisibleWhere()] },
    include: {
      domain: true,
      module: true,
      objective: true,
      blocks: { orderBy: { sortOrder: "asc" } },
      translations: { where: { locale }, take: 1 },
      sources: { include: { source: true } },
      quizzes: { where: { kind: "KNOWLEDGE_CHECK" }, take: 1 },
      progress: { where: { userId: user.id }, take: 1 },
    },
  });
  if (!lesson) return null;
  await recordLessonView(user, lesson.id, certification.id);
  const translation = lesson.translations[0] ?? null;
  const useTranslation = translation?.status === "APPROVED";
  const translatedBlocks = useTranslation ? asBlockMap(translation.blocks) : {};
  const blocks: LessonBlockView[] = lesson.blocks.map((block) => ({ key: block.key, type: block.type, data: translatedBlocks[block.key] ?? block.data }));
  const pathLessons = await prisma.lesson.findMany({
    where: { certificationId: certification.id, AND: [learnerVisibleWhere()] },
    orderBy: [{ domain: { sortOrder: "asc" } }, { module: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, slug: true, title: true },
  });
  const index = pathLessons.findIndex((item) => item.id === lesson.id);
  const note = await prisma.note.findFirst({ where: { userId: user.id, lessonId: lesson.id }, orderBy: { updatedAt: "desc" } });
  const bookmark = await prisma.bookmark.findUnique({ where: { userId_targetType_targetId: { userId: user.id, targetType: "LESSON", targetId: lesson.id } } });
  return {
    certification: { id: certification.id, code: certification.code, name: localizedField(certification.name, certification.translations, locale, "name") },
    lesson: {
      id: lesson.id,
      slug: lesson.slug,
      title: useTranslation ? translation.title : lesson.title,
      summary: useTranslation ? translation.summary : lesson.summary,
      estimatedMinutes: lesson.estimatedMinutes,
      status: lesson.status,
      version: lesson.version,
      needsVerification: lesson.needsVerification,
      verificationNote: lesson.verificationNote,
      lastReviewedAt: lesson.lastReviewedAt,
      isDemo: lesson.isDemo,
      objective: lesson.objective ? { code: lesson.objective.code, title: localizedField(lesson.objective.title, lesson.objective.translations, locale, "title") } : null,
      domainTitle: localizedField(lesson.domain.title, lesson.domain.translations, locale, "title"),
      moduleTitle: localizedField(lesson.module.title, lesson.module.translations, locale, "title"),
      blocks,
      progress: lesson.progress[0] ?? null,
      quiz: lesson.quizzes[0] ?? null,
      sources: lesson.sources.map((source) => source.source),
      translationState: locale === lesson.sourceLocale ? "source" : translation ? (translation.status === "APPROVED" ? "approved" : "pending") : "missing",
    },
    note,
    bookmarked: !!bookmark,
    prev: index > 0 ? pathLessons[index - 1] : null,
    next: index >= 0 && index < pathLessons.length - 1 ? pathLessons[index + 1] : null,
  };
}

export async function recordLessonView(user: CurrentUser, lessonId: string, certificationId: string, now = new Date()) {
  const existing = await prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: user.id, lessonId } } });
  if (existing) {
    await prisma.lessonProgress.update({ where: { id: existing.id }, data: { lastViewedAt: now, status: existing.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS" } });
  } else {
    await prisma.lessonProgress.create({ data: { userId: user.id, lessonId, status: "IN_PROGRESS", lastViewedAt: now } });
  }
  const day = todayISO(user.preference?.timezone ?? "UTC", now);
  const alreadyLogged = await prisma.learningEvent.count({ where: { userId: user.id, lessonId, type: "LESSON_VIEWED", metadata: { path: ["day"], equals: day } as Prisma.JsonFilter } });
  if (!alreadyLogged) {
    await prisma.learningEvent.create({ data: { userId: user.id, certificationId, lessonId, type: "LESSON_VIEWED", xp: 0, metadata: { day }, occurredAt: now } });
  }
}

export async function completeLesson(user: CurrentUser, lessonId: string) {
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, AND: [learnerVisibleWhere()] }, select: { id: true, certificationId: true } });
  if (!lesson) return { completed: false };
  const previous = await prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: user.id, lessonId } } });
  const firstCompletion = previous?.status !== "COMPLETED";
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    create: { userId: user.id, lessonId, status: "COMPLETED", completedAt: new Date(), lastViewedAt: new Date() },
    update: { status: "COMPLETED", completedAt: previous?.completedAt ?? new Date(), lastViewedAt: new Date() },
  });
  if (firstCompletion) {
    const now = new Date();
    await prisma.learningEvent.create({ data: { userId: user.id, certificationId: lesson.certificationId, lessonId, type: "LESSON_COMPLETED", xp: XP_RULES.lessonCompleted, occurredAt: now } });
    const tz = user.preference?.timezone ?? "UTC";
    await awardBadges(prisma, user.id, tz, now);
    await computeAndStoreReadiness(prisma, user.id, lesson.certificationId, tz, now);
  }
  return { completed: true, xp: firstCompletion ? XP_RULES.lessonCompleted : 0 };
}

export function localizedJsonField(base: string, translations: unknown, locale: string, field: string): string {
  const translated = pickTranslated<Record<string, unknown>>(translations, locale)?.[field];
  return typeof translated === "string" && translated.trim() ? translated : base;
}
