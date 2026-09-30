"use client";

import * as React from "react";
import { AppWindow, Maximize2, Minus, Monitor, Network, PanelRightClose, PanelRightOpen, Power, SquareTerminal, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type VmApp = {
  id: string;
  title: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
};

function ClientClock() {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return <span aria-hidden="true">--:--</span>;
  return <time dateTime={now.toISOString()}>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>;
}

export function VmShell({
  vmName,
  apps,
  activeAppId,
  onActiveAppChange,
  height = "page",
  children,
  className,
}: {
  vmName: string;
  apps: VmApp[];
  activeAppId: string;
  onActiveAppChange: (id: string) => void;
  /** "page": fits the viewport below the lab header; "full": full-screen workspace. The screen scrolls inside. */
  height?: "page" | "full";
  children?: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const activeApp = apps.find((app) => app.id === activeAppId) ?? apps[0];
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-2xl border bg-zinc-950 shadow-2xl", height === "full" ? "h-[calc(100vh-5.5rem)] min-h-[480px]" : "h-[clamp(560px,calc(100vh-12rem),1100px)]", className)} aria-label={t("labs.vm.region")}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-zinc-900 px-3 py-2 text-zinc-100">
          <div className="flex min-w-0 items-center gap-2">
            <Monitor className="h-4 w-4 text-sky-300" aria-hidden="true" />
            <span className="truncate text-sm font-semibold">{vmName}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{t("labs.vm.simulated")}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
              {t("labs.vm.connected")}
            </span>
            {children}
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.34),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.22),transparent_30%),linear-gradient(135deg,#0f172a,#111827_55%,#020617)] p-2 sm:p-3">
          <div className="flex min-h-0 flex-1 items-stretch justify-center">
            <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-white/15 bg-card text-card-foreground shadow-2xl">
              <div className="flex h-9 items-center justify-between gap-3 border-b bg-muted/80 px-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-primary">{activeApp?.icon ?? <AppWindow className="h-4 w-4" aria-hidden="true" />}</span>
                  <span className="truncate font-medium">{activeApp?.title}</span>
                </div>
                <div className="flex gap-2 text-muted-foreground" aria-hidden="true">
                  <Minus className="h-3.5 w-3.5" />
                  <Maximize2 className="h-3.5 w-3.5" />
                  <X className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">{activeApp?.content}</div>
            </div>
          </div>
          <div className="mt-2 flex h-11 shrink-0 items-center justify-between rounded-xl border border-white/10 bg-zinc-950/75 px-3 text-zinc-100 shadow-lg backdrop-blur sm:mt-3">
            <div className="flex items-center gap-2">
              <Power className="h-5 w-5 text-sky-300" aria-hidden="true" />
              {apps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  aria-pressed={activeApp?.id === app.id}
                  className={cn(
                    "inline-flex min-h-8 min-w-8 items-center gap-2 rounded-md px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                    activeApp?.id === app.id ? "bg-white/20" : "hover:bg-white/10",
                  )}
                  onClick={() => onActiveAppChange(app.id)}
                >
                  {app.icon ?? (app.id.includes("terminal") ? <SquareTerminal className="h-4 w-4" aria-hidden="true" /> : <AppWindow className="h-4 w-4" aria-hidden="true" />)}
                  <span className="hidden sm:inline">{app.title}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <Network className="h-4 w-4" aria-label={t("labs.vm.network")} />
              <ClientClock />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FullScreenToggle({ expanded, panelOpen, onToggle, onPanelToggle }: { expanded: boolean; panelOpen: boolean; onToggle: () => void; onPanelToggle: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2">
      <Button type="button" size="sm" variant="outline" onClick={onPanelToggle}>
        {panelOpen ? <PanelRightClose className="h-4 w-4" aria-hidden="true" /> : <PanelRightOpen className="h-4 w-4" aria-hidden="true" />}
        {panelOpen ? t("labs.vm.hideInstructions") : t("labs.vm.showInstructions")}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onToggle}>
        {expanded ? t("labs.vm.exitFullScreen") : t("labs.vm.fullScreen")}
      </Button>
    </div>
  );
}
