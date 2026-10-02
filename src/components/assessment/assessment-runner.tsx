"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock, Eye, EyeOff, Flag, Flame, ListChecks, LogOut, Repeat, ShieldAlert, XCircle } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import type { MessageKey } from "@/i18n/translator";
import { cn } from "@/lib/utils";
import type { AnswerOutcome, RunnerData, RunnerQuestion } from "@/modules/assessment/service";
import type { QuestionResponse, QuestionReview } from "@/modules/assessment/engine/types";
import { crossedSecondWarnings, crossedWarnings, hasContent, remainingTime } from "@/modules/assessment/engine/response";
import { answerAction, markAction, startSimilarAction, submitAction } from "@/app/(app)/practice/actions";
import { QuestionView, defaultResponse } from "@/components/assessment/question-view";
import { Markdown } from "@/components/markdown";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/form";
import { Kbd, Progress } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";

type Phase = "question" | "review";
const REASONING_MIN = 15;

function byId<T>(questions: RunnerQuestion[], pick: (q: RunnerQuestion) => T): Record<string, T> {
  return Object.fromEntries(questions.map((q) => [q.question.id, pick(q)]));
}

export function AssessmentRunner({ data }: { data: RunnerData }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const feedbackMode = data.immediateFeedback;
  const isLightning = data.mode === "LIGHTNING";

  const [questions, setQuestions] = React.useState<RunnerQuestion[]>(data.questions);
  const [index, setIndex] = React.useState(() => {
    const first = data.questions.findIndex((q) => !q.response);
    return first === -1 ? Math.max(0, data.questions.length - 1) : first;
  });
  const [drafts, setDrafts] = React.useState<Record<string, QuestionResponse | null>>(() => byId(data.questions, (q) => q.response ?? defaultResponse(q.question)));
  const [dirty, setDirty] = React.useState<Record<string, boolean>>({});
  const [saved, setSaved] = React.useState<Record<string, boolean>>(() => byId(data.questions, (q) => !!q.response));
  const [reviews, setReviews] = React.useState<Record<string, QuestionReview | null>>(() => byId(data.questions, (q) => q.review));
  const [marked, setMarked] = React.useState<Record<string, boolean>>(() => byId(data.questions, (q) => q.marked));
  const [confidence, setConfidence] = React.useState<Record<string, number | undefined>>({});
  const [reasoning, setReasoning] = React.useState<Record<string, string>>({});
  const [addedToReview, setAddedToReview] = React.useState<Record<string, boolean>>({});
  const [adaptiveDone, setAdaptiveDone] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("question");
  const [busy, setBusy] = React.useState<null | "answer" | "submit">(null);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("");
  const [urgent, setUrgent] = React.useState("");
  const [showTimer, setShowTimer] = React.useState(data.showTimer);
  const [remainingMs, setRemainingMs] = React.useState<number | null>(null);

  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const reviewHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const nextButtonRef = React.useRef<HTMLButtonElement>(null);
  const feedbackRef = React.useRef<HTMLDivElement>(null);
  const [feedbackPaused, setFeedbackPaused] = React.useState(false);
  const shownAt = React.useRef<number>(0);
  const spent = React.useRef<Record<string, number>>({});
  const submitting = React.useRef(false);

  const current = questions[index];
  const currentId = current?.question.id ?? "";
  const displayTotal = Math.max(data.total, questions.length);
  const answeredCount = questions.filter((q) => saved[q.question.id]).length;
  const unanswered = questions.filter((q) => !saved[q.question.id]);
  const unansweredCount = unanswered.length + Math.max(0, (data.adaptive && !adaptiveDone ? data.total : questions.length) - questions.length);
  const timed = !!data.expiresAt;

  React.useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  // ------------------------------------------------------------ timer
  const finishRef = React.useRef<(expired: boolean) => Promise<void>>(async () => undefined);
  React.useEffect(() => {
    const expiresAt = data.expiresAt;
    if (!expiresAt) return;
    const loadedAt = Date.now();
    let previous: number | null = null;
    let expiredHandled = false;
    const tick = () => {
      const remaining = remainingTime(expiresAt, data.serverNow, loadedAt, Date.now());
      setRemainingMs(remaining);
      if (data.mode === "LIGHTNING") {
        const crossed = crossedSecondWarnings(previous, remaining);
        if (crossed.length) setUrgent(t("assessment.runner.timeWarningSeconds", { seconds: Math.min(...crossed) }));
      } else {
        const crossed = crossedWarnings(previous, remaining);
        if (crossed.length) setUrgent(t("assessment.runner.timeWarning", { minutes: Math.min(...crossed) }));
      }
      previous = remaining;
      if (remaining <= 0 && !expiredHandled) {
        expiredHandled = true;
        setUrgent(t("assessment.runner.timeUp"));
        void finishRef.current(true);
      }
    };
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [data.expiresAt, data.mode, data.serverNow, t]);

  // ------------------------------------------------------------ leave protection
  React.useEffect(() => {
    if (!timed && !data.restrictions) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (submitting.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [timed, data.restrictions]);

  // ------------------------------------------------------------ helpers
  function elapsedFor(id: string) {
    return Math.min(3_600_000, Math.round((spent.current[id] ?? 0) + (Date.now() - shownAt.current)));
  }

  function rememberTime() {
    if (!currentId) return;
    spent.current[currentId] = elapsedFor(currentId);
    shownAt.current = Date.now();
  }

  async function sendAnswer(q: RunnerQuestion, response: QuestionResponse): Promise<AnswerOutcome | null> {
    const id = q.question.id;
    const res = await answerAction({
      kind: data.kind,
      attemptId: data.attemptId,
      questionId: id,
      response,
      timeMs: elapsedFor(id),
      confidence: confidence[id],
      reasoning: data.explainFirst ? reasoning[id] : undefined,
    });
    if (!res.ok) {
      if (res.error === "attempt_expired" || res.error === "attempt_closed") {
        await finishRef.current(true);
        return null;
      }
      setError(res.fieldErrors?.reasoning ? t("assessment.runner.reasoningRequired") : errorText(t, res.error));
      return null;
    }
    spent.current[id] = 0;
    shownAt.current = Date.now();
    setSaved((s) => ({ ...s, [id]: true }));
    setDirty((d) => ({ ...d, [id]: false }));
    return res.data ?? null;
  }

  /** Exam mode: persist the current answer before moving on. Returns false when saving failed. */
  async function saveCurrent(): Promise<boolean> {
    if (feedbackMode || !current) return true;
    const response = drafts[currentId];
    if (!dirty[currentId] || !hasContent(response)) return true;
    const outcome = await sendAnswer(current, response!);
    if (outcome) setStatus(t("assessment.runner.answerSaved"));
    return !!outcome;
  }

  async function goTo(i: number) {
    if (busy || i < 0 || i >= questions.length) return;
    setBusy("answer");
    const ok = await saveCurrent();
    setBusy(null);
    if (!ok) return;
    rememberTime();
    setError(null);
    setIndex(i);
    setPhase("question");
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function openReview() {
    if (busy) return;
    setBusy("answer");
    const ok = await saveCurrent();
    setBusy(null);
    if (!ok) return;
    rememberTime();
    setError(null);
    setPhase("review");
    requestAnimationFrame(() => reviewHeadingRef.current?.focus());
  }

  async function check(responseOverride?: QuestionResponse) {
    if (!current || busy) return;
    const response = responseOverride ?? drafts[currentId];
    if (!hasContent(response)) {
      setError(t("errors.invalid_input"));
      return;
    }
    if (data.explainFirst && (reasoning[currentId] ?? "").trim().length < REASONING_MIN) {
      setError(t("assessment.runner.reasoningRequired"));
      return;
    }
    setError(null);
    setBusy("answer");
    const outcome = await sendAnswer(current, response!);
    setBusy(null);
    if (!outcome) return;
    if (outcome.review) {
      const review = outcome.review;
      setReviews((r) => ({ ...r, [currentId]: review }));
      setStatus(review.isCorrect ? t("assessment.runner.correct") : review.score > 0 ? t("assessment.runner.partiallyCorrect") : t("assessment.runner.incorrect"));
    } else setStatus(t("assessment.runner.answerSaved"));
    if (outcome.addedToReview) setAddedToReview((a) => ({ ...a, [currentId]: true }));
    if (outcome.next) {
      const next = outcome.next;
      setQuestions((qs) => (qs.some((q) => q.question.id === next.question.id) ? qs : [...qs, next]));
      setDrafts((d) => ({ ...d, [next.question.id]: defaultResponse(next.question) }));
      setSaved((s) => ({ ...s, [next.question.id]: false }));
      setMarked((m) => ({ ...m, [next.question.id]: false }));
    }
    if (outcome.done) setAdaptiveDone(true);
    if (!isLightning) requestAnimationFrame(() => nextButtonRef.current?.focus());
  }

  async function lightningAdvance() {
    if (busy) return;
    setFeedbackPaused(false);
    if (index < questions.length - 1) await goTo(index + 1);
    else await finish(false);
  }

  async function toggleMarked() {
    if (!current) return;
    const next = !marked[currentId];
    setMarked((m) => ({ ...m, [currentId]: next }));
    const res = await markAction({ kind: data.kind, attemptId: data.attemptId, questionId: currentId, marked: next });
    if (!res.ok) {
      setMarked((m) => ({ ...m, [currentId]: !next }));
      setError(errorText(t, res.error));
    } else setStatus(next ? t("assessment.runner.marked") : t("assessment.runner.markForReview"));
  }

  async function finish(expired: boolean) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy("submit");
    if (!expired) {
      const ok = await saveCurrent();
      if (!ok) {
        submitting.current = false;
        setBusy(null);
        return;
      }
    } else {
      await saveCurrent().catch(() => false);
    }
    const res = await submitAction({ kind: data.kind, attemptId: data.attemptId, expired });
    if (res.ok && res.data) {
      router.push(res.data.href);
      return;
    }
    submitting.current = false;
    setBusy(null);
    setError(errorText(t, res.ok ? "unknown" : res.error));
  }
  React.useEffect(() => {
    finishRef.current = finish;
  });

  const review = feedbackMode ? reviews[currentId] ?? null : null;
  const locked = busy === "submit" || (feedbackMode && !!review) || (data.adaptive && !!saved[currentId]);

  React.useEffect(() => {
    if (!isLightning || !review) return;
    const id = window.setTimeout(() => {
      const active = document.activeElement;
      const feedbackFocused = active instanceof Node && !!feedbackRef.current?.contains(active);
      if (!feedbackPaused && !feedbackFocused) void lightningAdvance();
    }, 1600);
    return () => window.clearTimeout(id);
    // lightningAdvance intentionally reads the latest render state at timeout fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackPaused, isLightning, review, index]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, [contenteditable='true']")) return;
      if (!current || busy) return;

      const key = event.key.toUpperCase();
      const optionIndex = /^[1-9]$/.test(key) ? Number(key) - 1 : key >= "A" && key <= "F" ? key.charCodeAt(0) - 65 : -1;
      const option = current.question.options?.[optionIndex];
      if (option && !locked && current.question.options) {
        event.preventDefault();
        const previous = drafts[currentId]?.kind === "choice" ? drafts[currentId].selected : [];
        const selected = current.question.type === "MULTIPLE_RESPONSE" ? (previous.includes(option.key) ? previous.filter((v) => v !== option.key) : [...previous, option.key]) : [option.key];
        const response: QuestionResponse = { kind: "choice", selected };
        setDrafts((d) => ({ ...d, [currentId]: response }));
        setDirty((d) => ({ ...d, [currentId]: true }));
        setStatus(t("assessment.runner.optionSelected", { option: String.fromCharCode(65 + optionIndex) }));
        if (isLightning && current.question.type !== "MULTIPLE_RESPONSE") void check(response);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (isLightning && review) void lightningAdvance();
        else if (phase === "review") void finish(false);
        else if (feedbackMode && !review) void check();
        else if (index < questions.length - 1) void goTo(index + 1);
        else void openReview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ------------------------------------------------------------ derived UI state
  if (!current) {
    return (
      <Alert variant="destructive" role="alert" title={t("assessment.runner.loadError")}>
        <Link href={data.exitHref}>{t("common.back")}</Link>
      </Alert>
    );
  }

  const isLastLoaded = index === questions.length - 1;
  const canFinishAdaptive = data.adaptive && isLastLoaded && !!saved[currentId] && (adaptiveDone || answeredCount >= data.total);
  const warn = remainingMs !== null && remainingMs <= (isLightning ? 30_000 : 5 * 60_000);
  const critical = isLightning && remainingMs !== null && remainingMs <= 10_000;
  const timeText = remainingMs === null ? "--:--" : fmt.duration(Math.max(0, remainingMs) / 1000);
  const timerMaxMs = (data.lightningDurationSeconds ?? 0) * 1000 || (data.expiresAt ? Math.max(1, new Date(data.expiresAt).getTime() - new Date(data.serverNow).getTime()) : 1);
  const combo = questions.reduce(
    (state, q) => {
      const r = reviews[q.question.id];
      if (!r) return state;
      const currentStreak = r.isCorrect ? state.current + 1 : 0;
      return { current: currentStreak, best: Math.max(state.best, currentStreak) };
    },
    { current: 0, best: 0 },
  );
  const comboMultiplier = combo.current >= 6 ? 3 : combo.current >= 3 ? 2 : 1;
  const comboBase = combo.current < 3 ? 0 : combo.current < 6 ? 3 : 6;
  const comboDots = Array.from({ length: 3 }, (_, i) => combo.current >= comboBase + i + 1 || combo.current >= 6);

  const primaryAction = (() => {
    if (feedbackMode && !review) {
      return (
        <Button onClick={() => void check()} disabled={busy !== null || !hasContent(drafts[currentId])}>
          <CheckCircle2 aria-hidden="true" />
          {busy === "answer" ? t("common.saving") : t("assessment.runner.submitAnswer")}
        </Button>
      );
    }
    if (data.adaptive) {
      if (canFinishAdaptive || (isLastLoaded && adaptiveDone)) {
        return (
          <Button ref={nextButtonRef} onClick={openReview} disabled={busy !== null}>
            <ListChecks aria-hidden="true" />
            {t("assessment.runner.finish")}
          </Button>
        );
      }
      return (
        <Button ref={nextButtonRef} onClick={() => goTo(index + 1)} disabled={busy !== null || isLastLoaded}>
          {t("assessment.runner.next")}
          <ArrowRight aria-hidden="true" />
        </Button>
      );
    }
    if (index < questions.length - 1) {
      return (
        <Button ref={nextButtonRef} onClick={() => goTo(index + 1)} disabled={busy !== null}>
          {t("assessment.runner.next")}
          <ArrowRight aria-hidden="true" />
        </Button>
      );
    }
    return (
      <Button ref={nextButtonRef} onClick={openReview} disabled={busy !== null}>
        <ListChecks aria-hidden="true" />
        {feedbackMode ? t("assessment.runner.finish") : t("assessment.runner.reviewScreen")}
      </Button>
    );
  })();

  const restrictionHandlers = data.restrictions
    ? {
        onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
        onCut: (e: React.ClipboardEvent) => e.preventDefault(),
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      }
    : {};

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Live regions exist before content changes so announcements are reliable. */}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      <p className="sr-only" aria-live="assertive">
        {urgent}
      </p>

      <header className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{data.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {data.certificationCode ? <Badge variant="outline">{data.certificationCode}</Badge> : null}
            <span>{t("common.of", { current: answeredCount, total: displayTotal })}</span>
            {data.restrictions ? (
              <Badge variant="warning">
                <ShieldAlert aria-hidden="true" />
                {t("assessment.practice.restrictions")}
              </Badge>
            ) : null}
            {data.mode === "LIGHTNING" ? (
              <Badge key={`${combo.current}-${comboMultiplier}`} variant={comboMultiplier > 1 ? "purple" : "outline"} className={cn("gap-2", comboMultiplier > 1 && "motion-safe:animate-pop")}>
                <Flame className={cn("h-3.5 w-3.5", comboMultiplier > 1 && "animate-flicker")} aria-hidden="true" />
                {t("assessment.runner.combo", { count: combo.current, multiplier: comboMultiplier })}
                <span className="flex gap-0.5" aria-hidden="true">
                  {comboDots.map((filled, i) => (
                    <span key={i} className={cn("h-1.5 w-1.5 rounded-full", filled ? "bg-current" : "bg-current/25")} />
                  ))}
                </span>
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {timed ? (
            <div className="flex items-center gap-2">
              <div
                role="timer"
                aria-label={t("assessment.runner.timeRemaining")}
                className={cn(
                  "flex min-w-[7.5rem] items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold tabular-nums",
                  critical ? "border-destructive/60 bg-destructive/10 text-destructive" : warn ? "border-warning/60 bg-warning/10 text-warning" : "bg-muted/50",
                )}
              >
                {warn || critical ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <Clock className="h-4 w-4" aria-hidden="true" />}
                {showTimer ? t("assessment.runner.timeRemainingValue", { time: timeText }) : t("assessment.runner.timerHidden")}
              </div>
              <Button variant="ghost" size="iconSm" onClick={() => setShowTimer((v) => !v)} aria-pressed={!showTimer} aria-label={showTimer ? t("assessment.runner.hideTimer") : t("assessment.runner.showTimer")}>
                {showTimer ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            </div>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href={data.exitHref} title={t("assessment.runner.exitConfirm")}>
              <LogOut aria-hidden="true" />
              {t("assessment.runner.exitQuiz")}
            </Link>
          </Button>
        </div>
      </header>
      {isLightning && timed ? (
        <Progress
          value={Math.max(0, remainingMs ?? timerMaxMs)}
          max={timerMaxMs}
          label={t("assessment.runner.timeRemainingValue", { time: timeText })}
          indicatorClassName={critical ? "bg-destructive" : warn ? "bg-warning" : undefined}
          className="h-2"
        />
      ) : null}
      <Progress value={answeredCount} max={displayTotal} label={t("common.of", { current: answeredCount, total: displayTotal })} />
      <p className="text-xs text-muted-foreground">
        {t("assessment.runner.keyboardHint")} <Kbd>1-9</Kbd> <Kbd>A-F</Kbd> <Kbd>Enter</Kbd>
      </p>

      {error ? (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      ) : null}

      {isLightning ? (
        <Card className="mx-auto max-w-3xl">
          <CardContent className="space-y-6 p-4 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
                {t("assessment.runner.question", { current: index + 1, total: displayTotal })}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{t(`enums.questionType.${current.question.type}` as MessageKey)}</Badge>
                <Badge variant="secondary">{t(`enums.difficulty.${current.question.difficulty}` as MessageKey)}</Badge>
              </div>
            </div>

            {current.question.scenario ? (
              <section aria-label={t("assessment.runner.scenario")} className="rounded-lg border bg-muted/40 p-4">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">{t("assessment.runner.scenario")}</p>
                <Markdown>{current.question.scenario}</Markdown>
              </section>
            ) : null}
            <div className="text-xl font-semibold leading-relaxed">
              <Markdown>{current.question.stem}</Markdown>
            </div>

            <div className="grid gap-3" role="group" aria-label={t("assessment.runner.selectOne")}>
              {(current.question.options ?? []).map((option, optionIndex) => {
                const selected = drafts[currentId]?.kind === "choice" && drafts[currentId].selected.includes(option.key);
                const optionReview = review?.options?.find((item) => item.key === option.key);
                const response: QuestionResponse = {
                  kind: "choice",
                  selected:
                    current.question.type === "MULTIPLE_RESPONSE"
                      ? selected
                        ? (drafts[currentId]?.kind === "choice" ? drafts[currentId].selected.filter((key) => key !== option.key) : [])
                        : [...(drafts[currentId]?.kind === "choice" ? drafts[currentId].selected : []), option.key]
                      : [option.key],
                };
                return (
                  <button
                    key={option.key}
                    type="button"
                    disabled={locked || busy !== null}
                    onClick={() => {
                      setDrafts((draft) => ({ ...draft, [currentId]: response }));
                      setDirty((dirtyState) => ({ ...dirtyState, [currentId]: true }));
                      if (error) setError(null);
                      if (current.question.type !== "MULTIPLE_RESPONSE") void check(response);
                    }}
                    className={cn(
                      "flex min-h-14 items-start gap-3 rounded-xl border bg-card p-4 text-left text-base shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !locked && "hover:border-primary/60 hover:bg-primary/5",
                      selected && !optionReview && "border-primary bg-primary/5",
                      optionReview?.isCorrect && "border-success/70 bg-success/10",
                      optionReview && !optionReview.isCorrect && optionReview.selected && "border-destructive/70 bg-destructive/10",
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-muted text-sm font-semibold">{String.fromCharCode(65 + optionIndex)}</span>
                    <span className="flex-1">
                      <Markdown inline>{option.text}</Markdown>
                    </span>
                    {optionReview?.isCorrect ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success motion-safe:animate-pop" aria-hidden="true" /> : null}
                    {optionReview && !optionReview.isCorrect && optionReview.selected ? <XCircle className="h-5 w-5 shrink-0 text-destructive motion-safe:animate-pop" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>

            {review ? (
              <div
                ref={feedbackRef}
                tabIndex={-1}
                onMouseEnter={() => setFeedbackPaused(true)}
                onFocusCapture={() => setFeedbackPaused(true)}
                className="space-y-3"
                aria-live="polite"
              >
                <Alert variant={review.isCorrect ? "success" : "destructive"} title={review.isCorrect ? t("assessment.runner.correct") : t("assessment.runner.incorrect")}>
                  <Markdown>{review.explanation}</Markdown>
                </Alert>
                <div className="flex justify-end">
                  <Button ref={nextButtonRef} onClick={() => void lightningAdvance()} disabled={busy !== null}>
                    {index < questions.length - 1 ? t("assessment.runner.next") : t("assessment.runner.finish")}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end border-t pt-4">
                <Button onClick={() => void check()} disabled={busy !== null || !hasContent(drafts[currentId])}>
                  <CheckCircle2 aria-hidden="true" />
                  {busy === "answer" ? t("common.saving") : t("assessment.runner.submitAnswer")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        {phase === "question" ? (
          <Card>
            <CardContent className="space-y-5 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold focus:outline-none">
                  {t("assessment.runner.question", { current: index + 1, total: displayTotal })}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{t(`enums.questionType.${current.question.type}` as MessageKey)}</Badge>
                  <Badge variant="secondary">{t(`enums.difficulty.${current.question.difficulty}` as MessageKey)}</Badge>
                </div>
              </div>

              <div className={cn(data.restrictions && "select-none")} {...restrictionHandlers}>
                <QuestionView
                  question={current.question}
                  value={drafts[currentId] ?? null}
                  onChange={(v) => {
                    setDrafts((d) => ({ ...d, [currentId]: v }));
                    setDirty((d) => ({ ...d, [currentId]: true }));
                    if (error) setError(null);
                  }}
                  disabled={locked}
                  review={review}
                  idPrefix={`q${index}`}
                />
              </div>

              {!review && !locked ? (
                <div className="space-y-4 border-t pt-4">
                  {feedbackMode && data.explainFirst ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={`reason-${currentId}`}>{t("assessment.runner.explainReasoning")}</Label>
                      <Textarea
                        id={`reason-${currentId}`}
                        value={reasoning[currentId] ?? ""}
                        onChange={(e) => setReasoning((r) => ({ ...r, [currentId]: e.target.value }))}
                        placeholder={t("assessment.runner.reasoningPlaceholder")}
                        maxLength={2000}
                        rows={3}
                        aria-describedby={`reason-hint-${currentId}`}
                      />
                      <p id={`reason-hint-${currentId}`} className="text-xs text-muted-foreground">
                        {t("assessment.runner.reasoningRequired")}
                      </p>
                    </div>
                  ) : null}
                  <fieldset>
                    <legend className="text-sm font-medium">{t("assessment.runner.confidence")}</legend>
                    <p className="mb-2 text-xs text-muted-foreground">{t("assessment.runner.confidenceHint")}</p>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3].map((c) => (
                        <label
                          key={c}
                          className={cn(
                            "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                            confidence[currentId] === c && "border-primary bg-primary/5",
                          )}
                        >
                          <input
                            type="radio"
                            name={`confidence-${currentId}`}
                            value={c}
                            checked={confidence[currentId] === c}
                            onChange={() => setConfidence((s) => ({ ...s, [currentId]: c }))}
                            className="h-4 w-4 accent-[hsl(var(--primary))]"
                          />
                          {t(`enums.confidence.c${c}` as MessageKey)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              ) : null}

              {review ? (
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  {addedToReview[currentId] ? (
                    <p className="w-full text-sm text-muted-foreground" role="note">
                      <Repeat className="mr-1 inline h-4 w-4" aria-hidden="true" />
                      {t("assessment.runner.addedToReview")}
                    </p>
                  ) : null}
                  {current.lessonHref ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={current.lessonHref}>
                        <BookOpen aria-hidden="true" />
                        {t("assessment.runner.relatedLesson")}
                      </Link>
                    </Button>
                  ) : null}
                  {!review.isCorrect ? (
                    <form action={startSimilarAction.bind(null, currentId)}>
                      <SubmitButton variant="outline" size="sm" pendingLabel={t("common.loading")}>
                        <Repeat aria-hidden="true" />
                        {t("assessment.runner.similarQuestion")}
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              ) : !feedbackMode && saved[currentId] && !dirty[currentId] ? (
                <p className="text-sm text-muted-foreground">
                  <CheckCircle2 className="mr-1 inline h-4 w-4 text-success" aria-hidden="true" />
                  {t("assessment.runner.answerSaved")}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => goTo(index - 1)} disabled={index === 0 || busy !== null}>
                    <ArrowLeft aria-hidden="true" />
                    {t("assessment.runner.previous")}
                  </Button>
                  {!data.adaptive ? (
                    <Button variant={marked[currentId] ? "secondary" : "ghost"} onClick={toggleMarked} aria-pressed={!!marked[currentId]} disabled={busy === "submit"}>
                      <Flag aria-hidden="true" className={cn(marked[currentId] && "fill-current text-warning")} />
                      {marked[currentId] ? t("assessment.runner.marked") : t("assessment.runner.markForReview")}
                    </Button>
                  ) : null}
                </div>
                {primaryAction}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-5 p-4 sm:p-6">
              <div className="space-y-1">
                <h2 ref={reviewHeadingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
                  {t("assessment.runner.reviewScreen")}
                </h2>
                <p className="text-sm text-muted-foreground">{t("assessment.runner.reviewScreenBody")}</p>
              </div>
              {unansweredCount > 0 ? (
                <Alert variant="warning" title={t("assessment.runner.unansweredWarning", { count: unansweredCount })} />
              ) : null}
              <ul className="grid gap-2 sm:grid-cols-2">
                {questions.map((q, i) => {
                  const id = q.question.id;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => goTo(i)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="font-medium">{t("assessment.runner.goToQuestion", { n: i + 1 })}</span>
                        <span className="flex items-center gap-1.5">
                          {marked[id] ? (
                            <Badge variant="warning">
                              <Flag aria-hidden="true" />
                              {t("assessment.runner.marked")}
                            </Badge>
                          ) : null}
                          {saved[id] ? <Badge variant="success">{t("assessment.runner.answered")}</Badge> : <Badge variant="destructive">{t("assessment.runner.unanswered")}</Badge>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => goTo(index)} disabled={busy !== null}>
                  {t("assessment.runner.keepWorking")}
                </Button>
                <Button onClick={() => finish(false)} disabled={busy !== null}>
                  <CheckCircle2 aria-hidden="true" />
                  {busy === "submit" ? t("assessment.runner.submitting") : data.kind === "practice" && !feedbackMode ? t("assessment.runner.submitExam") : t("assessment.runner.confirmSubmit")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <aside aria-label={t("assessment.runner.navigator")} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm lg:self-start">
          <h2 className="text-sm font-semibold">{t("assessment.runner.navigator")}</h2>
          <ol className="grid grid-cols-6 gap-2 sm:grid-cols-10 lg:grid-cols-5">
            {Array.from({ length: displayTotal }, (_, i) => {
              const q = questions[i];
              if (!q) {
                return (
                  <li key={`pending-${i}`}>
                    <span className="flex h-9 w-full items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground" aria-hidden="true">
                      {i + 1}
                    </span>
                  </li>
                );
              }
              const id = q.question.id;
              const r = feedbackMode ? reviews[id] : null;
              const state = [
                saved[id] ? t("assessment.runner.answered") : t("assessment.runner.unanswered"),
                marked[id] ? t("assessment.runner.marked") : null,
                i === index && phase === "question" ? t("assessment.runner.current") : null,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    disabled={busy !== null}
                    aria-current={i === index && phase === "question" ? "step" : undefined}
                    aria-label={`${t("assessment.runner.goToQuestion", { n: i + 1 })}: ${state}`}
                    className={cn(
                      "relative flex h-9 w-full items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      saved[id] ? "border-primary/40 bg-primary/10 text-foreground" : "bg-background hover:bg-muted",
                      r && (r.isCorrect ? "border-success/60 bg-success/10" : "border-destructive/60 bg-destructive/10"),
                      i === index && phase === "question" && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                    )}
                  >
                    {i + 1}
                    {marked[id] ? <Flag className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-warning text-warning" aria-hidden="true" /> : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <ul aria-label={t("assessment.runner.navigatorLegend")} className="space-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm border border-primary/40 bg-primary/10" aria-hidden="true" />
              {t("assessment.runner.answered")}
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm border bg-background" aria-hidden="true" />
              {t("assessment.runner.unanswered")}
            </li>
            <li className="flex items-center gap-2">
              <Flag className="h-3 w-3 fill-warning text-warning" aria-hidden="true" />
              {t("assessment.runner.marked")}
            </li>
          </ul>
          {phase === "question" && !data.adaptive ? (
            <Button variant="outline" size="sm" className="w-full" onClick={openReview} disabled={busy !== null}>
              <ListChecks aria-hidden="true" />
              {t("assessment.runner.reviewScreen")}
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("assessment.runner.originalNotice")}</p>
        </aside>
      </div>
      )}
    </div>
  );
}
