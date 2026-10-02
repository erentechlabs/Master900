/**
 * Database-backed analytics helpers (readiness, mastery, streaks, XP, badges).
 * Accept any Prisma client so they can be used by the app, the seed and the worker.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { addDays, currentStreak, diffDaysISO, longestStreak, toISODate } from "@/lib/dates";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { computeReadiness, type ReadinessInput, type ReadinessResult } from "./readiness";
import { evaluateBadges, type BadgeCriteria, type BadgeStats } from "./gamification";

type Db = PrismaClient | Prisma.TransactionClient;

export type DomainMasteryRow = { domainId: string; answers: number; correct: number; accuracy: number };

export async function domainMastery(db: Db, userId: string, certificationId: string, since?: Date): Promise<Map<string, DomainMasteryRow>> {
  const rows = await db.questionAttempt.groupBy({
    by: ["domainId", "isCorrect"],
    where: { userId, certificationId, ...(since ? { answeredAt: { gte: since } } : {}) },
    _count: { _all: true },
  });
  const map = new Map<string, DomainMasteryRow>();
  for (const r of rows) {
    const m = map.get(r.domainId) ?? { domainId: r.domainId, answers: 0, correct: 0, accuracy: 0 };
    m.answers += r._count._all;
    if (r.isCorrect) m.correct += r._count._all;
    map.set(r.domainId, m);
  }
  for (const m of map.values()) m.accuracy = m.answers ? Math.round((m.correct / m.answers) * 100) : 0;
  return map;
}

export async function activeDays(db: Db, userId: string, timeZone: string, since: Date, until?: Date): Promise<string[]> {
  const events = await db.learningEvent.findMany({ where: { userId, occurredAt: { gte: since, ...(until ? { lte: until } : {}) } }, select: { occurredAt: true } });
  return [...new Set(events.map((e) => toISODate(e.occurredAt, timeZone)))].sort();
}

export async function totalXp(db: Db, userId: string): Promise<number> {
  const agg = await db.learningEvent.aggregate({ where: { userId }, _sum: { xp: true } });
  return agg._sum.xp ?? 0;
}

export async function streakInfo(db: Db, userId: string, timeZone: string, now = new Date()) {
  const days = new Set(await activeDays(db, userId, timeZone, addDays(now, -400)));
  const today = toISODate(now, timeZone);
  return { current: currentStreak(days, today), longest: longestStreak(days), days };
}

export async function loadReadinessInput(db: Db, userId: string, certificationId: string, timeZone = "UTC", now = new Date()): Promise<ReadinessInput> {
  const visible = learnerVisibleWhere(now);
  const [domains, lessons, completed, attempts, fullExams, labsTotal, labAttempts, days, lastEvent] = await Promise.all([
    db.examDomain.findMany({ where: { certificationId }, select: { id: true, weightMin: true, weightMax: true }, orderBy: { sortOrder: "asc" } }),
    db.lesson.groupBy({ by: ["domainId"], where: { certificationId, ...visible }, _count: { _all: true } }),
    db.lessonProgress.findMany({ where: { userId, status: "COMPLETED", completedAt: { lte: now }, lesson: { certificationId } }, select: { lesson: { select: { domainId: true } } } }),
    db.questionAttempt.findMany({
      where: { userId, certificationId, answeredAt: { gte: addDays(now, -90), lte: now } },
      select: { domainId: true, difficulty: true, isCorrect: true, answeredAt: true },
      orderBy: { answeredAt: "desc" },
      take: 500,
    }),
    db.practiceExamAttempt.findMany({
      where: { userId, certificationId, mode: "FULL", status: { in: ["SUBMITTED", "EXPIRED"] }, submittedAt: { not: null, lte: now } },
      select: { score: true, submittedAt: true },
    }),
    db.lab.count({ where: { certificationId, ...visible } }),
    db.labAttempt.findMany({ where: { userId, status: "COMPLETED", completedAt: { lte: now }, lab: { certificationId } }, select: { labId: true, solutionViewed: true } }),
    activeDays(db, userId, timeZone, addDays(now, -28), now),
    db.learningEvent.findFirst({ where: { userId, occurredAt: { lte: now } }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
  ]);
  const lessonsTotal = new Map(lessons.map((l) => [l.domainId, l._count._all]));
  const completedByDomain = new Map<string, number>();
  for (const c of completed) completedByDomain.set(c.lesson.domainId, (completedByDomain.get(c.lesson.domainId) ?? 0) + 1);
  const labIds = new Set(labAttempts.map((l) => l.labId));
  const unassisted = new Set(labAttempts.filter((l) => !l.solutionViewed).map((l) => l.labId));
  return {
    now,
    domains: domains.map((d) => ({
      id: d.id,
      weightMin: d.weightMin,
      weightMax: d.weightMax,
      lessonsTotal: lessonsTotal.get(d.id) ?? 0,
      lessonsCompleted: completedByDomain.get(d.id) ?? 0,
    })),
    attempts: attempts.map((a) => ({ domainId: a.domainId, difficulty: a.difficulty, isCorrect: a.isCorrect, answeredAt: a.answeredAt })),
    fullExams: fullExams.map((e) => ({ scorePercent: e.score ?? 0, submittedAt: e.submittedAt! })),
    labs: { total: labsTotal, completed: labIds.size, completedWithoutSolution: unassisted.size },
    activeDays: days,
    lastActivityAt: lastEvent?.occurredAt ?? null,
  };
}

/** Compute readiness and store a snapshot when it changed or the last one is older than six hours. */
export async function computeAndStoreReadiness(db: Db, userId: string, certificationId: string, timeZone = "UTC", now = new Date()): Promise<ReadinessResult> {
  const result = computeReadiness(await loadReadinessInput(db, userId, certificationId, timeZone, now));
  const last = await db.readinessSnapshot.findFirst({ where: { userId, certificationId }, orderBy: { createdAt: "desc" } });
  if (!last || last.score !== result.score || last.level !== result.level || now.getTime() - last.createdAt.getTime() > 6 * 3600_000) {
    await db.readinessSnapshot.create({
      data: { userId, certificationId, score: result.score, level: result.level, signals: JSON.parse(JSON.stringify(result.signals)), createdAt: now },
    });
  }
  return result;
}

