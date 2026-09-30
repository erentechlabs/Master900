import "server-only";
import { prisma } from "@/lib/db";
import { addDays, parseISODate, todayISO } from "@/lib/dates";
import type { TFunction } from "@/i18n/translator";
import type { CurrentUser } from "@/modules/auth/session";
import type { ReminderView } from "@/components/layout/header-controls";

/** In-app reminders shown in the header (computed on demand, nothing is e-mailed). */
export async function getReminders(user: CurrentUser, t: TFunction): Promise<ReminderView[]> {
  const tz = user.preference?.timezone ?? "UTC";
  const today = todayISO(tz);
  const start = parseISODate(today);
  const end = addDays(start, 1);
  const now = new Date();
  const [todaySessions, missed, due, challenge, soon, enrolled] = await Promise.all([
    prisma.studySession.findMany({
      where: { userId: user.id, status: "PLANNED", scheduledAt: { gte: start, lt: end } },
      orderBy: { scheduledAt: "asc" },
      take: 2,
    }),
    prisma.studySession.count({ where: { userId: user.id, status: "MISSED", updatedAt: { gte: addDays(now, -2) } } }),
    prisma.reviewQueueItem.count({ where: { userId: user.id, status: "ACTIVE", dueAt: { lte: now } } }),
    prisma.practiceExamAttempt.findFirst({ where: { userId: user.id, challengeDate: today }, select: { id: true } }),
    prisma.enrollment.findMany({
      where: { userId: user.id, status: "ACTIVE", targetExamDate: { gte: start, lte: addDays(start, 14) } },
      include: { certification: { select: { code: true } } },
    }),
    prisma.enrollment.count({ where: { userId: user.id, status: "ACTIVE" } }),
  ]);

  const items: ReminderView[] = [];
  for (const s of todaySessions) items.push({ id: `s-${s.id}`, text: t("learner.reminders.sessionToday", { title: s.title }), href: "/plan" });
  if (missed > 0) items.push({ id: "missed", text: t("learner.reminders.sessionMissed", { count: missed }), href: "/plan" });
  if (due > 0) items.push({ id: "due", text: t("learner.reminders.reviewsDue", { count: due }), href: "/practice/mistakes?due=1" });
  if (enrolled > 0 && !challenge) items.push({ id: "daily", text: t("learner.reminders.dailyChallenge"), href: "/practice?mode=DAILY" });
  for (const e of soon) {
    const days = Math.max(0, Math.round((e.targetExamDate!.getTime() - start.getTime()) / 86_400_000));
    items.push({ id: `exam-${e.id}`, text: t("learner.reminders.examSoon", { code: e.certification.code, days }), href: "/plan" });
  }
  return items;
}
