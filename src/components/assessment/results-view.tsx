import Link from "next/link";
import { ArrowLeft, Award, CheckCircle2, Clock, Flame, Repeat, Sparkles, Target, Timer } from "lucide-react";
import { getI18n } from "@/i18n/server";
import type { ResultsData } from "@/modules/assessment/service";
import { PageHeader, StatCard } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ResultsReviewList } from "./results-review-list";
import { ResultsCelebration } from "./results-celebration";

export async function ResultsView({ data, expired, gamification }: { data: ResultsData; expired: boolean; gamification: boolean }) {
  const { t, fmt } = await getI18n();
  const isExam = data.kind === "practice";
  const isLightning = data.mode === "LIGHTNING" && !!data.lightning;
  const answeredWithTime = data.total > 0 && data.timeSpentMs ? data.timeSpentMs / data.total : null;
  // Domains with at least one mistake, weakest first; a perfect round has nothing to review.
  const weakest = [...data.domains].filter((d) => d.total > 0 && d.correct < d.total).sort((a, b) => a.percent - b.percent).slice(0, 3);
  const celebrateResult = !!data.lightning?.isPersonalBest || data.correct === data.total || (data.targetPercent !== null && data.score >= data.targetPercent) || (data.passPercent !== null && data.score >= data.passPercent);
  const practiceAgainHref = isExam ? `/practice?mode=${data.mode}${data.certificationCode ? `&cert=${data.certificationCode}` : ""}` : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isLightning ? t("assessment.results.lightningEyebrow") : isExam ? t("assessment.results.examTitle") : t("assessment.results.title")}
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
          <ResultsCelebration value={data.score} label={isLightning ? t("assessment.results.roundScore") : t("assessment.results.score")} celebrateOnMount={celebrateResult} personalBest={!!data.lightning?.isPersonalBest} pointsMode={isLightning} />
          {isLightning ? null : <p className="text-center text-sm font-medium">{t("assessment.results.scoreValue", { correct: data.correct, total: data.total, percent: data.score })}</p>}
        </Card>
        <div className="space-y-4">
          {data.lightning ? (
            <Alert variant={data.lightning.isPersonalBest ? "success" : "info"} title={data.lightning.isPersonalBest ? t("assessment.results.newPersonalBest") : t("assessment.results.lightningComplete")}>
              {t("assessment.results.lightningDetails", {
                combo: data.lightning.bestCombo,
                time: fmt.duration(data.lightning.timeUsedMs / 1000),
                bonus: data.lightning.timeBonus,
                best: data.lightning.personalBest ?? 0,
              })}
            </Alert>
          ) : null}
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
          {data.lightning ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label={t("assessment.results.correct")} value={t("common.of", { current: data.correct, total: data.total })} icon={CheckCircle2} />
              <StatCard label={t("assessment.results.bestCombo")} value={String(data.lightning.bestCombo)} icon={Flame} />
              <StatCard label={t("assessment.results.timeBonus")} value={t("assessment.results.points", { score: data.lightning.timeBonus })} icon={Sparkles} />
              <StatCard label={t("assessment.results.timeSpent")} value={data.timeSpentMs !== null ? fmt.duration(data.timeSpentMs / 1000) : "—"} icon={Clock} />
              <StatCard label={t("assessment.results.averageTime")} value={answeredWithTime !== null ? fmt.duration(answeredWithTime / 1000) : "—"} icon={Timer} />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label={t("assessment.results.score")} value={fmt.percent(data.score)} icon={Target} />
              <StatCard label={t("assessment.results.timeSpent")} value={data.timeSpentMs !== null ? fmt.duration(data.timeSpentMs / 1000) : "—"} icon={Clock} />
              <StatCard label={t("assessment.results.averageTime")} value={answeredWithTime !== null ? fmt.duration(answeredWithTime / 1000) : "—"} icon={Timer} />
            </div>
          )}
          {weakest.length ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="text-base">
                  {t("assessment.results.reviewNext")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {weakest.map((domain) => (
                    <li key={domain.domainId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <span>{domain.title}</span>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/practice?mode=DOMAIN${data.certificationCode ? `&cert=${data.certificationCode}` : ""}`}>{t("assessment.results.reviewDomain")}</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {data.incorrectCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              <Repeat className="mr-1 inline h-4 w-4" aria-hidden="true" />
              {t("assessment.results.reviewQueueAdded", { count: data.incorrectCount })}{" "}
              <Link href="/practice/mistakes" className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary">
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
            {weakest[0] && weakest[0].percent < 75 ? <p className="text-sm font-medium">{t("assessment.results.weakestDomain", { domain: weakest[0].title })}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <ResultsReviewList items={data.reviews} />
    </div>
  );
}