export async function badgeStats(db: Db, userId: string, timeZone = "UTC", now = new Date()): Promise<BadgeStats> {
  const visible = learnerVisibleWhere(now);
  const [lessonsCompleted, enrollments, labs, perfectQuizzes, perfectPractice, fullExams, xp, streak, engagementEvents] = await Promise.all([
    db.lessonProgress.count({ where: { userId, status: "COMPLETED" } }),
    db.enrollment.findMany({ where: { userId }, select: { certificationId: true, certification: { select: { code: true } } } }),
    db.labAttempt.findMany({ where: { userId, status: "COMPLETED" }, distinct: ["labId"], select: { labId: true } }),
    db.quizAttempt.count({ where: { userId, status: "SUBMITTED", score: 100, totalCount: { gte: 3 } } }),
    db.practiceExamAttempt.count({ where: { userId, status: "SUBMITTED", score: 100, totalCount: { gte: 5 } } }),
    db.practiceExamAttempt.findMany({
      where: { userId, mode: "FULL", status: { in: ["SUBMITTED", "EXPIRED"] }, submittedAt: { not: null } },
      select: { score: true, submittedAt: true, certification: { select: { code: true } } },
      orderBy: { submittedAt: "asc" },
    }),
    totalXp(db, userId),
    streakInfo(db, userId, timeZone, now),
    db.learningEvent.findMany({ where: { userId, type: { in: ["QUEST_COMPLETED", "FOCUS_SESSION_COMPLETED", "LAB_COMPLETED", "PRACTICE_COMPLETED"] } }, select: { type: true, certificationId: true, metadata: true } }),
  ]);

  const domainMasteryRows: BadgeStats["domainMastery"] = [];
  const completedTracks: string[] = [];
  for (const e of enrollments) {
    const mastery = await domainMastery(db, userId, e.certificationId, addDays(now, -60));
    const domains = await db.examDomain.findMany({ where: { certificationId: e.certificationId }, select: { id: true, key: true } });
    for (const d of domains) {
      const m = mastery.get(d.id);
      if (m) domainMasteryRows.push({ certCode: e.certification.code, domainKey: d.key, accuracy: m.accuracy, answers: m.answers });
    }
    const [total, done] = await Promise.all([
      db.lesson.count({ where: { certificationId: e.certificationId, ...visible } }),
      db.lessonProgress.count({ where: { userId, status: "COMPLETED", lesson: { certificationId: e.certificationId, ...visible } } }),
    ]);
    if (total > 0 && done >= total) completedTracks.push(e.certification.code);
  }

  const bests: BadgeStats["fullExamBests"] = [];
  const byCert = new Map<string, number[]>();
  for (const f of fullExams) {
    const code = f.certification?.code ?? "unknown";
    byCert.set(code, [...(byCert.get(code) ?? []), Math.round(f.score ?? 0)]);
  }
  for (const [code, scores] of byCert) {
    const best = Math.max(...scores);
    const previous = scores.length > 1 ? Math.max(...scores.slice(0, -1)) : null;
    bests.push({ certCode: code, best: scores[scores.length - 1]! > (previous ?? -1) ? scores[scores.length - 1]! : best, previousBest: previous });
  }

  const meta = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
  const questDaysAllCompleted = new Set(engagementEvents.filter((e) => e.type === "QUEST_COMPLETED" && meta(e.metadata).questKey === "all" && typeof meta(e.metadata).date === "string").map((e) => String(meta(e.metadata).date))).size;
  const focusSessions = engagementEvents.filter((e) => e.type === "FOCUS_SESSION_COMPLETED").length;
  const threeStarLabs = engagementEvents.filter((e) => e.type === "LAB_COMPLETED" && Number(meta(e.metadata).stars ?? 0) >= 3).length;
  const lightning = engagementEvents.filter((e) => e.type === "PRACTICE_COMPLETED" && meta(e.metadata).mode === "LIGHTNING");
  const lightningRoundsAtLeast8 = lightning.filter((e) => Number(meta(e.metadata).correct ?? 0) >= 8).length;
  const bestLightningCorrect = lightning.reduce((best, e) => Math.max(best, Number(meta(e.metadata).correct ?? 0)), 0);
  const bestLightningCombo = lightning.reduce((best, e) => Math.max(best, Number(meta(e.metadata).bestCombo ?? 0)), 0);
  const labCertificationsCompleted = new Set(engagementEvents.filter((e) => e.type === "LAB_COMPLETED" && e.certificationId).map((e) => e.certificationId)).size;

  const sortedDays = [...streak.days].sort();
  const latest = sortedDays[sortedDays.length - 1];
  const before = sortedDays[sortedDays.length - 2];
  const today = toISODate(now, timeZone);
  const gap = latest && before && diffDaysISO(latest, today) <= 1 ? Math.max(0, diffDaysISO(before, latest) - 1) : 0;

  return {
    lessonsCompleted,
    domainMastery: domainMasteryRows,
    completedTracks,
    labsCompleted: labs.length,
    perfectQuizzes: perfectQuizzes + perfectPractice,
    currentStreak: streak.current,
    gapBeforeLatestActivity: gap,
    fullExamBests: bests,
    totalXp: xp,
    questDaysAllCompleted,
    focusSessions,
    threeStarLabs,
    lightningRoundsAtLeast8,
    bestLightningCorrect,
    bestLightningCombo,
    labCertificationsCompleted,
  };
}

