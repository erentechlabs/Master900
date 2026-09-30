"use client";

import * as React from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { LabPlayerData } from "@/modules/labs/service";
import type { ArchitectureConfig } from "@/modules/labs/engine/architecture";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";

export function ArchitecturePlayer({ lab, run, pending, onEvent, onCheck }: { lab: LabPlayerData["lab"]; run: LabPlayerData["run"]; pending: boolean; onEvent: (event: unknown) => void; onCheck: () => void }) {
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
    <Card className="m-4">
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
              <Select value={selectedZone} onChange={(event) => setSelectedZone(event.currentTarget.value)}>
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
              <Select aria-label={t("labs.architecture.connectFrom")} value={from} onChange={(event) => setFrom(event.currentTarget.value)}>
                <option value="" />
                {placed.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
              <Select aria-label={t("labs.architecture.connectTo")} value={to} onChange={(event) => setTo(event.currentTarget.value)}>
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
          {run.feedback?.kind === "architecture" && run.feedback.outcomes.length ? run.feedback.outcomes.filter((outcome) => outcome.feedback).map((outcome, index) => <Alert key={index} variant={outcome.passed ? "success" : "warning"} icon={outcome.passed}>{outcome.feedback}</Alert>) : null}
        </div>
        <Button onClick={onCheck} disabled={pending}>{t("labs.architecture.validate")}</Button>
      </CardContent>
    </Card>
  );
}

function labelFor(config: ArchitectureConfig, id: string): string {
  return config.palette.find((p) => p.id === id)?.label ?? id;
}
