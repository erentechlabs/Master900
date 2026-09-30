/**
 * Background worker: schedules recurring maintenance jobs and processes due jobs from the database queue.
 *
 *   npm run worker
 *
 * Several workers can run in parallel; jobs are claimed with FOR UPDATE SKIP LOCKED.
 */
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { processDueJobs, scheduleRecurringJobs } from "@/lib/jobs/queue";

const workerId = `worker-${process.pid}`;
const POLL_MS = 10_000;
const SCHEDULE_EVERY_POLLS = 6;
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

async function main() {
  logger.info("worker.started", { workerId });
  let polls = 0;
  while (!stopping) {
    try {
      if (polls % SCHEDULE_EVERY_POLLS === 0) {
        const enqueued = await scheduleRecurringJobs(prisma);
        if (enqueued) logger.info("worker.scheduled", { enqueued });
      }
      const { processed, claimed } = await processDueJobs(prisma, { limit: 20, workerId });
      if (claimed) logger.info("worker.processed", { processed, claimed });
    } catch (error) {
      logger.error("worker.loop_failed", { error });
    }
    polls += 1;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  logger.info("worker.stopped", { workerId });
  await prisma.$disconnect();
}

void main().catch(async (error) => {
  logger.error("worker.crashed", { error });
  await prisma.$disconnect();
  process.exit(1);
});
