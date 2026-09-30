"use client";

import * as React from "react";
import { Terminal } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { LabPlayerData } from "@/modules/labs/service";
import type { SandboxConfig } from "@/modules/labs/engine/command-sandbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Kbd } from "@/components/ui/misc";

type TerminalLine = { id: string; command?: string; output: string; isError?: boolean; explanation?: string };

export function CommandSandboxPlayer({ lab, run, pending, onEvent }: { lab: LabPlayerData["lab"]; run: LabPlayerData["run"]; pending: boolean; onEvent: (event: unknown) => Promise<LabPlayerData | null> }) {
  const { t } = useI18n();
  const config = lab.config as SandboxConfig;
  const [command, setCommand] = React.useState("");
  const [history, setHistory] = React.useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);
  const [lines, setLines] = React.useState<TerminalLine[]>([{ id: "welcome", output: config.welcome ?? t("labs.terminal.welcome") }]);
  const state = run.publicState as { resourceGroups?: unknown[]; storageAccounts?: unknown[] };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return;
    const lineId = crypto.randomUUID();
    if (/^(clear|cls)$/i.test(trimmed)) setLines([]);
    else setLines((current) => [...current, { id: lineId, command: trimmed, output: "" }].slice(-200));
    setHistory((current) => [...current, trimmed].slice(-50));
    setHistoryIndex(null);
    setCommand("");
    const result = await onEvent({ type: "command", command: trimmed });
    const feedback = result?.run.feedback?.kind === "command" ? result.run.feedback : null;
    if (feedback?.clear) setLines([]);
    else if (feedback) setLines((current) => current.map((line) => (line.id === lineId ? { ...line, output: feedback.output, isError: feedback.isError, explanation: feedback.explanation } : line)));
  };

  return (
    <div className="grid h-full min-h-0 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card className="min-h-0 bg-zinc-950 text-zinc-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Terminal aria-hidden="true" />{t("labs.terminal.label")}</CardTitle>
          <CardDescription className="text-zinc-300">{t("labs.sandboxNotice")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div role="log" aria-live="polite" className="max-h-[42rem] overflow-auto rounded-md border border-zinc-700 bg-black p-3 font-mono text-sm">
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
                onChange={(event) => setCommand(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
                    if (history[next]) {
                      setHistoryIndex(next);
                      setCommand(history[next]!);
                    }
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
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
