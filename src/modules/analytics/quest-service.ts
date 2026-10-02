import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { localizedField } from "@/i18n/translator";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { labProductFromParts, type LabProductInfo } from "@/modules/labs/products";
import { loadLabProducts } from "@/modules/labs/products-server";
import { awardBadges } from "./data";
import { XP_RULES } from "./gamification";
import { allQuestBonusClaimable, computeQuestProgress, localDayRange, millisecondsUntilLocalMidnight, questClaims, selectDailyQuests, type QuestEvent, type QuestProgress } from "./quests";

type Db = PrismaClient | Prisma.TransactionClient;

export type DailyQuestState = {
  date: string;
  timeZone: string;
  quests: QuestProgress[];
  allClaimed: boolean;
  bonusClaimed: boolean;
  millisecondsUntilReset: number;
  gamification: boolean;
};

export type RecommendedLab = { id: string; title: string; summary: string; href: string; code: string; type: string; estimatedMinutes: number; product: LabProductInfo };
export type JumpBackIn = {
  continueLesson: { title: string; href: string; code?: string } | null;
  inProgressLab: { title: string; href: string; code: string; stepProgress: number } | null;
  resumePractice: { href: string; code: string | null; mode: string; answered: number; total: number } | null;
};

function asEvents(events: { type: string; occurredAt: Date; durationSeconds: number | null; xp: number; metadata: Prisma.JsonValue | null }[]): QuestEvent[] {
  return events.map((e) => ({ type: e.type, occurredAt: e.occurredAt, durationSeconds: e.durationSeconds, xp: e.xp, metadata: e.metadata }));
}

export async function loadDailyQuests(userId: string, timeZone: string, now = new Date(), db: Db = prisma): Promise<DailyQuestState> {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const range = localDayRange(date, timeZone);
  const [user, hasFlashcards, hasLabs, events] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { preference: true } }),
    db.flashcard.count({ where: { status: { in: ["PUBLISHED", "OUTDATED"] }, certification: { enrollments: { some: { userId, status: "ACTIVE" } } } } }),
    db.lab.count({ where: { ...learnerVisibleWhere(now), certification: { enrollments: { some: { userId, status: "ACTIVE" } } } } }),
    db.learningEvent.findMany({ where: { userId, occurredAt: { gte: range.start, lt: range.end } }, select: { type: true, occurredAt: true, durationSeconds: true, xp: true, metadata: true } }),
  ]);
  const availability = { hasFlashcards: hasFlashcards > 0, hasLabs: hasLabs > 0, dailyGoalMinutes: user?.preference?.dailyGoalMinutes ?? 20 };
  const quests = computeQuestProgress(selectDailyQuests(userId, date, availability), asEvents(events), date);
  const claims = questClaims(asEvents(events), date);
  return {
    date,
    timeZone,
    quests,
    allClaimed: quests.length === 3 && quests.every((q) => q.claimed) && claims.some((c) => c.questKey === "all"),
    bonusClaimed: claims.some((c) => c.questKey === "all"),
    millisecondsUntilReset: millisecondsUntilLocalMidnight(now, timeZone),
    gamification: user?.preference?.gamificationEnabled !== false,
  };
}

