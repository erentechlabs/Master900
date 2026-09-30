"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError, enforceRateLimit, runAction, type ActionResult } from "@/lib/actions";
import { isValidTimeZone } from "@/lib/dates";
import { LOCALE_COOKIE } from "@/i18n/config";
import { authorize } from "@/modules/auth/session";
import { BCRYPT_ROUNDS } from "@/modules/auth/options";
import { changePasswordSchema } from "@/modules/auth/schemas";

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

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  return runAction("settings.changePassword", async () => {
    const user = await authorize("learn:use");
    if (user.isDemo) throw new ActionError("forbidden");
    enforceRateLimit("mutation", user.id);
    const parsed = changePasswordSchema.parse(input);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    const valid = await bcrypt.compare(parsed.currentPassword, row.passwordHash);
    if (!valid) throw new ActionError("current_password_invalid", { currentPassword: "current_password_invalid" });
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(parsed.newPassword, BCRYPT_ROUNDS), sessionVersion: { increment: 1 } },
    });
    return undefined;
  });
}

export async function signOutEverywhereAction(): Promise<ActionResult> {
  return runAction("settings.signOutEverywhere", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    return undefined;
  });
}

const deleteSchema = z.object({ confirmation: z.string(), currentPassword: z.string().min(1).max(128) });

export async function deleteAccountAction(input: unknown): Promise<ActionResult> {
  return runAction("settings.deleteAccount", async () => {
    const user = await authorize("learn:use");
    if (user.isDemo) throw new ActionError("forbidden");
    enforceRateLimit("mutation", user.id);
    const parsed = deleteSchema.parse(input);
    if (parsed.confirmation !== "DELETE") throw new ActionError("confirmation_mismatch", { confirmation: "confirmation_mismatch" });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true, roles: { include: { role: true } } } });
    const valid = await bcrypt.compare(parsed.currentPassword, row.passwordHash);
    if (!valid) throw new ActionError("current_password_invalid", { currentPassword: "current_password_invalid" });
    if (row.roles.some((r) => r.role.key === "ADMIN")) {
      const admins = await prisma.user.count({ where: { roles: { some: { role: { key: "ADMIN" } } } } });
      if (admins <= 1) throw new ActionError("last_admin");
    }
    await prisma.user.delete({ where: { id: user.id } });
    return undefined;
  });
}
