import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { StatusBadge } from "@/components/admin/status-badge";
import { createLesson, createModule } from "../actions";
import { getI18n } from "@/i18n/server";

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ certificationId?: string }> }) {
  await requirePermission("content:edit");
  const { t } = await getI18n();
  const params = await searchParams;
  const certs = await prisma.certification.findMany({ orderBy: { sortOrder: "asc" } });
  const certificationId = params.certificationId ?? certs[0]?.id;
  const domains = certificationId ? await prisma.examDomain.findMany({ where: { certificationId }, orderBy: { sortOrder: "asc" }, include: { modules: { orderBy: { sortOrder: "asc" }, include: { lessons: { orderBy: { sortOrder: "asc" } } } } } }) : [];
  return (
    <div className="space-y-5">
      <PageHeader title={t("admin.content.title")} description={t("admin.content.shortSubtitle")} />
      <form className="max-w-md"><Field id="certificationId" label={t("admin.content.chooseCertification")}><Select name="certificationId" defaultValue={certificationId} onChange={undefined}>{certs.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}</Select></Field><Button className="mt-2" type="submit">{t("admin.content.open")}</Button></form>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">{domains.map((d) => (
          <Card key={d.id}><CardHeader><CardTitle>{d.title}</CardTitle></CardHeader><CardContent className="space-y-4">
            {d.modules.map((m) => <div key={m.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><div><p className="font-medium">{m.title}</p><p className="text-sm text-muted-foreground">{m.summary}</p></div><StatusBadge status={m.status} /></div>
              <ul className="mt-3 space-y-2">{m.lessons.map((l) => <li key={l.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 p-2"><Link href={`/admin/content/lessons/${l.id}`} className="font-medium underline-offset-4 hover:underline">{l.title}</Link><StatusBadge status={l.status} /></li>)}</ul>
              <form action={createLesson as never} className="mt-3 grid gap-2 sm:grid-cols-2"><input type="hidden" name="moduleId" value={m.id} /><Input name="title" placeholder={t("admin.content.newLessonTitle")} required /><Input name="summary" placeholder={t("admin.common.summary")} /><Button type="submit" size="sm">{t("admin.content.createLesson")}</Button></form>
            </div>)}
          </CardContent></Card>
        ))}</div>
        <Card><CardHeader><CardTitle>{t("admin.content.newModule")}</CardTitle></CardHeader><CardContent><form action={createModule as never} className="space-y-3">
          <input type="hidden" name="certificationId" value={certificationId ?? ""} />
          <Field id="domainId" label={t("admin.common.domain")}><Select name="domainId">{domains.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</Select></Field>
          <Field id="title" label={t("admin.content.moduleTitle")}><Input name="title" required /></Field>
          <Field id="summary" label={t("admin.content.moduleSummary")}><Textarea name="summary" /></Field>
          <Button type="submit">{t("admin.content.createModule")}</Button>
        </form></CardContent></Card>
      </div>
    </div>
  );
}
