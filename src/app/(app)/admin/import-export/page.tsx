import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { PageHeader } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Checkbox } from "@/components/ui/form";
import { getI18n } from "@/i18n/server";

export default async function ImportExportPage() {
  await requirePermission("content:import");
  const { t } = await getI18n();
  const certs = await prisma.certification.findMany({ orderBy: { code: "asc" } });
  return <div className="space-y-4"><PageHeader title={t("admin.importExport.title")} description={t("admin.importExport.shortSubtitle")} />
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>{t("admin.importExport.importCoursePackage")}</CardTitle></CardHeader><CardContent><form action="/api/admin/import" method="post" encType="multipart/form-data" className="space-y-3"><Field id="file" label={t("admin.importExport.jsonOrCsvFile")}><Input name="file" type="file" accept=".json,.csv,application/json,text/csv" required /></Field><label className="flex gap-2"><Checkbox name="dryRun" /> {t("admin.importExport.validateOnly")}</label><label className="flex gap-2"><Checkbox name="publish" /> {t("admin.importExport.publishImportedShort")}</label><Button type="submit">{t("common.import")}</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle>{t("admin.importExport.exportTitle")}</CardTitle></CardHeader><CardContent className="space-y-3"><form action="/api/admin/export" method="get" className="space-y-3"><Field id="type" label={t("admin.common.type")}><Select name="type"><option value="course">{t("admin.importExport.coursePackage")}</option><option value="questions">{t("admin.importExport.questionsCsv")}</option><option value="catalog">{t("admin.importExport.catalogJson")}</option></Select></Field><Field id="code" label={t("admin.common.certification")}><Select name="code">{certs.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}</Select></Field><Button type="submit">{t("common.download")}</Button></form></CardContent></Card>
    </div>
  </div>;
}
