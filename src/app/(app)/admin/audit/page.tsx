import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getI18n } from "@/i18n/server";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("audit:view");
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const rows = await prisma.auditLog.findMany({ where: { ...(sp.action ? { action: { contains: sp.action, mode: "insensitive" } } : {}), ...(sp.actor ? { actorEmail: { contains: sp.actor, mode: "insensitive" } } : {}), ...(sp.entityType ? { entityType: sp.entityType } : {}) }, orderBy: { createdAt: "desc" }, take: 50 });
  return <div className="space-y-4"><PageHeader title={t("admin.audit.title")} description={t("admin.audit.shortSubtitle")} /><form className="grid gap-3 md:grid-cols-4"><Field id="action" label={t("admin.audit.filterAction")}><Input name="action" defaultValue={sp.action ?? ""} /></Field><Field id="actor" label={t("admin.audit.filterActor")}><Input name="actor" defaultValue={sp.actor ?? ""} /></Field><Field id="entityType" label={t("admin.audit.entityType")}><Input name="entityType" defaultValue={sp.entityType ?? ""} /></Field><Button type="submit">{t("common.filter")}</Button></form><Table><THead><TR><TH>{t("admin.audit.when")}</TH><TH>{t("admin.audit.actor")}</TH><TH>{t("admin.audit.action")}</TH><TH>{t("admin.audit.entity")}</TH><TH>{t("admin.audit.details")}</TH></TR></THead><TBody>{rows.map((r) => <TR key={r.id}><TD>{fmt.dateTime(r.createdAt)}</TD><TD>{r.actorEmail ?? t("admin.common.system")}</TD><TD>{r.action}</TD><TD>{r.entityType}:{r.entityId}</TD><TD><details><summary>{r.summary ?? t("admin.common.json")}</summary><pre className="max-w-xl overflow-auto text-xs">{JSON.stringify({ before: r.before, after: r.after, metadata: r.metadata }, null, 2)}</pre></details></TD></TR>)}</TBody></Table></div>;
}
