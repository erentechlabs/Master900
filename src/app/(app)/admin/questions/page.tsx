import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/admin/status-badge";
import { difficulties, questionTypes, authorTypes } from "@/modules/admin/cms";
import { generateQuestionDrafts } from "../actions";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("questions:edit");
  const { t } = await getI18n();
  const sp = await searchParams;
  const certs = await prisma.certification.findMany({ orderBy: { code: "asc" } });
  const lessons = await prisma.lesson.findMany({ orderBy: { updatedAt: "desc" }, take: 50 });
  const where = {
    ...(sp.certificationId ? { certificationId: sp.certificationId } : {}),
    ...(sp.type ? { type: sp.type as never } : {}),
    ...(sp.status ? { status: sp.status as never } : {}),
    ...(sp.difficulty ? { difficulty: sp.difficulty as never } : {}),
    ...(sp.authorType ? { authorType: sp.authorType as never } : {}),
    ...(sp.needsVerification === "true" ? { needsVerification: true } : {}),
    ...(sp.q ? { stem: { contains: sp.q, mode: "insensitive" as const } } : {}),
  };
  const questions = await prisma.question.findMany({ where, include: { certification: true, domain: true }, orderBy: { updatedAt: "desc" }, take: 100 });
  return (
    <div className="space-y-4">
      <PageHeader title={t("admin.questions.title")} description={t("admin.questions.shortSubtitle")} actions={<Button asChild><Link href="/admin/questions/new">{t("admin.questions.new")}</Link></Button>} />
      <form className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
        <Field id="q" label={t("common.search")}><Input name="q" defaultValue={sp.q ?? ""} /></Field>
        <Field id="certificationId" label={t("admin.common.certification")}><Select name="certificationId" defaultValue={sp.certificationId ?? ""}><option value="">{t("common.all")}</option>{certs.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select></Field>
        <Field id="type" label={t("admin.common.type")}><Select name="type" defaultValue={sp.type ?? ""}><option value="">{t("common.all")}</option>{questionTypes.map((type) => <option key={type} value={type}>{t(`enums.questionType.${type}` as MessageKey)}</option>)}</Select></Field>
        <Field id="difficulty" label={t("admin.common.difficulty")}><Select name="difficulty" defaultValue={sp.difficulty ?? ""}><option value="">{t("common.all")}</option>{difficulties.map((difficulty) => <option key={difficulty} value={difficulty}>{t(`enums.difficulty.${difficulty}` as MessageKey)}</option>)}</Select></Field>
        <Field id="authorType" label={t("admin.common.authorType")}><Select name="authorType" defaultValue={sp.authorType ?? ""}><option value="">{t("common.all")}</option>{authorTypes.map((authorType) => <option key={authorType} value={authorType}>{t(`enums.authorType.${authorType}` as MessageKey)}</option>)}</Select></Field>
        <Button type="submit" variant="secondary">{t("common.filter")}</Button>
      </form>
      {sp.generate !== undefined ? <form action={generateQuestionDrafts as never} className="flex flex-wrap items-end gap-3 rounded-lg border p-4"><Field id="lessonId" label={t("admin.questions.relatedLesson")}><Select name="lessonId">{lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</Select></Field><Field id="count" label={t("admin.questions.generateCountShort")}><Input name="count" type="number" defaultValue={3} min={1} max={10} /></Field><Button type="submit">{t("admin.questions.generate")}</Button></form> : <Button asChild variant="outline"><Link href="/admin/questions?generate">{t("admin.questions.generate")}</Link></Button>}
      <Table><THead><TR><TH>{t("admin.questions.question")}</TH><TH>{t("admin.common.certification")}</TH><TH>{t("admin.common.type")}</TH><TH>{t("admin.common.status")}</TH><TH>{t("admin.common.usage")}</TH><TH /></TR></THead><TBody>{questions.map((q) => <TR key={q.id}><TD className="max-w-xl"><Link className="font-medium underline-offset-4 hover:underline" href={`/admin/questions/${q.id}`}>{q.stem.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1")}</Link>{q.qualityFlags.length ? <p className="text-xs text-amber-700">{q.qualityFlags.join(", ")}</p> : null}</TD><TD>{t("admin.common.certificationDomain", { certification: q.certification.code, domain: q.domain.key })}</TD><TD>{t(`enums.questionType.${q.type}` as MessageKey)}</TD><TD><StatusBadge status={q.status} /></TD><TD>{t("admin.common.answeredCount", { count: q.timesAnswered })} · {q.timesAnswered ? Math.round((q.timesCorrect / q.timesAnswered) * 100) : 0}%</TD><TD><Button asChild size="sm" variant="outline"><Link href={`/admin/questions/${q.id}`}>{t("common.edit")}</Link></Button></TD></TR>)}</TBody></Table>
    </div>
  );
}
