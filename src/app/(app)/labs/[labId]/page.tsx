import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { localizedField } from "@/i18n/translator";
import type { MessageKey } from "@/i18n/translator";
import { requireUser } from "@/modules/auth/session";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { getLabPlayer, startLab, labModeSchema } from "@/modules/labs/service";
import { LabPlayer } from "@/components/labs/lab-player";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata({ params }: { params: Promise<{ labId: string }> }): Promise<Metadata> {
  const { labId } = await params;
  const { locale, t } = await getI18n();
  const lab = await prisma.lab.findFirst({ where: { id: labId, AND: [learnerVisibleWhere()] }, select: { title: true, translations: true } });
  return { title: lab ? localizedField(lab.title, lab.translations, locale, "title") : t("labs.title") };
}

export default async function LabPage({
  params,
  searchParams,
}: {
  params: Promise<{ labId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const [{ labId }, query] = await Promise.all([params, searchParams]);
  const [{ t }, user] = await Promise.all([getI18n(), requireUser(`/labs/${labId}`)]);
  const mode = labModeSchema.safeParse(query.mode).success ? labModeSchema.parse(query.mode) : undefined;
  const data = mode ? await startLab(user, { labId, mode }, (await getI18n()).locale) : await getLabPlayer(user, labId, (await getI18n()).locale);
  if (!data) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/labs" className="underline-offset-4 hover:underline">{t("labs.backToLabs")}</Link>}
        title={data.lab.title}
        description={data.lab.summary}
        actions={<Button asChild variant="outline"><Link href={`/certifications/${data.lab.certification.code}`}>{data.lab.certification.code}</Link></Button>}
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="info">{t(`enums.labType.${data.lab.type}` as MessageKey)}</Badge>
        <Badge variant="secondary">{t(`enums.labComplexity.${data.lab.complexity}` as MessageKey)}</Badge>
        <Badge variant="secondary">{t("labs.estimated", { minutes: data.lab.estimatedMinutes })}</Badge>
        <Badge variant={data.lab.mode === "CHALLENGE" ? "warning" : "success"}>{data.lab.mode === "CHALLENGE" ? t("labs.challengeMode") : t("labs.guidedMode")}</Badge>
        <Badge variant="outline">{t("labs.version", { version: data.lab.version })}</Badge>
      </div>

      <Alert variant="info" title={t("labs.safetyTitle")}>{t("labs.safetyNotice")}</Alert>
      {data.lab.status === "OUTDATED" ? <Alert variant="warning" title={t("labs.outdatedTitle")}><AlertTriangle aria-hidden="true" />{t("labs.outdatedBody")}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("labs.scenario")}</CardTitle></CardHeader>
          <CardContent>
            <Markdown>{data.lab.scenario}</Markdown>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("labs.objectives")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {data.lab.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}
            </ul>
          </CardContent>
        </Card>
      </div>

      {data.lab.prerequisites.length ? (
        <Alert title={t("labs.prerequisites")}>
          <ul className="list-disc pl-5">
            {data.lab.prerequisites.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Alert>
      ) : null}

      <LabPlayer initialData={data} />
    </div>
  );
}
