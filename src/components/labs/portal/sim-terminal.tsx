"use client";

import * as React from "react";
import { Terminal } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { UiSimConfig, UiSimEvent, UiSimState } from "@/modules/labs/engine/ui-simulation";
import { buildContext, terminalPrompt } from "@/modules/labs/engine/ui-simulation";
import { renderText } from "@/modules/labs/engine/templates";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Kbd } from "@/components/ui/misc";

export function SimTerminal({
  config,
  state,
  title,
  className,
  onEvent,
}: {
  config: UiSimConfig;
  state: UiSimState;
  title?: string;
  className?: string;
  onEvent: (event: UiSimEvent) => void;
}) {
  const { t } = useI18n();
  const [command, setCommand] = React.useState("");
  const [localHistory, setLocalHistory] = React.useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);
  const logRef = React.useRef<HTMLDivElement>(null);
  const prompt = terminalPrompt(config, state);
  const entries = state.__meta.terminal ?? [];
  const welcome = renderText(config.terminal?.welcome, buildContext(config, state));

  React.useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [entries.length]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return;
    setLocalHistory((h) => [...h, trimmed].slice(-80));
    setHistoryIndex(null);
    setCommand("");
    onEvent({ type: "command", command: trimmed });
  };

  return (
    <section className={cn("flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-50", className)} aria-label={title ?? t("labs.terminal.label")}>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-sm font-medium">
        <Terminal className="h-4 w-4 text-emerald-300" aria-hidden="true" />
        {title ?? config.terminal?.title ?? t("labs.terminal.label")}
      </div>
      <div ref={logRef} role="log" aria-live="polite" className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[13px] leading-relaxed">
        {welcome ? <pre className="mb-3 whitespace-pre-wrap text-zinc-300">{welcome}</pre> : null}
        {entries.map((entry) => (
          <div key={`${entry.id}-${entry.command}`} className="mb-3">
            <div>
              <span className="text-emerald-300">{entry.prompt}</span> <span>{entry.command}</span>
            </div>
            {entry.output ? <pre className={cn("whitespace-pre-wrap", entry.error ? "text-red-300" : "text-zinc-100")}>{entry.output}</pre> : null}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <span className="pb-2 font-mono text-sm text-emerald-300" aria-hidden="true">
            {prompt}
          </span>
          <Field id="ui-sim-terminal-input" label={t("labs.terminal.inputLabel")} hint={<>{t("labs.terminal.historyHint")} <Kbd>↑</Kbd> <Kbd>↓</Kbd></>} className="min-w-0 flex-1">
            <Input
              className="h-9 bg-zinc-900 font-mono text-zinc-50"
              value={command}
              placeholder={t("labs.terminal.placeholder")}
              onChange={(event) => setCommand(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  const next = historyIndex === null ? localHistory.length - 1 : Math.max(0, historyIndex - 1);
                  if (localHistory[next]) {
                    setHistoryIndex(next);
                    setCommand(localHistory[next]!);
                  }
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  const next = historyIndex === null ? localHistory.length : Math.min(localHistory.length, historyIndex + 1);
                  setHistoryIndex(next === localHistory.length ? null : next);
                  setCommand(next === localHistory.length ? "" : (localHistory[next] ?? ""));
                }
              }}
            />
          </Field>
          <Button type="submit" size="sm">
            {t("labs.terminal.run")}
          </Button>
        </div>
      </form>
    </section>
  );
}
