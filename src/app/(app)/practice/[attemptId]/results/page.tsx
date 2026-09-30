import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ActionError } from "@/lib/actions";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/modules/auth/session";
import { getResults } from "@/modules/assessment/service";
import { ResultsView } from "@/components/assessment/results-view";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("assessment.results.examTitle") };
}

export default async function PracticeResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ attemptId }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/practice/${attemptId}/results`);
  const { t, locale } = await getI18n();
  const data = await getResults(user, "practice", attemptId, locale, t).catch((error: unknown) => {
    if (error instanceof ActionError) notFound();
    throw error;
  });
  if ("redirect" in data) redirect(data.redirect);
  return <ResultsView data={data} expired={sp.expired === "1"} gamification={user.preference?.gamificationEnabled !== false} />;
}
