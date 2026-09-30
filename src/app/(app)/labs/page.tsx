import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, Search } from "lucide-react";
import type { LabAttemptStatus, LabComplexity, LabType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { localizedField } from "@/i18n/translator";
import type { MessageKey } from "@/i18n/translator";
import { requireUser } from "@/modules/auth/session";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { EmptyState, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("labs.title") };
}

const TYPES = ["UI_SIMULATION", "COMMAND_SANDBOX", "ARCHITECTURE", "TROUBLESHOOTING", "BUSINESS_SCENARIO"] as const satisfies readonly LabType[];
const COMPLEXITIES = ["INTRO", "BASIC", "INTERMEDIATE"] as const satisfies readonly LabComplexity[];
const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;

function attemptStatus(attempts: { status: LabAttemptStatus; updatedAt: Date }[]): (typeof STATUSES)[number] {
  if (attempts.some((a) => a.status === "COMPLETED")) return "COMPLETED";
  if (attempts.some((a) => a.status === "IN_PROGRESS")) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export default async function LabsPage({
  searchParams,
}: {
  searchParams: Promise<{ certification?: string; type?: string; complexity?: string; status?: string; q?: string }>;
}) {
  const [{ t, locale }, user] = await Promise.all([getI18n(), requireUser("/labs")]);
  const params = await searchParams;
  const visible = learnerVisibleWhere();
  const [labs, certifications, enrollments] = await Promise.all([
    prisma.lab.findMany({
      where: { AND: [visible] },
      include: {
        certification: { select: { id: true, code: true, name: true, themeColor: true } },
        attempts: { where: { userId: user.id }, select: { status: true, updatedAt: true }, orderBy: { updatedAt: "desc" } },
      },
      orderBy: [{ certification: { sortOrder: "asc" } }, { sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.certification.findMany({ where: { labs: { some: { AND: [visible] } } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.enrollment.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: { certificationId: true, isPrimary: true, createdAt: true } }),
  ]);
  const enrolled = new Map(enrollments.map((e, index) => [e.certificationId, e.isPrimary ? -1 : index]));
  const query = (params.q ?? "").trim().toLowerCase();
  const filtered = labs
    .filter((lab) => !params.certification || lab.certification.code === params.certification)
    .filter((lab) => !params.type || lab.type === params.type)
    .filter((lab) => !params.complexity || lab.complexity === params.complexity)
    .filter((lab) => !params.status || attemptStatus(lab.attempts) === params.status)
    .filter((lab) => !query || `${lab.title} ${lab.summary} ${lab.certification.code}`.toLowerCase().includes(query))
    .sort((a, b) => (enrolled.get(a.certificationId) ?? 999) - (enrolled.get(b.certificationId) ?? 999));

  return (
    <div>
      <PageHeader title={t("labs.title")} description={t("labs.subtitle")} />
      <form role="search" aria-label={t("labs.searchLabel")} className="mb-6 grid gap-2 md:grid-cols-[1fr_repeat(4,12rem)_auto] md:items-end">
        <Input name="q" defaultValue={params.q ?? ""} placeholder={t("labs.searchLabel")} aria-label={t("labs.searchLabel")} />
        <Select name="certification" defaultValue={params.certification ?? ""} aria-label={t("labs.filterCert")}>
          <option value="">{t("common.all")}</option>
          {certifications.map((cert) => <option key={cert.id} value={cert.code}>{cert.code}</option>)}
        </Select>
        <Select name="type" defaultValue={params.type ?? ""} aria-label={t("labs.filterType")}>
          <option value="">{t("common.all")}</option>
          {TYPES.map((type) => <option key={type} value={type}>{t(`enums.labType.${type}` as MessageKey)}</option>)}
        </Select>
        <Select name="complexity" defaultValue={params.complexity ?? ""} aria-label={t("labs.filterComplexity")}>
          <option value="">{t("common.all")}</option>
          {COMPLEXITIES.map((complexity) => <option key={complexity} value={complexity}>{t(`enums.labComplexity.${complexity}` as MessageKey)}</option>)}
        </Select>
        <Select name="status" defaultValue={params.status ?? ""} aria-label={t("labs.filterStatus")}>
          <option value="">{t("common.all")}</option>
          {STATUSES.map((status) => <option key={status} value={status}>{t(`labs.status.${status}` as MessageKey)}</option>)}
        </Select>
        <Button type="submit" variant="secondary"><Search aria-hidden="true" />{t("common.filter")}</Button>
      </form>

      {filtered.length === 0 ? <EmptyState title={t("labs.empty")} icon={FlaskConical} /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((lab) => {
          const status = attemptStatus(lab.attempts);
          const title = localizedField(lab.title, lab.translations, locale, "title");
          const summary = localizedField(lab.summary, lab.translations, locale, "summary");
          return (
            <Card key={lab.id} className="flex flex-col">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{lab.certification.code}</Badge>
                  <Badge variant="outline">{t(`enums.labType.${lab.type}` as MessageKey)}</Badge>
                  <Badge variant={status === "COMPLETED" ? "success" : status === "IN_PROGRESS" ? "warning" : "secondary"}>{t(`labs.status.${status}` as MessageKey)}</Badge>
                </div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{summary}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{t(`enums.labComplexity.${lab.complexity}` as MessageKey)}</Badge>
                  <Badge variant="secondary">{t("labs.estimated", { minutes: lab.estimatedMinutes })}</Badge>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {lab.learningObjectives.slice(0, 3).map((objective) => <li key={objective}>{objective}</li>)}
                </ul>
              </CardContent>
              <CardFooter className="flex-wrap">
                <Button asChild>
                  <Link href={`/labs/${lab.id}`}>{status === "COMPLETED" ? t("labs.review") : status === "IN_PROGRESS" ? t("common.resume") : t("common.start")}</Link>
                </Button>
                {status === "NOT_STARTED" ? (
                  <Button asChild variant="outline">
                    <Link href={`/labs/${lab.id}?mode=CHALLENGE`}>{t("labs.challengeMode")}</Link>
                  </Button>
                ) : null}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
