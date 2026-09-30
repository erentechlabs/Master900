import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { localizedField } from "@/i18n/translator";
import { requireUser } from "@/modules/auth/session";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { getLabPlayer, startLab, labModeSchema } from "@/modules/labs/service";
import { LabPlayer } from "@/components/labs/lab-player";
import { Alert } from "@/components/ui/alert";

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
    <div className="space-y-4" data-layout="wide">
      {data.lab.status === "OUTDATED" ? <Alert variant="warning" title={t("labs.outdatedTitle")}><AlertTriangle aria-hidden="true" />{t("labs.outdatedBody")}</Alert> : null}

      <LabPlayer initialData={data} />
    </div>
  );
}
