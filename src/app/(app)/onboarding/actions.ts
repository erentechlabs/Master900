"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseISODate } from "@/lib/dates";
import { LOCALE_COOKIE } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { authorize } from "@/modules/auth/session";
import { buildStudyPlan, defaultTargetDate } from "@/modules/planner/service";
import { onboardingInputSchema, parseOnboardingFormData } from "@/modules/learning/onboarding";

export async function saveOnboardingAction(formData: FormData): Promise<void> {
  const user = await authorize("learn:use");
  const parsed = onboardingInputSchema.safeParse(parseOnboardingFormData(formData));
  if (!parsed.success) redirect("/onboarding?error=invalid_input");
  const data = parsed.data;
  const certs = await prisma.certification.findMany({
    where: { code: { in: data.certificationCodes }, status: { not: "RETIRED" }, isVisible: true },
    select: { id: true, code: true, hasLearningPath: true },
  });
  const byCode = new Map(certs.map((c) => [c.code, c]));
  const ordered = data.certificationCodes.map((code) => byCode.get(code)).filter((c): c is NonNullable<typeof c> => !!c);
  if (!ordered.length) redirect("/onboarding?error=invalid_input");

  await prisma.$transaction(async (tx) => {
    await tx.userPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        careerGoal: data.careerGoal,
        experienceLevel: data.experienceLevel,
        studyDays: data.studyDays,
        sessionMinutes: data.sessionMinutes,
        learningStyle: data.learningStyle,
        timezone: data.timezone,
        dailyGoalMinutes: data.dailyGoalMinutes,
      },
      update: {
        careerGoal: data.careerGoal,
        experienceLevel: data.experienceLevel,
        studyDays: data.studyDays,
        sessionMinutes: data.sessionMinutes,
        learningStyle: data.learningStyle,
        timezone: data.timezone,
        dailyGoalMinutes: data.dailyGoalMinutes,
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { locale: data.locale, onboardingCompletedAt: new Date() } });
    await tx.enrollment.updateMany({ where: { userId: user.id }, data: { isPrimary: false } });
    for (const [index, cert] of ordered.entries()) {
      await tx.enrollment.upsert({
        where: { userId_certificationId: { userId: user.id, certificationId: cert.id } },
        create: {
          userId: user.id,
          certificationId: cert.id,
          isPrimary: index === 0,
          targetExamDate: data.targetExamDate ? parseISODate(data.targetExamDate) : null,
        },
        update: {
          status: "ACTIVE",
          isPrimary: index === 0,
          targetExamDate: data.targetExamDate ? parseISODate(data.targetExamDate) : null,
        },
      });
    }
  });

  (await cookies()).set(LOCALE_COOKIE, data.locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });

  const primary = ordered[0]!;
  if (formData.get("skipDiagnostic") === "1") {
    const { t, locale } = await getI18n();
    await buildStudyPlan(
      prisma,
      user.id,
      {
        certificationId: primary.id,
        targetDate: data.targetExamDate ?? defaultTargetDate(data.timezone),
        studyDays: data.studyDays,
        sessionMinutes: data.sessionMinutes,
        revisionWeeks: 1,
        includePracticeExams: true,
        preferredTime: "18:00",
      },
      { t, locale, timeZone: data.timezone, reason: "regenerated" },
    );
    revalidatePath("/dashboard");
    redirect("/dashboard");
  }
  revalidatePath("/dashboard");
  redirect(`/diagnostic/${primary.code}`);
}

