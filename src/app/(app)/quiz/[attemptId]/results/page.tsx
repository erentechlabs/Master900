import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ActionError } from "@/lib/actions";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/modules/auth/session";
import { getResults } from "@/modules/assessment/service";
import { ResultsView } from "@/components/assessment/results-view";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("assessment.results.title") };
}

export default async function QuizResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ attemptId }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/quiz/${attemptId}/results`);
  const attempt = await prisma.quizAttempt.findFirst({
    where: { id: attemptId, userId: user.id },
    select: { quiz: { select: { kind: true, certification: { select: { code: true } } } } },
  });
  if (!attempt) notFound();
  if (attempt.quiz.kind === "DIAGNOSTIC") redirect(`/diagnostic/${attempt.quiz.certification.code}/results?attempt=${attemptId}`);
  const { t, locale } = await getI18n();
  const data = await getResults(user, "quiz", attemptId, locale, t).catch((error: unknown) => {
    if (error instanceof ActionError) notFound();
    throw error;
  });
  if ("redirect" in data) redirect(data.redirect);
  return <ResultsView data={data} expired={sp.expired === "1"} gamification={user.preference?.gamificationEnabled !== false} />;
}
