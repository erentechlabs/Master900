/**
 * Study plan persistence (works with any Prisma client: app, seed, worker).
 */
import type { Prisma, PrismaClient, StudySessionType } from "@prisma/client";
import { addDaysISO, parseISODate, todayISO, toISODate } from "@/lib/dates";
import { truncate } from "@/lib/utils";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import type { TFunction } from "@/i18n/translator";
import { localizedField } from "@/i18n/translator";
import { domainMastery } from "@/modules/analytics/data";
import { generateStudyPlan, type PlannedSession, type PlanWarning } from "./generator";

type Db = PrismaClient | Prisma.TransactionClient;

export type PlanSettingsInput = {
  certificationId: string;
  targetDate: string;
  studyDays: number[];
  sessionMinutes: number;
  revisionWeeks: number;
  includePracticeExams: boolean;
  preferredTime: string;
};

export type AdjustmentReason = "regenerated" | "missed" | "target_changed" | "weak_domain" | "finished_early" | "curriculum_changed";

export async function weakDomainIds(db: Db, userId: string, certificationId: string, now = new Date()): Promise<string[]> {
  const enrollment = await db.enrollment.findUnique({ where: { userId_certificationId: { userId, certificationId } } });
  const fromDiagnostic = ((enrollment?.diagnosticResult as { weakDomainIds?: string[] } | null)?.weakDomainIds ?? []).filter(Boolean);
  const mastery = await domainMastery(db, userId, certificationId, new Date(now.getTime() - 60 * 86_400_000));
  const fromPractice = [...mastery.values()].filter((m) => m.answers >= 5 && m.accuracy < 60).map((m) => m.domainId);
  return [...new Set([...fromPractice, ...fromDiagnostic])];
}

function sessionTitle(s: PlannedSession, names: { lessons: Map<string, string>; labs: Map<string, string>; domains: Map<string, string> }, t: TFunction): string {
  switch (s.type) {
    case "LESSON": {
      const titles = truncate(s.lessonIds.map((id) => names.lessons.get(id) ?? "").filter(Boolean).join(", "), 140);
      return s.labId ? t("planner.sessionTitle_LESSON_LAB", { titles }) : t("planner.sessionTitle_LESSON", { titles });
    }
    case "LAB":
      return t("planner.sessionTitle_LAB", { title: names.labs.get(s.labId ?? "") ?? "" });
    case "PRACTICE_EXAM":
      return s.practiceMode === "FULL" ? t("planner.sessionTitle_PRACTICE_FULL") : t("planner.sessionTitle_PRACTICE_QUICK");
    case "REVISION": {
      const domain = s.domainIds?.[0] ? names.domains.get(s.domainIds[0]) : null;
      return domain ? t("planner.sessionTitle_REVISION", { domain }) : t("planner.sessionTitle_REVISION_ALL");
    }
    default:
      return t("planner.sessionTitle_REVIEW");
  }
}

/**
 * Create or rebuild the learner's plan for a certification. Completed, missed
 * and skipped sessions are kept as history; future planned sessions are replaced.
 */