export async function claimQuest(userId: string, questKey: string, timeZone: string, now = new Date(), db: PrismaClient = prisma) {
  return db.$transaction(async (tx) => {
    const state = await loadDailyQuests(userId, timeZone, now, tx);
    const quest = state.quests.find((q) => q.key === questKey);
    if (!quest || !quest.completed) return { claimed: false, reason: "not_complete" as const, state };
    const existing = await tx.learningEvent.findFirst({ where: { userId, type: "QUEST_COMPLETED", metadata: { path: ["questKey"], equals: questKey }, occurredAt: { gte: localDayRange(state.date, timeZone).start, lt: localDayRange(state.date, timeZone).end } } });
    if (!existing) {
      await tx.learningEvent.create({ data: { userId, type: "QUEST_COMPLETED", xp: XP_RULES.questCompleted, metadata: { questKey, date: state.date }, occurredAt: now } });
    }
    const refreshed = await loadDailyQuests(userId, timeZone, now, tx);
    const claims = refreshed.quests.map((q) => ({ questKey: q.key, date: state.date })).filter((c) => refreshed.quests.find((q) => q.key === c.questKey)?.claimed || c.questKey === questKey);
    let bonusAwarded = false;
    if (allQuestBonusClaimable(refreshed.quests.map((q) => (q.key === questKey ? { ...q, claimed: true } : q)), [...claims, { questKey, date: state.date }])) {
      const bonusExists = await tx.learningEvent.findFirst({ where: { userId, type: "QUEST_COMPLETED", metadata: { path: ["questKey"], equals: "all" }, occurredAt: { gte: localDayRange(state.date, timeZone).start, lt: localDayRange(state.date, timeZone).end } } });
      if (!bonusExists) {
        await tx.learningEvent.create({ data: { userId, type: "QUEST_COMPLETED", xp: XP_RULES.allQuestsBonus, metadata: { questKey: "all", date: state.date }, occurredAt: now } });
        bonusAwarded = true;
      }
    }
    await awardBadges(tx, userId, timeZone, now);
    return { claimed: !existing, bonusAwarded, state: await loadDailyQuests(userId, timeZone, now, tx) };
  });
}

export async function loadRecommendedLabs(userId: string, locale: string, certificationId: string | null, now = new Date()): Promise<RecommendedLab[]> {
  if (!certificationId) return [];
  const labs = await prisma.lab.findMany({
    where: { certificationId, ...learnerVisibleWhere(now), attempts: { none: { userId, status: "COMPLETED" } } },
    orderBy: [{ complexity: "asc" }, { sortOrder: "asc" }],
    take: 3,
    select: { id: true, title: true, summary: true, translations: true, type: true, estimatedMinutes: true, certification: { select: { code: true } } },
  });
  const products = await loadLabProducts(labs.map((lab) => lab.id));
  return labs.map((lab) => ({
    id: lab.id,
    title: localizedField(lab.title, lab.translations, locale, "title"),
    summary: localizedField(lab.summary, lab.translations, locale, "summary"),
    href: `/labs/${lab.id}`,
    code: lab.certification.code,
    type: lab.type,
    estimatedMinutes: lab.estimatedMinutes,
    product: products.get(lab.id) ?? labProductFromParts(lab.type, null, null, null),
  }));
}

export async function loadJumpBackIn(userId: string, locale: string, continueLesson: JumpBackIn["continueLesson"]): Promise<JumpBackIn> {
  const [lab, practice] = await Promise.all([
    prisma.labAttempt.findFirst({ where: { userId, status: "IN_PROGRESS" }, orderBy: { updatedAt: "desc" }, include: { lab: { include: { certification: { select: { code: true } }, steps: { select: { id: true }, orderBy: { sortOrder: "asc" } } } } } }),
    prisma.practiceExamAttempt.findFirst({ where: { userId, status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" }, include: { certification: { select: { code: true } }, questionAttempts: { select: { id: true } } } }),
  ]);
  let stepProgress = 0;
  if (lab) {
    const progress = lab.stepProgress && typeof lab.stepProgress === "object" ? Object.keys(lab.stepProgress as Record<string, unknown>).length : 0;
    stepProgress = lab.lab.steps.length ? Math.round((progress / lab.lab.steps.length) * 100) : 0;
  }
  return {
    continueLesson,
    inProgressLab: lab ? { title: localizedField(lab.lab.title, lab.lab.translations, locale, "title"), href: `/labs/${lab.labId}`, code: lab.lab.certification.code, stepProgress } : null,
    resumePractice: practice ? { href: `/practice/${practice.id}`, code: practice.certification?.code ?? null, mode: practice.mode, answered: practice.questionAttempts.length, total: practice.totalCount } : null,
  };
}
