import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { requirePermission } from "@/modules/auth/session";
import { PageHeader } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { saveOnboardingAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("learner.onboarding.title") };
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ cert?: string; error?: string }> }) {
  const [{ cert, error }, user, { t }] = await Promise.all([searchParams, requirePermission("learn:use", "/onboarding"), getI18n()]);
  const certifications = await prisma.certification.findMany({
    where: { status: { in: ["ACTIVE", "ANNOUNCED", "RETIRING"] }, isVisible: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { code: true, name: true, status: true, hasLearningPath: true },
  });
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { certification: { select: { code: true } } },
  });
  const preferred = cert?.toUpperCase();
  const selected = preferred && certifications.some((c) => c.code === preferred) ? [preferred] : enrollments.map((e) => e.certification.code);
  const pref = user.preference;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("learner.onboarding.title")} description={t("learner.onboarding.subtitle")} />
      {error ? <Alert variant="destructive" className="mb-4" title={t("errors.invalid_input")} /> : null}
      <OnboardingWizard
        certifications={certifications}
        initial={{
          certificationCodes: selected,
          careerGoal: pref?.careerGoal ?? "",
          experienceLevel: pref?.experienceLevel ?? "",
          targetExamDate: enrollments[0]?.targetExamDate?.toISOString().slice(0, 10) ?? "",
          studyDays: pref?.studyDays.length ? pref.studyDays : [1, 2, 3, 4, 5],
          sessionMinutes: pref?.sessionMinutes ?? 30,
          learningStyle: pref?.learningStyle ?? "",
          locale: user.locale === "tr" ? "tr" : "en",
          timezone: pref?.timezone ?? "UTC",
          dailyGoalMinutes: pref?.dailyGoalMinutes ?? 20,
        }}
        action={saveOnboardingAction}
      />
    </div>
  );
}

