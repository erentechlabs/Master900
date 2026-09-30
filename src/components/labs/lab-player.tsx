"use client";

import * as React from "react";
import Link from "next/link";
import { AppWindow, CheckCircle2, ChevronLeft, ExternalLink, Eye, Lightbulb, Play, RotateCcw, SquareTerminal } from "lucide-react";
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
import { Progress } from "@/components/ui/misc";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/radix";
import { applyLabEventAction, checkLabAction, resetLabAction, revealSolutionAction, useHintAction as requestLabHintAction } from "@/app/(app)/labs/actions";
import type { LabPlayerData } from "@/modules/labs/service";
import type { UiSimEvent } from "@/modules/labs/engine/ui-simulation";
import { UiSimulationPlayer } from "./players/ui-simulation-player";
import { CommandSandboxPlayer } from "./players/command-sandbox-player";
import { ArchitecturePlayer } from "./players/architecture-player";
import { DecisionPlayer } from "./players/decision-player";
import { FullScreenToggle, VmShell, type VmApp } from "./vm/vm-shell";

type ActionResult<T> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

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
  const [fullScreen, setFullScreen] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(true);
  const fullRef = React.useRef<HTMLDivElement>(null);
  const completedSteps = data.run.stepStatus.filter((status) => status.passed).length;
  const firstOpenStep = data.lab.steps.find((step) => !data.run.stepStatus.find((status) => status.key === step.key)?.passed);
  const targetId = data.lab.mode !== "CHALLENGE" ? firstOpenStep?.targetId : null;

  React.useEffect(() => {
    if (!fullScreen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fullRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullScreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullScreen]);

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

  const [checked, setChecked] = React.useState(false);
  const sendEvent = React.useCallback((event: unknown) => applyResult(() => applyLabEventAction({ attemptId: data.run.attemptId, event })), [applyResult, data.run.attemptId]);
  const check = React.useCallback(() => {
    setChecked(true);
    return applyResult(() => checkLabAction({ attemptId: data.run.attemptId }));
  }, [applyResult, data.run.attemptId]);

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
    void applyResult(() => resetLabAction({ attemptId: data.run.attemptId }));
    setHint(null);
    setChecked(false);
  }, [applyResult, data.run.attemptId, t]);

  const reveal = React.useCallback(() => applyResult(() => revealSolutionAction({ attemptId: data.run.attemptId })), [applyResult, data.run.attemptId]);
  const height = fullScreen ? "full" : "page";
  const workspace = (
    <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]", !panelOpen && "lg:grid-cols-1 2xl:grid-cols-1")}>
      <div className="min-w-0">
        <LabVm data={data} pending={pending} targetId={targetId} height={height} onEvent={sendEvent} onCheck={check} />
      </div>
      {panelOpen ? <InstructionsPanel data={data} hint={hint} pending={pending} completedSteps={completedSteps} firstOpenStepKey={firstOpenStep?.key} height={height} showFeedback={checked} onHint={requestHint} onCheck={check} onReveal={reveal} onReset={reset} /> : null}
    </div>
  );

  return (
    <section className="space-y-4" aria-label={t("labs.vm.workspace")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/labs" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t("labs.backToLabs")}
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{data.lab.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link href={`/certifications/${data.lab.certification.code}`} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Badge variant="outline">{data.lab.certification.code}</Badge>
            </Link>
            <Badge variant="info">{t(`enums.labType.${data.lab.type}` as MessageKey)}</Badge>
            <Badge variant="secondary">{t(`enums.labComplexity.${data.lab.complexity}` as MessageKey)}</Badge>
            <Badge variant="secondary">{t("labs.estimated", { minutes: data.lab.estimatedMinutes })}</Badge>
            <Badge variant={data.lab.mode === "CHALLENGE" ? "warning" : "success"}>{data.lab.mode === "CHALLENGE" ? t("labs.challengeMode") : t("labs.guidedMode")}</Badge>
          </div>
        </div>
        {!fullScreen ? <FullScreenToggle expanded={false} panelOpen={panelOpen} onToggle={() => setFullScreen(true)} onPanelToggle={() => setPanelOpen((value) => !value)} /> : null}
      </div>
      <div
        ref={fullRef}
        tabIndex={fullScreen ? -1 : undefined}
        className={cn(fullScreen && "fixed inset-0 z-50 overflow-auto bg-background p-4 focus:outline-none")}
        role={fullScreen ? "dialog" : undefined}
        aria-modal={fullScreen || undefined}
        aria-label={fullScreen ? t("labs.vm.fullScreen") : undefined}
      >
        {fullScreen ? (
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="truncate font-semibold">{data.lab.title}</p>
            <FullScreenToggle expanded panelOpen={panelOpen} onToggle={() => setFullScreen(false)} onPanelToggle={() => setPanelOpen((value) => !value)} />
          </div>
        ) : null}
        {workspace}
      </div>
    </section>
  );
}

function LabVm({ data, pending, targetId, height, onEvent, onCheck }: { data: LabPlayerData; pending: boolean; targetId?: string | null; height: "page" | "full"; onEvent: (event: unknown) => Promise<LabPlayerData | null>; onCheck: () => void }) {
  const { t } = useI18n();
  const [activeApp, setActiveApp] = React.useState("main");
  if (data.lab.type === "UI_SIMULATION") {
    return <UiSimulationPlayer key={data.run.attemptId} lab={data.lab} run={data.run} targetId={targetId} height={height} onEvent={(event: UiSimEvent) => onEvent(event)} />;
  }
  const apps: VmApp[] = [
    {
      id: "main",
      title: data.lab.type === "COMMAND_SANDBOX" ? t("labs.vm.terminal") : data.lab.type === "ARCHITECTURE" ? t("labs.vm.architectureDesigner") : t("labs.vm.serviceDesk"),
      icon: data.lab.type === "COMMAND_SANDBOX" ? <SquareTerminal className="h-4 w-4" aria-hidden="true" /> : <AppWindow className="h-4 w-4" aria-hidden="true" />,
      content:
        data.lab.type === "COMMAND_SANDBOX" ? (
          <CommandSandboxPlayer lab={data.lab} run={data.run} pending={pending} onEvent={onEvent} />
        ) : data.lab.type === "ARCHITECTURE" ? (
          <ArchitecturePlayer lab={data.lab} run={data.run} pending={pending} onEvent={onEvent} onCheck={onCheck} />
        ) : (
          <DecisionPlayer lab={data.lab} run={data.run} pending={pending} onEvent={onEvent} />
        ),
    },
  ];
  return <VmShell vmName="LAB-VM01" apps={apps} activeAppId={activeApp} height={height} onActiveAppChange={setActiveApp} />;
}

function InstructionsPanel({
  data,
  hint,
  pending,
  completedSteps,
  firstOpenStepKey,
  height,
  showFeedback,
  onHint,
  onCheck,
  onReveal,
  onReset,
}: {
  data: LabPlayerData;
  hint: string | null;
  pending: boolean;
  completedSteps: number;
  firstOpenStepKey?: string;
  height: "page" | "full";
  /** Rule feedback appears once the learner has used "Check my work". */
  showFeedback: boolean;
  onHint: (stepKey: string) => void;
  onCheck: () => void;
  onReveal: () => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  return (
    <aside className={cn("min-w-0 space-y-4 rounded-xl border bg-card p-3 lg:overflow-auto", height === "full" ? "lg:h-[calc(100vh-5.5rem)]" : "lg:h-[clamp(560px,calc(100vh-12rem),1100px)]")} aria-label={t("labs.vm.instructions")}>
      <CompletionCard data={data} completedSteps={completedSteps} />
      <Tabs defaultValue="tasks">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tasks">{t("labs.vm.tasks")}</TabsTrigger>
          <TabsTrigger value="overview">{t("labs.vm.overview")}</TabsTrigger>
          <TabsTrigger value="resources">{t("labs.vm.resources")}</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks" className="space-y-4">
          <Progress value={completedSteps} max={Math.max(1, data.lab.steps.length)} label={t("labs.steps")} />
          <ol className="space-y-3">
            {data.lab.steps.map((step, index) => {
              const status = data.run.stepStatus.find((s) => s.key === step.key);
              const passed = status?.passed === true;
              return (
                <li key={step.key} className={cn("rounded-lg border p-3", passed ? "border-success/40 bg-success/5" : firstOpenStepKey === step.key ? "border-warning/60" : "bg-background")}>
                  <div className="flex items-start gap-2">
                    {passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]">{index + 1}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{step.title}</p>
                      {data.lab.mode !== "CHALLENGE" ? <Markdown className="mt-1 text-sm text-muted-foreground">{step.instruction}</Markdown> : null}
                      {passed && step.explanation ? <Markdown className="mt-2 text-xs text-muted-foreground">{step.explanation}</Markdown> : null}
                      {showFeedback && status?.outcomes.some((o) => !o.passed && o.feedback) ? <ul className="mt-2 space-y-1 text-xs text-destructive">{status.outcomes.filter((o) => !o.passed && o.feedback).map((o, outcomeIndex) => <li key={outcomeIndex}>{o.feedback}</li>)}</ul> : null}
                    </div>
                  </div>
                  {!passed && firstOpenStepKey === step.key && step.hintAvailable ? <Button className="mt-3" size="sm" variant="outline" onClick={() => onHint(step.key)} disabled={pending}><Lightbulb aria-hidden="true" />{t("labs.hint")}</Button> : null}
                </li>
              );
            })}
          </ol>
          {hint ? <Alert variant="info" title={t("labs.hintTitle")} role="status"><Markdown>{hint}</Markdown></Alert> : null}
          <Button className="w-full" onClick={onCheck} disabled={pending || data.run.completed}><Play aria-hidden="true" />{pending ? t("labs.checking") : t("labs.checkWork")}</Button>
        </TabsContent>
        <TabsContent value="overview" className="space-y-4">
          <p className="text-sm text-muted-foreground">{data.lab.summary}</p>
          <PanelSection title={t("labs.scenario")}><Markdown>{data.lab.scenario}</Markdown></PanelSection>
          <PanelSection title={t("labs.objectives")}><ul className="list-disc space-y-1 pl-5 text-sm">{data.lab.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></PanelSection>
          <PanelSection title={t("labs.prerequisites")}>{data.lab.prerequisites.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{data.lab.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t("labs.noPrerequisites")}</p>}</PanelSection>
          <Alert variant="info" title={t("labs.safetyTitle")}>{t("labs.safetyNotice")}</Alert>
        </TabsContent>
        <TabsContent value="resources" className="space-y-4">
          <PanelSection title={t("labs.sources")}>{data.lab.sources.length ? <ul className="space-y-2 text-sm">{data.lab.sources.map((source) => <li key={source.url}><a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">{t("common.opensInNewTab")}</span></a></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("labs.vm.noResources")}</p>}</PanelSection>
          <div className="flex flex-col gap-2">
            <Dialog>
              <DialogTrigger asChild><Button variant="outline" disabled={pending || data.run.solutionViewed}><Eye aria-hidden="true" />{t("labs.showSolution")}</Button></DialogTrigger>
              <DialogContent closeLabel={t("common.close")}>
                <DialogTitle>{t("labs.showSolution")}</DialogTitle>
                <DialogDescription>{t("labs.solutionWarning")}</DialogDescription>
                <div className="flex justify-end gap-2">
                  <DialogClose asChild><Button variant="outline">{t("common.cancel")}</Button></DialogClose>
                  <DialogClose asChild><Button variant="destructive" onClick={onReveal}>{t("common.confirm")}</Button></DialogClose>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={onReset} disabled={pending}><RotateCcw aria-hidden="true" />{t("labs.reset")}</Button>
          </div>
          {data.lab.solution ? <PanelSection title={t("labs.solution")}><Markdown>{data.lab.solution}</Markdown></PanelSection> : null}
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function CompletionCard({ data, completedSteps }: { data: LabPlayerData; completedSteps: number }) {
  const { t } = useI18n();
  return (
    <Card className={cn(data.run.completed && "border-success/40")}>
      <CardHeader className="pb-2">
        <CardTitle>{data.run.completed ? t("labs.completed") : t("labs.vm.progress")}</CardTitle>
        <CardDescription>{t("common.of", { current: completedSteps, total: data.lab.steps.length })} · {t("labs.hintsUsed", { count: data.run.hintsUsed })}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-muted p-2"><span className="block text-xs text-muted-foreground">{t("labs.vm.score")}</span><span className="text-lg font-semibold">{data.run.score ?? 0}%</span></div>
        <div className="rounded-lg bg-muted p-2"><span className="block text-xs text-muted-foreground">{t("labs.vm.xp")}</span><span className="text-lg font-semibold">{data.run.xpEarned}</span></div>
      </CardContent>
    </Card>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border bg-background p-3"><h3 className="mb-2 font-medium">{title}</h3>{children}</section>;
}
