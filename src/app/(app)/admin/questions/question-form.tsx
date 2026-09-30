import Link from "next/link";
import type { Certification, ExamDomain, ExamObjective, Lesson, Question, QuestionOption, QuestionSource, OfficialSource, QuestionTranslation } from "@prisma/client";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Textarea, Checkbox, SaveBar, JsonField, Hidden } from "@/components/admin/admin-forms";
import { prettyJson } from "@/modules/admin/cms";
import { difficulties, questionTypes } from "@/modules/admin/cms";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

type Cert = Certification & { domains: (ExamDomain & { objectives: ExamObjective[] })[]; lessons: Lesson[] };
type Q = Question & { domain: ExamDomain; objective: ExamObjective | null; lesson: Lesson | null; options: QuestionOption[]; sources: (QuestionSource & { source: OfficialSource })[]; translations: QuestionTranslation[] };

export async function QuestionForm({ question, certifications, action }: { question?: Q; certifications: Cert[]; action: (formData: FormData) => Promise<unknown> }) {
  const { t } = await getI18n();
  const cert = certifications.find((c) => c.id === question?.certificationId) ?? certifications[0];
  const tr = question?.translations.find((t) => t.locale === "tr");
  return <div className="space-y-6"><PageHeader title={question ? t("admin.questions.edit") : t("admin.questions.new")} actions={<Button asChild variant="outline"><Link href="/admin/questions">{t("common.back")}</Link></Button>} />
    <form action={action as never} className="space-y-6"><Hidden name="id" value={question?.id} />
      <Card><CardHeader><CardTitle>{t("admin.questions.details")}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        <Field id="certificationId" label={t("admin.common.certification")}><Select name="certificationId" defaultValue={question?.certificationId ?? cert?.id}>{certifications.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select></Field>
        <Field id="domainKey" label={t("admin.common.domainKey")}><Select name="domainKey" defaultValue={question?.domain.key ?? cert?.domains[0]?.key}>{cert?.domains.map((d) => <option key={d.id} value={d.key}>{d.key} - {d.title}</option>)}</Select></Field>
        <Field id="objectiveCode" label={t("admin.common.objectiveCode")}><Input name="objectiveCode" defaultValue={question?.objective?.code ?? ""} /></Field>
        <Field id="lessonSlug" label={t("admin.questions.relatedLessonSlug")}><Input name="lessonSlug" defaultValue={question?.lesson?.slug ?? ""} /></Field>
        <Field id="code" label={t("admin.common.reference")}><Input name="code" defaultValue={question?.code ?? `${cert?.code.toLowerCase() ?? "q"}-new-question`} required /></Field>
        <Field id="type" label={t("admin.common.type")}><Select name="type" defaultValue={question?.type ?? "SINGLE_CHOICE"}>{questionTypes.map((type) => <option key={type} value={type}>{t(`enums.questionType.${type}` as MessageKey)}</option>)}</Select></Field>
        <Field id="difficulty" label={t("admin.common.difficulty")}><Select name="difficulty" defaultValue={question?.difficulty ?? "MEDIUM"}>{difficulties.map((difficulty) => <option key={difficulty} value={difficulty}>{t(`enums.difficulty.${difficulty}` as MessageKey)}</option>)}</Select></Field>
        <label className="flex items-center gap-2"><Checkbox name="shuffleOptions" defaultChecked={question?.shuffleOptions ?? true} /> {t("admin.questions.shuffle")}</label>
        <Field id="stem" label={t("admin.questions.stem")} className="md:col-span-2"><Textarea name="stem" defaultValue={question?.stem ?? ""} rows={5} required /></Field>
        <Field id="scenario" label={t("admin.questions.scenarioShort")} className="md:col-span-2"><Textarea name="scenario" defaultValue={question?.scenario ?? ""} rows={4} /></Field>
        <Field id="explanation" label={t("admin.questions.explanationShort")} className="md:col-span-2"><Textarea name="explanation" defaultValue={question?.explanation ?? ""} rows={4} required /></Field>
        <JsonField id="options" name="options" label={t("admin.questions.optionsJson")} value={prettyJson(question?.options.map((o) => ({ key: o.key, text: o.text, correct: o.isCorrect, explanation: o.explanation })) ?? [{ key: "A", text: "", correct: true, explanation: "" }, { key: "B", text: "", correct: false, explanation: "" }])} />
        <JsonField id="interaction" name="interaction" label={t("admin.questions.interactionJson")} value={prettyJson(question?.interaction ?? {})} />
        <JsonField id="answerKey" name="answerKey" label={t("admin.questions.answerKeyJson")} value={prettyJson(question?.answerKey ?? {})} />
        <JsonField id="sources" name="sources" label={t("admin.questions.sourcesJson")} value={prettyJson(question?.sources.map((s) => ({ title: s.source.title, url: s.source.url })) ?? [])} />
        <Field id="qualityFlags" label={t("admin.common.qualityFlags")}><Textarea name="qualityFlags" defaultValue={question?.qualityFlags.join("\n") ?? ""} /></Field>
        <label className="flex items-center gap-2"><Checkbox name="needsVerification" defaultChecked={question?.needsVerification ?? false} /> {t("admin.common.needsVerification")}</label>
        <JsonField id="translations" name="translations" label={t("admin.questions.translationsJson")} value={prettyJson(tr ? { tr: { stem: tr.stem, scenario: tr.scenario, explanation: tr.explanation, options: tr.options, interaction: tr.interaction, answerExplanations: tr.answerExplanations, status: tr.status } } : {})} />
        <Field id="changeNote" label={t("admin.common.changeNote")}><Input name="changeNote" /></Field>
      </CardContent></Card>
      <SaveBar backHref="/admin/questions" />
    </form>
    <Card><CardHeader><CardTitle>{t("admin.common.preview")}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{t("admin.questions.savedPreviewNotice")}</p></CardContent></Card>
  </div>;
}
