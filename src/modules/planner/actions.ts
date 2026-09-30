"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError, enforceRateLimit, runAction, type ActionResult } from "@/lib/actions";
import { parseISODate, todayISO } from "@/lib/dates";
import { getI18n } from "@/i18n/server";
import { authorize } from "@/modules/auth/session";
import { awardBadges, computeAndStoreReadiness } from "@/modules/analytics/data";
import { XP_RULES } from "@/modules/analytics/gamification";
import { buildStudyPlan } from "./service";

const planSchema = z.object({
  certificationId: z.string().min(1).max(40),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  studyDays: z.array(z.coerce.number().int().min(0).max(6)).min(1),
  sessionMinutes: z.coerce.number().int().min(10).max(240),
  revisionWeeks: z.coerce.number().int().min(0).max(8),
  includePracticeExams: z.boolean(),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.enum(["regenerated", "target_changed"]).default("regenerated"),
});

export type PlanActionInput = z.input<typeof planSchema>;

function parsePlanFormData(formData: FormData): PlanActionInput {
  return {
    certificationId: String(formData.get("certificationId") ?? ""),
    targetDate: String(formData.get("targetDate") ?? ""),
    studyDays: formData.getAll("studyDays").map(Number),
    sessionMinutes: Number(formData.get("sessionMinutes") || 30),
    revisionWeeks: Number(formData.get("revisionWeeks") || 1),
    includePracticeExams: formData.get("includePracticeExams") === "on",
    preferredTime: String(formData.get("preferredTime") || "18:00"),
    reason: String(formData.get("reason") || "regenerated") as "regenerated" | "target_changed",
  };
}

export async function generatePlanAction(input: unknown): Promise<ActionResult<{ planId: string; sessions: number; warnings: string[] }>> {
  return runAction("planner.generate", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const data = planSchema.parse(input);
    const enrollment = await prisma.enrollment.findUnique({ where: { userId_certificationId: { userId: user.id, certificationId: data.certificationId } } });
    if (!enrollment) throw new ActionError("not_found");
    const tz = user.preference?.timezone ?? "UTC";
    if (data.targetDate <= todayISO(tz)) throw new ActionError("invalid_input", { targetDate: "future_date" });
    const { t, locale } = await getI18n();
    const result = await buildStudyPlan(
      prisma,
      user.id,
      {
        certificationId: data.certificationId,
        targetDate: data.targetDate,
        studyDays: [...new Set(data.studyDays)].sort((a, b) => a - b),
        sessionMinutes: data.sessionMinutes,
        revisionWeeks: data.revisionWeeks,
        includePracticeExams: data.includePracticeExams,
        preferredTime: data.preferredTime,
      },
      { t, locale, timeZone: tz, reason: data.reason },
    );
    revalidatePath("/plan");
    revalidatePath("/dashboard");
    return { ...result, warnings: result.warnings };
  });
}

export async function generatePlanFormAction(formData: FormData): Promise<void> {
  await generatePlanAction(parsePlanFormData(formData));
}

const sessionSchema = z.object({ sessionId: z.string().min(1).max(40) });

async function findOwnedSession(userId: string, sessionId: string) {
  const session = await prisma.studySession.findUnique({ where: { id: sessionId }, include: { plan: { select: { certificationId: true } } } });
  if (!session || session.userId !== userId) throw new ActionError("not_found");
  return session;
}

export async function completeStudySessionAction(input: unknown): Promise<ActionResult> {
  return runAction("planner.completeSession", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const { sessionId } = sessionSchema.parse(input);
    const session = await findOwnedSession(user.id, sessionId);
    if (session.status !== "COMPLETED") {
      await prisma.studySession.update({ where: { id: session.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      await prisma.learningEvent.create({
        data: {
          userId: user.id,
          certificationId: session.plan.certificationId,
          type: "STUDY_SESSION_COMPLETED",
          xp: XP_RULES.studySessionCompleted,
          durationSeconds: session.durationMinutes * 60,
          metadata: { studySessionId: session.id, type: session.type },
        },
      });
      const tz = user.preference?.timezone ?? "UTC";
      await Promise.all([awardBadges(prisma, user.id, tz), computeAndStoreReadiness(prisma, user.id, session.plan.certificationId, tz)]);
    }
    revalidatePath("/plan");
    revalidatePath("/dashboard");
    revalidatePath("/progress");
    return undefined;
  });
}

export async function skipStudySessionAction(input: unknown): Promise<ActionResult> {
  return runAction("planner.skipSession", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const { sessionId } = sessionSchema.parse(input);
    const session = await findOwnedSession(user.id, sessionId);
    await prisma.studySession.update({ where: { id: session.id }, data: { status: "SKIPPED" } });
    revalidatePath("/plan");
    revalidatePath("/dashboard");
    return undefined;
  });
}

const rescheduleSchema = sessionSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function rescheduleStudySessionAction(input: unknown): Promise<ActionResult> {
  return runAction("planner.rescheduleSession", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const { sessionId, date } = rescheduleSchema.parse(input);
    const session = await findOwnedSession(user.id, sessionId);
    if (date < todayISO(user.preference?.timezone ?? "UTC")) throw new ActionError("invalid_input", { date: "future_date" });
    await prisma.studySession.update({
      where: { id: session.id },
      data: { scheduledAt: parseISODate(date), originalScheduledAt: session.originalScheduledAt ?? session.scheduledAt, status: "PLANNED" },
    });
    revalidatePath("/plan");
    revalidatePath("/dashboard");
    return undefined;
  });
}

