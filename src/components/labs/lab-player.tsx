"use client";

import * as React from "react";
import Link from "next/link";
import { AppWindow, CheckCircle2, ChevronLeft, Clock3, ExternalLink, Eye, Flag, Lightbulb, Play, RotateCcw, Sparkles, SquareTerminal, Star, Trophy } from "lucide-react";
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
import { Kbd, Progress } from "@/components/ui/misc";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/radix";
import { RingProgress } from "@/components/charts";
import { celebrate } from "@/components/ui/celebration";
import { applyLabEventAction, checkLabAction, resetLabAction, revealSolutionAction, useHintAction as requestLabHintAction } from "@/app/(app)/labs/actions";
import type { LabPlayerData } from "@/modules/labs/service";
import { labProductFromConfig, labProductLabel } from "@/modules/labs/products";
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
  const previousPassedRef = React.useRef<Set<string>>(new Set(initialData.run.stepStatus.filter((status) => status.passed).map((status) => status.key)));
  const wasCompletedRef = React.useRef(initialData.run.completed);
  const [completedOpen, setCompletedOpen] = React.useState(false);
  const [briefingOpen, setBriefingOpen] = React.useState(false);
  const [liveMessage, setLiveMessage] = React.useState("");
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

  React.useEffect(() => {
    const key = `lab-briefing:${initialData.run.attemptId}`;
    const firstAttemptEventCount = initialData.run.eventCount <= 1;
    if (!firstAttemptEventCount || window.localStorage.getItem(key) === "dismissed") return undefined;
    const id = window.setTimeout(() => setBriefingOpen(true), 0);
    return () => window.clearTimeout(id);
  }, [initialData.run.attemptId, initialData.run.eventCount]);

  React.useEffect(() => {
    const previous = previousPassedRef.current;
    const newlyPassed = data.run.stepStatus.filter((status) => status.passed && !previous.has(status.key));
    if (newlyPassed.length) {
      const first = newlyPassed[0]!;
      const title = data.lab.steps.find((step) => step.key === first.key)?.title ?? t("labs.stepDone");
      const message = t("labs.stepCompleteToast", { title });
      setLiveMessage(message);
      toast.success(message, { duration: 1800 });
    }
    previousPassedRef.current = new Set(data.run.stepStatus.filter((status) => status.passed).map((status) => status.key));
    if (data.run.completed && !wasCompletedRef.current) {
      setBriefingOpen(false);
      setCompletedOpen(true);
      setLiveMessage(t("labs.completion.announcement", { title: data.lab.title, stars: data.run.stars }));
      celebrate({ particleCount: 80, spread: 68, origin: { x: 0.5, y: 0.2 } });
    }
    wasCompletedRef.current = data.run.completed;
  }, [data, t]);

  const applyResult = React.useCallback(
    (work: () => Promise<ActionResult<LabPlayerData>>) =>
      new Promise<LabPlayerData | null>((resolve) => {
        startTransition(async () => {
          const result = await work();
          if (result.ok && result.data) {
            setData(result.data);
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

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter" || data.run.completed) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [data-lab-terminal], [data-sim-sql]")) return;
      event.preventDefault();
      void check();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [check, data.run.completed]);

  const dismissBriefing = React.useCallback(() => {
    window.localStorage.setItem(`lab-briefing:${data.run.attemptId}`, "dismissed");
    setBriefingOpen(false);
  }, [data.run.attemptId]);

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
      <div aria-live="polite" className="sr-only">{liveMessage}</div>
      <MissionBriefingDialog data={data} open={!data.run.completed && briefingOpen} onOpenChange={(open) => (open ? setBriefingOpen(true) : dismissBriefing())} onStart={dismissBriefing} />
      <CompletionDialog data={data} open={completedOpen} onOpenChange={setCompletedOpen} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/labs" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t("labs.backToLabs")}
          </Link>
          <h1 className="mt-1 font-display text-subtitle sm:text-[24px] sm:leading-8">{data.lab.title}</h1>
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
    <aside className={cn("min-w-0 space-y-4 rounded-lg border bg-card p-3 lg:overflow-auto", height === "full" ? "lg:h-[calc(100dvh-5.5rem)]" : "lg:h-[clamp(560px,calc(100dvh-13rem),1100px)]")} aria-label={t("labs.vm.instructions")}>
      <CompletionCard data={data} completedSteps={completedSteps} />
      <Tabs defaultValue="tasks">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tasks">{t("labs.vm.tasks")}</TabsTrigger>
          <TabsTrigger value="overview">{t("labs.vm.overview")}</TabsTrigger>
          <TabsTrigger value="resources">{t("labs.vm.resources")}</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks" className="space-y-4">
          <Progress value={completedSteps} max={Math.max(1, data.lab.steps.length)} label={t("labs.steps")} className="mt-1" />
          <ol className="space-y-3">
            {data.lab.steps.map((step, index) => {
              const status = data.run.stepStatus.find((s) => s.key === step.key);
              const passed = status?.passed === true;
              return (
                <li key={step.key} aria-current={!passed && firstOpenStepKey === step.key ? "step" : undefined} className={cn("relative rounded-md border p-3 transition-colors duration-200 ease-fluent", passed ? "border-transparent bg-tint-success" : firstOpenStepKey === step.key ? "border-control-stroke bg-layer before:absolute before:left-0 before:top-3 before:h-5 before:w-[3px] before:rounded-full before:bg-primary" : "border-transparent bg-layer")}>
                  <div className="flex items-start gap-2">
                    {passed ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 animate-pop text-success motion-reduce:animate-none" aria-hidden="true" /> : <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", firstOpenStepKey === step.key ? "border-primary bg-primary text-primary-foreground" : "border-control-stroke-strong text-muted-foreground")}>{index + 1}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{step.title}</p>
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
          <div className="sticky -bottom-3 -mx-3 -mb-3 border-t border-stroke-divider bg-card p-3">
            <Button className="w-full" onClick={onCheck} disabled={pending || data.run.completed}><Play aria-hidden="true" />{pending ? t("labs.checking") : t("labs.checkWork")}</Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">{t("labs.checkShortcut")} <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd></p>
          </div>
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
                <div className="-mx-6 -mb-6 mt-2 grid grid-cols-2 gap-2 rounded-b-lg border-t border-stroke-divider bg-background p-6">
                  <DialogClose asChild><Button onClick={onReveal}>{t("common.confirm")}</Button></DialogClose>
                  <DialogClose asChild><Button variant="outline">{t("common.cancel")}</Button></DialogClose>
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
  const progress = data.lab.steps.length ? (completedSteps / data.lab.steps.length) * 100 : 0;
  return (
    <Card className={cn(data.run.completed && "border-success/40")}>
      <CardHeader className="pb-2">
        <CardTitle>{data.run.completed ? t("labs.completed") : t("labs.vm.progress")}</CardTitle>
        <CardDescription>{t("common.of", { current: completedSteps, total: data.lab.steps.length })} · {t("labs.hintsUsed", { count: data.run.hintsUsed })} · {t("labs.elapsed", { time: formatElapsed(data.run.elapsedSeconds) })}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-[auto_1fr_1fr] gap-2 text-sm">
        <div className="row-span-2 grid place-items-center rounded-lg bg-muted p-2"><RingProgress value={progress} size={58} label={t("labs.vm.progress")} /></div>
        <div className="rounded-lg bg-muted p-2"><span className="block text-xs text-muted-foreground">{t("labs.vm.score")}</span><span className="text-lg font-semibold">{data.run.score ?? 0}%</span></div>
        <div className="rounded-lg bg-muted p-2"><span className="block text-xs text-muted-foreground">{t("labs.vm.xp")}</span><span className="text-lg font-semibold">{data.run.xpEarned}</span></div>
      </CardContent>
    </Card>
  );
}

function MissionBriefingDialog({ data, open, onOpenChange, onStart }: { data: LabPlayerData; open: boolean; onOpenChange: (open: boolean) => void; onStart: () => void }) {
  const { t } = useI18n();
  const product = productLabel(data.lab, t);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")} aria-describedby="mission-briefing-description">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Flag aria-hidden="true" /></div>
          <div>
            <DialogTitle>{t("labs.briefing.title")}</DialogTitle>
            <DialogDescription id="mission-briefing-description">{t("labs.briefing.subtitle", { product: product.label })}</DialogDescription>
          </div>
        </div>
        <PanelSection title={data.lab.title}><Markdown>{data.lab.scenario}</Markdown></PanelSection>
        <div className="grid gap-3 sm:grid-cols-3">
          <BriefingStat icon={<Clock3 aria-hidden="true" />} label={t("labs.briefing.time")} value={t("labs.estimated", { minutes: data.lab.estimatedMinutes })} />
          <BriefingStat icon={<Trophy aria-hidden="true" />} label={t("labs.complexity")} value={t(`enums.labComplexity.${data.lab.complexity}` as MessageKey)} />
          <BriefingStat icon={product.icon} label={t("labs.briefing.product")} value={product.label} />
        </div>
        <PanelSection title={t("labs.briefing.whatYouWillDo")}><ul className="list-disc space-y-1 pl-5 text-sm">{data.lab.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></PanelSection>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard active={data.lab.mode !== "CHALLENGE"} title={t("labs.guidedMode")} body={t("labs.guidedModeBody")} href={`/labs/${data.lab.id}?mode=GUIDED`} />
          <ModeCard active={data.lab.mode === "CHALLENGE"} title={t("labs.challengeMode")} body={t("labs.challengeModeBody")} href={`/labs/${data.lab.id}?mode=CHALLENGE`} />
        </div>
        <Button onClick={onStart} size="lg" className="justify-self-end"><Play aria-hidden="true" />{t("labs.briefing.start")}</Button>
      </DialogContent>
    </Dialog>
  );
}

function CompletionDialog({ data, open, onOpenChange }: { data: LabPlayerData; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const stars = [0, 1, 2] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")} className="max-w-2xl" aria-describedby="lab-completion-description">
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Sparkles aria-hidden="true" /></div>
          <DialogTitle>{t("labs.completion.title")}</DialogTitle>
          <DialogDescription id="lab-completion-description">{t("labs.completion.body", { title: data.lab.title })}</DialogDescription>
          <div className="mt-4 flex justify-center gap-2" aria-label={t("labs.completion.stars", { count: data.run.stars })}>
            {stars.map((star, index) => <Star key={star} className={cn("h-9 w-9 motion-safe:animate-pop", index < data.run.stars ? "fill-amber-400 text-amber-500" : "text-muted-foreground/40")} style={{ animationDelay: `${index * 120}ms` }} aria-hidden="true" />)}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <Metric label={t("labs.vm.score")} value={`${data.run.score ?? 0}%`} />
          <Metric label={t("labs.elapsedLabel")} value={formatElapsed(data.run.elapsedSeconds)} />
          <Metric label={t("labs.hints")} value={String(data.run.hintsUsed)} />
          <Metric label={t("labs.vm.xp")} value={String(data.run.xpEarned)} />
        </div>
        <PanelSection title={t("labs.completion.learned")}><ul className="space-y-2 text-sm">{data.lab.steps.map((step) => <li key={step.key}><span className="font-medium">{step.title}</span>{step.explanation ? <Markdown className="mt-1 text-muted-foreground">{step.explanation}</Markdown> : null}</li>)}</ul></PanelSection>
        <div className="flex flex-wrap justify-end gap-2">
          {data.nextLab ? <Button asChild><Link href={`/labs/${data.nextLab.id}`}>{t("labs.completion.nextLab")}</Link></Button> : null}
          {data.lab.mode !== "CHALLENGE" ? <Button asChild variant="outline"><Link href={`/labs/${data.lab.id}?mode=CHALLENGE`}>{t("labs.completion.replayChallenge")}</Link></Button> : null}
          <Button asChild variant="secondary"><Link href="/labs">{t("labs.backToLabs")}</Link></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BriefingStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-2 rounded-lg border bg-layer p-3 text-sm"><span className="text-primary [&_svg]:size-5">{icon}</span><span><span className="block text-xs text-muted-foreground">{label}</span><span className="font-medium">{value}</span></span></div>;
}

function ModeCard({ active, title, body, href }: { active: boolean; title: string; body: string; href: string }) {
  return <Link href={href} className={cn("rounded-lg border p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-primary bg-primary/5" : "bg-layer hover:bg-subtle-hover")}><span className="font-semibold">{title}</span><span className="mt-1 block text-muted-foreground">{body}</span></Link>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted p-3 text-center"><span className="block text-xs text-muted-foreground">{label}</span><span className="font-display text-title">{value}</span></div>;
}

function productLabel(lab: LabPlayerData["lab"], t: TFunction): { label: string; icon: React.ReactNode } {
  const info = labProductFromConfig(lab.type, lab.config);
  const icon = info.kind === "terminal" || info.hasTerminal ? <SquareTerminal aria-hidden="true" /> : <AppWindow aria-hidden="true" />;
  return { label: labProductLabel(info, t), icon };
}

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`;
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-md bg-layer p-3"><h3 className="mb-2 font-semibold">{title}</h3>{children}</section>;
}
