import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/admin/status-badge";
import { moveCertification } from "../actions";
import { getI18n } from "@/i18n/server";

export default async function CertificationsPage() {
  await requirePermission("catalog:manage");
  const { t } = await getI18n();
  const certs = await prisma.certification.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: { _count: { select: { lessons: true, questions: true, labs: true } } } });
  return (
    <div className="space-y-4">
      <PageHeader title={t("admin.certifications.title")} description={t("admin.certifications.shortSubtitle")} actions={<Button asChild><Link href="/admin/certifications/new">{t("admin.certifications.new")}</Link></Button>} />
      <Table><THead><TR><TH>{t("admin.common.order")}</TH><TH>{t("admin.common.code")}</TH><TH>{t("admin.certifications.name")}</TH><TH>{t("admin.common.status")}</TH><TH>{t("admin.common.content")}</TH><TH /></TR></THead><TBody>{certs.map((c) => (
        <TR key={c.id}>
          <TD className="flex gap-1">
            <form action={moveCertification as never}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="direction" value="up" /><Button type="submit" size="iconSm" variant="outline" aria-label={t("admin.common.moveUp")}>↑</Button></form>
            <form action={moveCertification as never}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="direction" value="down" /><Button type="submit" size="iconSm" variant="outline" aria-label={t("admin.common.moveDown")}>↓</Button></form>
          </TD>
          <TD>{c.code}</TD><TD><Link className="font-medium underline-offset-4 hover:underline" href={`/admin/certifications/${c.id}`}>{c.name}</Link></TD><TD><StatusBadge status={c.status} /></TD>
          <TD>{t("admin.common.itemCounts", { lessons: c._count.lessons, questions: c._count.questions, labs: c._count.labs })}</TD><TD><Button asChild size="sm" variant="outline"><Link href={`/admin/certifications/${c.id}`}>{t("common.edit")}</Link></Button></TD>
        </TR>
      ))}</TBody></Table>
    </div>
  );
}
