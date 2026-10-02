"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pause, Play, Square, TimerReset } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/radix";
import { celebrate } from "@/components/ui/celebration";
import { completeFocusSessionAction } from "@/app/(app)/focus/actions";
import type { FocusTodayStats } from "@/modules/learning/focus";
import { FOCUS_DURATIONS, endFocusSession, pauseFocusSession, remainingFromEnd, resumeFocusSession, startFocusSession, type FocusTimerState } from "./focus-timer";

const STORAGE_KEY = "mfa.focusSession";

function readStored(): FocusTimerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FocusTimerState) : null;
  } catch {
    return null;
  }
}

function writeStored(state: FocusTimerState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatMinutes(ms: number) {
  return Math.max(0, Math.ceil(ms / 60_000));
}

function ProgressRing({ progress, label, className = "h-28 w-28" }: { progress: number; label: React.ReactNode; className?: string }) {
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <div className={`relative grid place-items-center ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/80" />
        <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-primary transition-[stroke-dashoffset] duration-300" strokeDasharray={106.81} strokeDashoffset={106.81 * (1 - pct)} />
      </svg>
      <span className="absolute text-center font-display text-subtitle tabular-nums">{label}</span>
    </div>
  );
}

export function FocusSessions({ initialStats }: { initialStats: FocusTodayStats }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [stats, setStats] = React.useState(initialStats);
  const [state, setState] = React.useState<FocusTimerState>(() => {
    const stored = readStored();
    return stored ? (stored.status === "running" ? { ...stored, remainingMs: remainingFromEnd(stored.endsAt) } : stored) : endFocusSession(25);
  });
  const [announcement, setAnnouncement] = React.useState("");
  const completedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    writeStored(state);
  }, [state]);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("mfa:open-focus", onOpen);
    return () => window.removeEventListener("mfa:open-focus", onOpen);
  }, []);

  React.useEffect(() => {
    if (state.status !== "running") return;
    const tick = window.setInterval(() => {
      setState((current) => {
        if (current.status !== "running") return current;
        const remainingMs = remainingFromEnd(current.endsAt);
        if (remainingMs > 0) return { ...current, remainingMs };
        if (completedRef.current !== current.clientSessionId) {
          completedRef.current = current.clientSessionId;
          completeFocusSessionAction({ minutes: current.durationMinutes, clientSessionId: current.clientSessionId }).then((result) => {
            if (result.ok && result.data) {
              setStats({ minutes: result.data.minutes, sessions: result.data.sessions });
              toast.success(t("shell.focusEnded", { xp: result.data.xp }));
              celebrate({ particleCount: 60, spread: 70 });
              setAnnouncement(t("shell.focusCompleted"));
            }
          });
        }
        return endFocusSession(current.durationMinutes);
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [state.status, t]);

  const running = state.status === "running";
  const paused = state.status === "paused";
  const progress = state.durationMinutes ? 1 - state.remainingMs / (state.durationMinutes * 60_000) : 0;

  const start = (minutes = state.durationMinutes) => {
    const next = startFocusSession(minutes);
    setState(next);
    // The open flyout and the title-bar ring already show the running timer; a toast would cover the flyout.
    setAnnouncement(t("shell.focusStarted", { minutes }));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative w-10" aria-label={t("shell.focus")}>
          {running ? <ProgressRing progress={progress} label={<span className="text-[10px]">{formatMinutes(state.remainingMs)}</span>} className="h-6 w-6" /> : <TimerReset className="h-5 w-5" aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div aria-live="polite" className="sr-only">{announcement}</div>
        <div className="space-y-4">
          <div>
            <p className="font-display text-base font-semibold">{t("shell.focusSessions")}</p>
            <p className="text-sm text-muted-foreground">{t("shell.focusDescription")}</p>
          </div>
          <div className="flex justify-center">
            <ProgressRing progress={progress} label={<>{formatMinutes(state.remainingMs)}<span className="block text-xs font-normal text-muted-foreground">min</span></>} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">{t("shell.focusDuration")}</p>
            <div className="grid grid-cols-4 gap-2">
              {FOCUS_DURATIONS.map((minutes) => (
                <Button key={minutes} type="button" variant={state.durationMinutes === minutes ? "default" : "secondary"} size="sm" onClick={() => setState(endFocusSession(minutes))} disabled={running || paused}>
                  {minutes}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {!running && !paused ? <Button className="flex-1" onClick={() => start()}><Play aria-hidden="true" />{t("common.start")}</Button> : null}
            {running ? <Button className="flex-1" variant="secondary" onClick={() => setState((current) => pauseFocusSession(current))}><Pause aria-hidden="true" />{t("common.pause")}</Button> : null}
            {paused ? <Button className="flex-1" onClick={() => setState((current) => resumeFocusSession(current))}><Play aria-hidden="true" />{t("common.resume")}</Button> : null}
            {(running || paused) ? <Button variant="outline" onClick={() => setState(endFocusSession(state.durationMinutes))}><Square aria-hidden="true" />{t("shell.focusEnd")}</Button> : null}
          </div>
          <div className="rounded-lg border bg-card p-3 text-sm">
            <p className="font-medium">{t("shell.focusToday")}</p>
            <p className="text-muted-foreground">{t("shell.focusTodayStats", { minutes: stats.minutes, sessions: stats.sessions })}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
