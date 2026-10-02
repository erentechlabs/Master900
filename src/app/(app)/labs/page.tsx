import type { Metadata } from "next";
import Link from "next/link";
import { AppWindow, Beaker, CheckCircle2, Clock3, FlaskConical, Monitor, Play, Search, SquareTerminal, Star, Trophy } from "lucide-react";
import type { LabAttemptStatus, LabComplexity, LabType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { localizedField } from "@/i18n/translator";
import type { MessageKey, TFunction } from "@/i18n/translator";
import { requireUser } from "@/modules/auth/session";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { bestLabStars } from "@/modules/labs/stars";
import { labProductFromParts, labProductLabel, type LabProductInfo } from "@/modules/labs/products";
import { loadLabProducts } from "@/modules/labs/products-server";
import { EmptyState, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("labs.title") };
}

const TYPES = ["UI_SIMULATION", "COMMAND_SANDBOX", "ARCHITECTURE", "TROUBLESHOOTING", "BUSINESS_SCENARIO"] as const satisfies readonly LabType[];
const COMPLEXITIES = ["INTRO", "BASIC", "INTERMEDIATE"] as const satisfies readonly LabComplexity[];
const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
const MAX_STARS_PER_LAB = 3;

function attemptStatus(attempts: { status: LabAttemptStatus; updatedAt: Date }[]): (typeof STATUSES)[number] {
  if (attempts.some((a) => a.status === "COMPLETED")) return "COMPLETED";
  if (attempts.some((a) => a.status === "IN_PROGRESS")) return "IN_PROGRESS";
  return "NOT_STARTED";
}

function hrefWith(params: Record<string, string | undefined>, updates: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...updates })) if (value) next.set(key, value);
  const query = next.toString();
  return query ? `/labs?${query}` : "/labs";
}

