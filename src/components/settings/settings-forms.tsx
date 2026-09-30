"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, RotateCcw } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translator";
import { resetLearningProgressAction, updateSettingsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Spinner } from "@/components/ui/misc";

type SettingsFormsProps = {
  user: { id: string; email: string; name: string | null; locale: string; isDemo: boolean; createdAt: string; roles: string[] };
  preference: {
    timezone: string;
    studyDays: number[];
    sessionMinutes: number;
    dailyGoalMinutes: number;
    learningStyle: string | null;
    experienceLevel: string | null;
    showTimerByDefault: boolean;
    gamificationEnabled: boolean;
    reducedMotion: boolean;
    shareAnonymousAnalytics: boolean;
  } | null;
};

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const TIME_ZONES = ["UTC", "Europe/Istanbul", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore"];

function errorText(t: ReturnType<typeof useI18n>["t"], code: string) {
  const key = `errors.${code}` as MessageKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return t("common.genericError");
}

export function SettingsForms({ user, preference }: SettingsFormsProps) {
  const { t, fmt } = useI18n();
  const [pending, startTransition] = React.useTransition();
  const detectedZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [studyDays, setStudyDays] = React.useState<number[]>(preference?.studyDays.length ? preference.studyDays : [1, 3, 5]);
  const pref = {
    timezone: preference?.timezone ?? (TIME_ZONES.includes(detectedZone) ? detectedZone : "UTC"),
    sessionMinutes: preference?.sessionMinutes ?? 30,
    dailyGoalMinutes: preference?.dailyGoalMinutes ?? 20,
    learningStyle: preference?.learningStyle ?? "",
    experienceLevel: preference?.experienceLevel ?? "",
    showTimerByDefault: preference?.showTimerByDefault ?? true,
    gamificationEnabled: preference?.gamificationEnabled ?? true,
    reducedMotion: preference?.reducedMotion ?? false,
    shareAnonymousAnalytics: preference?.shareAnonymousAnalytics ?? true,
  };

  const onSettings = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateSettingsAction({
        name: formData.get("name") ?? "",
        locale: formData.get("locale") ?? "en",
        timezone: formData.get("timezone") ?? "UTC",
        studyDays,
        sessionMinutes: formData.get("sessionMinutes"),
        dailyGoalMinutes: formData.get("dailyGoalMinutes"),
        learningStyle: formData.get("learningStyle") ?? "",
        experienceLevel: formData.get("experienceLevel") ?? "",
        showTimerByDefault: formData.get("showTimerByDefault") === "on",
        gamificationEnabled: formData.get("gamificationEnabled") === "on",
        reducedMotion: formData.get("reducedMotion") === "on",
        shareAnonymousAnalytics: formData.get("shareAnonymousAnalytics") === "on",
      });
      if (!result.ok) toast.error(errorText(t, result.error));
      else toast.success(t("settings.saved"));
    });
  };

  const onReset = (formData: FormData) => {
    startTransition(async () => {
      const result = await resetLearningProgressAction({ confirmation: formData.get("confirmation") });
      if (!result.ok) {
        toast.error(errorText(t, result.error));
      }
    });
  };

  return (
    <div className="space-y-6">
      <form action={onSettings} className="space-y-6">
        <Card id="profile">
          <CardHeader>
            <CardTitle>{t("settings.profile")}</CardTitle>
            <CardDescription>{t("settings.memberSince", { date: fmt.date(new Date(user.createdAt)) })}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field id="settings-name" label={t("settings.name")}>
              <Input name="name" defaultValue={user.name ?? ""} autoComplete="name" />
            </Field>
            <Field id="settings-email" label={t("settings.email")} hint={t("settings.emailReadOnly")}>
              <Input name="email" defaultValue={user.email} disabled />
            </Field>
          </CardContent>
        </Card>

        <Card id="preferences">
          <CardHeader>
            <CardTitle>{t("settings.preferences")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field id="settings-locale" label={t("settings.language")}>
              <Select name="locale" defaultValue={user.locale}>
                <option value="en">English</option>
                <option value="tr">Türkçe</option>
              </Select>
            </Field>
            <Field id="settings-timezone" label={t("settings.timezone")} hint={t("settings.timezoneHint")}>
              <Select name="timezone" defaultValue={pref.timezone}>
                {[...new Set([pref.timezone, detectedZone, ...TIME_ZONES])].filter(Boolean).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="space-y-2 md:col-span-2">
              <legend className="text-sm font-medium">{t("settings.studyDays")}</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <label key={day} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={studyDays.includes(day)}
                      onChange={(e) => setStudyDays((prev) => (e.target.checked ? [...new Set([...prev, day])].sort() : prev.filter((d) => d !== day)))}
                    />
                    {t(`settings.day_${day}` as MessageKey)}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field id="settings-session-minutes" label={t("settings.sessionMinutes")}>
              <Input name="sessionMinutes" type="number" min={5} max={240} defaultValue={pref.sessionMinutes} />
            </Field>
            <Field id="settings-daily-goal" label={t("settings.dailyGoal")}>
              <Input name="dailyGoalMinutes" type="number" min={1} max={480} defaultValue={pref.dailyGoalMinutes} />
            </Field>
            <Field id="settings-learning-style" label={t("settings.learningStyle")}>
              <Select name="learningStyle" defaultValue={pref.learningStyle}>
                <option value="">{t("settings.notSet")}</option>
                {["READING", "VISUAL", "GUIDED_PRACTICE", "QUIZZES"].map((v) => (
                  <option key={v} value={v}>
                    {t(`settings.learningStyle_${v}` as MessageKey)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="settings-experience" label={t("settings.experienceLevel")}>
              <Select name="experienceLevel" defaultValue={pref.experienceLevel}>
                <option value="">{t("settings.notSet")}</option>
                {["NEW_TO_TECH", "SOME_EXPERIENCE", "EXPERIENCED"].map((v) => (
                  <option key={v} value={v}>
                    {t(`settings.experience_${v}` as MessageKey)}
                  </option>
                ))}
              </Select>
            </Field>
            <Toggle name="showTimerByDefault" defaultChecked={pref.showTimerByDefault} label={t("settings.showTimer")} />
            <Toggle name="gamificationEnabled" defaultChecked={pref.gamificationEnabled} label={t("settings.gamification")} hint={t("settings.gamificationHint")} />
            <Toggle name="reducedMotion" defaultChecked={pref.reducedMotion} label={t("settings.reducedMotion")} hint={t("settings.reducedMotionHint")} />
          </CardContent>
        </Card>

        <Card id="privacy">
          <CardHeader>
            <CardTitle>{t("settings.privacy")}</CardTitle>
            <CardDescription>{t("settings.privacyBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Toggle name="shareAnonymousAnalytics" defaultChecked={pref.shareAnonymousAnalytics} label={t("settings.shareAnalytics")} hint={t("settings.shareAnalyticsHint")} />
          </CardContent>
        </Card>

        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          {t("common.save")}
        </Button>
      </form>

      <Card id="data">
        <CardHeader>
          <CardTitle>{t("settings.data")}</CardTitle>
          <CardDescription>{t("settings.dataExportBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Button asChild variant="outline">
            <a href="/api/me/export">
              <Download aria-hidden="true" />
              {t("settings.dataExport")}
            </a>
          </Button>
          <form action={onReset} className="rounded-lg border border-destructive/40 p-4">
            <div className="mb-4 flex items-start gap-3">
              <RotateCcw className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
              <div>
                <p className="font-medium">{t("settings.resetProgress")}</p>
                <p className="text-sm text-muted-foreground">{t("settings.resetProgressBody")}</p>
              </div>
            </div>
            <Field id="reset-confirmation" label={t("settings.resetConfirmLabel")}>
              <Input name="confirmation" placeholder={t("settings.resetConfirmWord")} />
            </Field>
            <Button type="submit" variant="destructive" className="mt-4" disabled={pending}>
              {t("settings.resetProgress")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3">
      <Checkbox name={name} defaultChecked={defaultChecked} className="mt-1" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}
