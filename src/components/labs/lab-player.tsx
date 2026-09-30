"use client";

import * as React from "react";
import { CheckCircle2, ExternalLink, RotateCcw, Terminal, Lightbulb, Eye, Play, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import type { MessageKey, TFunction } from "@/i18n/translator";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox, Field, Input, Radio, Select, Textarea } from "@/components/ui/form";
import { Progress, Separator, Kbd } from "@/components/ui/misc";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/radix";
import { applyLabEventAction, checkLabAction, resetLabAction, revealSolutionAction, useHintAction as requestLabHintAction } from "@/app/(app)/labs/actions";
import type { LabPlayerData } from "@/modules/labs/service";
import type { UiSimConfig, UiSimComponent, UiSimField } from "@/modules/labs/engine/ui-simulation";
import type { SandboxConfig } from "@/modules/labs/engine/command-sandbox";
import type { ArchitectureConfig } from "@/modules/labs/engine/architecture";
import type { PublicDecisionConfig, StageFeedback } from "@/modules/labs/engine/decision";

type ActionState = LabPlayerData["run"];
type LabContent = LabPlayerData["lab"];
type ActionResult<T> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };
type TerminalLine = { id: string; command?: string; output: string; isError?: boolean; explanation?: string };
type Values = Record<string, string | boolean | string[]>;

function readPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = Array.isArray(cur) ? cur[Number(part)] : typeof cur === "object" ? (cur as Record<string, unknown>)[part] : undefined;
  }
  return cur;
}

function actionError(result: ActionResult<unknown>, t: TFunction): string {
  if (result.ok) return "";
  const fieldCode = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined;
  return errorText(t, fieldCode ?? result.error);
}

