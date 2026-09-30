import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, Clock, ListChecks, PlayCircle, SkipForward } from "lucide-react";
import { prisma } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { errorText } from "@/i18n/errors";
import { requireUser } from "@/modules/auth/session";
import { getCatalogCert } from "@/modules/catalog/queries";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { CertIcon } from "@/components/learning/certification-card";
import { PageHeader } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { startDiagnosticAction } from "@/app/(app)/practice/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("learner.diagnostic.title") };
}

export default async function DiagnosticPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/diagnostic/${code}`);
  const { t, fmt, locale } = await getI18n();
  const cert = await getCatalogCert(code, locale);
  if (!cert) notFound();

  const quiz = await prisma.quiz.findFirst({ where: { kind: "DIAGNOSTIC", certificationId: cert.id } });
  const [questionCount, inProgress, lastCompleted] = await Promise.all([
    prisma.question.count({ where: { AND: [{ certificationId: cert.id }, learnerVisibleWhere()] } }),
    quiz ? prisma.quizAttempt.findFirst({ where: { userId: user.id, quizId: quiz.id, status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" } }) : null,
    quiz ? prisma.quizAttempt.findFirst({ where: { userId: user.id, quizId: quiz.id, status: { in: ["SUBMITTED", "EXPIRED"] } }, orderBy: { submittedAt: "desc" } }) : null,
  ]);
  const available = !!quiz && questionCount > 0;
  const plannedCount = quiz ? Math.min(quiz.questionCount, questionCount) : 0;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow={`${cert.code}: ${cert.name}`} title={t("learner.diagnostic.title")} description={t("learner.diagnostic.intro")} />
      {error ? (
        <Alert variant="destructive" role="alert">
          {error === "no_questions" ? t("learner.diagnostic.unavailable") : errorText(t, error)}
        </Alert>
      ) : null}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-4">
            <CertIcon icon={cert.icon} color={cert.themeColor} />
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
                {t("learner.diagnostic.questionsInfo", { count: plannedCount })}
              </li>
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                {t("learner.diagnostic.noTimer")}
              </li>
              <li className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                {t("assessment.runner.originalNotice")}
              </li>
            </ul>
          </div>
          {!available ? <Alert variant="warning">{t("learner.diagnostic.unavailable")}</Alert> : null}
          {lastCompleted?.submittedAt ? (
            <p className="text-sm text-muted-foreground">
              {t("learner.diagnostic.lastTaken", { date: fmt.date(lastCompleted.submittedAt), score: lastCompleted.score ?? 0 })}{" "}
              <Link href={`/diagnostic/${cert.code}/results?attempt=${lastCompleted.id}`} className="text-primary underline-offset-4 hover:underline">
                {t("learner.diagnostic.viewResults")}
              </Link>
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {inProgress ? (
            <Button asChild>
              <Link href={`/quiz/${inProgress.id}`}>
                <PlayCircle aria-hidden="true" />
                {t("common.resume")}
              </Link>
            </Button>
          ) : available ? (
            <form action={startDiagnosticAction.bind(null, cert.code)}>
              <SubmitButton pendingLabel={t("common.loading")}>
                <PlayCircle aria-hidden="true" />
                {lastCompleted ? t("learner.diagnostic.retake") : t("learner.diagnostic.start")}
              </SubmitButton>
            </form>
          ) : null}
          <Button asChild variant="ghost">
            <Link href={`/learn/${cert.code}`}>
              <SkipForward aria-hidden="true" />
              {t("learner.diagnostic.skip")}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