/** Award any newly earned badges. Returns the badges that were created. */
export async function awardBadges(db: Db, userId: string, timeZone = "UTC", now = new Date()) {
  const [defs, existing, stats] = await Promise.all([
    db.badge.findMany(),
    db.userBadge.findMany({ where: { userId }, select: { badgeId: true, scopeKey: true } }),
    badgeStats(db, userId, timeZone, now),
  ]);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const have = new Set(existing.map((e) => `${e.badgeId}:${e.scopeKey}`));
  const earned = evaluateBadges(
    defs.map((d) => ({ key: d.key, criteria: d.criteria as unknown as BadgeCriteria })),
    stats,
  );
  const created: { key: string; name: string; translations: unknown }[] = [];
  for (const e of earned) {
    const def = byKey.get(e.key)!;
    if (have.has(`${def.id}:${e.scopeKey}`)) continue;
    const cert = e.certCode ? await db.certification.findUnique({ where: { code: e.certCode }, select: { id: true } }) : null;
    await db.userBadge.create({
      data: { userId, badgeId: def.id, scopeKey: e.scopeKey, certificationId: cert?.id ?? null, context: e.context ? JSON.parse(JSON.stringify(e.context)) : undefined, earnedAt: now },
    });
    await db.learningEvent.create({
      data: { userId, type: "BADGE_EARNED", certificationId: cert?.id ?? null, xp: def.xpReward, metadata: { badge: def.key, scope: e.scopeKey }, occurredAt: now },
    });
    have.add(`${def.id}:${e.scopeKey}`);
    created.push({ key: def.key, name: def.name, translations: def.translations });
  }
  return created;
}
