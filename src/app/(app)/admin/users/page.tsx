import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { ROLE_KEYS } from "@/modules/auth/permissions";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input, Checkbox } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/admin/status-badge";
import { saveUserRoles, setTemporaryPassword, setUserStatus } from "../actions";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission("users:manage");
  const { t, fmt } = await getI18n();
  const { q } = await searchParams;
  const users = await prisma.user.findMany({ where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}, include: { roles: { include: { role: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  return <div className="space-y-4"><PageHeader title={t("admin.users.title")} description={t("admin.users.shortSubtitle")} />
    <form className="max-w-md"><Field id="q" label={t("common.search")}><Input name="q" defaultValue={q ?? ""} /></Field><Button className="mt-2" type="submit">{t("common.search")}</Button></form>
    <Table><THead><TR><TH>{t("admin.users.user")}</TH><TH>{t("admin.users.roles")}</TH><TH>{t("admin.users.status")}</TH><TH>{t("admin.users.joined")}</TH><TH>{t("admin.users.actions")}</TH></TR></THead><TBody>{users.map((u) => { const roles = new Set(u.roles.map((r) => r.role.key)); return <TR key={u.id}><TD><p className="font-medium">{u.name ?? t("admin.common.unnamed")}</p><p className="text-sm text-muted-foreground">{u.email}</p></TD><TD><form action={saveUserRoles as never} className="space-y-2"><input type="hidden" name="userId" value={u.id} />{ROLE_KEYS.map((r) => <label key={r} className="mr-3 inline-flex items-center gap-1"><Checkbox name={`role_${r}`} defaultChecked={roles.has(r)} /> {t(`enums.roles.${r}` as MessageKey)}</label>)}<Button type="submit" size="sm" variant="outline">{t("admin.users.saveRoles")}</Button></form></TD><TD><StatusBadge status={u.status} /></TD><TD>{fmt.calendarDate(u.createdAt)}</TD><TD className="space-y-2"><form action={setUserStatus as never}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="status" value={u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} /><Button type="submit" size="sm" variant="outline">{u.status === "ACTIVE" ? t("admin.users.suspend") : t("admin.users.reactivate")}</Button></form><form action={setTemporaryPassword as never} className="flex gap-2"><input type="hidden" name="userId" value={u.id} /><Input name="password" type="password" placeholder={t("admin.users.temporaryPassword")} /><Button type="submit" size="sm" variant="outline">{t("admin.common.set")}</Button></form></TD></TR>; })}</TBody></Table>
  </div>;
}
