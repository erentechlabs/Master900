import "server-only";
import { prisma } from "@/lib/db";
import { toISODate } from "@/lib/dates";

export type FocusTodayStats = { minutes: number; sessions: number };

/** Focus minutes and completed sessions for the learner's local day (focus time is kept out of study duration). */
export async function getFocusTodayStats(userId: string, timeZone = "UTC", now = new Date()): Promise<FocusTodayStats> {
  const since = new Date(now.getTime() - 36 * 60 * 60_000);
  const today = toISODate(now, timeZone);
  const events = await prisma.learningEvent.findMany({
    where: { userId, type: "FOCUS_SESSION_COMPLETED", occurredAt: { gte: since, lte: now } },
    select: { occurredAt: true, metadata: true },
  });
  let minutes = 0;
  let sessions = 0;
  for (const event of events) {
    if (toISODate(event.occurredAt, timeZone) !== today) continue;
    const meta = event.metadata && typeof event.metadata === "object" ? (event.metadata as Record<string, unknown>) : {};
    const value = typeof meta.minutes === "number" ? meta.minutes : Number(meta.minutes ?? 0);
    if (Number.isFinite(value)) minutes += value;
    sessions += 1;
  }
  return { minutes, sessions };
}