async function loadLabsPageData(userId: string) {
  const visible = learnerVisibleWhere();
  const [labs, certifications, enrollments] = await Promise.all([
    prisma.lab.findMany({
      where: { AND: [visible] },
      select: {
        id: true,
        certificationId: true,
        slug: true,
        type: true,
        title: true,
        summary: true,
        translations: true,
        learningObjectives: true,
        complexity: true,
        estimatedMinutes: true,
        sortOrder: true,
        certification: { select: { id: true, code: true, name: true, themeColor: true, sortOrder: true } },
        attempts: { where: { userId }, select: { status: true, updatedAt: true, hintsUsed: true, solutionViewed: true }, orderBy: { updatedAt: "desc" } },
      },
      orderBy: [{ certification: { sortOrder: "asc" } }, { sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.certification.findMany({ where: { labs: { some: { AND: [visible] } } }, select: { id: true, code: true, name: true, themeColor: true, sortOrder: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.enrollment.findMany({ where: { userId, status: "ACTIVE" }, select: { certificationId: true, isPrimary: true, createdAt: true } }),
  ]);
  const products = await loadLabProducts(labs.map((lab) => lab.id));
  return { labs, certifications, enrollments, products };
}

export default async function LabsPage({
  searchParams,
}: {
  searchParams: Promise<{ certification?: string; type?: string; complexity?: string; status?: string; q?: string }>;
}) {
  const [{ t, locale }, user] = await Promise.all([getI18n(), requireUser("/labs")]);
  const params = await searchParams;
  const { labs, certifications, enrollments, products } = await loadLabsPageData(user.id);
  const enrolled = new Map(enrollments.map((e, index) => [e.certificationId, e.isPrimary ? -1 : index]));
  const query = (params.q ?? "").trim().toLowerCase();
  const decorated = labs.map((lab) => {
    const status = attemptStatus(lab.attempts);
    const bestStars = bestLabStars(lab.attempts);
    const title = localizedField(lab.title, lab.translations, locale, "title");
    const summary = localizedField(lab.summary, lab.translations, locale, "summary");
    return { ...lab, titleText: title, summaryText: summary, status, bestStars, product: productInfo(products.get(lab.id) ?? labProductFromParts(lab.type, null, null, null), t) };
  });
  const filtered = decorated
    .filter((lab) => !params.certification || lab.certification.code === params.certification)
    .filter((lab) => !params.type || lab.type === params.type)
    .filter((lab) => !params.complexity || lab.complexity === params.complexity)
    .filter((lab) => !params.status || lab.status === params.status)
    .filter((lab) => !query || `${lab.titleText} ${lab.summaryText} ${lab.certification.code} ${lab.product.label}`.toLowerCase().includes(query))
    .sort((a, b) => (enrolled.get(a.certificationId) ?? 999) - (enrolled.get(b.certificationId) ?? 999) || a.certification.sortOrder - b.certification.sortOrder || a.sortOrder - b.sortOrder);
  const completedCount = decorated.filter((lab) => lab.status === "COMPLETED").length;
  const inProgress = decorated.filter((lab) => lab.status === "IN_PROGRESS");
  const starsEarned = decorated.reduce((sum, lab) => sum + lab.bestStars, 0);
  const certCounts = new Map<string, number>();
  for (const lab of decorated) certCounts.set(lab.certification.code, (certCounts.get(lab.certification.code) ?? 0) + 1);
  const grouped = params.certification ? [[params.certification, filtered] as const] : groupByCertification(filtered, enrolled);
  const currentParams = { certification: params.certification, type: params.type, complexity: params.complexity, status: params.status, q: params.q };

  return (
    <div className="space-y-6">
      <PageHeader title={t("labs.title")} description={t("labs.subtitle")} />
      <section aria-label={t("labs.stats.title")} className="grid gap-3 md:grid-cols-3">
        <Stat icon={<CheckCircle2 aria-hidden="true" />} label={t("labs.stats.completed")} value={`${completedCount}/${decorated.length}`} />
        <Stat icon={<Star aria-hidden="true" />} label={t("labs.stats.stars")} value={`${starsEarned}/${decorated.length * MAX_STARS_PER_LAB}`} />
        <Stat icon={<Play aria-hidden="true" />} label={t("labs.stats.inProgress")} value={String(inProgress.length)} />
      </section>

      <nav aria-label={t("labs.filterCert")} className="flex gap-2 overflow-x-auto rounded-lg border bg-card p-2">
        <Button asChild size="sm" variant={!params.certification ? "default" : "ghost"}><Link href={hrefWith(currentParams, { certification: undefined })}>{t("common.all")} <Badge variant="secondary">{decorated.length}</Badge></Link></Button>
        {certifications.map((cert) => (
          <Button key={cert.id} asChild size="sm" variant={params.certification === cert.code ? "default" : "ghost"}>
            <Link href={hrefWith(currentParams, { certification: cert.code })}>{cert.code} <Badge variant="secondary">{certCounts.get(cert.code) ?? 0}</Badge></Link>
          </Button>
        ))}
      </nav>

      <form role="search" aria-label={t("labs.searchLabel")} className="grid gap-3 sm:grid-cols-2 md:grid-cols-[1fr_repeat(3,11rem)_auto] md:items-end">
        <input type="hidden" name="certification" value={params.certification ?? ""} />
        <Field id="lab-filter-q" label={t("labs.searchLabel")}>
          <Input name="q" type="search" defaultValue={params.q ?? ""} placeholder={t("labs.searchPlaceholder")} />
        </Field>
        <Field id="lab-filter-type" label={t("labs.filterType")}>
          <Select name="type" defaultValue={params.type ?? ""}>
            <option value="">{t("common.all")}</option>
            {TYPES.map((type) => <option key={type} value={type}>{t(`enums.labType.${type}` as MessageKey)}</option>)}
          </Select>
        </Field>
        <Field id="lab-filter-complexity" label={t("labs.filterComplexity")}>
          <Select name="complexity" defaultValue={params.complexity ?? ""}>
            <option value="">{t("common.all")}</option>
            {COMPLEXITIES.map((complexity) => <option key={complexity} value={complexity}>{t(`enums.labComplexity.${complexity}` as MessageKey)}</option>)}
          </Select>
        </Field>
        <Field id="lab-filter-status" label={t("labs.filterStatus")}>
          <Select name="status" defaultValue={params.status ?? ""}>
            <option value="">{t("common.all")}</option>
            {STATUSES.map((status) => <option key={status} value={status}>{t(`labs.status.${status}` as MessageKey)}</option>)}
          </Select>
        </Field>
        <Button type="submit" variant="secondary"><Search aria-hidden="true" />{t("common.filter")}</Button>
      </form>

      {inProgress.length ? <ContinueRow labs={inProgress.slice(0, 6)} /> : null}
      {filtered.length === 0 ? <EmptyState title={t("labs.empty")} icon={FlaskConical} /> : null}
      <div className="space-y-8">
        {grouped.map(([code, items]) => items.length ? (
          <section key={code} className="space-y-3" aria-labelledby={`labs-${code}`}>
            {!params.certification ? <h2 id={`labs-${code}`} className="font-display text-subtitle">{code}</h2> : null}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((lab) => <LabCard key={lab.id} lab={lab} />)}
            </div>
          </section>
        ) : null)}
      </div>
    </div>
  );

  function ContinueRow({ labs }: { labs: typeof decorated }) {
    return (
      <section className="space-y-3" aria-labelledby="continue-labs">
        <h2 id="continue-labs" className="font-display text-subtitle">{t("labs.continueTitle")}</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {labs.map((lab) => <Link key={lab.id} href={`/labs/${lab.id}`} className="rounded-lg border bg-card p-4 shadow-sm hover:bg-subtle-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="text-sm text-muted-foreground">{lab.certification.code} · {lab.product.label}</span><span className="mt-1 block font-semibold">{lab.titleText}</span></Link>)}
        </div>
      </section>
    );
  }

  function LabCard({ lab }: { lab: typeof decorated[number] }) {
    return (
      <Card className="group flex flex-col overflow-hidden">
        <div className="h-1" style={{ backgroundColor: lab.certification.themeColor }} />
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">{lab.certification.code}</Badge>
            <Badge variant={lab.status === "COMPLETED" ? "success" : lab.status === "IN_PROGRESS" ? "warning" : "secondary"}>{t(`labs.status.${lab.status}` as MessageKey)}</Badge>
            <span role="img" className="ml-auto inline-flex items-center gap-1 text-xs text-amber-600" aria-label={t("labs.bestStars", { count: lab.bestStars })}>{[0, 1, 2].map((star) => <Star key={star} className={star < lab.bestStars ? "h-4 w-4 fill-amber-400" : "h-4 w-4 text-muted-foreground/40"} aria-hidden="true" />)}</span>
          </div>
          <CardTitle>{lab.titleText}</CardTitle>
          <CardDescription>{lab.summaryText}</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline"><lab.product.Icon className="h-3.5 w-3.5" aria-hidden="true" />{lab.product.label}</Badge>
            <Badge variant="secondary"><Trophy className="h-3.5 w-3.5" aria-hidden="true" />{t(`enums.labComplexity.${lab.complexity}` as MessageKey)}</Badge>
            <Badge variant="secondary"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{t("labs.estimated", { minutes: lab.estimatedMinutes })}</Badge>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {lab.learningObjectives.slice(0, 3).map((objective) => <li key={objective}>{objective}</li>)}
          </ul>
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Button asChild>
            <Link href={`/labs/${lab.id}`}>{lab.status === "COMPLETED" ? t("labs.review") : lab.status === "IN_PROGRESS" ? t("common.resume") : t("common.start")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/labs/${lab.id}?mode=CHALLENGE`}>{t("labs.challengeMode")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">{icon}</span><span><span className="block text-sm text-muted-foreground">{label}</span><span className="font-display text-title">{value}</span></span></div>;
}

function groupByCertification<T extends { certification: { code: string }; certificationId: string }>(labs: T[], enrolled: Map<string, number>) {
  const groups = new Map<string, T[]>();
  for (const lab of labs) groups.set(lab.certification.code, [...(groups.get(lab.certification.code) ?? []), lab]);
  return [...groups.entries()].sort(([, a], [, b]) => (enrolled.get(a[0]?.certificationId ?? "") ?? 999) - (enrolled.get(b[0]?.certificationId ?? "") ?? 999));
}

function productInfo(info: LabProductInfo, t: TFunction): { label: string; Icon: typeof AppWindow } {
  const Icon = info.kind === "terminal" ? SquareTerminal : info.kind === "designer" ? Beaker : info.hasTerminal ? Monitor : AppWindow;
  return { label: labProductLabel(info, t), Icon };
}
