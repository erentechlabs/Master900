import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, BookOpen, CalendarCheck, Gauge, LayoutDashboard, RotateCcw, ThumbsUp, Target } from "lucide-react";
import { prisma } from "@/lib/db";
import { ActionError } from "@/lib/actions";
import { getI18n } from "@/i18n/server";
import { localizedField, type MessageKey } from "@/i18n/translator";
import { requireUser } from "@/modules/auth/session";
import { getResults } from "@/modules/assessment/service";
import { classifyDomains } from "@/modules/assessment/engine/results";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { RingProgress } from "@/components/charts";
import { ResultsReviewList } from "@/components/assessment/results-review-list";
import { PageHeader } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("learner.diagnostic.resultsTitle") };
}

export default async function DiagnosticResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/diagnostic/${code}/results`);
  const { t, fmt, locale } = await getI18n();
  const cert = await prisma.certification.findUnique({ where: { code }, select: { id: true, code: true, name: true, translations: true } });
  if (!cert) notFound();

  const requested = Array.isArray(sp.attempt) ? sp.attempt[0] : sp.attempt;
  const attempt = await prisma.quizAttempt.findFirst({
    where: { userId: user.id, quiz: { kind: "DIAGNOSTIC", certificationId: cert.id }, ...(requested ? { id: requested } : { status: { in: ["SUBMITTED", "EXPIRED"] } }) },
    orderBy: { submittedAt: "desc" },
    select: { id: true, status: true },
  });
  if (!attempt) redirect(`/diagnostic/${cert.code}`);
  if (attempt.status === "IN_PROGRESS") redirect(`/quiz/${attempt.id}`);

  const results = await getResults(user, "quiz", attempt.id, locale, t).catch((error: unknown) => {
    if (error instanceof ActionError) notFound();
    throw error;
  });
  if ("redirect" in results) redirect(results.redirect);

  const classified = classifyDomains(results.domains.map((d) => ({ ...d, answered: d.total })));
  const strengths = results.domains.filter((d) => classified.strong.includes(d.domainId));
  const focus = results.domains.filter((d) => classified.weak.includes(d.domainId));
  const focusIds = focus.map((d) => d.domainId);

  const [modules, plan, readiness] = await Promise.all([
    prisma.module.findMany({
      where: { AND: [{ certificationId: cert.id }, learnerVisibleWhere(), ...(focusIds.length ? [{ domainId: { in: focusIds } }] : [])] },
      orderBy: [{ domain: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      take: 4,
      select: {
        id: true,
        title: true,
        summary: true,
        translations: true,
        estimatedMinutes: true,
        domain: { select: { title: true, translations: true } },
        lessons: { where: learnerVisibleWhere(), orderBy: { sortOrder: "asc" }, take: 1, select: { slug: true } },
      },
    }),
    prisma.studyPlan.findFirst({
      where: { userId: user.id, certificationId: cert.id, status: "ACTIVE" },
      select: { targetDate: true, _count: { select: { sessions: { where: { status: "PLANNED" } } } } },
    }),
    prisma.readinessSnapshot.findFirst({ where: { userId: user.id, certificationId: cert.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const firstLessonHref = modules.find((m) => m.lessons[0])?.lessons[0] ? `/learn/${cert.code}/${modules.find((m) => m.lessons[0])!.lessons[0]!.slug}` : `/learn/${cert.code}`;
  const certName = localizedField(cert.name, cert.translations, locale, "name");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${cert.code}: ${certName}`}
        title={t("learner.diagnostic.resultsTitle")}
        description={t("learner.diagnostic.resultsSubtitle")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard">
                <LayoutDashboard aria-hidden="true" />
                {t("nav.dashboard")}
              </Link>
            </Button>
            <Button asChild>
              <Link href={firstLessonHref}>
                {t("learner.diagnostic.startLearning")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col items-center justify-center gap-2 p-6">
          <RingProgress value={results.score} label={t("learner.diagnostic.score")} />
          <p className="text-center text-sm">{t("assessment.results.scoreValue", { correct: results.correct, total: results.total, percent: results.score })}</p>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("learner.diagnostic.initialReadiness")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {readiness ? (
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="info" className="text-sm">
                  {t(`enums.readinessLevel.${readiness.level}` as MessageKey)}
                </Badge>
                <span className="text-sm tabular-nums text-muted-foreground">{fmt.percent(readiness.score)}</span>
                <p className="w-full text-sm">{t(`progress.level_${readiness.level}` as MessageKey)}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("progress.noData")}</p>
            )}
            <p className="text-xs text-muted-foreground">{t("progress.readinessDisclaimer")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <ThumbsUp className="h-5 w-5 text-success" aria-hidden="true" />
              {t("learner.diagnostic.strengths")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {strengths.length ? (
              <ul className="space-y-3">
                {strengths.map((d) => (
                  <li key={d.domainId} className="space-y-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="font-medium">{d.title}</span>
                      <span className="tabular-nums">{fmt.percent(d.percent)}</span>
                    </div>
                    <Progress value={d.percent} label={`${d.title}: ${fmt.percent(d.percent)}`} indicatorClassName="bg-success" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("learner.diagnostic.noStrengths")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Target className="h-5 w-5 text-warning" aria-hidden="true" />
              {t("learner.diagnostic.focusAreas")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {focus.length ? (
              <ul className="space-y-3">
                {focus.map((d) => (
                  <li key={d.domainId} className="space-y-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="font-medium">{d.title}</span>
                      <span className="tabular-nums">{fmt.percent(d.percent)}</span>
                    </div>
                    <Progress value={d.percent} label={`${d.title}: ${fmt.percent(d.percent)}`} indicatorClassName="bg-warning" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("learner.diagnostic.noFocusAreas")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {modules.length ? (
        <section aria-labelledby="recommended-modules" className="space-y-3">
          <h2 id="recommended-modules" className="text-lg font-semibold tracking-tight">
            {t("learner.diagnostic.recommendedModules")}
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {modules.map((m) => (
              <li key={m.id}>
                <Card className="h-full">
                  <CardHeader>
                    <p className="text-xs font-medium text-muted-foreground">{localizedField(m.domain.title, m.domain.translations, locale, "title")}</p>
                    <CardTitle as="h3">{localizedField(m.title, m.translations, locale, "title")}</CardTitle>
                    {m.summary ? <CardDescription>{localizedField(m.summary, m.translations, locale, "summary")}</CardDescription> : null}
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{t("common.minutes", { count: m.estimatedMinutes })}</span>
                    {m.lessons[0] ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/learn/${cert.code}/${m.lessons[0].slug}`}>
                          <BookOpen aria-hidden="true" />
                          {t("common.start")}
                        </Link>
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan ? (
        <Alert variant="success" title={t("learner.diagnostic.planCreated")}>
          <p>{t("learner.diagnostic.planCreatedBody", { count: plan._count.sessions, date: fmt.calendarDate(plan.targetDate) })}</p>
          <Link href="/plan" className="mt-1 inline-flex items-center gap-1 font-medium">
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            {t("learner.diagnostic.viewPlan")}
          </Link>
        </Alert>
      ) : null}

      <ResultsReviewList items={results.reviews} />

      <div className="flex justify-end">
        <Button asChild variant="ghost">
          <Link href={`/diagnostic/${cert.code}`}>
            <RotateCcw aria-hidden="true" />
            {t("learner.diagnostic.retake")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
