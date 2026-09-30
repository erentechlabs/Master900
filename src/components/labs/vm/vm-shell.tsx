"use client";

import * as React from "react";
import { AppWindow, Maximize, Minimize, Minus, Monitor, PanelRightClose, PanelRightOpen, Square, Wifi, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type VmApp = {
  id: string;
  title: string;
  icon?: React.ReactNode;
  /** Content of the window's caption bar (e.g. the browser tab); defaults to the app icon and title. */
  titleBar?: React.ReactNode;
  content: React.ReactNode;
};

/** Windows 11 style tray clock (time over date); rendered on the client only to avoid hydration mismatches. */
function TrayClock() {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return <span className="w-14" aria-hidden="true" />;
  return (
    <time dateTime={now.toISOString()} className="text-right text-[11px] leading-[14px]">
      <span className="block">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      <span className="block">{now.toLocaleDateString([], { day: "numeric", month: "numeric", year: "numeric" })}</span>
    </time>
  );
}

/**
 * The simulated lab VM: a remote-session bar, a Windows 11 style desktop with one maximised app window at a time
 * (Mica caption bar with decorative caption buttons) and a centred taskbar that switches between the VM's apps.
 */
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
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-background shadow-lg",
        height === "full" ? "h-[calc(100dvh-5.5rem)] min-h-[480px]" : "h-[clamp(560px,calc(100dvh-13rem),1100px)]",
        className,
      )}
      aria-label={t("labs.vm.region")}
    >
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-stroke-divider px-3 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <Monitor className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate font-semibold">{vmName}</span>
          <span className="hidden text-muted-foreground sm:inline">{t("labs.vm.simulated")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 items-center gap-1.5 rounded bg-tint-success px-2 font-semibold text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {t("labs.vm.connected")}
          </span>
          {children}
        </div>
      </div>
      <div className="vm-wallpaper relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 p-2 sm:p-3">
          <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-stroke-surface bg-card text-card-foreground shadow-xl">
            <div className="flex h-8 shrink-0 items-stretch justify-between bg-background text-xs">
              {activeApp?.titleBar ? (
                <div className="flex min-w-0 flex-1 items-end pl-2">{activeApp.titleBar}</div>
              ) : (
                <div className="flex min-w-0 items-center gap-2 pl-3 [&_svg]:size-4">
                  <span className="text-primary">{activeApp?.icon ?? <AppWindow aria-hidden="true" />}</span>
                  <span className="truncate">{activeApp?.title}</span>
                </div>
              )}
              <div className="flex h-full text-foreground/80" aria-hidden="true">
                <span className="grid h-full w-11 place-items-center">
                  <Minus className="h-3.5 w-3.5" strokeWidth={1.25} />
                </span>
                <span className="grid h-full w-11 place-items-center">
                  <Square className="h-3 w-3" strokeWidth={1.25} />
                </span>
                <span className="grid h-full w-11 place-items-center">
                  <X className="h-3.5 w-3.5" strokeWidth={1.25} />
                </span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">{activeApp?.content}</div>
          </div>
        </div>
        <div className="relative flex h-12 shrink-0 items-center justify-center border-t border-stroke-card bg-background/85 px-3 backdrop-blur-2xl">
          <div className="flex items-center gap-1" role="toolbar" aria-label={t("labs.vm.region")}>
            {apps.map((app) => {
              const active = activeApp?.id === app.id;
              return (
                <button
                  key={app.id}
                  type="button"
                  aria-pressed={active}
                  title={app.title}
                  className="relative grid h-10 w-10 place-items-center rounded-md transition-colors hover:bg-subtle-hover active:bg-subtle-pressed [&_svg]:size-5"
                  onClick={() => onActiveAppChange(app.id)}
                >
                  <span className="text-primary">{app.icon ?? <AppWindow aria-hidden="true" />}</span>
                  <span className="sr-only">{app.title}</span>
                  <span
                    aria-hidden="true"
                    className={cn("absolute bottom-0.5 left-1/2 h-[3px] -translate-x-1/2 rounded-full transition-all duration-200 ease-fluent", active ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground")}
                  />
                </button>
              );
            })}
          </div>
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-3 text-foreground">
            <Wifi className="h-4 w-4" aria-label={t("labs.vm.network")} />
            <TrayClock />
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
      <Button type="button" variant="outline" onClick={onPanelToggle}>
        {panelOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
        {panelOpen ? t("labs.vm.hideInstructions") : t("labs.vm.showInstructions")}
      </Button>
      <Button type="button" variant="outline" onClick={onToggle}>
        {expanded ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        {expanded ? t("labs.vm.exitFullScreen") : t("labs.vm.fullScreen")}
      </Button>
    </div>
  );
}
