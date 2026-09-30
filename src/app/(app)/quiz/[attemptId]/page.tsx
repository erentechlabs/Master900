import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ActionError } from "@/lib/actions";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/modules/auth/session";
import { getRunnerData } from "@/modules/assessment/service";
import { AssessmentRunner } from "@/components/assessment/assessment-runner";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("enums.quizKind.KNOWLEDGE_CHECK") };
}

export default async function QuizAttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const user = await requireUser(`/quiz/${attemptId}`);
  const { t, locale } = await getI18n();
  const data = await getRunnerData(user, "quiz", attemptId, locale, t).catch((error: unknown) => {
    if (error instanceof ActionError) notFound();
    throw error;
  });
  if ("redirect" in data) redirect(data.redirect);
  return <AssessmentRunner data={data} />;
}
