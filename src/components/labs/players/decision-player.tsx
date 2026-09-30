"use client";

import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translator";
import type { LabPlayerData } from "@/modules/labs/service";
import type { PublicDecisionConfig, StageFeedback } from "@/modules/labs/engine/decision";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Radio, Textarea } from "@/components/ui/form";

export function DecisionPlayer({ lab, run, pending, onEvent }: { lab: LabPlayerData["lab"]; run: LabPlayerData["run"]; pending: boolean; onEvent: (event: unknown) => void }) {
  const { t } = useI18n();
  const config = lab.config as PublicDecisionConfig;
  const state = run.publicState as { stages?: Record<string, { answer: string | string[]; correct: boolean; attempts: number }> };
  const [answers, setAnswers] = React.useState<Record<string, string | string[]>>({});
  return (
    <Card className="m-4">
      <CardHeader>
        <CardTitle>{lab.type === "TROUBLESHOOTING" ? t("enums.labType.TROUBLESHOOTING" as MessageKey) : t("enums.labType.BUSINESS_SCENARIO" as MessageKey)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <DecisionContext config={config} />
        {config.stages.map((stage, index) => {
          const stored = state.stages?.[stage.id];
          const current = answers[stage.id] ?? stored?.answer ?? (stage.kind === "multiple" ? [] : "");
          return (
            <section key={stage.id} className="space-y-3 rounded-lg border p-4" aria-labelledby={`stage-${stage.id}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 id={`stage-${stage.id}`} className="font-medium">{stage.prompt}</h2>
                <Badge variant={stored?.correct ? "success" : "outline"}>{t("labs.decision.stage", { n: index + 1, total: config.stages.length })}</Badge>
              </div>
              {stage.kind === "text" ? (
                <Field id={`decision-${stage.id}`} label={t("labs.decision.reasoningLabel")}>
                  <Textarea value={typeof current === "string" ? current : ""} placeholder={t("labs.decision.reasoningPlaceholder")} onChange={(event) => setAnswers((a) => ({ ...a, [stage.id]: event.currentTarget.value }))} disabled={pending} />
                </Field>
              ) : (
                <fieldset className="space-y-2">
                  <legend className="sr-only">{stage.prompt}</legend>
                  {stage.options?.map((option) => {
                    const selected = Array.isArray(current) ? current.includes(option.id) : current === option.id;
                    return (
                      <label key={option.id} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                        {stage.kind === "multiple" ? (
                          <Checkbox checked={selected} onChange={(event) => setAnswers((a) => ({ ...a, [stage.id]: event.currentTarget.checked ? [...(Array.isArray(current) ? current : []), option.id] : (Array.isArray(current) ? current : []).filter((v) => v !== option.id) }))} disabled={pending} />
                        ) : (
                          <Radio checked={selected} onChange={() => setAnswers((a) => ({ ...a, [stage.id]: option.id }))} disabled={pending} />
                        )}
                        <span>{option.text}</span>
                      </label>
                    );
                  })}
                </fieldset>
              )}
              <Button disabled={pending} onClick={() => onEvent({ stageId: stage.id, answer: answers[stage.id] ?? current })}>{t("labs.decision.submitStage")}</Button>
              {run.feedback?.kind === "decision" && run.feedback.feedback.stageId === stage.id ? <DecisionFeedback feedback={run.feedback.feedback} /> : null}
              {stored?.correct ? <Alert variant="success">{t("labs.decision.stageCorrect")}</Alert> : null}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DecisionContext({ config }: { config: PublicDecisionConfig }) {
  const { t } = useI18n();
  const context = config.context;
  return (
    <section className="grid gap-3 md:grid-cols-2">
      {context.environment ? <Alert title={t("labs.decision.context")}>{context.environment}</Alert> : null}
      {context.requirements?.length ? <ContextList title={t("labs.decision.requirements")} items={context.requirements} /> : null}
      {context.symptoms?.length ? <ContextList title={t("labs.decision.symptoms")} items={context.symptoms} /> : null}
      {context.constraints?.length ? <ContextList title={t("labs.decision.constraints")} items={context.constraints} /> : null}
      {context.settings?.length ? <ContextList title={t("labs.decision.settings")} items={context.settings.map((s) => `${s.name}: ${s.value}`)} /> : null}
      {context.logs ? <pre className="overflow-auto rounded-lg border bg-muted p-3 text-xs">{context.logs}</pre> : null}
    </section>
  );
}

function ContextList({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-lg border p-3"><h3 className="font-medium">{title}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

function DecisionFeedback({ feedback }: { feedback: StageFeedback }) {
  const { t } = useI18n();
  return (
    <Alert variant={feedback.correct ? "success" : "warning"} title={feedback.correct ? t("labs.decision.stageCorrect") : t("labs.decision.stageIncorrect")} role="status">
      {feedback.options?.length ? (
        <ul className="space-y-1">
          {feedback.options.filter((option) => option.selected || option.correct).map((option) => (
            <li key={option.id} className="flex gap-2">
              {option.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>{option.feedback}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {feedback.modelAnswer ? <div className="mt-2"><p className="font-medium">{t("labs.decision.modelAnswer")}</p><p>{feedback.modelAnswer}</p></div> : null}
    </Alert>
  );
}
