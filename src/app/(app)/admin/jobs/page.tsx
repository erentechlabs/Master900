import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/admin/status-badge";
import { enqueueMaintenanceJob, runDueJobsAction } from "../actions";
import { getI18n } from "@/i18n/server";

export default async function JobsPage() {
  await requirePermission("jobs:manage");
  const { t, fmt } = await getI18n();
  const jobs = await prisma.job.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return <div className="space-y-4"><PageHeader title={t("admin.jobs.title")} description={t("admin.jobs.shortSubtitle")} actions={<form action={runDueJobsAction as never}><Button type="submit">{t("admin.jobs.runNow")}</Button></form>} />
    <div className="flex flex-wrap gap-2">{["content.publishScheduled", "analytics.readinessSnapshots", "planner.adjustPlans"].map((type) => <form key={type} action={enqueueMaintenanceJob as never}><input type="hidden" name="type" value={type} /><Button type="submit" variant="outline">{type}</Button></form>)}</div>
    <Table><THead><TR><TH>{t("admin.jobs.type")}</TH><TH>{t("admin.jobs.status")}</TH><TH>{t("admin.jobs.attempts")}</TH><TH>{t("admin.jobs.runAt")}</TH><TH>{t("admin.jobs.lastError")}</TH></TR></THead><TBody>{jobs.map((j) => <TR key={j.id}><TD>{j.type}</TD><TD><StatusBadge status={j.status} /></TD><TD>{t("admin.jobs.attemptsValue", { attempts: j.attempts, max: j.maxAttempts })}</TD><TD>{fmt.dateTime(j.runAt)}</TD><TD>{j.lastError}</TD></TR>)}</TBody></Table>
  </div>;
}
