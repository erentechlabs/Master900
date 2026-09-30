import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, Filter, Repeat, Trophy } from "lucide-react";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";
import { requireUser } from "@/modules/auth/session";
import { listMistakes, mistakeFilterOptions, type MistakeFilters } from "@/modules/assessment/mistakes";
import { EmptyState, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Input, Label, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { startPracticeFormAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("assessment.mistakes.title") };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z]{2,3}-\d{3}$/;

function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}

export default async function MistakesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser("/practice/mistakes");
  const { t, fmt, locale } = await getI18n();

  const certificationCode = one(sp.cert);
  const difficulty = one(sp.difficulty);
  const filters: MistakeFilters = {
    certificationCode: certificationCode && CODE_RE.test(certificationCode) ? certificationCode : undefined,
    domainId: one(sp.domain)?.slice(0, 40),
    difficulty: difficulty === "EASY" || difficulty === "MEDIUM" || difficulty === "HARD" ? difficulty : undefined,
    from: DATE_RE.test(one(sp.from) ?? "") ? one(sp.from) : undefined,
    to: DATE_RE.test(one(sp.to) ?? "") ? one(sp.to) : undefined,
    dueOnly: one(sp.due) === "1" || one(sp.due) === "on",
  };
  const [{ rows, total }, options] = await Promise.all([listMistakes(user, filters, locale), mistakeFilterOptions(user, locale, filters.certificationCode)]);
  const hasFilters = !!(filters.certificationCode || filters.domainId || filters.difficulty || filters.from || filters.to || filters.dueOnly);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("assessment.mistakes.title")}
        description={t("assessment.mistakes.subtitle")}
        actions={
          <Button asChild variant="outline">
            <Link href="/practice">{t("assessment.results.backToPractice")}</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="space-y-4 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Filter className="h-4 w-4" aria-hidden="true" />
                {t("assessment.mistakes.filters")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form method="get" action="/practice/mistakes" className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="f-cert">{t("assessment.mistakes.certification")}</Label>
                  <Select id="f-cert" name="cert" defaultValue={filters.certificationCode ?? ""}>
                    <option value="">{t("common.all")}</option>
                    {options.certs.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}: {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-domain">{t("assessment.mistakes.domain")}</Label>
                  <Select id="f-domain" name="domain" defaultValue={filters.domainId ?? ""}>
                    <option value="">{t("common.all")}</option>
                    {options.domains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {options.certs.length > 1 && !filters.certificationCode ? `${d.certificationCode} · ` : ""}
                        {d.title}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-difficulty">{t("assessment.mistakes.difficulty")}</Label>
                  <Select id="f-difficulty" name="difficulty" defaultValue={filters.difficulty ?? ""}>
                    <option value="">{t("common.all")}</option>
                    {(["EASY", "MEDIUM", "HARD"] as const).map((d) => (
                      <option key={d} value={d}>
                        {t(`enums.difficulty.${d}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="f-from">{t("assessment.mistakes.from")}</Label>
                    <Input id="f-from" name="from" type="date" defaultValue={filters.from} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="f-to">{t("assessment.mistakes.to")}</Label>
                    <Input id="f-to" name="to" type="date" defaultValue={filters.to} />
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox name="due" value="1" defaultChecked={filters.dueOnly} className="mt-0.5" />
                  <span>{t("assessment.mistakes.dueOnly")}</span>
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="submit" size="sm">
                    {t("assessment.mistakes.apply")}
                  </Button>
                  {hasFilters ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/practice/mistakes">{t("common.clearFilters")}</Link>
                    </Button>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>

          {total > 0 ? (
            <Card>
              <CardContent className="pt-6">
                <form action={startPracticeFormAction} className="space-y-3">
                  <input type="hidden" name="mode" value="MISTAKE_REVIEW" />
                  {filters.certificationCode ? <input type="hidden" name="mCert" value={filters.certificationCode} /> : null}
                  {filters.domainId ? <input type="hidden" name="mDomain" value={filters.domainId} /> : null}
                  {filters.difficulty ? <input type="hidden" name="mDifficulty" value={filters.difficulty} /> : null}
                  {filters.from ? <input type="hidden" name="mFrom" value={filters.from} /> : null}
                  {filters.to ? <input type="hidden" name="mTo" value={filters.to} /> : null}
                  {filters.dueOnly ? <input type="hidden" name="mDue" value="on" /> : null}
                  <div className="space-y-1.5">
                    <Label htmlFor="m-count">{t("assessment.practice.questionCount")}</Label>
                    <Select id="m-count" name="questionCount" defaultValue={String(Math.min(10, total))}>
                      {[...new Set([5, 10, 20].map((n) => Math.min(n, total)))].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox name="mExplain" className="mt-0.5" />
                    <span>{t("assessment.mistakes.explainFirst")}</span>
                  </label>
                  <SubmitButton className="w-full" pendingLabel={t("common.loading")}>
                    <Repeat aria-hidden="true" />
                    {t("assessment.mistakes.startReviewGeneric")}
                  </SubmitButton>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <section aria-labelledby="mistake-list-heading" className="space-y-3">
          <h2 id="mistake-list-heading" className="sr-only">
            {t("assessment.mistakes.title")}
          </h2>
          {rows.length === 0 ? (
            <EmptyState icon={Trophy} title={t("assessment.mistakes.empty")} action={{ label: t("assessment.practice.title"), href: "/practice" }} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground" role="status">
                {t("common.questionsCount", { count: total })}
              </p>
              <ul className="space-y-3">
                {rows.map((r) => (
                  <li key={r.questionId} className="rounded-lg border bg-card p-4 shadow-sm">
                    <p className="text-sm font-medium">{r.snippet}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="outline">{r.certificationCode}</Badge>
                      <Badge variant="outline">{r.domainTitle}</Badge>
                      <Badge variant="secondary">{t(`enums.difficulty.${r.difficulty}` as MessageKey)}</Badge>
                      <Badge variant="destructive">{t("assessment.mistakes.timesWrong", { count: r.timesWrong })}</Badge>
                      {r.correctSince ? (
                        <Badge variant="success">
                          <CheckCircle2 aria-hidden="true" />
                          {t("assessment.mistakes.since")}
                        </Badge>
                      ) : null}
                      {r.review?.status === "MASTERED" ? (
                        <Badge variant="success">{t("assessment.mistakes.mastered")}</Badge>
                      ) : r.review?.due ? (
                        <Badge variant="warning">
                          <Clock aria-hidden="true" />
                          {t("assessment.mistakes.due")}
                        </Badge>
                      ) : null}
                    </div>
                    {r.lastWrongAt ? <p className="mt-2 text-xs text-muted-foreground">{t("assessment.mistakes.lastAnswered", { date: fmt.date(r.lastWrongAt) })}</p> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