export async function buildStudyPlan(
  db: Db,
  userId: string,
  settings: PlanSettingsInput,
  opts: { t: TFunction; locale: string; timeZone: string; reason: AdjustmentReason; now?: Date; fullExamMinutes?: number },
): Promise<{ planId: string; warnings: PlanWarning[]; sessions: number }> {
  const now = opts.now ?? new Date();
  const today = todayISO(opts.timeZone, now);
  const visible = learnerVisibleWhere(now);
  const [cert, lessons, labs, progress, labsDone, weak] = await Promise.all([
    db.certification.findUniqueOrThrow({ where: { id: settings.certificationId }, select: { currentVersion: true } }),
    db.lesson.findMany({
      where: { certificationId: settings.certificationId, ...visible },
      select: { id: true, title: true, domainId: true, moduleId: true, estimatedMinutes: true, translations: { where: { locale: opts.locale }, select: { title: true } }, domain: { select: { sortOrder: true } }, module: { select: { sortOrder: true } }, sortOrder: true },
    }),
    db.lab.findMany({ where: { certificationId: settings.certificationId, ...visible }, select: { id: true, title: true, moduleId: true, estimatedMinutes: true, translations: true } }),
    db.lessonProgress.findMany({ where: { userId, status: "COMPLETED", lesson: { certificationId: settings.certificationId } }, select: { lessonId: true } }),
    db.labAttempt.findMany({ where: { userId, status: "COMPLETED", lab: { certificationId: settings.certificationId } }, select: { labId: true } }),
    weakDomainIds(db, userId, settings.certificationId, now),
  ]);
  const domains = await db.examDomain.findMany({ where: { certificationId: settings.certificationId }, select: { id: true, title: true, translations: true } });

  lessons.sort((a, b) => a.domain.sortOrder - b.domain.sortOrder || a.module.sortOrder - b.module.sortOrder || a.sortOrder - b.sortOrder);
  const done = new Set(progress.map((p) => p.lessonId));
  const labsCompleted = new Set(labsDone.map((l) => l.labId));

  const result = generateStudyPlan({
    startDate: today,
    targetDate: settings.targetDate,
    studyDays: settings.studyDays,
    sessionMinutes: settings.sessionMinutes,
    lessons: lessons.map((l) => ({ id: l.id, title: l.title, domainId: l.domainId, moduleId: l.moduleId, estimatedMinutes: l.estimatedMinutes, completed: done.has(l.id) })),
    labs: labs.map((l) => ({ id: l.id, title: l.title, moduleId: l.moduleId, estimatedMinutes: l.estimatedMinutes, completed: labsCompleted.has(l.id) })),
    weakDomainIds: weak,
    revisionWeeks: settings.revisionWeeks,
    includePracticeExams: settings.includePracticeExams,
    fullExamMinutes: opts.fullExamMinutes,
  });

  const names = {
    lessons: new Map(lessons.map((l) => [l.id, l.translations[0]?.title || l.title])),
    labs: new Map(labs.map((l) => [l.id, localizedField(l.title, l.translations, opts.locale, "title")])),
    domains: new Map(domains.map((d) => [d.id, localizedField(d.title, d.translations, opts.locale, "title")])),
  };

  const existing = await db.studyPlan.findFirst({ where: { userId, certificationId: settings.certificationId, status: "ACTIVE" } });
  const logEntry = { at: now.toISOString(), reason: opts.reason };
  const planData = {
    targetDate: parseISODate(settings.targetDate),
    studyDays: settings.studyDays,
    sessionMinutes: settings.sessionMinutes,
    revisionWeeks: settings.revisionWeeks,
    includePracticeExams: settings.includePracticeExams,
    preferredTime: settings.preferredTime,
    curriculumVersion: cert.currentVersion,
    warnings: result.warnings,
    generatedAt: now,
    lastAdjustedAt: now,
  };
  const plan = existing
    ? await db.studyPlan.update({
        where: { id: existing.id },
        data: { ...planData, adjustmentLog: [...((existing.adjustmentLog as unknown[]) ?? []), logEntry].slice(-20) as Prisma.InputJsonValue },
      })
    : await db.studyPlan.create({
        data: { ...planData, userId, certificationId: settings.certificationId, startDate: parseISODate(today), adjustmentLog: [logEntry] },
      });

  await db.studySession.deleteMany({ where: { planId: plan.id, status: "PLANNED", scheduledAt: { gte: parseISODate(today) } } });
  await db.studySession.createMany({
    data: result.sessions.map((s) => ({
      planId: plan.id,
      userId,
      scheduledAt: parseISODate(s.date),
      durationMinutes: s.durationMinutes,
      type: s.type as StudySessionType,
      title: sessionTitle(s, names, opts.t),
      details: JSON.parse(JSON.stringify({ lessonIds: s.lessonIds, labId: s.labId ?? null, domainIds: s.domainIds ?? [], practiceMode: s.practiceMode ?? null })),
    })),
  });
  await db.enrollment.updateMany({ where: { userId, certificationId: settings.certificationId }, data: { targetExamDate: parseISODate(settings.targetDate) } });
  return { planId: plan.id, warnings: result.warnings, sessions: result.sessions.length };
}

/** Mark planned sessions before today as missed. Returns the number of sessions changed per plan. */
export async function markMissedSessions(db: Db, userId: string, timeZone: string, now = new Date()): Promise<Map<string, number>> {
  const today = parseISODate(todayISO(timeZone, now));
  const missed = await db.studySession.findMany({ where: { userId, status: "PLANNED", scheduledAt: { lt: today } }, select: { id: true, planId: true } });
  if (missed.length === 0) return new Map();
  await db.studySession.updateMany({ where: { id: { in: missed.map((m) => m.id) } }, data: { status: "MISSED" } });
  const perPlan = new Map<string, number>();
  for (const m of missed) perPlan.set(m.planId, (perPlan.get(m.planId) ?? 0) + 1);
  return perPlan;
}

export function planSettingsFromPlan(plan: {
  certificationId: string;
  targetDate: Date;
  studyDays: number[];
  sessionMinutes: number;
  revisionWeeks: number;
  includePracticeExams: boolean;
  preferredTime: string;
}): PlanSettingsInput {
  return {
    certificationId: plan.certificationId,
    targetDate: toISODate(plan.targetDate),
    studyDays: plan.studyDays,
    sessionMinutes: plan.sessionMinutes,
    revisionWeeks: plan.revisionWeeks,
    includePracticeExams: plan.includePracticeExams,
    preferredTime: plan.preferredTime,
  };
}

export function defaultTargetDate(timeZone: string, now = new Date()): string {
  return addDaysISO(todayISO(timeZone, now), 42);
}
