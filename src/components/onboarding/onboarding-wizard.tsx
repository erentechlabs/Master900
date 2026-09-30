"use client";

import * as React from "react";
import type { ExperienceLevel, LearningStyle } from "@prisma/client";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Field, Input, Radio, Select, Textarea } from "@/components/ui/form";
import { Progress } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";

type CertOption = { code: string; name: string; status: string; hasLearningPath: boolean };
type Initial = {
  certificationCodes: string[];
  careerGoal: string;
  experienceLevel: ExperienceLevel | "";
  targetExamDate: string;
  studyDays: number[];
  sessionMinutes: number;
  learningStyle: LearningStyle | "";
  locale: "en" | "tr";
  timezone: string;
  dailyGoalMinutes: number;
};

const steps = ["certifications", "goal", "schedule", "preferences"] as const;
const goals = ["student", "business", "it", "developer", "data-ai", "manager", "other"] as const;
const experienceLevels = ["NEW_TO_TECH", "SOME_EXPERIENCE", "EXPERIENCED"] as const;
const learningStyles = ["READING", "VISUAL", "GUIDED_PRACTICE", "QUIZZES"] as const;

export function OnboardingWizard({
  certifications,
  initial,
  action,
}: {
  certifications: CertOption[];
  initial: Initial;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [step, setStep] = React.useState(0);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const [timezone, setTimezone] = React.useState(() =>
    initial.timezone === "UTC" && typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : initial.timezone,
  );

  React.useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const titleKey =
    step === 0
      ? "learner.onboarding.certificationsTitle"
      : step === 1
        ? "learner.onboarding.goalTitle"
        : step === 2
          ? "learner.onboarding.scheduleStepTitle"
          : "learner.onboarding.preferencesStepTitle";

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="timezone" value={timezone} />
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">{t("learner.onboarding.step", { current: step + 1, total: steps.length })}</p>
        <Progress value={step + 1} max={steps.length} label={t("learner.onboarding.step", { current: step + 1, total: steps.length })} />
      </div>

      <Card>
        <CardContent className="space-y-5 p-5">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
            {t(titleKey)}
          </h2>

          <section hidden={step !== 0} className="space-y-3" aria-labelledby="onboarding-certs">
            <p id="onboarding-certs" className="text-sm text-muted-foreground">
              {t("learner.onboarding.certificationsHint")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {certifications.map((cert) => (
                <label key={cert.code} className="flex gap-3 rounded-lg border p-3">
                  <Checkbox name="certificationCodes" value={cert.code} defaultChecked={initial.certificationCodes.includes(cert.code)} />
                  <span>
                    <span className="block font-medium">
                      {cert.code} · {cert.name}
                    </span>
                    {!cert.hasLearningPath ? <span className="text-xs text-muted-foreground">{t("learner.onboarding.noLearningPath")}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section hidden={step !== 1} className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {goals.map((goal) => (
                <label key={goal} className="flex items-center gap-2 rounded-lg border p-3">
                  <Radio name="careerGoal" value={goal} defaultChecked={initial.careerGoal.startsWith(goal)} />
                  <span>{t(`learner.onboarding.goal${goal === "data-ai" ? "Data" : goal[0]!.toUpperCase() + goal.slice(1)}` as MessageKey)}</span>
                </label>
              ))}
            </div>
            <Field id="goalDetail" label={t("learner.onboarding.goalDetail")}>
              <Textarea name="goalDetail" defaultValue={initial.careerGoal.includes(": ") ? initial.careerGoal.split(": ").slice(1).join(": ") : ""} />
            </Field>
            <Field id="experienceLevel" label={t("learner.onboarding.experienceTitle")} required>
              <Select name="experienceLevel" defaultValue={initial.experienceLevel || "NEW_TO_TECH"}>
                {experienceLevels.map((level) => (
                  <option key={level} value={level}>
                    {t(`enums.experienceLevel.${level}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </section>

          <section hidden={step !== 2} className="space-y-4">
            <Field id="targetExamDate" label={t("learner.onboarding.examDateTitle")} hint={t("learner.onboarding.examDateHint")}>
              <Input name="targetExamDate" type="date" defaultValue={initial.targetExamDate} />
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("learner.onboarding.studyDaysTitle")}</legend>
              <div className="grid gap-2 sm:grid-cols-4">
                {Array.from({ length: 7 }, (_, day) => (
                  <label key={day} className="flex items-center gap-2 rounded-lg border p-3">
                    <Checkbox name="studyDays" value={day} defaultChecked={initial.studyDays.includes(day)} />
                    <span>{t(`learner.weekdays.d${day}` as MessageKey)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field id="sessionMinutes" label={t("learner.onboarding.sessionTitle")} required>
              <Input name="sessionMinutes" type="number" min={10} max={240} step={5} defaultValue={initial.sessionMinutes} />
            </Field>
            <Field id="dailyGoalMinutes" label={t("learner.dashboard.dailyGoal")} required>
              <Input name="dailyGoalMinutes" type="number" min={5} max={240} step={5} defaultValue={initial.dailyGoalMinutes} />
            </Field>
          </section>

          <section hidden={step !== 3} className="space-y-4">
            <Field id="learningStyle" label={t("learner.onboarding.styleTitle")} required>
              <Select name="learningStyle" defaultValue={initial.learningStyle || "READING"}>
                {learningStyles.map((style) => (
                  <option key={style} value={style}>
                    {t(`enums.learningStyle.${style}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="locale" label={t("learner.onboarding.languageTitle")} required>
              <Select name="locale" defaultValue={initial.locale}>
                <option value="en">{t("learner.onboarding.languageEnglish")}</option>
                <option value="tr">{t("learner.onboarding.languageTurkish")}</option>
              </Select>
            </Field>
            <Field id="timezoneText" label={t("learner.onboarding.timezoneTitle")} required>
              <Input id="timezoneText" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
            </Field>
          </section>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft aria-hidden="true" />
          {t("common.back")}
        </Button>
        {step < steps.length - 1 ? (
          <Button type="button" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>
            {t("common.next")}
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingLabel={t("learner.onboarding.saving")}>{t("learner.onboarding.finish")}</SubmitButton>
            <SubmitButton name="skipDiagnostic" value="1" variant="secondary" pendingLabel={t("learner.onboarding.saving")}>
              {t("learner.diagnostic.skip")}
            </SubmitButton>
          </div>
        )}
      </div>
      <noscript>
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">{t("learner.onboarding.diagnosticNextBody")}</div>
      </noscript>
    </form>
  );
}
