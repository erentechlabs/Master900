"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { authorize } from "@/modules/auth/session";

/** Enroll the current learner in a certification track and continue to the right next step. */
export async function enrollAction(code: string): Promise<void> {
  const user = await authorize("learn:use").catch(() => null);
  if (!user) redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/certifications/${code}`)}`);
  const cert = await prisma.certification.findUnique({ where: { code } });
  if (!cert || cert.status === "RETIRED") redirect(`/certifications/${code}`);
  const existing = await prisma.enrollment.count({ where: { userId: user.id, status: "ACTIVE" } });
  const enrollment = await prisma.enrollment.upsert({
    where: { userId_certificationId: { userId: user.id, certificationId: cert.id } },
    create: { userId: user.id, certificationId: cert.id, isPrimary: existing === 0 },
    update: { status: "ACTIVE" },
  });
  revalidatePath("/dashboard");
  revalidatePath(`/certifications/${code}`);
  if (!user.onboardingCompletedAt) redirect("/onboarding");
  const hasQuestions = await prisma.question.count({ where: { certificationId: cert.id, status: "PUBLISHED" } });
  redirect(hasQuestions > 0 && !enrollment.diagnosticCompletedAt ? `/diagnostic/${code}` : cert.hasLearningPath ? `/learn/${code}` : `/certifications/${code}`);
}
