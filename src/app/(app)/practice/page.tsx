import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Flame, Gauge, History, ListChecks, Repeat, Sparkles, Timer, Zap } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { errorText } from "@/i18n/errors";
import type { MessageKey } from "@/i18n/translator";
import { cn } from "@/lib/utils";
import { requireUser } from "@/modules/auth/session";
import { getPracticeHub, type HubAttempt } from "@/modules/assessment/hub";
import { EmptyState, PageHeader, SectionTitle } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Label, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { startPracticeFormAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("assessment.practice.title") };
}

type Mode = "QUICK" | "DOMAIN" | "FULL" | "ADAPTIVE" | "DAILY" | "MISTAKE_REVIEW";
const MODES: Mode[] = ["QUICK", "DOMAIN", "FULL", "ADAPTIVE", "DAILY", "MISTAKE_REVIEW"];

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function attemptHref(a: HubAttempt, results = false) {
  return results ? `/practice/${a.id}/results` : `/practice/${a.id}`;
}

export default async function PracticeHubPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser("/practice");
  const { t, fmt, locale } = await getI18n();
  const requestedMode = one(sp.mode)?.toUpperCase() as Mode | undefined;
  const hub = await getPracticeHub(user, locale, one(sp.cert));
  const error = one(sp.error);
  const cert = hub.selected;
  const hasQuestions = !!cert && cert.questionCount > 0;
  const fullInProgress = hub.inProgress.find((a) => a.mode === "FULL" && a.certificationCode === cert?.code);
  const recommended = requestedMode && MODES.includes(requestedMode) ? requestedMode : null;

  const hidden = (mode: Mode) => (
    <>
      <input type="hidden" name="mode" value={mode} />
      {cert ? <input type="hidden" name="certificationCode" value={cert.code} /> : null}
    </>
  );

  const cardClass = (mode: Mode) => cn("flex flex-col", recommended === mode && "ring-2 ring-primary");
  const recommendedBadge = (mode: Mode) =>
    recommended === mode ? (
      <Badge variant="info" className="w-fit">
        <Sparkles aria-hidden="true" />
        {t("assessment.practice.recommended")}
      </Badge>
    ) : null;

  const cards: Record<Mode, React.ReactNode> = {
    QUICK: (
      <Card key="QUICK" id="mode-QUICK" className={cardClass("QUICK")}>
        <form action={startPracticeFormAction} className="flex flex-1 flex-col">
          {hidden("QUICK")}
          <CardHeader>
            {recommendedBadge("QUICK")}
            <CardTitle as="h3" className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("assessment.practice.quickTitle")}
            </CardTitle>
            <CardDescription>{t("assessment.practice.quickBody")}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quick-count">{t("assessment.practice.questionCount")}</Label>
              <Select id="quick-count" name="questionCount" defaultValue="10">
                {[5, 10, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
            {hub.domains.length > 1 ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("assessment.practice.domains")}</legend>
                <p className="text-xs text-muted-foreground">{t("assessment.practice.allDomainsHint")}</p>
                {hub.domains.map((d) => (
                  <label key={d.id} className="flex items-start gap-2 text-sm">
                    <Checkbox name="domainIds" value={d.id} className="mt-0.5" />
                    <span>{d.title}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="flex items-start gap-2 text-sm">
              <Checkbox name="immediateFeedback" defaultChecked className="mt-0.5" />
              <span>{t("assessment.practice.immediateFeedback")}</span>
            </label>
          </CardContent>
          <CardFooter>
            <SubmitButton disabled={!hasQuestions} pendingLabel={t("common.loading")}>
              {t("assessment.practice.start")}
            </SubmitButton>
          </CardFooter>
        </form>
      </Card>
    ),
    DOMAIN: (
      <Card key="DOMAIN" id="mode-DOMAIN" className={cardClass("DOMAIN")}>
        <form action={startPracticeFormAction} className="flex flex-1 flex-col">
          {hidden("DOMAIN")}
          <CardHeader>
            {recommendedBadge("DOMAIN")}
            <CardTitle as="h3" className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("assessment.practice.domainTitle")}
            </CardTitle>
            <CardDescription>{t("assessment.practice.domainBody")}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="domain-select">{t("assessment.practice.chooseDomain")}</Label>
              <Select id="domain-select" name="domainId" required defaultValue={hub.domains[0]?.id}>
                {hub.domains.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.questionCount === 0}>
                    {d.title} ({t("common.questionsCount", { count: d.questionCount })})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="domain-count">{t("assessment.practice.questionCount")}</Label>
              <Select id="domain-count" name="questionCount" defaultValue="10">
                {[10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox name="immediateFeedback" className="mt-0.5" />
              <span>{t("assessment.practice.immediateFeedback")}</span>
            </label>
          </CardContent>
          <CardFooter>
            <SubmitButton disabled={!hasQuestions || hub.domains.length === 0} pendingLabel={t("common.loading")}>
              {t("assessment.practice.start")}
            </SubmitButton>
          </CardFooter>
        </form>
      </Card>
    ),
    FULL: (
      <Card key="FULL" id="mode-FULL" className={cardClass("FULL")}>
        <form action={startPracticeFormAction} className="flex flex-1 flex-col">
          {hidden("FULL")}
          <CardHeader>
            {recommendedBadge("FULL")}
            <CardTitle as="h3" className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("assessment.practice.fullTitle")}
            </CardTitle>
            <CardDescription>{t("assessment.practice.fullBody", { count: hub.full.questionCount, minutes: hub.full.minutes })}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            <p className="text-xs text-muted-foreground">{t("assessment.practice.fullFormatNote")}</p>
            <p className="text-xs text-muted-foreground">{t("assessment.results.targetNote")}</p>
            {fullInProgress ? null : (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox name="restrictions" className="mt-0.5" aria-describedby="restrictions-hint" />
                <span>
                  {t("assessment.practice.restrictions")}
                  <span id="restrictions-hint" className="block text-xs text-muted-foreground">
                    {t("assessment.practice.restrictionsHint")}
                  </span>
                </span>
              </label>
            )}
          </CardContent>
          <CardFooter>
            {fullInProgress ? (
              <Button asChild>
                <Link href={attemptHref(fullInProgress)}>{t("assessment.practice.resume")}</Link>
              </Button>
            ) : (
              <SubmitButton disabled={!hasQuestions} pendingLabel={t("common.loading")}>
                {t("assessment.practice.start")}
              </SubmitButton>
            )}
          </CardFooter>
        </form>
      </Card>
    ),
    ADAPTIVE: (
      <Card key="ADAPTIVE" id="mode-ADAPTIVE" className={cardClass("ADAPTIVE")}>
        <form action={startPracticeFormAction} className="flex flex-1 flex-col">
          {hidden("ADAPTIVE")}
          <CardHeader>
            {recommendedBadge("ADAPTIVE")}
            <CardTitle as="h3" className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("assessment.practice.adaptiveTitle")}
            </CardTitle>
            <CardDescription>{t("assessment.practice.adaptiveBody")}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="adaptive-length">{t("assessment.practice.adaptiveLength")}</Label>
              <Select id="adaptive-length" name="questionCount" defaultValue="15">
                {[10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {t("common.questionsCount", { count: n })}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
          <CardFooter>
            <SubmitButton disabled={!hasQuestions} pendingLabel={t("common.loading")}>
              {t("assessment.practice.start")}
            </SubmitButton>
          </CardFooter>
        </form>
      </Card>
    ),
    DAILY: (
      <Card key="DAILY" id="mode-DAILY" className={cardClass("DAILY")}>
        <form action={startPracticeFormAction} className="flex flex-1 flex-col">
          <input type="hidden" name="mode" value="DAILY" />
          <CardHeader>
            {recommendedBadge("DAILY")}
            <CardTitle as="h3" className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("assessment.practice.dailyTitle")}
            </CardTitle>
            <CardDescription>{t("assessment.practice.dailyBody")}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {hub.daily.status === "done" ? (
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                {t("assessment.practice.dailyDone")}
                {hub.daily.score !== null ? <span className="tabular-nums">({fmt.percent(hub.daily.score)})</span> : null}
              </p>
            ) : null}
          </CardContent>
          <CardFooter>
            {hub.daily.status === "done" && hub.daily.attemptId ? (
              <Button asChild variant="outline">
                <Link href={`/practice/${hub.daily.attemptId}/results`}>{t("assessment.practice.viewResults")}</Link>
              </Button>
            ) : hub.daily.status === "in_progress" && hub.daily.attemptId ? (
              <Button asChild>
                <Link href={`/practice/${hub.daily.attemptId}`}>{t("assessment.practice.resume")}</Link>
              </Button>
            ) : (
              <SubmitButton disabled={!hub.certs.some((c) => c.enrolled)} pendingLabel={t("common.loading")}>
                {t("assessment.practice.start")}
              </SubmitButton>
            )}
          </CardFooter>
        </form>
      </Card>
    ),
    MISTAKE_REVIEW: (
      <Card key="MISTAKE_REVIEW" id="mode-MISTAKE_REVIEW" className={cardClass("MISTAKE_REVIEW")}>
        <CardHeader>
          {recommendedBadge("MISTAKE_REVIEW")}
          <CardTitle as="h3" className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("assessment.practice.mistakesTitle")}
          </CardTitle>
          <CardDescription>{t("assessment.practice.mistakesBody")}</CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          <p className="text-sm text-muted-foreground">{t("assessment.practice.mistakesCount", { count: hub.mistakes.total, due: hub.mistakes.due })}</p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button asChild variant={hub.mistakes.total ? "default" : "outline"}>
            <Link href="/practice/mistakes">{t("assessment.practice.reviewMistakes")}</Link>
          </Button>
          {hub.mistakes.due ? (
            <Button asChild variant="outline">
              <Link href="/practice/mistakes?due=1">{t("assessment.mistakes.dueOnly")}</Link>
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    ),
  };
  const order = recommended ? [recommended, ...MODES.filter((m) => m !== recommended)] : MODES;

  return (
    <div className="space-y-8">
      <PageHeader title={t("assessment.practice.title")} description={t("assessment.practice.subtitle")} />
      <Alert variant="info">{t("assessment.practice.originalNotice")}</Alert>
      {error ? (
        <Alert variant="destructive" role="alert">
          {errorText(t, error)}
        </Alert>
      ) : null}

      {hub.certs.length === 0 ? (
        <EmptyState title={t("assessment.practice.noContent")} action={{ label: t("nav.certifications"), href: "/certifications" }} />
      ) : (
        <>
          <nav aria-label={t("assessment.practice.certification")} className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{t("assessment.practice.certification")}:</span>
            {hub.certs.map((c) => (
              <Button key={c.id} asChild size="sm" variant={c.id === cert?.id ? "default" : "outline"}>
                <Link href={`/practice?cert=${c.code}${recommended ? `&mode=${recommended}` : ""}`} aria-current={c.id === cert?.id ? "page" : undefined}>
                  {c.code}
                  <span className="sr-only">: {c.name}</span>
                </Link>
              </Button>
            ))}
          </nav>

          {cert ? (
            <section aria-labelledby="modes-heading" className="space-y-3">
              <SectionTitle id="modes-heading">
                {cert.code}: {cert.name}
              </SectionTitle>
              <p className="text-sm text-muted-foreground">
                {hasQuestions ? t("assessment.practice.questionsAvailable", { count: cert.questionCount }) : t("assessment.practice.noContent")}
                {!cert.enrolled ? (
                  <>
                    {" "}
                    <Link href={`/certifications/${cert.code}`} className="text-primary underline-offset-4 hover:underline">
                      {t("assessment.practice.enrollHint")}
                    </Link>
                  </>
                ) : null}
              </p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{order.map((m) => cards[m])}</div>
            </section>
          ) : null}
        </>
      )}

      {hub.inProgress.length ? (
        <section aria-labelledby="in-progress-heading">
          <SectionTitle id="in-progress-heading">{t("assessment.practice.inProgress")}</SectionTitle>
          <ul className="grid gap-3 md:grid-cols-2">
            {hub.inProgress.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {t(`enums.practiceMode.${a.mode}` as MessageKey)}
                    {a.certificationCode ? <span className="text-muted-foreground"> · {a.certificationCode}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmt.dateTime(a.startedAt)}
                    {a.expiresAt ? ` · ${t("assessment.practice.endsAt", { time: fmt.dateTime(a.expiresAt) })}` : ""}
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link href={attemptHref(a)}>{t("assessment.practice.resume")}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="history-heading">
        <SectionTitle id="history-heading">
          <History className="mr-2 inline h-5 w-5" aria-hidden="true" />
          {t("assessment.practice.history")}
        </SectionTitle>
        {hub.history.length === 0 ? (
          <EmptyState title={t("assessment.practice.noHistory")} />
        ) : (
          <Table caption={t("assessment.practice.history")}>
            <THead>
              <TR>
                <TH>{t("assessment.practice.mode")}</TH>
                <TH>{t("assessment.practice.certification")}</TH>
                <TH>{t("assessment.practice.date")}</TH>
                <TH>{t("assessment.practice.result")}</TH>
                <TH>
                  <span className="sr-only">{t("common.actions")}</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {hub.history.map((a) => (
                <TR key={a.id}>
                  <TD className="font-medium">{t(`enums.practiceMode.${a.mode}` as MessageKey)}</TD>
                  <TD>{a.certificationCode ?? "—"}</TD>
                  <TD>{a.submittedAt ? fmt.dateTime(a.submittedAt) : "—"}</TD>
                  <TD className="tabular-nums">
                    {a.score !== null ? fmt.percent(a.score) : "—"}
                    {a.status === "EXPIRED" ? (
                      <Badge variant="warning" className="ml-2">
                        {t("assessment.practice.timedOut")}
                      </Badge>
                    ) : null}
                  </TD>
                  <TD className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={attemptHref(a, true)}>{t("assessment.practice.viewResults")}</Link>
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