export function LabPlayer({ initialData }: { initialData: LabPlayerData }) {
  const { t } = useI18n();
  const [data, setData] = React.useState(initialData);
  const [pending, startTransition] = React.useTransition();
  const [hint, setHint] = React.useState<string | null>(null);
  const completedSteps = data.run.stepStatus.filter((s) => s.passed).length;
  const firstOpenStep = data.lab.steps.find((s) => !data.run.stepStatus.find((status) => status.key === s.key)?.passed);

  const applyResult = React.useCallback(
    (work: () => Promise<ActionResult<LabPlayerData>>) =>
      new Promise<LabPlayerData | null>((resolve) => {
        startTransition(async () => {
          const result = await work();
          if (result.ok && result.data) {
            setData(result.data);
            if (result.data.run.completed) toast.success(t("labs.completed"));
            resolve(result.data);
          } else {
            toast.error(actionError(result, t));
            resolve(null);
          }
        });
      }),
    [t],
  );

  const sendEvent = React.useCallback((event: unknown) => applyResult(() => applyLabEventAction({ attemptId: data.run.attemptId, event })), [applyResult, data.run.attemptId]);
  const check = React.useCallback(() => applyResult(() => checkLabAction({ attemptId: data.run.attemptId })), [applyResult, data.run.attemptId]);

  const requestHint = React.useCallback(
    (stepKey: string) => {
      startTransition(async () => {
        const result = await requestLabHintAction({ attemptId: data.run.attemptId, stepKey });
        if (result.ok && result.data) {
          setData(result.data);
          setHint(result.data.hint);
        } else toast.error(actionError(result, t));
      });
    },
    [data.run.attemptId, t],
  );

  const reset = React.useCallback(() => {
    if (!window.confirm(t("labs.resetConfirm"))) return;
    applyResult(() => resetLabAction({ attemptId: data.run.attemptId }));
    setHint(null);
  }, [applyResult, data.run.attemptId, t]);

  const reveal = React.useCallback(() => applyResult(() => revealSolutionAction({ attemptId: data.run.attemptId })), [applyResult, data.run.attemptId]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        {data.lab.type === "UI_SIMULATION" ? <UiSimulationPlayer lab={data.lab} run={data.run} pending={pending} onEvent={sendEvent} /> : null}
        {data.lab.type === "COMMAND_SANDBOX" ? <CommandSandboxPlayer lab={data.lab} run={data.run} pending={pending} onEvent={sendEvent} /> : null}
        {data.lab.type === "ARCHITECTURE" ? <ArchitecturePlayer lab={data.lab} run={data.run} pending={pending} onEvent={sendEvent} onCheck={check} /> : null}
        {data.lab.type === "TROUBLESHOOTING" || data.lab.type === "BUSINESS_SCENARIO" ? <DecisionPlayer lab={data.lab} run={data.run} pending={pending} onEvent={sendEvent} /> : null}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t(data.lab.mode === "CHALLENGE" ? "labs.goals" : "labs.steps")}</CardTitle>
            <CardDescription>
              {t("common.of", { current: completedSteps, total: data.lab.steps.length })} · {t("labs.hintsUsed", { count: data.run.hintsUsed })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={completedSteps} max={Math.max(1, data.lab.steps.length)} label={t("labs.steps")} />
            <ol className="space-y-3">
              {data.lab.steps.map((step, index) => {
                const status = data.run.stepStatus.find((s) => s.key === step.key);
                const passed = status?.passed === true;
                const showInstruction = data.lab.mode !== "CHALLENGE";
                return (
                  <li key={step.key} className={cn("rounded-lg border p-3", passed ? "border-success/40 bg-success/5" : "bg-card")}>
                    <div className="flex items-start gap-2">
                      {passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]">{index + 1}</span>}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{step.title}</p>
                        {showInstruction ? <Markdown className="mt-1 text-sm text-muted-foreground">{step.instruction}</Markdown> : null}
                        {passed && step.explanation ? <Markdown className="mt-2 text-xs text-muted-foreground">{step.explanation}</Markdown> : null}
                        {status?.outcomes.some((o) => !o.passed && o.feedback) ? (
                          <ul className="mt-2 space-y-1 text-xs text-destructive">
                            {status.outcomes
                              .filter((o) => !o.passed && o.feedback)
                              .map((o, outcomeIndex) => (
                                <li key={outcomeIndex}>{o.feedback}</li>
                              ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                    {!passed && firstOpenStep?.key === step.key && step.hintAvailable ? (
                      <Button className="mt-3" size="sm" variant="outline" onClick={() => requestHint(step.key)} disabled={pending}>
                        <Lightbulb aria-hidden="true" />
                        {t("labs.hint")}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {hint ? (
              <Alert variant="info" title={t("labs.hintTitle")} role="status">
                <Markdown>{hint}</Markdown>
              </Alert>
            ) : null}
            <Button className="w-full" onClick={check} disabled={pending || data.run.completed}>
              <Play aria-hidden="true" />
              {pending ? t("labs.checking") : t("labs.checkWork")}
            </Button>
          </CardContent>
        </Card>

        {data.run.completed ? (
          <Card className="border-success/40">
            <CardHeader>
              <CardTitle>{t("labs.completed")}</CardTitle>
              <CardDescription>{data.run.xpEarned > 0 ? t("labs.completedXp", { xp: data.run.xpEarned }) : t("labs.assistedCompletion")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{t("labs.completedBody")}</p>
              <p className="font-medium">{t("labs.score", { score: data.run.score ?? 0 })}</p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t("labs.actions")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={pending || data.run.solutionViewed}>
                  <Eye aria-hidden="true" />
                  {t("labs.showSolution")}
                </Button>
              </DialogTrigger>
              <DialogContent closeLabel={t("common.close")}>
                <DialogTitle>{t("labs.showSolution")}</DialogTitle>
                <DialogDescription>{t("labs.solutionWarning")}</DialogDescription>
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="outline">{t("common.cancel")}</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="destructive" onClick={reveal}>
                      {t("common.confirm")}
                    </Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={reset} disabled={pending}>
              <RotateCcw aria-hidden="true" />
              {t("labs.reset")}
            </Button>
          </CardContent>
        </Card>

        {data.lab.solution ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("labs.solution")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Markdown>{data.lab.solution}</Markdown>
            </CardContent>
          </Card>
        ) : null}

        {data.lab.sources.length ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("labs.sources")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {data.lab.sources.map((source) => (
                  <li key={source.url}>
                    <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">{t("common.opensInNewTab")}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}

function UiSimulationPlayer({ lab, run, pending, onEvent }: { lab: LabContent; run: ActionState; pending: boolean; onEvent: (event: unknown) => void }) {
  const { t } = useI18n();
  const config = lab.config as UiSimConfig;
  const state = run.publicState as Record<string, unknown> & { __meta?: { page?: string; message?: { tone: "success" | "error"; text: string } | null } };
  const page = config.pages.find((p) => p.id === (state.__meta?.page ?? config.startPage)) ?? config.pages[0]!;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{config.portal.name}</CardTitle>
            <CardDescription>{t("labs.uiSimNotice")}</CardDescription>
          </div>
          <Badge variant="info">{t("labs.sim.portalLabel")}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="info">{t("labs.uiSimNotice")}</Alert>
        <nav aria-label={t("labs.sim.navigation")} className="flex flex-wrap gap-2">
          {config.navigation.map((item) => (
            <Button key={item.page} size="sm" variant={page.id === item.page ? "secondary" : "outline"} onClick={() => onEvent({ type: "navigate", page: item.page })} disabled={pending}>
              {item.label}
            </Button>
          ))}
        </nav>
        <Separator />
        <section aria-labelledby="sim-page-title" className="space-y-4">
          <h2 id="sim-page-title" className="text-xl font-semibold">
            {page.title}
          </h2>
          {page.breadcrumb?.length ? <p className="text-sm text-muted-foreground">{page.breadcrumb.join(" / ")}</p> : null}
          <div aria-live="polite">
            {state.__meta?.message ? <Alert variant={state.__meta.message.tone === "success" ? "success" : "destructive"}>{state.__meta.message.text}</Alert> : null}
          </div>
          {page.components.map((component, index) => (
            <UiComponent key={"id" in component && component.id ? component.id : index} component={component} state={state} pending={pending} onEvent={onEvent} />
          ))}
        </section>
      </CardContent>
    </Card>
  );
}

function UiComponent({ component, state, pending, onEvent }: { component: UiSimComponent; state: Record<string, unknown>; pending: boolean; onEvent: (event: unknown) => void }) {
  const { t } = useI18n();
  if (component.kind === "text") return <Markdown>{component.text}</Markdown>;
  if (component.kind === "callout") return <Alert variant={component.variant}>{component.text}</Alert>;
  if (component.kind === "button") {
    return (
      <Button variant={component.variant === "danger" ? "destructive" : component.variant === "secondary" ? "secondary" : "default"} onClick={() => onEvent({ type: "click", componentId: component.id })} disabled={pending}>
        {component.label}
      </Button>
    );
  }
  if (component.kind === "links") {
    return (
      <div className="rounded-lg border p-4">
        {component.title ? <h3 className="font-medium">{component.title}</h3> : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {component.items.map((item) => (
            <button key={item.id} type="button" className="rounded-lg border p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onEvent({ type: "navigate", page: item.page })} disabled={pending}>
              <span className="font-medium">{item.label}</span>
              {item.description ? <span className="block text-sm text-muted-foreground">{item.description}</span> : null}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (component.kind === "table") {
    const rows = readPath(state, component.source);
    const list = Array.isArray(rows) ? rows : [];
    return (
      <div className="overflow-x-auto rounded-lg border">
        {component.title ? <h3 className="p-3 font-medium">{component.title}</h3> : null}
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60">
            <tr>{component.columns.map((c) => <th key={c.key} className="px-3 py-2 font-medium">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {list.length ? (
              list.map((row, index) => {
                const record = row as Record<string, unknown>;
                const rowPage = component.rowKey && component.rowLinks ? component.rowLinks[String(record[component.rowKey])] : undefined;
                return (
                  <tr key={index} className="border-t">
                    {component.columns.map((c, cellIndex) => (
                      <td key={c.key} className="px-3 py-2">
                        {rowPage && cellIndex === 0 ? (
                          <button className="font-medium text-primary underline-offset-4 hover:underline" type="button" onClick={() => onEvent({ type: "navigate", page: rowPage })}>
                            {String(record[c.key] ?? "")}
                          </button>
                        ) : (
                          String(record[c.key] ?? "")
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr><td className="px-3 py-4 text-muted-foreground" colSpan={component.columns.length}>{component.emptyText ?? t("labs.sim.noRows")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }
  if (component.kind === "settings") {
    return (
      <div className="space-y-4 rounded-lg border p-4">
        {component.title ? <h3 className="font-medium">{component.title}</h3> : null}
        {component.description ? <p className="text-sm text-muted-foreground">{component.description}</p> : null}
        {component.fields.map((field) => (
          <UiField key={field.id} field={field} value={readPath(state, field.bindTo)} onChange={(value) => onEvent({ type: "setField", componentId: component.id, fieldId: field.id, value })} disabled={pending} idPrefix={component.id} />
        ))}
      </div>
    );
  }
  if (component.kind === "form") return <UiForm component={component} pending={pending} onEvent={onEvent} />;
  return null;
}

function UiField({ field, value, onChange, disabled, idPrefix }: { field: UiSimField; value: unknown; onChange: (value: string | boolean | string[]) => void; disabled: boolean; idPrefix: string }) {
  const id = `${idPrefix}-${field.id}`;
  if (field.control === "toggle") {
    return (
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={value === true} onChange={(e) => onChange(e.currentTarget.checked)} disabled={disabled} />
        {field.label}
      </label>
    );
  }
  if (field.control === "select") {
    return (
      <Field id={id} label={field.label} hint={field.help} required={field.required}>
        <Select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.currentTarget.value)} disabled={disabled}>
          <option value="" />
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
    );
  }
  if (field.control === "radio") {
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{field.label}</legend>
        {field.options?.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <Radio checked={value === o.value} onChange={() => onChange(o.value)} disabled={disabled} />
            {o.label}
          </label>
        ))}
      </fieldset>
    );
  }
  if (field.control === "checkboxes") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{field.label}</legend>
        {field.options?.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(o.value)}
              onChange={(e) => onChange(e.currentTarget.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
              disabled={disabled}
            />
            {o.label}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <Field id={id} label={field.label} hint={field.help} required={field.required}>
      <Input value={typeof value === "string" ? value : ""} placeholder={field.placeholder} onChange={(e) => onChange(e.currentTarget.value)} disabled={disabled} />
    </Field>
  );
}

function UiForm({ component, pending, onEvent }: { component: Extract<UiSimComponent, { kind: "form" }>; pending: boolean; onEvent: (event: unknown) => void }) {
  const [values, setValues] = React.useState<Values>({});
  return (
    <form
      className="space-y-4 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onEvent({ type: "submitForm", componentId: component.id, values });
      }}
    >
      {component.title ? <h3 className="font-medium">{component.title}</h3> : null}
      {component.description ? <p className="text-sm text-muted-foreground">{component.description}</p> : null}
      {component.fields.map((field) => (
        <UiField key={field.id} idPrefix={component.id} field={field} value={values[field.id]} onChange={(value) => setValues((v) => ({ ...v, [field.id]: value }))} disabled={pending} />
      ))}
      <Button type="submit" disabled={pending}>{component.submit.label}</Button>
    </form>
  );
}

function CommandSandboxPlayer({ lab, run, pending, onEvent }: { lab: LabContent; run: ActionState; pending: boolean; onEvent: (event: unknown) => Promise<LabPlayerData | null> }) {
  const { t } = useI18n();
  const config = lab.config as SandboxConfig;
  const [command, setCommand] = React.useState("");
  const [history, setHistory] = React.useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);
  const [lines, setLines] = React.useState<TerminalLine[]>([{ id: "welcome", output: config.welcome ?? t("labs.terminal.welcome") }]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return;
    const lineId = crypto.randomUUID();
    const isClear = trimmed.toLowerCase() === "clear" || trimmed.toLowerCase() === "cls";
    if (isClear) setLines([]);
    else setLines((current) => [...current, { id: lineId, command: trimmed, output: "" }].slice(-200));
    setHistory((h) => [...h, trimmed].slice(-50));
    setHistoryIndex(null);
    setCommand("");
    const result = await onEvent({ type: "command", command: trimmed });
    const feedback = result?.run.feedback?.kind === "command" ? result.run.feedback : null;
    if (feedback?.clear) setLines([]);
    else if (feedback) {
      setLines((current) => current.map((line) => (line.id === lineId ? { ...line, output: feedback.output, isError: feedback.isError, explanation: feedback.explanation } : line)));
    }
  };
  const state = run.publicState as { resourceGroups?: unknown[]; storageAccounts?: unknown[] };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card className="bg-zinc-950 text-zinc-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Terminal aria-hidden="true" />{t("labs.terminal.label")}</CardTitle>
          <CardDescription className="text-zinc-300">{t("labs.sandboxNotice")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div role="log" aria-live="polite" className="max-h-[28rem] overflow-auto rounded-md border border-zinc-700 bg-black p-3 font-mono text-sm">
            {lines.map((line) => (
              <div key={line.id} className="mb-3">
                {line.command ? <div><span className="text-emerald-300">{config.prompt ?? "$"}</span> {line.command}</div> : null}
                {line.output ? <pre className={cn("whitespace-pre-wrap", line.isError ? "text-red-300" : "text-zinc-100")}>{line.output}</pre> : null}
                {line.explanation ? <p className="mt-1 text-xs text-zinc-300">{line.explanation}</p> : null}
              </div>
            ))}
          </div>
          <form onSubmit={submit} className="flex items-end gap-2">
            <Field id="lab-command" label={t("labs.terminal.inputLabel")} hint={<>{t("labs.terminal.historyHint")} <Kbd>↑</Kbd> <Kbd>↓</Kbd></>}>
              <Input
                className="font-mono text-foreground"
                value={command}
                placeholder={t("labs.terminal.placeholder")}
                onChange={(e) => setCommand(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
                    if (history[next]) {
                      setHistoryIndex(next);
                      setCommand(history[next]);
                    }
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const next = historyIndex === null ? history.length : Math.min(history.length, historyIndex + 1);
                    setHistoryIndex(next === history.length ? null : next);
                    setCommand(next === history.length ? "" : (history[next] ?? ""));
                  }
                }}
                disabled={pending}
              />
            </Field>
            <Button type="submit" disabled={pending}>{t("labs.terminal.run")}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("labs.resourceState")}</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ResourceList title={t("labs.resourceGroups")} items={state.resourceGroups} />
          <ResourceList title={t("labs.storageAccounts")} items={state.storageAccounts} />
        </CardContent>
      </Card>
    </div>
  );
}

function ResourceList({ title, items }: { title: string; items: unknown[] | undefined }) {
  const list = Array.isArray(items) ? items : [];
  return (
    <section>
      <h3 className="font-medium">{title}</h3>
      {list.length ? (
        <ul className="mt-2 space-y-2">
          {list.map((item, index) => {
            const record = item as Record<string, unknown>;
            return <li key={index} className="rounded-md border p-2"><span className="font-mono">{String(record.name ?? "")}</span><span className="block text-xs text-muted-foreground">{String(record.location ?? record.resourceGroup ?? "")}</span></li>;
          })}
        </ul>
      ) : <p className="mt-1 text-muted-foreground">-</p>}
    </section>
  );
}

function ArchitecturePlayer({ lab, run, pending, onEvent, onCheck }: { lab: LabContent; run: ActionState; pending: boolean; onEvent: (event: unknown) => void; onCheck: () => void }) {
  const { t } = useI18n();
  const config = lab.config as ArchitectureConfig;
  const state = run.publicState as { placements?: Record<string, string>; connections?: [string, string][] };
  const placements = state.placements ?? {};
  const [selectedItem, setSelectedItem] = React.useState(config.palette[0]?.id ?? "");
  const [selectedZone, setSelectedZone] = React.useState(config.zones[0]?.id ?? "");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const placed = config.palette.filter((p) => placements[p.id]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("labs.architecture.zones")}</CardTitle>
        <CardDescription>{t("labs.architecture.paletteHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <section aria-labelledby="palette-title" className="space-y-3">
            <h2 id="palette-title" className="font-medium">{t("labs.architecture.palette")}</h2>
            <div className="space-y-2">
              {config.palette.map((item) => (
                <button key={item.id} type="button" className={cn("w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedItem === item.id && "border-primary bg-primary/5")} onClick={() => setSelectedItem(item.id)}>
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.category}</span>
                  <span className="block text-xs">{item.description}</span>
                </button>
              ))}
            </div>
            <Field id="arch-zone" label={t("labs.architecture.placeIn")}>
              <Select value={selectedZone} onChange={(e) => setSelectedZone(e.currentTarget.value)}>
                {config.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
              </Select>
            </Field>
            <Button onClick={() => onEvent({ type: "place", item: selectedItem, zone: selectedZone })} disabled={pending || !selectedItem}>{t("common.add")}</Button>
          </section>
          <section className="grid gap-3 md:grid-cols-2" aria-label={t("labs.architecture.zones")}>
            {config.zones.map((zone) => (
              <div key={zone.id} className="min-h-40 rounded-lg border border-dashed p-3">
                <h3 className="font-medium">{zone.label}</h3>
                {zone.description ? <p className="text-xs text-muted-foreground">{zone.description}</p> : null}
                <ul className="mt-3 space-y-2">
                  {config.palette.filter((p) => placements[p.id] === zone.id).map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-muted p-2 text-sm">
                      <span>{item.label}</span>
                      <Button size="sm" variant="ghost" onClick={() => onEvent({ type: "remove", item: item.id })}>{t("labs.architecture.remove")}</Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
        {config.allowConnections ? (
          <section className="space-y-3 rounded-lg border p-4">
            <h2 className="font-medium">{t("labs.architecture.connections")}</h2>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Select aria-label={t("labs.architecture.connectFrom")} value={from} onChange={(e) => setFrom(e.currentTarget.value)}>
                <option value="" />
                {placed.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
              <Select aria-label={t("labs.architecture.connectTo")} value={to} onChange={(e) => setTo(e.currentTarget.value)}>
                <option value="" />
                {placed.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
              <Button onClick={() => onEvent({ type: "connect", from, to })} disabled={pending || !from || !to}>{t("labs.architecture.addConnection")}</Button>
            </div>
            {state.connections?.length ? (
              <ul className="space-y-1 text-sm">
                {state.connections.map(([a, b]) => (
                  <li key={`${a}-${b}`} className="flex items-center justify-between rounded-md border p-2">
                    <span>{labelFor(config, a)} -&gt; {labelFor(config, b)}</span>
                    <Button size="sm" variant="ghost" onClick={() => onEvent({ type: "disconnect", from: a, to: b })}>{t("labs.architecture.removeConnection")}</Button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">{t("labs.architecture.noConnections")}</p>}
          </section>
        ) : null}
        <div aria-live="polite" className="space-y-2">
          {run.feedback?.kind === "architecture" && run.feedback.outcomes.length ? (
            run.feedback.outcomes.filter((outcome) => outcome.feedback).map((outcome, index) => (
              <Alert key={index} variant={outcome.passed ? "success" : "warning"} icon={outcome.passed}>
                {outcome.feedback}
              </Alert>
            ))
          ) : null}
        </div>
        <Button onClick={onCheck} disabled={pending}>{t("labs.architecture.validate")}</Button>
      </CardContent>
    </Card>
  );
}

function labelFor(config: ArchitectureConfig, id: string): string {
  return config.palette.find((p) => p.id === id)?.label ?? id;
}

function DecisionPlayer({ lab, run, pending, onEvent }: { lab: LabContent; run: ActionState; pending: boolean; onEvent: (event: unknown) => void }) {
  const { t } = useI18n();
  const config = lab.config as PublicDecisionConfig;
  const state = run.publicState as { stages?: Record<string, { answer: string | string[]; correct: boolean; attempts: number }> };
  const [answers, setAnswers] = React.useState<Record<string, string | string[]>>({});
  return (
    <Card>
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
                  <Textarea value={typeof current === "string" ? current : ""} placeholder={t("labs.decision.reasoningPlaceholder")} onChange={(e) => setAnswers((a) => ({ ...a, [stage.id]: e.currentTarget.value }))} disabled={pending} />
                </Field>
              ) : (
                <fieldset className="space-y-2">
                  <legend className="sr-only">{stage.prompt}</legend>
                  {stage.options?.map((option) => {
                    const selected = Array.isArray(current) ? current.includes(option.id) : current === option.id;
                    return (
                      <label key={option.id} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                        {stage.kind === "multiple" ? (
                          <Checkbox checked={selected} onChange={(e) => setAnswers((a) => ({ ...a, [stage.id]: e.currentTarget.checked ? [...(Array.isArray(current) ? current : []), option.id] : (Array.isArray(current) ? current : []).filter((v) => v !== option.id) }))} disabled={pending} />
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
          {feedback.options.filter((o) => o.selected || o.correct).map((o) => (
            <li key={o.id} className="flex gap-2">
              {o.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>{o.feedback}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {feedback.modelAnswer ? <div className="mt-2"><p className="font-medium">{t("labs.decision.modelAnswer")}</p><p>{feedback.modelAnswer}</p></div> : null}
    </Alert>
  );
}
