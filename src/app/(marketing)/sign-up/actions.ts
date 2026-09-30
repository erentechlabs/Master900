"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ActionError, clientIp, enforceRateLimit, runAction, type ActionResult } from "@/lib/actions";
import { isValidTimeZone } from "@/lib/dates";
import { LOCALE_COOKIE } from "@/i18n/config";
import { getSettings } from "@/modules/admin/settings";
import { BCRYPT_ROUNDS } from "@/modules/auth/options";
import { signUpSchema } from "@/modules/auth/schemas";

export async function registerAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("auth.register", async () => {
    enforceRateLimit("signUp", await clientIp());
    const settings = await getSettings();
    if (!getEnv().REGISTRATION_ENABLED || !settings["platform.registrationEnabled"]) throw new ActionError("registration_disabled");

    const parsed = signUpSchema.safeParse({
      name: formData.get("name") ?? "",
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
      locale: formData.get("locale") ?? "en",
      acceptTerms: formData.get("acceptTerms") ?? undefined,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "_form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.path[0] === "email" ? "email_invalid" : issue.message;
      }
      throw new ActionError("invalid_input", fieldErrors);
    }
    const { email, password, name, locale } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ActionError("invalid_input", { email: "email_taken" });

    const tzInput = String(formData.get("timezone") ?? "");
    const timezone = isValidTimeZone(tzInput) ? tzInput : "UTC";
    const learnerRole = await prisma.role.findUniqueOrThrow({ where: { key: "LEARNER" } });
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        locale,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        roles: { create: { roleId: learnerRole.id } },
        preference: { create: { timezone, studyDays: [1, 3, 5], sessionMinutes: 30 } },
      },
    });
    (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    logger.info("auth.registered", { userId: user.id });
    return undefined;
  });
}
