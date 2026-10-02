import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, addDaysISO, parseISODate, todayISO, toISODate } from "@/lib/dates";
import { localizedField } from "@/i18n/translator";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { activeDays, computeAndStoreReadiness, domainMastery, streakInfo, totalXp } from "./data";
import { levelForXp } from "./gamification";
import { loadJumpBackIn, loadRecommendedLabs } from "./quest-service";
import { recommendNextAction } from "./recommend";

function sessionHref(session: { type: string; details: Prisma.JsonValue | null; plan: { certification: { code: string } } }): string {
  const details = (session.details && typeof session.details === "object" ? session.details : {}) as { lessonIds?: string[]; labId?: string; practiceMode?: string };
  if (session.type === "LESSON" && details.lessonIds?.[0]) return `/learn/${session.plan.certification.code}?lesson=${details.lessonIds[0]}`;
  if (session.type === "LAB" && details.labId) return `/labs/${details.labId}`;
  if (session.type === "PRACTICE_EXAM") return `/practice?mode=${details.practiceMode === "FULL" ? "FULL" : "QUICK"}&cert=${session.plan.certification.code}`;
  return "/practice/mistakes?due=1";
}

export async function loadDashboard(userId: string, locale: string, timeZone: string, now = new Date()) {
  const today = todayISO(timeZone, now);
  const todayDate = parseISODate(today);
  const visible = learnerVisibleWhere(now);
  const [
    user,
    enrollments,
    sessions,
    dueReviews,
    lastProgress,
    dailyChallenge,
    recentBadges,
    curriculumAlerts,
    xp,
    streak,
    active,
    todayMinutes,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, onboardingCompletedAt: true, preference: true } }),
    prisma.enrollment.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      include: { certification: { select: { id: true, code: true, name: true, translations: true, hasLearningPath: true } } },
    }),
    prisma.studySession.findMany({
      where: { userId, scheduledAt: { gte: todayDate, lte: parseISODate(addDaysISO(today, 14)) } },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 12,
      include: { plan: { select: { certification: { select: { code: true } } } } },
    }),
    prisma.reviewQueueItem.count({ where: { userId, status: "ACTIVE", dueAt: { lte: now } } }),
    prisma.lessonProgress.findFirst({
      where: { userId },
      orderBy: { lastViewedAt: "desc" },
      include: { lesson: { select: { slug: true, title: true, translations: { where: { locale }, select: { title: true } }, certification: { select: { code: true } } } } },
    }),
    prisma.practiceExamAttempt.findFirst({ where: { userId, mode: "DAILY", challengeDate: today, status: "SUBMITTED" }, select: { id: true } }),
    prisma.userBadge.findMany({ where: { userId }, orderBy: { earnedAt: "desc" }, take: 4, include: { badge: true } }),
    prisma.curriculumAlert.findMany({
      where: { resolvedAt: null, certification: { enrollments: { some: { userId, status: "ACTIVE" } } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { certification: { select: { code: true } } },
    }),
    totalXp(prisma, userId),
    streakInfo(prisma, userId, timeZone, now),
    activeDays(prisma, userId, timeZone, addDays(now, -34), now),
    prisma.learningEvent.aggregate({ where: { userId, occurredAt: { gte: todayDate }, durationSeconds: { not: null } }, _sum: { durationSeconds: true } }),
  ]);

  const primary = enrollments.find((e) => e.isPrimary) ?? enrollments[0] ?? null;
  const readiness = primary ? await computeAndStoreReadiness(prisma, userId, primary.certificationId, timeZone, now) : null;
  const latestSnapshot = primary
    ? await prisma.readinessSnapshot.findFirst({ where: { userId, certificationId: primary.certificationId }, orderBy: { createdAt: "desc" } })
    : null;
  const mastery = primary ? await domainMastery(prisma, userId, primary.certificationId, addDays(now, -90)) : new Map();
  const domains = primary
    ? await prisma.examDomain.findMany({ where: { certificationId: primary.certificationId }, select: { id: true, title: true, translations: true }, orderBy: { sortOrder: "asc" } })
    : [];
  const nextLesson = primary
    ? await prisma.lesson.findFirst({
        where: { certificationId: primary.certificationId, ...visible, progress: { none: { userId, status: "COMPLETED" } } },
        orderBy: [{ domain: { sortOrder: "asc" } }, { module: { sortOrder: "asc" } }, { sortOrder: "asc" }],
        select: { slug: true, title: true, translations: { where: { locale }, select: { title: true } }, domainId: true, domain: { select: { title: true, translations: true } } },
      })
    : null;
  const fullExam = primary
    ? await prisma.practiceExamAttempt.findFirst({
        where: { userId, certificationId: primary.certificationId, mode: "FULL", status: { in: ["SUBMITTED", "EXPIRED"] }, submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        select: { submittedAt: true },
      })
    : null;
  const weakDomainIds = [...mastery.values()].filter((m) => m.answers >= 3 && m.accuracy < 65).map((m) => m.domainId);
  const todaySession = sessions.find((s) => toISODate(s.scheduledAt) === today && s.status === "PLANNED") ?? null;
  const action = recommendNextAction({
    enrolledCodes: enrollments.map((e) => e.certification.code),
    primaryCode: primary?.certification.code ?? null,
    diagnosticDone: !!primary?.diagnosticCompletedAt,
    primaryHasContent: !!primary?.certification.hasLearningPath,
    dueReviews,
    todaySession: todaySession ? { id: todaySession.id, title: todaySession.title, href: sessionHref(todaySession) } : null,
    overdueSessions: 0,
    nextLesson: nextLesson
      ? {
          title: nextLesson.translations[0]?.title || nextLesson.title,
          href: `/learn/${primary!.certification.code}/${nextLesson.slug}`,
          domainTitle: localizedField(nextLesson.domain.title, nextLesson.domain.translations, locale, "title"),
          isWeakDomain: weakDomainIds.includes(nextLesson.domainId),
        }
      : null,
    readinessLevel: readiness?.level ?? null,
    daysSinceFullExam: fullExam?.submittedAt ? Math.floor((now.getTime() - fullExam.submittedAt.getTime()) / 86_400_000) : null,
    pendingLab: null,
  });

  const level = levelForXp(xp);
  const continueLesson = lastProgress
    ? { title: lastProgress.lesson.translations[0]?.title || lastProgress.lesson.title, href: `/learn/${lastProgress.lesson.certification.code}/${lastProgress.lesson.slug}`, code: lastProgress.lesson.certification.code }
    : null;
  const [recommendedLabs, jumpBackIn] = await Promise.all([loadRecommendedLabs(userId, locale, primary?.certificationId ?? null, now), loadJumpBackIn(userId, locale, continueLesson)]);
  const activeSet = new Set(active);
  const strip = Array.from({ length: 35 }, (_, index) => {
    const date = addDaysISO(today, index - 34);
    return { date, active: activeSet.has(date), label: date };
  });

  return {
    user,
    enrollments,
    primary,
    readiness: latestSnapshot ? { score: latestSnapshot.score, level: latestSnapshot.level, signals: latestSnapshot.signals } : readiness,
    sessions: sessions.map((s) => ({ ...s, href: sessionHref(s) })),
    dueReviews,
    continueLesson,
    jumpBackIn,
    recommendedLabs,
    dailyChallengeDone: !!dailyChallenge,
    recentBadges,
    curriculumAlerts,
    mastery: domains.map((d) => ({ id: d.id, title: localizedField(d.title, d.translations, locale, "title"), accuracy: mastery.get(d.id)?.accuracy ?? 0, answers: mastery.get(d.id)?.answers ?? 0 })),
    xp,
    level,
    streak,
    activeStrip: strip,
    dailyGoal: { doneMinutes: Math.round((todayMinutes._sum.durationSeconds ?? 0) / 60), goalMinutes: user?.preference?.dailyGoalMinutes ?? 20 },
    nextAction: action,
  };
}

