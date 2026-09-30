import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/admin/status-badge";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

export default async function LabsPage() {
  await requirePermission("labs:edit");
  const { t } = await getI18n();
  const labs = await prisma.lab.findMany({ include: { certification: true, domain: true }, orderBy: { updatedAt: "desc" }, take: 100 });
  return <div className="space-y-4"><PageHeader title={t("admin.labsBuilder.title")} description={t("admin.labsBuilder.shortSubtitle")} actions={<Button asChild><Link href="/admin/labs/new">{t("admin.labsBuilder.new")}</Link></Button>} />
    <Table><THead><TR><TH>{t("admin.labsBuilder.lab")}</TH><TH>{t("admin.common.certification")}</TH><TH>{t("admin.common.type")}</TH><TH>{t("admin.common.status")}</TH><TH /></TR></THead><TBody>{labs.map((l) => <TR key={l.id}><TD><Link className="font-medium underline-offset-4 hover:underline" href={`/admin/labs/${l.id}`}>{l.title}</Link></TD><TD>{l.certification.code} {l.domain?.key}</TD><TD>{t(`enums.labType.${l.type}` as MessageKey)}</TD><TD><StatusBadge status={l.status} /></TD><TD><Button asChild size="sm" variant="outline"><Link href={`/labs/${l.id}`}>{t("admin.common.player")}</Link></Button></TD></TR>)}</TBody></Table>
  </div>;
}
