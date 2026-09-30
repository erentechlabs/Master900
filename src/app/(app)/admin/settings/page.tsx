import { getEnv } from "@/lib/env";
import { requirePermission } from "@/modules/auth/session";
import { getSettings } from "@/modules/admin/settings";
import { PageHeader } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Checkbox, SaveBar } from "@/components/admin/admin-forms";
import { saveSettings } from "../actions";
import { getI18n } from "@/i18n/server";

export default async function SettingsPage() {
  await requirePermission("settings:manage");
  const { t } = await getI18n();
  const [settings, env] = await Promise.all([getSettings(), Promise.resolve(getEnv())]);
  return <div className="space-y-4"><PageHeader title={t("admin.settings.title")} description={t("admin.settings.shortSubtitle")} />
    <form action={saveSettings as never} className="space-y-6">
      <Card><CardHeader><CardTitle>{t("admin.settings.aiTitle")}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        <Field id="ai.provider" label={t("admin.settings.aiProvider")}><Select name="ai.provider" defaultValue={settings["ai.provider"]}><option value="env">{t("admin.settings.aiProviderEnv")}</option><option value="local">{t("admin.settings.aiProviderLocalShort")}</option><option value="openai">{t("admin.settings.aiProviderOpenAIShort")}</option></Select></Field>
        <Field id="ai.model" label={t("admin.settings.aiModel")}><Input name="ai.model" defaultValue={settings["ai.model"]} /></Field>
        <Field id="ai.baseUrl" label={t("admin.settings.aiBaseUrl")}><Input name="ai.baseUrl" defaultValue={settings["ai.baseUrl"]} /></Field>
        <p className="text-sm text-muted-foreground">AI_API_KEY: {env.AI_API_KEY ? t("admin.settings.aiKeyConfiguredShort") : t("admin.settings.aiKeyMissingShort")}</p>
        <label className="flex items-center gap-2"><Checkbox name="ai.draftsEnabled" defaultChecked={settings["ai.draftsEnabled"]} /> {t("admin.settings.aiDraftsEnabledShort")}</label>
        <label className="flex items-center gap-2"><Checkbox name="ai.enabled" defaultChecked={settings["ai.enabled"]} /> {t("admin.settings.aiTutorEnabled")}</label>
        <Field id="ai.tutorDailyLimit" label={t("admin.settings.tutorDailyLimit")}><Input name="ai.tutorDailyLimit" type="number" min={0} max={1000} defaultValue={settings["ai.tutorDailyLimit"]} /></Field>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("admin.settings.platformTitle")}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-2"><Checkbox name="platform.registrationEnabled" defaultChecked={settings["platform.registrationEnabled"]} /> {t("admin.settings.registrationEnabledShort")}</label>
        <Field id="practice.fullExamQuestions" label={t("admin.settings.fullExamQuestionsShort")}><Input name="practice.fullExamQuestions" type="number" defaultValue={settings["practice.fullExamQuestions"]} /></Field>
        <Field id="practice.fullExamMinutes" label={t("admin.settings.fullExamMinutesShort")}><Input name="practice.fullExamMinutes" type="number" defaultValue={settings["practice.fullExamMinutes"]} /></Field>
        <Field id="practice.targetPercent" label={t("admin.settings.practiceTargetShort")}><Input name="practice.targetPercent" type="number" defaultValue={settings["practice.targetPercent"]} /></Field>
        <Field id="analytics.minCohort" label={t("admin.settings.analyticsMinCohortShort")}><Input name="analytics.minCohort" type="number" defaultValue={settings["analytics.minCohort"]} /></Field>
      </CardContent></Card>
      <SaveBar backHref="/admin" />
    </form>
  </div>;
}
