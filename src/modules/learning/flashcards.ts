import "server-only";
import { z } from "zod";
import type { ContentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { localizedField } from "@/i18n/translator";
import { reviewSrs, qualityFromRating, type FlashcardRating } from "@/modules/learning/srs";
import { XP_RULES } from "@/modules/analytics/gamification";
import type { CurrentUser } from "@/modules/auth/session";

export const flashcardReviewSchema = z.object({ flashcardId: z.string().min(1).max(80), rating: z.enum(["again", "hard", "good", "easy"]) });

export async function getFlashcardDeck(userId: string, locale: string, filters: { certificationId?: string; domainId?: string; moduleId?: string }) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: "ACTIVE", certification: { isVisible: true } },
    include: { certification: { include: { domains: { orderBy: { sortOrder: "asc" }, include: { modules: { orderBy: { sortOrder: "asc" } } } } } } },
  });
  const certIds = enrollments.map((enrollment) => enrollment.certificationId);
  const certificationId = filters.certificationId && certIds.includes(filters.certificationId) ? filters.certificationId : certIds[0];
  if (!certificationId) return { enrollments, certificationId: null, cards: [] };
  const visibleStatuses: ContentStatus[] = ["PUBLISHED", "OUTDATED"];
  const lessonWhere: Prisma.LessonWhereInput = {};
  if (filters.domainId) lessonWhere.domainId = filters.domainId;
  if (filters.moduleId) lessonWhere.moduleId = filters.moduleId;
  const where: Prisma.FlashcardWhereInput = {
    certificationId,
    status: { in: visibleStatuses },
    ...(Object.keys(lessonWhere).length ? { lesson: { is: lessonWhere } } : {}),
  };
  const dueQueue = await prisma.reviewQueueItem.findMany({
    where: { userId, reason: "FLASHCARD", status: "ACTIVE", dueAt: { lte: new Date() }, flashcard: { is: where } },
    orderBy: { dueAt: "asc" },
    include: { flashcard: { include: { lesson: true } } },
    take: 30,
  });
  const dueIds = new Set(dueQueue.flatMap((item) => (item.flashcardId ? [item.flashcardId] : [])));
  const newCards = await prisma.flashcard.findMany({
    where: { ...where, id: { notIn: [...dueIds] }, reviewItems: { none: { userId } } },
    include: { lesson: true },
    orderBy: { sortOrder: "asc" },
    take: Math.max(0, 20 - dueQueue.length),
  });
  const cards = [
    ...dueQueue.flatMap((item) => (item.flashcard ? [{ id: item.flashcard.id, front: item.flashcard.front, back: item.flashcard.back, translations: item.flashcard.translations, lesson: item.flashcard.lesson, due: true }] : [])),
    ...newCards.map((card) => ({ id: card.id, front: card.front, back: card.back, translations: card.translations, lesson: card.lesson, due: false })),
  ];
  return {
    enrollments: enrollments.map((enrollment) => ({
      id: enrollment.id,
      certificationId: enrollment.certificationId,
      certification: {
        id: enrollment.certification.id,
        code: enrollment.certification.code,
        name: localizedField(enrollment.certification.name, enrollment.certification.translations, locale, "name"),
        domains: enrollment.certification.domains.map((domain) => ({
          id: domain.id,
          title: localizedField(domain.title, domain.translations, locale, "title"),
          modules: domain.modules.map((module) => ({ id: module.id, title: localizedField(module.title, module.translations, locale, "title") })),
        })),
      },
    })),
    certificationId,
    cards: cards.map((card) => ({
      id: card.id,
      front: localizedField(card.front, card.translations, locale, "front"),
      back: localizedField(card.back, card.translations, locale, "back"),
      lessonTitle: card.lesson ? card.lesson.title : null,
      due: card.due,
    })),
  };
}

export async function reviewFlashcard(user: CurrentUser, flashcardId: string, rating: FlashcardRating) {
  const flashcard = await prisma.flashcard.findFirst({ where: { id: flashcardId, status: { in: ["PUBLISHED", "OUTDATED"] as ContentStatus[] } }, select: { id: true, certificationId: true, lessonId: true } });
  if (!flashcard) return { reviewed: false };
  const enrollment = await prisma.enrollment.count({ where: { userId: user.id, certificationId: flashcard.certificationId, status: "ACTIVE" } });
  if (!enrollment) return { reviewed: false };
  const existing = await prisma.reviewQueueItem.findUnique({ where: { userId_flashcardId: { userId: user.id, flashcardId } } });
  const result = reviewSrs(
    existing
      ? { easeFactor: existing.easeFactor, intervalDays: existing.intervalDays, repetitions: existing.repetitions, lapses: existing.lapses }
      : { easeFactor: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 },
    qualityFromRating(rating),
  );
  await prisma.reviewQueueItem.upsert({
    where: { userId_flashcardId: { userId: user.id, flashcardId } },
    create: {
      userId: user.id,
      certificationId: flashcard.certificationId,
      lessonId: flashcard.lessonId,
      flashcardId,
      reason: "FLASHCARD",
      status: result.mastered ? "MASTERED" : "ACTIVE",
      easeFactor: result.state.easeFactor,
      intervalDays: result.state.intervalDays,
      repetitions: result.state.repetitions,
      lapses: result.state.lapses,
      dueAt: result.dueAt,
      lastReviewedAt: new Date(),
    },
    update: {
      status: result.mastered ? "MASTERED" : "ACTIVE",
      easeFactor: result.state.easeFactor,
      intervalDays: result.state.intervalDays,
      repetitions: result.state.repetitions,
      lapses: result.state.lapses,
      dueAt: result.dueAt,
      lastReviewedAt: new Date(),
    },
  });
  await prisma.learningEvent.create({ data: { userId: user.id, certificationId: flashcard.certificationId, lessonId: flashcard.lessonId, type: "FLASHCARD_REVIEWED", xp: XP_RULES.flashcardReviewed, metadata: { rating } } });
  return { reviewed: true, dueAt: result.dueAt, mastered: result.mastered };
}

