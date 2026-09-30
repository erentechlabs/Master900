import Link from "next/link";
import { ArrowLeft, Award, Clock, Repeat, Target, Timer } from "lucide-react";
import { getI18n } from "@/i18n/server";
import type { ResultsData } from "@/modules/assessment/service";
import { RingProgress } from "@/components/charts";
import { PageHeader, StatCard } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ResultsReviewList } from "./results-review-list";

export async function ResultsView({ data, expired, gamification }: { data: ResultsData; expired: boolean; gamification: boolean }) {
  const { t, fmt } = await getI18n();
  const isExam = data.kind === "practice";
  const answeredWithTime = data.total > 0 && data.timeSpentMs ? data.timeSpentMs / data.total : null;
  const weakest = [...data.domains].filter((d) => d.total > 0).sort((a, b) => a.percent - b.percent)[0];
  const practiceAgainHref = isExam ? `/practice?mode=${data.mode}${data.certificationCode ? `&cert=${data.certificationCode}` : ""}` : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isExam ? t("assessment.results.examTitle") : t("assessment.results.title")}
        title={data.title}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={data.backHref}>
                <ArrowLeft aria-hidden="true" />
                {data.backHref.startsWith("/learn/") && data.backHref.split("/").length > 3 ? t("assessment.results.backToLesson") : t("assessment.results.backToPractice")}
              </Link>
            </Button>
            {practiceAgainHref ? (
              <Button asChild>
                <Link href={practiceAgainHref}>
                  <Repeat aria-hidden="true" />
                  {t("assessment.results.practiceAgain")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {expired || data.status === "EXPIRED" ? <Alert variant="warning" role="status" title={t("assessment.results.expired")} /> : null}

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <Card className="flex flex-col items-center justify-center gap-2 p-6">
          <RingProgress value={data.score} label={t("assessment.results.score")} />
          <p className="text-center text-sm font-medium">{t("assessment.results.scoreValue", { correct: data.correct, total: data.total, percent: data.score })}</p>
        </Card>
        <div className="space-y-4">
          {data.targetPercent !== null ? (
            <Alert
              variant={data.score >= data.targetPercent ? "success" : "info"}
              title={data.score >= data.targetPercent ? t("assessment.results.targetMet", { target: data.targetPercent }) : t("assessment.results.targetNotMet", { target: data.targetPercent })}
            >
              {t("assessment.results.targetNote")}
            </Alert>
          ) : null}
          {data.passPercent !== null ? (
            <Alert variant={data.score >= data.passPercent ? "success" : "info"} title={data.score >= data.passPercent ? t("assessment.quiz.passed") : t("assessment.quiz.notPassed")}>
              {t("assessment.quiz.passTarget", { percent: data.passPercent })}
            </Alert>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label={t("assessment.results.score")} value={fmt.percent(data.score)} icon={Target} />
            <StatCard label={t("assessment.results.timeSpent")} value={data.timeSpentMs !== null ? fmt.duration(data.timeSpentMs / 1000) : "—"} icon={Clock} />
            <StatCard label={t("assessment.results.averageTime")} value={answeredWithTime !== null ? fmt.duration(answeredWithTime / 1000) : "—"} icon={Timer} />
          </div>
          {data.incorrectCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              <Repeat className="mr-1 inline h-4 w-4" aria-hidden="true" />
              {t("assessment.results.reviewQueueAdded", { count: data.incorrectCount })}{" "}
              <Link href="/practice/mistakes" className="text-primary underline-offset-4 hover:underline">
                {t("assessment.mistakes.title")}
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      {gamification && data.newBadges.length ? (
        <Alert variant="success" title={t("assessment.results.newBadges")}>
          <ul className="mt-1 flex flex-wrap gap-2">
            {data.newBadges.map((b) => (
              <li key={b.key}>
                <Badge variant="purple">
                  <Award aria-hidden="true" />
                  {b.name}
                </Badge>
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {data.domains.length ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("assessment.results.byDomain")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table caption={t("assessment.results.byDomain")}>
              <THead>
                <TR>
                  <TH>{t("assessment.results.domain")}</TH>
                  <TH className="w-28">{t("assessment.results.correct")}</TH>
                  <TH className="w-48">{t("assessment.results.percent")}</TH>
                </TR>
              </THead>
              <TBody>
                {data.domains.map((d) => (
                  <TR key={d.domainId}>
                    <TD className="font-medium">{d.title}</TD>
                    <TD className="tabular-nums">{t("common.of", { current: d.correct, total: d.total })}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={d.percent}
                          label={`${d.title}: ${fmt.percent(d.percent)}`}
                          indicatorClassName={d.percent >= 75 ? "bg-success" : d.percent < 60 ? "bg-destructive" : undefined}
                        />
                        <span className="w-12 shrink-0 text-right tabular-nums">{fmt.percent(d.percent)}</span>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {weakest && weakest.percent < 75 ? <p className="text-sm font-medium">{t("assessment.results.weakestDomain", { domain: weakest.title })}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <ResultsReviewList items={data.reviews} />
    </div>
  );
}
