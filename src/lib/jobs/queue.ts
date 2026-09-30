import "server-only";
import type { Job, Prisma, PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import { jobHandlers } from "./handlers";

type Db = PrismaClient | Prisma.TransactionClient;

export async function enqueueJob(db: Db, type: string, payload: Prisma.InputJsonValue = {}, runAt = new Date(), createdById?: string | null) {
  return db.job.create({ data: { type, payload, runAt, createdById: createdById ?? null } });
}

/** Maintenance jobs the worker schedules automatically. All handlers are idempotent. */
export const RECURRING_JOBS: readonly { type: string; everyMinutes: number }[] = [
  { type: "content.publishScheduled", everyMinutes: 5 },
  { type: "planner.adjustPlans", everyMinutes: 60 },
  { type: "analytics.readinessSnapshots", everyMinutes: 24 * 60 },
];

/** Enqueue each recurring job when none is pending/running and none was created within its interval. */
export async function scheduleRecurringJobs(db: PrismaClient, now = new Date()): Promise<number> {
  let enqueued = 0;
  for (const job of RECURRING_JOBS) {
    const since = new Date(now.getTime() - job.everyMinutes * 60_000);
    const recent = await db.job.findFirst({
      where: { type: job.type, OR: [{ status: { in: ["PENDING", "RUNNING"] } }, { createdAt: { gte: since } }] },
      select: { id: true },
    });
    if (!recent) {
      await enqueueJob(db, job.type, {}, now);
      enqueued += 1;
    }
  }
  return enqueued;
}

type ClaimRow = { id: string };

async function claimDue(db: PrismaClient, limit: number, workerId: string): Promise<Job[]> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimRow[]>`
      SELECT id FROM "Job"
      WHERE status = 'PENDING' AND "runAt" <= now()
      ORDER BY "runAt" ASC, "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
    const ids = rows.map((r) => r.id);
    if (!ids.length) return [];
    await tx.job.updateMany({ where: { id: { in: ids } }, data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId, attempts: { increment: 1 } } });
    return tx.job.findMany({ where: { id: { in: ids } } });
  });
}

export async function processDueJobs(db: PrismaClient, options: { limit: number; workerId: string }) {
  const jobs = await claimDue(db, options.limit, options.workerId);
  let processed = 0;
  for (const job of jobs) {
    try {
      const handler = jobHandlers[job.type];
      if (!handler) throw new Error(`Unknown job type: ${job.type}`);
      const result = await handler(db, job.payload);
      await db.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", result: JSON.parse(JSON.stringify(result ?? {})), lastError: null } });
      processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextAttempt = job.attempts;
      const failed = nextAttempt >= job.maxAttempts;
      const delaySeconds = Math.min(3600, 30 * 2 ** Math.max(0, nextAttempt - 1));
      await db.job.update({
        where: { id: job.id },
        data: {
          status: failed ? "FAILED" : "PENDING",
          lastError: message,
          lockedAt: null,
          lockedBy: null,
          runAt: failed ? job.runAt : new Date(Date.now() + delaySeconds * 1000),
        },
      });
      logger.error("job.failed", { jobId: job.id, type: job.type, error });
    }
  }
  return { processed, claimed: jobs.length };
}
