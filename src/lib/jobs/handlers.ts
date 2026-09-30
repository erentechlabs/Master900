import "server-only";
import type { PrismaClient } from "@prisma/client";
import { audit } from "@/modules/admin/audit";
import { generateDraftQuestions } from "@/modules/admin/ai-drafts";
import { computeAndStoreReadiness } from "@/modules/analytics/data";
import { buildStudyPlan, markMissedSessions, planSettingsFromPlan } from "@/modules/planner/service";
import { createTranslator } from "@/i18n/translator";
import { getMessages } from "@/i18n/messages";
import { isLocale } from "@/i18n/config";

export type JobHandler = (db: PrismaClient, payload: unknown) => Promise<unknown>;

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

export const jobHandlers: Record<string, JobHandler> = {
  async "content.publishScheduled"(db) {
    const now = new Date();
    const [lessons, questions, labs] = await Promise.all([
      db.lesson.findMany({ where: { status: "APPROVED", publishAt: { lte: now } }, select: { id: true, version: true } }),
      db.question.findMany({ where: { status: "APPROVED", publishAt: { lte: now } }, select: { id: true, version: true } }),
      db.lab.findMany({ where: { status: "APPROVED", publishAt: { lte: now } }, select: { id: true, version: true } }),
    ]);
    for (const l of lessons) {
      await db.lesson.update({ where: { id: l.id }, data: { status: "PUBLISHED", publishedAt: now, publishAt: null, lastReviewedAt: now } });
      await db.contentReview.create({ data: { entityType: "LESSON", entityId: l.id, entityVersion: l.version, fromStatus: "APPROVED", toStatus: "PUBLISHED", decision: "PUBLISHED", comment: "Published by scheduled job" } });
      await audit(null, "job.publishScheduled", { entityType: "LESSON", entityId: l.id, summary: "Scheduled lesson published" }, db);
    }
    for (const q of questions) {
      await db.question.update({ where: { id: q.id }, data: { status: "PUBLISHED", publishedAt: now, publishAt: null, lastReviewedAt: now } });
      await db.contentReview.create({ data: { entityType: "QUESTION", entityId: q.id, entityVersion: q.version, fromStatus: "APPROVED", toStatus: "PUBLISHED", decision: "PUBLISHED", comment: "Published by scheduled job" } });
      await audit(null, "job.publishScheduled", { entityType: "QUESTION", entityId: q.id, summary: "Scheduled question published" }, db);
    }
    for (const l of labs) {
      await db.lab.update({ where: { id: l.id }, data: { status: "PUBLISHED", publishedAt: now, publishAt: null, lastReviewedAt: now } });
      await db.contentReview.create({ data: { entityType: "LAB", entityId: l.id, entityVersion: l.version, fromStatus: "APPROVED", toStatus: "PUBLISHED", decision: "PUBLISHED", comment: "Published by scheduled job" } });
      await audit(null, "job.publishScheduled", { entityType: "LAB", entityId: l.id, summary: "Scheduled lab published" }, db);
    }
    return { lessons: lessons.length, questions: questions.length, labs: labs.length };
  },
  async "analytics.readinessSnapshots"(db) {
    const enrollments = await db.enrollment.findMany({ where: { status: "ACTIVE" }, select: { userId: true, certificationId: true } });
    for (const e of enrollments) await computeAndStoreReadiness(db, e.userId, e.certificationId);
    return { enrollments: enrollments.length };
  },
  async "planner.adjustPlans"(db) {
    // Only plans that actually had missed sessions are rebuilt, in each learner's own language and time zone.
    const users = await db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, locale: true, preference: { select: { timezone: true } } } });
    let adjusted = 0;
    for (const user of users) {
      const timeZone = user.preference?.timezone ?? "UTC";
      const missedByPlan = await markMissedSessions(db, user.id, timeZone);
      if (missedByPlan.size === 0) continue;
      const locale = isLocale(user.locale) ? user.locale : "en";
      const t = createTranslator(getMessages(locale));
      const plans = await db.studyPlan.findMany({ where: { id: { in: [...missedByPlan.keys()] }, status: "ACTIVE" } });
      for (const plan of plans) {
        await buildStudyPlan(db, user.id, planSettingsFromPlan(plan), { reason: "missed", t, locale, timeZone });
        adjusted += 1;
      }
    }
    return { users: users.length, adjustedPlans: adjusted };
  },
  async "ai.generateDrafts"(db, payload) {
    const p = payloadRecord(payload);
    const lessonId = String(p.lessonId ?? "");
    const count = Number(p.count ?? 3);
    const actorId = String(p.actorId ?? "");
    const actor = actorId ? await db.user.findUnique({ where: { id: actorId }, select: { id: true, email: true } }) : null;
    return generateDraftQuestions(db, { lessonId, count, actor: actor ?? { id: actorId || "system", email: "system" } });
  },
};
