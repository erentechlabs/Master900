import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { PageHeader } from "@/components/page";
import { Markdown } from "@/components/markdown";
import { WorkflowPanel } from "@/components/admin/workflow-panel";
import { saveLesson } from "../../../actions";
import { Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Textarea, Checkbox, SaveBar, JsonField, Hidden } from "@/components/admin/admin-forms";
import { prettyJson } from "@/modules/admin/cms";
import { diffLines, snapshotToText } from "@/modules/content/diff";
import { getI18n } from "@/i18n/server";

export default async function LessonEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("content:edit");
  const { t, fmt } = await getI18n();
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({ where: { id }, include: { certification: { include: { domains: { include: { objectives: true } } } }, blocks: { orderBy: { sortOrder: "asc" } }, sources: { include: { source: true } }, translations: true } });
  if (!lesson) notFound();
  const reviews = await prisma.contentReview.findMany({ where: { entityType: "LESSON", entityId: id }, orderBy: { createdAt: "desc" } });
  const revisions = await prisma.contentRevision.findMany({ where: { entityType: "LESSON", entityId: id }, orderBy: { version: "desc" }, take: 10 });
  const tr = lesson.translations.find((t) => t.locale === "tr");
  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.content.editLessonTitle", { title: lesson.title })} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <form action={saveLesson as never} className="space-y-6">
          <Hidden name="id" value={lesson.id} />
          <Card><CardHeader><CardTitle>{t("admin.content.metadata")}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
            <Field id="title" label={t("admin.common.title")}><Input name="title" defaultValue={lesson.title} required /></Field>
            <Field id="slug" label={t("admin.common.slug")}><Input name="slug" defaultValue={lesson.slug} required /></Field>
            <Field id="summary" label={t("admin.common.summary")} className="md:col-span-2"><Textarea name="summary" defaultValue={lesson.summary ?? ""} /></Field>
            <Field id="estimatedMinutes" label={t("admin.content.estimatedMinutes")}><Input name="estimatedMinutes" type="number" defaultValue={lesson.estimatedMinutes} /></Field>
            <Field id="objectiveId" label={t("admin.common.objective")}><Select name="objectiveId" defaultValue={lesson.objectiveId ?? ""}><option value="">{t("common.none")}</option>{lesson.certification.domains.flatMap((d) => d.objectives).map((o) => <option key={o.id} value={o.id}>{o.code} - {o.title}</option>)}</Select></Field>
            <label className="flex items-center gap-2"><Checkbox name="needsVerification" defaultChecked={lesson.needsVerification} /> {t("admin.common.needsVerification")}</label>
            <Field id="verificationNote" label={t("admin.common.verificationNote")}><Textarea name="verificationNote" defaultValue={lesson.verificationNote ?? ""} /></Field>
            <JsonField id="sources" name="sources" label={t("admin.common.sourcesJson")} value={prettyJson(lesson.sources.map((s) => ({ title: s.source.title, url: s.source.url })))} />
            <JsonField id="blocks" name="blocks" label={t("admin.content.blocksJson")} value={prettyJson(lesson.blocks.map((b) => ({ key: b.key, type: b.type, sortOrder: b.sortOrder, data: b.data })))} rows={22} />
            <Field id="trTitle" label={t("admin.content.translationTitleShort")}><Input name="trTitle" defaultValue={tr?.title ?? ""} /></Field>
            <Field id="trSummary" label={t("admin.content.translationSummaryShort")}><Textarea name="trSummary" defaultValue={tr?.summary ?? ""} /></Field>
            <JsonField id="trBlocks" name="trBlocks" label={t("admin.content.translationBlocksJson")} value={prettyJson(tr?.blocks ?? {})} />
            <Field id="changeNote" label={t("admin.common.changeNote")}><Input name="changeNote" /></Field>
          </CardContent></Card>
          <SaveBar backHref="/admin/content" />
        </form>
        <div className="space-y-6">
          <WorkflowPanel entityType="LESSON" entityId={lesson.id} status={lesson.status} authorType={lesson.authorType} roles={user.roles} reviews={reviews} />
          <Card><CardHeader><CardTitle>{t("admin.common.preview")}</CardTitle></CardHeader><CardContent>{lesson.blocks.map((b) => <div key={b.id} className="mb-4"><h3 className="font-semibold">{b.key}</h3><Markdown>{typeof (b.data as { markdown?: unknown }).markdown === "string" ? (b.data as { markdown: string }).markdown : prettyJson(b.data)}</Markdown></div>)}</CardContent></Card>
        </div>
      </div>
      <Card><CardHeader><CardTitle>{t("admin.revisions.title")}</CardTitle></CardHeader><CardContent className="space-y-3">{revisions.length ? revisions.map((r) => { const diff = diffLines(snapshotToText(r.snapshot), snapshotToText({ lesson, blocks: lesson.blocks })); return <details key={r.id} className="rounded-md border p-3"><summary>{t("admin.revisions.versionCreated", { version: r.version, date: fmt.dateTime(r.createdAt) })}</summary><pre className="mt-2 max-h-72 overflow-auto text-xs">{diff.map((d) => `${d.type === "add" ? "+" : d.type === "remove" ? "-" : " "}${d.text}`).join("\n")}</pre></details>; }) : <p className="text-sm text-muted-foreground">{t("admin.revisions.noRevisions")}</p>}</CardContent></Card>
    </div>
  );
}
