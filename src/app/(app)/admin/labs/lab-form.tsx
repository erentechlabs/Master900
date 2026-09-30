import Link from "next/link";
import type { Certification, ExamDomain, ExamObjective, Lab, LabStep, LabValidationRule, Module } from "@prisma/client";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Textarea, Checkbox, SaveBar, JsonField, Hidden } from "@/components/admin/admin-forms";
import { labComplexities, labTypes, prettyJson } from "@/modules/admin/cms";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

type Cert = Certification & { domains: (ExamDomain & { objectives: ExamObjective[] })[]; modules: Module[] };
type L = Lab & { steps: (LabStep & { rules: LabValidationRule[] })[]; rules: LabValidationRule[] };

export async function LabForm({ lab, certifications, action }: { lab?: L; certifications: Cert[]; action: (formData: FormData) => Promise<unknown> }) {
  const { t } = await getI18n();
  const cert = certifications.find((c) => c.id === lab?.certificationId) ?? certifications[0];
  const steps = lab?.steps.map((s) => ({ key: s.key, title: s.title, instruction: s.instruction, hint: s.hint, explanation: s.explanation, targetId: s.targetId, rules: s.rules.map((r) => ({ key: r.key, description: r.description, rule: r.rule, successFeedback: r.successFeedback, failureFeedback: r.failureFeedback })) })) ?? [];
  return <div className="space-y-6"><PageHeader title={lab ? t("admin.labsBuilder.editTitle", { title: lab.title }) : t("admin.labsBuilder.new")} actions={<Button asChild variant="outline"><Link href="/admin/labs">{t("common.back")}</Link></Button>} />
    <form action={action as never} className="space-y-6"><Hidden name="id" value={lab?.id} />
      <Card><CardHeader><CardTitle>{t("admin.labsBuilder.details")}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        <Field id="certificationId" label={t("admin.common.certification")}><Select name="certificationId" defaultValue={lab?.certificationId ?? cert?.id}>{certifications.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select></Field>
        <Field id="domainId" label={t("admin.common.domain")}><Select name="domainId" defaultValue={lab?.domainId ?? ""}><option value="">{t("common.none")}</option>{cert?.domains.map((d) => <option key={d.id} value={d.id}>{d.key} - {d.title}</option>)}</Select></Field>
        <Field id="moduleId" label={t("admin.common.module")}><Select name="moduleId" defaultValue={lab?.moduleId ?? ""}><option value="">{t("common.none")}</option>{cert?.modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select></Field>
        <Field id="objectiveId" label={t("admin.common.objective")}><Select name="objectiveId" defaultValue={lab?.objectiveId ?? ""}><option value="">{t("common.none")}</option>{cert?.domains.flatMap((d) => d.objectives).map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}</Select></Field>
        <Field id="title" label={t("admin.common.title")}><Input name="title" defaultValue={lab?.title ?? ""} required /></Field>
        <Field id="slug" label={t("admin.common.slug")}><Input name="slug" defaultValue={lab?.slug ?? ""} /></Field>
        <Field id="type" label={t("admin.common.type")}><Select name="type" defaultValue={lab?.type ?? "UI_SIMULATION"}>{labTypes.map((labType) => <option key={labType} value={labType}>{t(`enums.labType.${labType}` as MessageKey)}</option>)}</Select></Field>
        <Field id="complexity" label={t("admin.labsBuilder.complexity")}><Select name="complexity" defaultValue={lab?.complexity ?? "INTRO"}>{labComplexities.map((complexity) => <option key={complexity} value={complexity}>{t(`enums.labComplexity.${complexity}` as MessageKey)}</option>)}</Select></Field>
        <Field id="estimatedMinutes" label={t("admin.labsBuilder.minutesShort")}><Input name="estimatedMinutes" type="number" defaultValue={lab?.estimatedMinutes ?? 15} /></Field>
        <Field id="summary" label={t("admin.common.summary")} className="md:col-span-2"><Textarea name="summary" defaultValue={lab?.summary ?? ""} required /></Field>
        <Field id="scenario" label={t("admin.labsBuilder.scenario")} className="md:col-span-2"><Textarea name="scenario" defaultValue={lab?.scenario ?? ""} required /></Field>
        <Field id="learningObjectives" label={t("admin.labsBuilder.objectivesShort")}><Textarea name="learningObjectives" defaultValue={lab?.learningObjectives.join("\n") ?? ""} /></Field>
        <Field id="prerequisites" label={t("admin.labsBuilder.prerequisites")}><Textarea name="prerequisites" defaultValue={lab?.prerequisites.join("\n") ?? ""} /></Field>
        <JsonField id="config" name="config" label={t("admin.labsBuilder.configJson")} value={prettyJson(lab?.config ?? {})} />
        <JsonField id="steps" name="steps" label={t("admin.labsBuilder.stepsJson")} value={prettyJson(steps.length ? steps : [{ key: "step-1", title: "Step 1", instruction: "", explanation: "", rules: [] }])} rows={16} />
        <JsonField id="finalRules" name="finalRules" label={t("admin.labsBuilder.finalRulesJson")} value={prettyJson(lab?.rules.map((r) => ({ key: r.key, description: r.description, rule: r.rule, successFeedback: r.successFeedback, failureFeedback: r.failureFeedback })) ?? [])} />
        <Field id="solution" label={t("admin.labsBuilder.solutionShort")} className="md:col-span-2"><Textarea name="solution" defaultValue={lab?.solution ?? ""} rows={8} /></Field>
        <label className="flex items-center gap-2"><Checkbox name="needsVerification" defaultChecked={lab?.needsVerification ?? false} /> {t("admin.common.needsVerification")}</label>
        <Field id="changeNote" label={t("admin.common.changeNote")}><Input name="changeNote" /></Field>
      </CardContent></Card>
      <SaveBar backHref="/admin/labs" />
    </form>
  </div>;
}
