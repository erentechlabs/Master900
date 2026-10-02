"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError, enforceRateLimit, runAction, type ActionResult } from "@/lib/actions";
import { isValidTimeZone } from "@/lib/dates";
import { LOCALE_COOKIE } from "@/i18n/config";
import { authorize } from "@/modules/auth/session";
import { accentColorSchema } from "@/components/settings/personalization-options";

const preferenceDefaults = {
  timezone: "UTC",
  studyDays: [] as number[],
  sessionMinutes: 30,
  dailyGoalMinutes: 20,
  learningStyle: null,
  experienceLevel: null,
  showTimerByDefault: true,
  gamificationEnabled: true,
  reducedMotion: false,
  accentColor: "default",
  transparencyEffects: true,
  shareAnonymousAnalytics: true,
};

const settingsSchema = z.object({
  name: z.string().trim().max(80).optional(),
  locale: z.enum(["en", "tr"]),
  timezone: z.string().refine(isValidTimeZone, "invalid_timezone"),
  studyDays: z.array(z.coerce.number().int().min(0).max(6)).max(7),
  sessionMinutes: z.coerce.number().int().min(5).max(240),
  dailyGoalMinutes: z.coerce.number().int().min(1).max(480),
  learningStyle: z.enum(["", "READING", "VISUAL", "GUIDED_PRACTICE", "QUIZZES"]).default(""),
  experienceLevel: z.enum(["", "NEW_TO_TECH", "SOME_EXPERIENCE", "EXPERIENCED"]).default(""),
  showTimerByDefault: z.boolean(),
  gamificationEnabled: z.boolean(),
  reducedMotion: z.boolean(),
  accentColor: accentColorSchema,
  transparencyEffects: z.boolean(),
  shareAnonymousAnalytics: z.boolean(),
});

export async function updateSettingsAction(input: unknown): Promise<ActionResult> {
  return runAction("settings.update", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const parsed = settingsSchema.parse(input);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: parsed.name || null,
        locale: parsed.locale,
        preference: {
          upsert: {
            create: {
              timezone: parsed.timezone,
              studyDays: [...new Set(parsed.studyDays)].sort(),
              sessionMinutes: parsed.sessionMinutes,
              dailyGoalMinutes: parsed.dailyGoalMinutes,
              learningStyle: parsed.learningStyle || null,
              experienceLevel: parsed.experienceLevel || null,
              showTimerByDefault: parsed.showTimerByDefault,
              gamificationEnabled: parsed.gamificationEnabled,
              reducedMotion: parsed.reducedMotion,
              accentColor: parsed.accentColor,
              transparencyEffects: parsed.transparencyEffects,
              shareAnonymousAnalytics: parsed.shareAnonymousAnalytics,
            },
            update: {
              timezone: parsed.timezone,
              studyDays: [...new Set(parsed.studyDays)].sort(),
              sessionMinutes: parsed.sessionMinutes,
              dailyGoalMinutes: parsed.dailyGoalMinutes,
              learningStyle: parsed.learningStyle || null,
              experienceLevel: parsed.experienceLevel || null,
              showTimerByDefault: parsed.showTimerByDefault,
              gamificationEnabled: parsed.gamificationEnabled,
              reducedMotion: parsed.reducedMotion,
              accentColor: parsed.accentColor,
              transparencyEffects: parsed.transparencyEffects,
              shareAnonymousAnalytics: parsed.shareAnonymousAnalytics,
            },
          },
        },
      },
    });
    (await cookies()).set(LOCALE_COOKIE, parsed.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false, secure: process.env.NODE_ENV === "production" });
    revalidatePath("/", "layout");
    revalidatePath("/settings");
    return undefined;
  });
}

const resetSchema = z.object({ confirmation: z.string() });

export async function resetLearningProgressAction(input: unknown): Promise<ActionResult> {
  await runAction("settings.resetLearningProgress", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const parsed = resetSchema.parse(input);
    if (parsed.confirmation !== "RESET") throw new ActionError("confirmation_mismatch", { confirmation: "confirmation_mismatch" });
    await prisma.$transaction(async (tx) => {
      await tx.questionAttempt.deleteMany({ where: { userId: user.id } });
      await tx.quizAttempt.deleteMany({ where: { userId: user.id } });
      await tx.practiceExamAttempt.deleteMany({ where: { userId: user.id } });
      await tx.reviewQueueItem.deleteMany({ where: { userId: user.id } });
      await tx.labAttempt.deleteMany({ where: { userId: user.id } });
      await tx.studySession.deleteMany({ where: { userId: user.id } });
      await tx.studyPlan.deleteMany({ where: { userId: user.id } });
      await tx.bookmark.deleteMany({ where: { userId: user.id } });
      await tx.note.deleteMany({ where: { userId: user.id } });
      await tx.userBadge.deleteMany({ where: { userId: user.id } });
      await tx.learningEvent.deleteMany({ where: { userId: user.id } });
      await tx.readinessSnapshot.deleteMany({ where: { userId: user.id } });
      await tx.tutorConversation.deleteMany({ where: { userId: user.id } });
      await tx.enrollment.deleteMany({ where: { userId: user.id } });
      await tx.lessonProgress.deleteMany({ where: { userId: user.id } });
      await tx.user.update({
        where: { id: user.id },
        data: {
          onboardingCompletedAt: null,
          preference: { upsert: { create: preferenceDefaults, update: preferenceDefaults } },
        },
      });
    });
    revalidatePath("/", "layout");
  });
  redirect("/dashboard");
}
