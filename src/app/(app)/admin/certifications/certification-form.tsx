import Link from "next/link";
import type { Certification, CertificationVersion, CurriculumAlert, ExamDomain, ExamObjective } from "@prisma/client";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Textarea, Checkbox, SaveBar, JsonField, Hidden, StatusBadge } from "@/components/admin/admin-forms";
import { prettyJson } from "@/modules/admin/cms";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

type Cert = Certification & { domains?: (ExamDomain & { objectives: ExamObjective[] })[]; versions?: CertificationVersion[]; curriculumAlerts?: CurriculumAlert[]; relatedFrom?: { to: Certification }[] };

export async function CertificationForm({ certification, iconNames, certifications, action }: { certification?: Cert; iconNames: string[]; certifications: Certification[]; action: (formData: FormData) => Promise<unknown> }) {
  const { t, fmt } = await getI18n();
  const outline = certification?.domains?.map((d) => ({ key: d.key, title: d.title, description: d.description, weightMin: d.weightMin, weightMax: d.weightMax, objectives: d.objectives.map((o) => ({ code: o.code, title: o.title, description: o.description })) })) ?? [];
  const tr = (certification?.translations as { tr?: { name?: string; description?: string } } | null)?.tr;
  return (
    <div className="space-y-6">
      <PageHeader title={certification ? t("admin.certifications.editTitle", { code: certification.code }) : t("admin.certifications.new")} actions={<Button asChild variant="outline"><Link href="/admin/certifications">{t("common.back")}</Link></Button>} />
      <form action={action as never} className="space-y-6">
        <Hidden name="id" value={certification?.id} />
        <Card><CardHeader><CardTitle>{t("admin.certifications.catalogDetails")}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
          <Field id="code" label={t("admin.certifications.code")}><Input name="code" defaultValue={certification?.code} required /></Field>
          <Field id="name" label={t("admin.certifications.name")}><Input name="name" defaultValue={certification?.name} required /></Field>
          <Field id="description" label={t("admin.certifications.description")} className="md:col-span-2"><Textarea name="description" defaultValue={certification?.description} required /></Field>
          <Field id="audience" label={t("admin.certifications.audience")}><Input name="audience" defaultValue={certification?.audience ?? ""} /></Field>
          <Field id="status" label={t("admin.common.status")}><Select name="status" defaultValue={certification?.status ?? "ACTIVE"}>{["ACTIVE","ANNOUNCED","RETIRING","RETIRED"].map((s) => <option key={s} value={s}>{t(`enums.certificationStatus.${s}` as MessageKey)}</option>)}</Select></Field>
          <Field id="examVersion" label={t("admin.certifications.examVersion")}><Input name="examVersion" defaultValue={certification?.examVersion ?? ""} /></Field>
          <Field id="officialUrl" label={t("admin.certifications.officialUrlShort")}><Input name="officialUrl" type="url" defaultValue={certification?.officialUrl ?? ""} /></Field>
          <Field id="studyGuideUrl" label={t("admin.certifications.studyGuideUrlShort")}><Input name="studyGuideUrl" type="url" defaultValue={certification?.studyGuideUrl ?? ""} /></Field>
          <Field id="lastCurriculumReviewAt" label={t("admin.certifications.lastReview")}><Input name="lastCurriculumReviewAt" type="date" defaultValue={certification?.lastCurriculumReviewAt?.toISOString().slice(0,10) ?? ""} /></Field>
          <Field id="retirementDate" label={t("admin.certifications.retirementDate")}><Input name="retirementDate" type="date" defaultValue={certification?.retirementDate?.toISOString().slice(0,10) ?? ""} /></Field>
          <Field id="replacementCode" label={t("admin.certifications.replacementShort")}><Select name="replacementCode" defaultValue={certifications.find((c) => c.id === certification?.replacementId)?.code ?? ""}><option value="">{t("common.none")}</option>{certifications.filter((c) => c.id !== certification?.id).map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}</Select></Field>
          <Field id="estimatedStudyHoursMin" label={t("admin.certifications.effortMinShort")}><Input name="estimatedStudyHoursMin" type="number" defaultValue={certification?.estimatedStudyHoursMin ?? ""} /></Field>
          <Field id="estimatedStudyHoursMax" label={t("admin.certifications.effortMaxShort")}><Input name="estimatedStudyHoursMax" type="number" defaultValue={certification?.estimatedStudyHoursMax ?? ""} /></Field>
          <Field id="recommendedPrerequisites" label={t("admin.certifications.prerequisitesShort")}><Textarea name="recommendedPrerequisites" defaultValue={certification?.recommendedPrerequisites.join("\n") ?? ""} /></Field>
          <Field id="relatedCodes" label={t("admin.certifications.related")}><Textarea name="relatedCodes" defaultValue={certification?.relatedFrom?.map((r) => r.to.code).join("\n") ?? ""} /></Field>
          <Field id="icon" label={t("admin.certifications.icon")}><Select name="icon" defaultValue={certification?.icon ?? "GraduationCap"}>{iconNames.map((i) => <option key={i}>{i}</option>)}</Select></Field>
          <Field id="themeColor" label={t("admin.certifications.themeColor")}><Input name="themeColor" type="color" defaultValue={certification?.themeColor ?? "#2563eb"} /></Field>
          <label className="flex items-center gap-2"><Checkbox name="isVisible" defaultChecked={certification?.isVisible ?? true} /> {t("admin.certifications.visible")}</label>
          <label className="flex items-center gap-2"><Checkbox name="hasLearningPath" defaultChecked={certification?.hasLearningPath ?? false} /> {t("admin.certifications.hasLearningPath")}</label>
          <Field id="unverifiedFields" label={t("admin.certifications.unverifiedFieldsShort")}><Textarea name="unverifiedFields" defaultValue={certification?.unverifiedFields.join("\n") ?? ""} /></Field>
          <Field id="verificationNotes" label={t("admin.certifications.verificationNotes")}><Textarea name="verificationNotes" defaultValue={certification?.verificationNotes ?? ""} /></Field>
          <Field id="trName" label={t("admin.certifications.translationNameShort")}><Input name="trName" defaultValue={tr?.name ?? ""} /></Field>
          <Field id="trDescription" label={t("admin.certifications.translationDescriptionShort")}><Textarea name="trDescription" defaultValue={tr?.description ?? ""} /></Field>
          <JsonField id="domains" name="domains" label={t("admin.certifications.domainsJson")} value={prettyJson(outline.length ? outline : [{ key: "core", title: "Core concepts", weightMin: 0, weightMax: 100, objectives: [{ code: "1.1", title: "Describe core concepts" }] }])} rows={18} />
          <Field id="changeSummary" label={t("admin.certifications.outlineChangeSummary")}><Input name="changeSummary" /></Field>
        </CardContent></Card>
        <SaveBar backHref="/admin/certifications" />
      </form>
      {certification?.versions?.length ? <Card><CardHeader><CardTitle>{t("admin.revisions.versionHistory")}</CardTitle></CardHeader><CardContent><Table><THead><TR><TH>{t("admin.common.version")}</TH><TH>{t("admin.revisions.label")}</TH><TH>{t("admin.common.created")}</TH></TR></THead><TBody>{certification.versions.map((v) => <TR key={v.id}><TD>{v.version}</TD><TD>{v.label}</TD><TD>{fmt.dateTime(v.createdAt)}</TD></TR>)}</TBody></Table></CardContent></Card> : null}
      {certification?.curriculumAlerts?.length ? <Card><CardHeader><CardTitle>{t("admin.certifications.alerts")}</CardTitle></CardHeader><CardContent>{certification.curriculumAlerts.map((a) => <p key={a.id} className="text-sm"><StatusBadge status={a.resolvedAt ? "RESOLVED" : "OPEN"} /> {a.message}</p>)}</CardContent></Card> : null}
    </div>
  );
}
