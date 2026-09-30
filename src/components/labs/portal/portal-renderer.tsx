"use client";

import * as React from "react";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Copy,
  ExternalLink,
  Globe,
  Grid3x3,
  HelpCircle,
  Lock,
  Menu,
  RefreshCw,
  Search,
  Settings,
  Shield,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type {
  ColumnFormat,
  PortalTheme,
  UiSimAction,
  UiSimComponent,
  UiSimComponentOf,
  UiSimConfig,
  UiSimEvent,
  UiSimField,
  UiSimFieldValue,
  UiSimNavItem,
  UiSimPage,
  UiSimState,
} from "@/modules/labs/engine/ui-simulation";
import {
  buildContext,
  cellValue,
  currentPage,
  fieldDefaultValue,
  formFields,
  getPage,
  pageUrl,
  passes,
  resolveOptions,
  rowKeyOf,
  tableRows,
  validateFormValues,
  visibleFields,
} from "@/modules/labs/engine/ui-simulation";
import { getPath } from "@/modules/labs/engine/rules";
import { renderText, renderTemplate, toText, type TemplateContext } from "@/modules/labs/engine/templates";
import { Markdown } from "@/components/markdown";
import { BarList, LineChart } from "@/components/charts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Radio, Select, Textarea } from "@/components/ui/form";
import { Spinner } from "@/components/ui/misc";
import { Popover, PopoverContent, PopoverTrigger, Switch, Tooltip } from "@/components/ui/radix";
import { TD, TH, TR, TBody, THead, Table } from "@/components/ui/table";
import { PortalIcon } from "./icon-map";
import { SimTerminal } from "./sim-terminal";

/**
 * Visual identity of each simulated portal: colours, typeface, launcher and navigation style approximate the real
 * product (no logos; a neutral brand mark is used instead).
 */
type ThemeView = {
  /** Header bar background, text and border classes. */
  header: string;
  /** App launcher: Microsoft 365 style waffle or a hamburger menu. */
  launcher: "waffle" | "menu";
  /** Neutral brand mark (coloured square, not a logo). */
  mark: string;
  nav: "left" | "tabs";
  activeNav: string;
  activeTab: string;
  primary: string;
  /** Fluent-style flat command bar (Microsoft portals) or outlined buttons (GitHub). */
  command: "flat" | "outline";
  font: "segoe" | "github";
  density: "compact" | "comfortable";
};

const FLUENT_PRIMARY = "bg-[#0f6cbd] text-white hover:bg-[#115ea3] dark:bg-[#2886de] dark:hover:bg-[#479ef5]";
const FLUENT_ACTIVE_NAV = "bg-[#ebf3fc] font-semibold text-[#0f548c] shadow-[inset_3px_0_0_#0f6cbd] dark:bg-sky-950 dark:text-sky-200";
const FLUENT_ACTIVE_TAB = "border-[#0f6cbd] font-semibold text-foreground";

const MICROSOFT = { launcher: "waffle", nav: "left", activeNav: FLUENT_ACTIVE_NAV, activeTab: FLUENT_ACTIVE_TAB, primary: FLUENT_PRIMARY, command: "flat", font: "segoe", density: "compact" } as const;

const THEME: Record<Exclude<PortalTheme, "power">, ThemeView> = {
  generic: { ...MICROSOFT, header: "bg-slate-900 text-white", launcher: "menu", mark: "bg-slate-500", density: "comfortable" },
  azure: { ...MICROSOFT, header: "bg-[#005a9e] text-white", launcher: "menu", mark: "bg-gradient-to-br from-sky-300 to-blue-600" },
  entra: { ...MICROSOFT, header: "bg-[#1b2a4a] text-white", mark: "bg-gradient-to-br from-sky-300 to-indigo-600" },
  purview: { ...MICROSOFT, header: "border-b-2 border-b-[#008575] bg-card text-foreground", mark: "bg-gradient-to-br from-teal-300 to-emerald-700" },
  defender: { ...MICROSOFT, header: "bg-[#1f1f1f] text-white", mark: "bg-gradient-to-br from-sky-400 to-blue-700" },
  m365: { ...MICROSOFT, header: "bg-[#0f6cbd] text-white", mark: "bg-gradient-to-br from-orange-400 via-rose-500 to-violet-600" },
  sharepoint: { ...MICROSOFT, header: "bg-[#036c70] text-white", mark: "bg-gradient-to-br from-teal-300 to-teal-700" },
  "power-platform": { ...MICROSOFT, header: "bg-[#3b1f5c] text-white", mark: "bg-gradient-to-br from-fuchsia-400 to-indigo-600", density: "comfortable" },
  "power-apps": {
    ...MICROSOFT,
    header: "bg-[#742774] text-white",
    mark: "bg-gradient-to-br from-fuchsia-300 to-purple-700",
    primary: "bg-[#742774] text-white hover:bg-[#5f1f5f] dark:bg-fuchsia-700 dark:hover:bg-fuchsia-600",
    density: "comfortable",
  },
  "power-automate": { ...MICROSOFT, header: "bg-[#0a5bd3] text-white", mark: "bg-gradient-to-br from-sky-300 to-blue-700", density: "comfortable" },
  "power-bi": { ...MICROSOFT, header: "bg-[#252423] text-white", mark: "bg-gradient-to-br from-yellow-300 to-amber-500", density: "comfortable" },
  "copilot-studio": { ...MICROSOFT, header: "bg-gradient-to-r from-[#1a1446] to-[#0d3b66] text-white", mark: "bg-gradient-to-br from-cyan-300 via-violet-500 to-fuchsia-600", density: "comfortable" },
  foundry: { ...MICROSOFT, header: "bg-[#1c1b2e] text-white", launcher: "menu", mark: "bg-gradient-to-br from-violet-400 to-blue-600" },
  fabric: { ...MICROSOFT, header: "bg-[#0e6b5c] text-white", mark: "bg-gradient-to-br from-emerald-300 to-teal-700" },
  github: {
    header: "border-b border-[#d1d9e0] bg-[#f6f8fa] text-[#1f2328] dark:border-[#3d444d] dark:bg-[#010409] dark:text-[#f0f6fc]",
    launcher: "menu",
    mark: "rounded-full bg-[#1f2328] dark:bg-[#f0f6fc]",
    nav: "tabs",
    activeNav: "bg-muted font-semibold",
    activeTab: "border-[#fd8c73] font-semibold text-foreground",
    primary: "bg-[#1f883d] text-white hover:bg-[#1a7f37] dark:bg-[#238636] dark:hover:bg-[#2ea043]",
    command: "outline",
    font: "github",
    density: "compact",
  },
};

function toneVariant(tone: string | undefined): "info" | "success" | "warning" | "destructive" {
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  if (tone === "error") return "destructive";
  return "info";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function valueKey(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value);
}

function themeOf(config: UiSimConfig): ThemeView {
  return THEME[config.portal.theme === "power" ? "power-apps" : config.portal.theme];
}

export function BrowserApp({
  config,
  state,
  targetId,
  onEvent,
}: {
  config: UiSimConfig;
  state: UiSimState;
  targetId?: string | null;
  onEvent: (event: UiSimEvent) => void;
}) {
  const { t } = useI18n();
  const page = currentPage(config, state);
  const ctx = buildContext(config, state);
  const trail = state.__meta.trail ?? [page.id];
  const errorUrl = state.__meta.browserError?.url;
  const canBack = trail.length > 1 || !!errorUrl;
  const address = errorUrl ?? pageUrl(config, page, ctx);
  return (
    <div className="flex h-full min-h-0 flex-col bg-card" data-sim-page={page.id}>
      <div className="flex items-center gap-1 border-b border-stroke-divider bg-card px-2 py-1.5">
        <Button size="iconSm" variant="ghost" disabled={!canBack} data-sim-back="" onClick={() => onEvent({ type: "back" })}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t("labs.portal.back")}</span>
        </Button>
        <Button size="iconSm" variant="ghost" disabled>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t("labs.portal.forward")}</span>
        </Button>
        <Button size="iconSm" variant="ghost" onClick={() => onEvent({ type: "openUrl", url: address })}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t("labs.portal.refresh")}</span>
        </Button>
        <AddressForm key={address} initialAddress={address} onOpen={(url) => onEvent({ type: "openUrl", url })} />
        <Badge variant="secondary">{t("labs.portal.simulated")}</Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {errorUrl ? <BrowserError url={errorUrl} /> : <PortalRenderer config={config} state={state} targetId={targetId} onEvent={onEvent} />}
      </div>
    </div>
  );
}

/** The browser's tab, drawn in the VM window's caption bar (Edge style). */
export function BrowserTab({ config, state }: { config: UiSimConfig; state: UiSimState }) {
  const page = currentPage(config, state);
  const title = state.__meta.browserError?.url ?? renderText(page.title, buildContext(config, state));
  return (
    <div className="flex h-7 min-w-36 max-w-60 items-center gap-2 rounded-t-lg bg-card px-3 text-xs">
      <Globe className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="truncate">{title}</span>
    </div>
  );
}

function AddressForm({ initialAddress, onOpen }: { initialAddress: string; onOpen: (url: string) => void }) {
  const { t } = useI18n();
  const [address, setAddress] = React.useState(initialAddress);
  return (
    <form
      className="mx-1 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3 transition-shadow focus-within:bg-control-focus focus-within:shadow-[inset_0_0_0_2px_hsl(var(--primary))]"
      onSubmit={(event) => {
        event.preventDefault();
        onOpen(address);
      }}
    >
      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <label className="sr-only" htmlFor="sim-address-bar">
        {t("labs.portal.address")}
      </label>
      <input id="sim-address-bar" value={address} onChange={(event) => setAddress(event.currentTarget.value)} className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
    </form>
  );
}

function BrowserError({ url }: { url: string }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-3 p-10">
      <TriangleAlert className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-display text-subtitle">{t("labs.portal.siteUnreachable")}</h2>
      <p className="text-sm text-muted-foreground">{t("labs.portal.siteUnreachableBody", { url })}</p>
    </div>
  );
}

export function PortalRenderer({ config, state, targetId, onEvent }: { config: UiSimConfig; state: UiSimState; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  const page = currentPage(config, state);
  const ctx = buildContext(config, state);
  if (page.layout === "blank") {
    const theme = themeOf(config);
    return <div className="min-h-full space-y-4 bg-background p-6 text-sm">{page.components.map((component, index) => <PortalComponent key={componentKey(component, index)} component={component} config={config} state={state} page={page} ctx={ctx} theme={theme} targetId={targetId} onEvent={onEvent} />)}</div>;
  }
  return <PortalChrome config={config} state={state} page={page} targetId={targetId} onEvent={onEvent} />;
}

function PortalChrome({ config, state, page, targetId, onEvent }: { config: UiSimConfig; state: UiSimState; page: UiSimPage; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  const { t } = useI18n();
  const [filter, setFilter] = React.useState("");
  const [cloudShell, setCloudShell] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(true);
  const theme = themeOf(config);
  const ctx = buildContext(config, state);
  const notifications = state.__meta.notifications ?? [];
  const terminalSurface = config.terminal?.surface ?? (config.portal.theme === "azure" ? "cloudshell" : undefined);
  const showCloudShell = !!config.terminal && (terminalSurface === "cloudshell" || terminalSurface === "both");
  const grouped = config.navigation
    .filter((item) => !filter || `${item.label} ${item.section ?? ""}`.toLowerCase().includes(filter.toLowerCase()))
    .reduce<Record<string, typeof config.navigation>>((acc, item) => {
      const section = item.section ?? "";
      acc[section] = [...(acc[section] ?? []), item];
      return acc;
    }, {});
  const requiresMissing = page.requires && !getPath(ctx, `$sel.${page.requires}`);
  // Tab themes (GitHub): a page tab menu that overlaps the navigation is that page's repository tab set; any other page
  // menu is shown in addition (e.g. the repository Settings sidebar, or pull request tabs) so global tabs never vanish.
  const navPages = new Set(config.navigation.map((item) => item.page));
  const menu = page.menu?.length ? page.menu : null;
  const replacesTabs = theme.nav === "tabs" && !!menu && page.menuStyle === "tabs" && menu.some((item) => navPages.has(item.page));
  const tabItems = theme.nav === "tabs" ? (replacesTabs ? menu : config.navigation) : null;
  const pageMenu = replacesTabs ? null : menu;
  const sideMenu = pageMenu && page.menuStyle !== "tabs" ? pageMenu : null;
  const secondaryTabs = pageMenu && page.menuStyle === "tabs" ? pageMenu : null;
  const LauncherIcon = theme.launcher === "waffle" ? Grid3x3 : Menu;
  const headerButton = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 dark:hover:bg-white/10";
  const compact = theme.density === "compact";

  const title = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {page.icon ? <PortalIcon name={page.icon} className="h-5 w-5 shrink-0 text-muted-foreground" /> : null}
          <span className="min-w-0 break-words">{renderText(page.title, ctx)}</span>
        </h1>
        {page.subtitle ? <p className="text-xs text-muted-foreground">{renderText(page.subtitle, ctx)}</p> : null}
      </div>
      {theme.command === "outline" ? <CommandBar page={page} ctx={ctx} theme={theme} targetId={targetId} onEvent={onEvent} /> : null}
    </div>
  );
  const body = (
    <>
      {theme.command === "flat" ? <CommandBar page={page} ctx={ctx} theme={theme} targetId={targetId} onEvent={onEvent} /> : null}
      <div aria-live="polite">{state.__meta.message ? <Alert variant={toneVariant(state.__meta.message.tone)}>{state.__meta.message.text}</Alert> : null}</div>
      {requiresMissing ? (
        <ResourceNotFound config={config} onEvent={onEvent} />
      ) : (
        <div className={cn("space-y-4", compact && "space-y-3")}>
          {page.components.map((component, index) => (
            <PortalComponent key={componentKey(component, index)} component={component} config={config} state={state} page={page} ctx={ctx} theme={theme} targetId={targetId} onEvent={onEvent} />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className={cn("relative flex min-h-full flex-col bg-background text-[13px] text-foreground", theme.font === "segoe" ? "portal-font-segoe" : "portal-font-github")}>
      <header className={cn("flex h-11 shrink-0 items-center gap-2 px-2", theme.header)}>
        {theme.nav === "left" ? (
          <button type="button" className={headerButton} aria-expanded={navOpen} onClick={() => setNavOpen((value) => !value)}>
            <LauncherIcon className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t("labs.portal.navigation")}</span>
          </button>
        ) : (
          <span className={headerButton} aria-hidden="true">
            <LauncherIcon className="h-4 w-4" />
          </span>
        )}
        <span className={cn("h-5 w-5 shrink-0 rounded-[5px]", theme.mark)} aria-hidden="true" />
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold">{config.portal.name}</span>
        <div className="relative mx-auto hidden min-w-0 max-w-md flex-1 md:block">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="portal-search" className="sr-only">{t("labs.portal.search")}</label>
          <input
            id="portal-search"
            className="h-8 w-full rounded-md border border-black/10 bg-white/95 pl-8 pr-2 text-[13px] text-zinc-900 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
            placeholder={config.portal.searchPlaceholder ?? t("labs.portal.search")}
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 md:ml-0">
          {showCloudShell ? (
            <button type="button" className={cn(headerButton, cloudShell && "bg-black/15 dark:bg-white/15")} aria-pressed={cloudShell} onClick={() => setCloudShell((value) => !value)}>
              <Cloud className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t("labs.portal.cloudShell")}</span>
            </button>
          ) : null}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className={cn(headerButton, "relative")}>
                <Bell className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t("labs.portal.notifications")}</span>
                {notifications.length ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[#c50f1f] px-1 text-[10px] leading-4 text-white">{notifications.length}</span> : null}
              </button>
            </PopoverTrigger>
            <PopoverContent>
              <h3 className="font-medium">{t("labs.portal.notifications")}</h3>
              {notifications.length ? (
                <ul className="mt-2 max-h-80 space-y-2 overflow-auto">
                  {[...notifications].reverse().map((item) => (
                    <li key={item.id} className="rounded-md border p-2 text-sm">
                      <span className="font-medium">{item.title}</span>
                      {item.message ? <span className="block text-muted-foreground">{item.message}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{t("labs.portal.noNotifications")}</p>
              )}
            </PopoverContent>
          </Popover>
          <Tooltip content={t("labs.portal.decorativeDisabled")}>
            <button type="button" disabled className={cn(headerButton, "hidden sm:inline-flex")}>
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t("labs.portal.settings")}</span>
            </button>
          </Tooltip>
          <Tooltip content={t("labs.portal.decorativeDisabled")}>
            <button type="button" disabled className={cn(headerButton, "hidden sm:inline-flex")}>
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t("labs.portal.help")}</span>
            </button>
          </Tooltip>
          <div className="ml-1 flex min-w-0 items-center gap-2 border-l border-current/20 pl-2 text-xs">
            <span className="hidden min-w-0 max-w-44 text-right lg:block">
              <span className="block truncate">{config.portal.user ?? t("labs.portal.learner")}</span>
              {config.portal.tenant ? <span className="block truncate text-[11px] opacity-75">{config.portal.tenant}</span> : null}
            </span>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#c7e0f4] text-[11px] font-semibold text-[#0f548c]" title={config.portal.user}>
              {initials(config.portal.user)}
            </span>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {theme.nav === "left" && navOpen ? (
          <nav aria-label={t("labs.portal.navigation")} className="w-52 shrink-0 overflow-y-auto border-r bg-muted/30 p-2">
            <NavGroups groups={grouped} active={page.navItem ?? page.id} theme={theme} onEvent={onEvent} />
          </nav>
        ) : null}
        <div className="min-w-0 flex-1 overflow-auto">
          {tabItems ? <PageTabs items={tabItems} active={page.navItem ?? page.id} theme={theme} onEvent={onEvent} /> : null}
          {secondaryTabs ? <PageTabs items={secondaryTabs} active={page.id} theme={theme} onEvent={onEvent} /> : null}
          <div className={cn("mx-auto max-w-[1280px] space-y-4 p-4", compact && "space-y-3 p-3")}>
            <Breadcrumb page={page} ctx={ctx} />
            {sideMenu ? (
              <div className="flex gap-4">
                <PageResourceMenu items={sideMenu} active={page.id} theme={theme} onEvent={onEvent} />
                <div className={cn("min-w-0 flex-1 space-y-4", compact && "space-y-3")}>
                  {title}
                  {body}
                </div>
              </div>
            ) : (
              <>
                {title}
                {body}
              </>
            )}
          </div>
        </div>
      </div>
      {cloudShell ? (
        <div className="h-72 shrink-0 border-t shadow-2xl">
          <SimTerminal config={config} state={state} title={t("labs.portal.cloudShell")} onEvent={onEvent} />
        </div>
      ) : null}
      <div aria-live="polite" className="sr-only">{state.__meta.toast ? `${state.__meta.toast.title} ${state.__meta.toast.message ?? ""}` : ""}</div>
      {state.__meta.toast ? <PortalToast key={state.__meta.toast.id} title={state.__meta.toast.title} message={state.__meta.toast.message} /> : null}
    </div>
  );
}

function initials(user: string | undefined): string {
  const name = (user ?? "Lab learner").split("@")[0]!.replace(/[._-]+/g, " ").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "L") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

function PortalToast({ title, message }: { title: string; message?: string }) {
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const id = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(id);
  }, []);
  if (!visible) return null;
  return (
    <div className="absolute right-4 top-14 z-30 flex max-w-sm gap-2 rounded-md border bg-card p-3 text-sm shadow-xl">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      <div>
        <div className="font-semibold">{title}</div>
        {message ? <div className="text-muted-foreground">{message}</div> : null}
      </div>
    </div>
  );
}

/** Page an action opens (navigation test hook), e.g. a tile whose action navigates or ends with a navigation. */
function gotoTarget(action: UiSimAction | undefined): string | undefined {
  if (!action) return undefined;
  if (action.type === "navigate") return action.page;
  if (action.type === "sequence") return [...action.actions].reverse().map(gotoTarget).find(Boolean);
  return undefined;
}

function componentKey(component: UiSimComponent, index: number): string {
  return "id" in component && component.id ? component.id : `${component.kind}-${index}`;
}

function NavGroups({ groups, active, theme, onEvent }: { groups: Record<string, UiSimNavItem[]>; active: string; theme: ThemeView; onEvent: (event: UiSimEvent) => void }) {
  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([section, items]) => (
        <div key={section || "main"}>
          {section ? <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section}</div> : null}
          <div className="space-y-0.5">
            {items.map((item, index) => (
              <button key={`${item.page}-${index}`} type="button" data-sim-nav={item.page} aria-current={active === item.page ? "page" : undefined} className={cn("flex min-h-8 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active === item.page ? theme.activeNav : "hover:bg-muted")} onClick={() => onEvent({ type: "navigate", page: item.page })}>
                <PortalIcon name={item.icon} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PageTabs({ items, active, theme, onEvent }: { items: { page: string; label: string; icon?: UiSimNavItem["icon"] }[]; active: string; theme: ThemeView; onEvent: (event: UiSimEvent) => void }) {
  const { t } = useI18n();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b px-3" aria-label={t("labs.portal.pageTabs")}>
      {items.map((item, index) => (
        <button key={`${item.page}-${index}`} type="button" data-sim-nav={item.page} aria-current={active === item.page ? "page" : undefined} className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active === item.page ? theme.activeTab : "border-transparent text-muted-foreground hover:text-foreground")} onClick={() => onEvent({ type: "navigate", page: item.page })}>
          <PortalIcon name={item.icon} className="shrink-0" />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function PageResourceMenu({ items, active, theme, onEvent }: { items: UiSimNavItem[]; active: string; theme: ThemeView; onEvent: (event: UiSimEvent) => void }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("labs.portal.resourceMenu")} className="w-44 shrink-0 space-y-0.5 border-r pr-2">
      {items.map((item, index) =>
        item.section && items.findIndex((other) => other.section === item.section) === index ? (
          <React.Fragment key={`${item.page}-${index}`}>
            <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.section}</div>
            <ResourceMenuButton item={item} active={active} theme={theme} onEvent={onEvent} />
          </React.Fragment>
        ) : (
          <ResourceMenuButton key={`${item.page}-${index}`} item={item} active={active} theme={theme} onEvent={onEvent} />
        ),
      )}
    </nav>
  );
}

function ResourceMenuButton({ item, active, theme, onEvent }: { item: UiSimNavItem; active: string; theme: ThemeView; onEvent: (event: UiSimEvent) => void }) {
  return (
    <button type="button" data-sim-nav={item.page} aria-current={active === item.page ? "page" : undefined} className={cn("flex min-h-8 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active === item.page ? theme.activeNav : "hover:bg-muted")} onClick={() => onEvent({ type: "navigate", page: item.page })}>
      <PortalIcon name={item.icon} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function Breadcrumb({ page, ctx }: { page: UiSimPage; ctx: TemplateContext }) {
  const { t } = useI18n();
  if (!page.breadcrumb?.length) return null;
  return (
    <nav aria-label={t("labs.portal.breadcrumb")} className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {page.breadcrumb.map((crumb, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <ChevronRight className="h-3 w-3" aria-hidden="true" /> : null}
          <span className={index < page.breadcrumb!.length - 1 ? "text-[#0f6cbd] dark:text-sky-300" : undefined}>{renderText(crumb, ctx)}</span>
        </React.Fragment>
      ))}
    </nav>
  );
}

function CommandBar({ page, ctx, theme, targetId, onEvent }: { page: UiSimPage; ctx: TemplateContext; theme: ThemeView; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  const commands = (page.commands ?? []).filter((command) => passes(command.visibleWhen, ctx));
  if (!commands.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", theme.command === "flat" && "border-b pb-1")} role="toolbar" aria-label={renderText(page.title, ctx)}>
      {commands.map((command) => {
        const disabled = command.disabledWhen ? passes(command.disabledWhen, ctx) : false;
        if (theme.command === "flat") {
          return (
            <button
              key={command.id}
              type="button"
              disabled={disabled}
              data-sim-click={command.id} data-sim-goto={gotoTarget(command.action)} onClick={() => onEvent({ type: "click", componentId: command.id })}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded px-2 text-[13px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                command.variant === "danger" ? "[&_svg]:text-destructive" : "[&_svg]:text-[#0f6cbd] dark:[&_svg]:text-sky-300",
                highlight(command.id, targetId),
              )}
            >
              <PortalIcon name={command.icon} />
              {command.label}
            </button>
          );
        }
        return (
          <Button
            key={command.id}
            size="sm"
            variant={command.variant === "danger" ? "destructive" : command.variant === "link" ? "link" : "outline"}
            disabled={disabled}
            data-sim-click={command.id} data-sim-goto={gotoTarget(command.action)} onClick={() => onEvent({ type: "click", componentId: command.id })}
            className={cn(command.variant === "primary" && theme.primary, highlight(command.id, targetId))}
          >
            <PortalIcon name={command.icon} />
            {command.label}
          </Button>
        );
      })}
    </div>
  );
}

function ResourceNotFound({ config, onEvent }: { config: UiSimConfig; onEvent: (event: UiSimEvent) => void }) {
  const { t } = useI18n();
  return (
    <Alert variant="warning" title={t("labs.portal.resourceNotFound")}>
      <Button size="sm" variant="outline" onClick={() => onEvent({ type: "navigate", page: config.startPage })}>
        {getPage(config, config.startPage)?.title ?? t("labs.sim.home")}
      </Button>
    </Alert>
  );
}

function highlight(id: string | undefined, targetId?: string | null): string | undefined {
  return id && targetId === id ? "relative ring-2 ring-warning ring-offset-2 motion-safe:animate-pulse after:absolute after:-right-2 after:-top-2 after:rounded-full after:bg-warning after:px-1.5 after:py-0.5 after:text-[10px] after:font-semibold after:text-warning-foreground after:content-['Next']" : undefined;
}

function PortalComponent(props: { component: UiSimComponent; config: UiSimConfig; state: UiSimState; page: UiSimPage; ctx: TemplateContext; theme: ThemeView; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  const { component, ctx } = props;
  if (!passes(component.visibleWhen, ctx)) return null;
  switch (component.kind) {
    case "text":
      return <Markdown compact className={highlight(component.id, props.targetId)}>{renderText(component.text, ctx)}</Markdown>;
    case "callout":
      return <Alert variant={toneVariant(component.variant)} title={component.title ? renderText(component.title, ctx) : undefined} className={highlight(component.id, props.targetId)}><Markdown compact>{renderText(component.text, ctx)}</Markdown></Alert>;
    case "table":
      return <SimTable {...props} component={component} />;
    case "links":
      return <LinksComponent {...props} component={component} />;
    case "button":
      return <ButtonComponent {...props} component={component} />;
    case "tiles":
      return <TilesComponent {...props} component={component} />;
    case "form":
      return <FormComponent {...props} component={component} />;
    case "wizard":
      return <WizardComponent {...props} component={component} />;
    case "settings":
      return <SettingsComponent {...props} component={component} />;
    case "properties":
      return <PropertiesComponent {...props} component={component} />;
    case "terminal":
      return <div className={cn("h-96 overflow-hidden rounded-lg border", highlight(component.id, props.targetId))}><SimTerminal config={props.config} state={props.state} title={component.title} onEvent={props.onEvent} /></div>;
    case "sqlEditor":
      return <SqlEditor {...props} component={component} />;
    case "chat":
      return <ChatComponent {...props} component={component} />;
    case "code":
      return <CodeComponent {...props} component={component} />;
    case "deployment":
      return <DeploymentComponent {...props} component={component} />;
    case "chart":
      return <ChartComponent component={component} />;
  }
}

const STATUS_DOT = {
  success: "bg-[#107c10]",
  danger: "bg-[#c50f1f]",
  warning: "bg-[#f7630c]",
  muted: "bg-zinc-400",
} as const;

/** Colour of a status value, e.g. Running (green), Failed (red), Pending (amber), Stopped (grey). */
function statusTone(value: string): keyof typeof STATUS_DOT {
  const v = value.toLowerCase();
  if (/\b(fail(ed|ure)?|error|critical|high|non-?compliant|denied|rejected|blocked|unhealthy|offline|expired|compromised|at risk|breach|malicious|isolat(ed|ion) failed)\b/.test(v)) return "danger";
  if (/\b(stopped|deallocated|disabled|inactive|deleted|not started|not configured|off|none|dismissed|postponed|closed|draft)\b/.test(v)) return "muted";
  if (/\b(pending|in ?progress|creating|updating|starting|stopping|queued|warning|medium|in review|review|preview|report-only|simulation|waiting|degraded|needs attention|partially|provisioning|running tests|evaluating|investigating|new|active alert|fired|triggered)\b/.test(v)) return "warning";
  if (/\b(succeed(ed)?|success(ful)?|running|enabled|active|healthy|compliant|approved|available|online|ready|published|completed?|resolved|connected|passed|allowed|on|deployed|assigned|protected|isolated|low|informational|acknowledged|merged|open)\b/.test(v)) return "success";
  return "muted";
}

function FormattedValue({ value, format, ctx }: { value: unknown; format?: ColumnFormat; ctx: TemplateContext }) {
  const { t } = useI18n();
  if (format === "status") {
    const text = toText(value);
    return <span className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[statusTone(text)])} aria-hidden="true" />{text}</span>;
  }
  if (format === "badge") return <Badge variant="secondary">{toText(value)}</Badge>;
  if (format === "code") return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{toText(value)}</code>;
  if (format === "link") return <span className="inline-flex items-center gap-1 text-primary">{toText(value)}<ExternalLink className="h-3 w-3" aria-hidden="true" /></span>;
  if (format === "date") return <time dateTime={toText(value)}>{toText(value).slice(0, 10)}</time>;
  if (format === "datetime") {
    const text = toText(value);
    return <time dateTime={text}>{text.length >= 16 ? `${text.slice(0, 10)} ${text.slice(11, 16)} UTC` : text}</time>;
  }
  if (format === "bool") return value ? <Badge variant="success">{t("labs.portal.yes")}</Badge> : <Badge variant="outline">{t("labs.portal.no")}</Badge>;
  if (format === "tags") {
    const list = Array.isArray(value) ? value : isRecord(value) ? Object.entries(value).map(([k, v]) => `${k}: ${toText(v)}`) : toText(value).split(",").filter(Boolean);
    return <span className="flex flex-wrap gap-1">{list.map((item, index) => <Badge key={`${valueKey(item)}-${index}`} variant="outline">{toText(item)}</Badge>)}</span>;
  }
  if (format === "json") return <pre className="max-w-xs overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>;
  if (format === "count") return <span className="tabular-nums">{Array.isArray(value) ? value.length : toText(value)}</span>;
  return <>{toText(renderTemplate(toText(value), ctx))}</>;
}

function SimTable({ component, ctx, targetId, onEvent }: { component: UiSimComponentOf<"table">; config: UiSimConfig; state: UiSimState; ctx: TemplateContext; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState("");
  const rows = tableRows(component, ctx).filter((row) => !query || JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
  const variant = component.variant ?? "table";
  if (variant === "cards" || variant === "flow" || variant === "list" || variant === "files") {
    return (
      <section className={cn("rounded-lg border bg-card p-3", highlight(component.id, targetId))}>
        <ComponentHeader title={component.title} searchable={component.searchable} query={query} onQuery={setQuery} />
        <div className={cn("mt-3 grid gap-2", variant === "cards" && "md:grid-cols-2", variant === "flow" && "relative")}>
          {rows.length ? rows.map((row, index) => <RowCard key={component.rowKey ? rowKeyOf(component, row) : index} component={component} row={row} ctx={ctx} variant={variant} onEvent={onEvent} />) : <p className="text-sm text-muted-foreground">{component.emptyText ?? t("labs.sim.noRows")}</p>}
        </div>
      </section>
    );
  }
  return (
    <section className={cn("space-y-2", highlight(component.id, targetId))}>
      <ComponentHeader title={component.title} searchable={component.searchable} query={query} onQuery={setQuery} />
      <Table caption={component.title}>
        <THead>
          <TR>{component.columns.map((column, index) => <TH key={`${column.key}-${index}`}>{column.label}</TH>)}{component.rowActions?.length ? <TH>{t("labs.portal.actions")}</TH> : null}</TR>
        </THead>
        <TBody>
          {rows.length ? rows.map((row, rowIndex) => {
            const key = component.rowKey ? rowKeyOf(component, row) : String(rowIndex);
            return (
              <TR key={key}>
                {component.columns.map((column, cellIndex) => {
                  const raw = column.template ? renderTemplate(column.template, { ...ctx, $row: row }) : cellValue(row, column.key);
                  const clickable = component.rowKey && (cellIndex === 0 || column.format === "link");
                  return (
                    <TD key={`${column.key}-${cellIndex}`}>
                      {clickable ? (
                        <button type="button" className="min-h-6 text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-sim-row={`${component.id}:${key}`} onClick={() => onEvent({ type: "rowClick", componentId: component.id, rowKey: key })}>
                          <FormattedValue value={raw} format={column.format} ctx={{ ...ctx, $row: row }} />
                        </button>
                      ) : (
                        <FormattedValue value={raw} format={column.format} ctx={{ ...ctx, $row: row }} />
                      )}
                    </TD>
                  );
                })}
                {component.rowActions?.length ? <TD><RowActions component={component} row={row} rowKey={key} ctx={ctx} onEvent={onEvent} /></TD> : null}
              </TR>
            );
          }) : <TR><TD colSpan={component.columns.length + (component.rowActions?.length ? 1 : 0)}>{component.emptyText ?? t("labs.sim.noRows")}</TD></TR>}
        </TBody>
      </Table>
    </section>
  );
}

function ComponentHeader({ title, searchable, query, onQuery }: { title?: string; searchable?: boolean; query: string; onQuery: (value: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {title ? <h2 className="font-semibold">{title}</h2> : <span />}
      {searchable ? <Field id={`search-${title ?? "rows"}`} label={t("labs.portal.searchRows")}><Input className="h-8" value={query} onChange={(event) => onQuery(event.currentTarget.value)} /></Field> : null}
    </div>
  );
}

function RowCard({ component, row, ctx, variant, onEvent }: { component: UiSimComponentOf<"table">; row: unknown; ctx: TemplateContext; variant: string; onEvent: (event: UiSimEvent) => void }) {
  const key = component.rowKey ? rowKeyOf(component, row) : "";
  return (
    <div className={cn("rounded-lg border bg-background p-3", variant === "flow" && "border-l-4 border-l-primary")}>
      {component.columns.map((column, index) => {
        const raw = column.template ? renderTemplate(column.template, { ...ctx, $row: row }) : cellValue(row, column.key);
        return (
          <div key={`${column.key}-${index}`} className={cn("flex justify-between gap-3 text-sm", index === 0 && "font-medium")}>
            <span className="text-muted-foreground">{column.label}</span>
            {component.rowKey && index === 0 ? <button className="text-primary hover:underline" data-sim-row={`${component.id}:${key}`} onClick={() => onEvent({ type: "rowClick", componentId: component.id, rowKey: key })}><FormattedValue value={raw} format={column.format} ctx={{ ...ctx, $row: row }} /></button> : <FormattedValue value={raw} format={column.format} ctx={{ ...ctx, $row: row }} />}
          </div>
        );
      })}
      {component.rowActions?.length ? <div className="mt-2"><RowActions component={component} row={row} rowKey={key} ctx={ctx} onEvent={onEvent} /></div> : null}
    </div>
  );
}

function RowActions({ component, row, rowKey, ctx, onEvent }: { component: UiSimComponentOf<"table">; row: unknown; rowKey: string; ctx: TemplateContext; onEvent: (event: UiSimEvent) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(component.rowActions ?? []).filter((action) => passes(action.visibleWhen, { ...ctx, $row: row })).map((action) => (
        <Button key={action.id} size="sm" variant={action.variant === "danger" ? "destructive" : "outline"} data-sim-row-action={`${component.id}:${rowKey}:${action.id}`} onClick={() => onEvent({ type: "rowAction", componentId: component.id, rowKey, actionId: action.id })}>
          <PortalIcon name={action.icon} />
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function LinksComponent({ component, onEvent, targetId }: { component: UiSimComponentOf<"links">; onEvent: (event: UiSimEvent) => void; targetId?: string | null }) {
  return (
    <section className={cn("rounded-lg border bg-card p-3", highlight(component.id, targetId))}>
      {component.title ? <h2 className="font-semibold">{component.title}</h2> : null}
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {component.items.map((item) => (
          <button key={item.id} type="button" className="min-h-14 rounded-lg border p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-sim-click={`${component.id}:${item.id}`} data-sim-goto={item.page} onClick={() => onEvent({ type: "click", componentId: component.id, itemId: item.id })}>
            <span className="flex items-center gap-2 font-medium"><PortalIcon name={item.icon} />{item.label}</span>
            {item.description ? <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function ButtonComponent({ component, ctx, theme, targetId, onEvent }: { component: UiSimComponentOf<"button">; ctx: TemplateContext; theme: ThemeView; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  const disabled = component.disabledWhen ? passes(component.disabledWhen, ctx) : false;
  const variant = component.variant === "danger" ? "destructive" : component.variant === "secondary" ? "outline" : component.variant === "link" ? "link" : "default";
  return (
    <Button disabled={disabled} variant={variant} data-sim-click={component.id} data-sim-goto={gotoTarget(component.action)} onClick={() => onEvent({ type: "click", componentId: component.id })} className={cn(variant === "default" && theme.primary, highlight(component.id, targetId))}>
      <PortalIcon name={component.icon} />
      {component.label}
    </Button>
  );
}

function TilesComponent({ component, ctx, targetId, onEvent }: { component: UiSimComponentOf<"tiles">; ctx: TemplateContext; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  return (
    <section className={cn("space-y-3", highlight(component.id, targetId))}>
      {component.title ? <h2 className="font-semibold">{component.title}</h2> : null}
      <div className={cn("grid gap-3", component.size === "lg" ? "md:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {component.items.filter((item) => passes(item.visibleWhen, ctx)).map((item) => (
          <button key={item.id} type="button" className="min-h-24 rounded-lg border bg-card p-4 text-left shadow-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-sim-click={`${component.id}:${item.id}`} data-sim-goto={gotoTarget(item.action)} onClick={() => onEvent({ type: "click", componentId: component.id, itemId: item.id })}>
            <span className="flex items-center gap-2 font-semibold"><PortalIcon name={item.icon} className="h-5 w-5" />{item.label}</span>
            {item.description ? <span className="mt-2 block text-sm text-muted-foreground">{item.description}</span> : null}
            {item.badge ? <Badge className="mt-3" variant="secondary">{item.badge}</Badge> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function FieldControl({ field, value, error, ctx, onChange, onCommit }: { field: UiSimField; value: UiSimFieldValue | undefined; error?: string; ctx: TemplateContext; onChange: (value: UiSimFieldValue) => void; onCommit?: () => void }) {
  const { t } = useI18n();
  const id = React.useId();
  const options = resolveOptions(field, ctx);
  if (field.control === "toggle") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div>
          <label htmlFor={id} className="text-sm font-medium">{field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}</label>
          {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <Switch id={id} data-sim-field={field.id} checked={value === true} onCheckedChange={(checked) => onChange(checked)} disabled={field.readOnly} />
      </div>
    );
  }
  if (field.control === "select") return <Field id={id} label={field.label} hint={field.help} error={error} required={field.required}><Select data-sim-field={field.id} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.currentTarget.value)} disabled={field.readOnly}><option value="" />{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>;
  if (field.control === "radio") return <fieldset className="space-y-2"><legend className="text-sm font-medium">{field.label}</legend>{options.map((option) => <label key={option.value} className="flex min-h-6 items-center gap-2 text-sm"><Radio value={option.value} data-sim-field={field.id} checked={value === option.value} onChange={() => onChange(option.value)} disabled={field.readOnly} />{option.label}</label>)}{error ? <p className="text-xs text-destructive">{error}</p> : null}</fieldset>;
  if (field.control === "checkboxes") {
    const selected = Array.isArray(value) ? value : [];
    return <fieldset className="space-y-2"><legend className="text-sm font-medium">{field.label}</legend>{options.map((option) => <label key={option.value} className="flex min-h-6 items-center gap-2 text-sm"><Checkbox value={option.value} data-sim-field={field.id} checked={selected.includes(option.value)} onChange={(event) => onChange(event.currentTarget.checked ? [...selected, option.value] : selected.filter((v) => v !== option.value))} disabled={field.readOnly} />{option.label}</label>)}{error ? <p className="text-xs text-destructive">{error}</p> : null}</fieldset>;
  }
  if (field.control === "textarea" || field.control === "code") return <Field id={id} label={field.label} hint={field.help} error={error} required={field.required}><Textarea data-sim-field={field.id} className={field.control === "code" ? "font-mono" : undefined} value={typeof value === "string" ? value : ""} placeholder={field.placeholder} onChange={(event) => onChange(event.currentTarget.value)} onBlur={onCommit} readOnly={field.readOnly} /></Field>;
  return <Field id={id} label={field.label} hint={field.help ?? (field.control === "number" ? t("labs.portal.numberField") : undefined)} error={error} required={field.required}><Input data-sim-field={field.id} type={field.control === "number" ? "number" : "text"} value={typeof value === "number" || typeof value === "string" ? value : ""} placeholder={field.placeholder} onChange={(event) => onChange(field.control === "number" && event.currentTarget.value !== "" ? Number(event.currentTarget.value) : event.currentTarget.value)} onBlur={onCommit} onKeyDown={(event) => { if (event.key === "Enter") onCommit?.(); }} readOnly={field.readOnly} /></Field>;
}

function FormComponent({ component, config, state, ctx, theme, targetId, onEvent }: { component: UiSimComponentOf<"form">; config: UiSimConfig; state: UiSimState; ctx: TemplateContext; theme: ThemeView; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  const [values, setValues] = React.useState<Record<string, UiSimFieldValue>>(() => Object.fromEntries(component.fields.map((field) => [field.id, fieldDefaultValue(field, ctx)])));
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = React.useState(false);
  const visible = visibleFields(component.fields, values, ctx);
  const validation = validateFormValues(visible, values, ctx);
  return (
    <form
      data-sim-form={component.id}
      noValidate
      className={cn("space-y-4 rounded-lg border bg-card p-4", highlight(component.id, targetId))}
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (Object.keys(validation.errors).length) return;
        onEvent({ type: "submitForm", componentId: component.id, values: validation.values });
      }}
    >
      {component.title ? <h2 className="font-semibold">{component.title}</h2> : null}
      {component.description ? <p className="text-sm text-muted-foreground">{component.description}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((field) => (
          <FieldControl
            key={field.id}
            field={field}
            value={values[field.id]}
            error={attempted || touched[field.id] ? validation.errors[field.id]?.message : undefined}
            ctx={ctx}
            onChange={(value) => {
              setValues((current) => ({ ...current, [field.id]: value }));
              setTouched((current) => ({ ...current, [field.id]: true }));
            }}
          />
        ))}
      </div>
      {component.preview ? <ChartPreview component={component} config={config} state={state} values={values} /> : null}
      <Button type="submit" data-sim-submit="" className={theme.primary}>{component.submit.label}</Button>
    </form>
  );
}

function ChartPreview({ component, config, state, values }: { component: UiSimComponentOf<"form">; config: UiSimConfig; state: UiSimState; values: Record<string, UiSimFieldValue> }) {
  const { t } = useI18n();
  const preview = component.preview;
  if (!preview) return null;
  const ctx = buildContext(config, state);
  const rows = Array.isArray(getPath(ctx, preview.dataset)) ? (getPath(ctx, preview.dataset) as unknown[]) : [];
  const category = String(values[preview.categoryField] ?? "");
  const valueField = String(values[preview.valueField] ?? "");
  const data = rows.slice(0, 12).map((row, index) => ({ label: toText(getPath(row, category)) || String(index + 1), value: Number(getPath(row, valueField)) || 0 }));
  return <div className="rounded-lg border p-3"><h3 className="mb-2 font-medium">{t("labs.portal.preview")}</h3>{data.length ? <BarList data={data} caption={t("labs.portal.preview")} valueLabel={t("labs.portal.value")} toggleLabel={t("labs.portal.showData")} /> : <p className="text-sm text-muted-foreground">{t("labs.portal.noPreview")}</p>}</div>;
}

function displayValue(field: UiSimField, value: UiSimFieldValue | undefined, ctx: TemplateContext, yes: string, no: string): string {
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "—";
  const options = resolveOptions(field, ctx);
  const label = (v: string) => options.find((option) => option.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map(label).join(", ");
  if (typeof value === "boolean") return value ? yes : no;
  if (typeof value === "string") return field.control === "textarea" || field.control === "code" ? (value.length > 160 ? `${value.slice(0, 160)}…` : value) : label(value);
  return String(value);
}

function WizardComponent({ component, ctx, theme, targetId, onEvent }: { component: UiSimComponentOf<"wizard">; ctx: TemplateContext; theme: ThemeView; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  const { t } = useI18n();
  const [tabIndex, setTabIndex] = React.useState(0);
  const allFields = formFields(component);
  const [values, setValues] = React.useState<Record<string, UiSimFieldValue>>(() => Object.fromEntries(allFields.map((field) => [field.id, fieldDefaultValue(field, ctx)])));
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [left, setLeft] = React.useState<Record<number, boolean>>({});
  const reviewIndex = component.tabs.length;
  const reviewLabel = component.reviewLabel ?? t("labs.portal.reviewCreate");
  const labels = [...component.tabs.map((tab) => tab.label), reviewLabel];
  const allVisible = visibleFields(allFields, values, ctx);
  const validation = validateFormValues(allVisible, values, ctx);
  const isReview = tabIndex === reviewIndex;
  const goTo = (index: number) => {
    setLeft((current) => ({ ...current, [tabIndex]: true }));
    setTabIndex(Math.max(0, Math.min(reviewIndex, index)));
  };
  const tabHasErrors = (index: number) => (component.tabs[index]?.fields ?? []).some((field) => validation.errors[field.id]);
  const activeTab = component.tabs[tabIndex];
  const activeVisible = visibleFields(activeTab?.fields ?? [], values, ctx);
  const errorCount = Object.keys(validation.errors).length;
  return (
    <section data-sim-form={component.id} className={cn("rounded-lg border bg-card", highlight(component.id, targetId))}>
      <div className="px-4 pt-4">
        {component.title ? <h2 className="font-semibold">{component.title}</h2> : null}
        {component.description ? <p className="text-sm text-muted-foreground">{component.description}</p> : null}
        <div className="mt-3 flex gap-1 overflow-x-auto border-b" role="tablist">
          {labels.map((label, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              data-sim-tab={index}
              aria-selected={tabIndex === index}
              className={cn("relative inline-flex min-h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tabIndex === index ? theme.activeTab : "border-transparent text-muted-foreground hover:text-foreground")}
              onClick={() => goTo(index)}
            >
              {label}
              {index < reviewIndex && (left[index] || isReview) && tabHasErrors(index) ? <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-label={t("labs.portal.validationErrors")} /> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4 p-4">
        {isReview ? (
          <div className="space-y-4">
            {errorCount ? (
              <Alert variant="destructive" title={t("labs.portal.validationErrors")}>
                <ul className="list-disc pl-5">{Object.values(validation.errors).map((error, index) => <li key={index}>{error.message}</li>)}</ul>
              </Alert>
            ) : (
              <Alert variant="success" title={t("labs.portal.validationPassed")}><CheckCircle2 aria-hidden="true" /></Alert>
            )}
            {component.tabs.map((tab) => {
              const fields = visibleFields(tab.fields, values, ctx);
              if (!fields.length) return null;
              return (
                <section key={tab.id}>
                  <h3 className="mb-2 border-b pb-1 text-sm font-semibold">{tab.label}</h3>
                  <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-[minmax(10rem,16rem)_1fr]">
                    {fields.map((field) => (
                      <React.Fragment key={field.id}>
                        <dt className="text-muted-foreground">{field.label}</dt>
                        <dd className="min-w-0 break-words font-medium">{displayValue(field, values[field.id], ctx, t("labs.portal.yes"), t("labs.portal.no"))}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
        ) : (
          <>
            {activeTab?.description ? <p className="text-sm text-muted-foreground">{activeTab.description}</p> : null}
            <div className="grid gap-4 md:grid-cols-2">
              {activeVisible.map((field) => (
                <FieldControl
                  key={field.id}
                  field={field}
                  value={values[field.id]}
                  error={touched[field.id] || left[tabIndex] ? validation.errors[field.id]?.message : undefined}
                  ctx={ctx}
                  onChange={(value) => {
                    setValues((current) => ({ ...current, [field.id]: value }));
                    setTouched((current) => ({ ...current, [field.id]: true }));
                  }}
                />
              ))}
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {isReview ? (
            <Button data-sim-submit="" className={theme.primary} disabled={errorCount > 0} onClick={() => onEvent({ type: "submitForm", componentId: component.id, values: validation.values })}>
              {component.submit.label}
            </Button>
          ) : (
            <Button className={theme.primary} onClick={() => goTo(reviewIndex)}>
              {reviewLabel}
            </Button>
          )}
          <Button variant="outline" disabled={tabIndex === 0} onClick={() => goTo(tabIndex - 1)}>
            <ChevronLeft aria-hidden="true" />
            {t("labs.portal.previous")}
          </Button>
          {!isReview ? (
            <Button variant="outline" onClick={() => goTo(tabIndex + 1)}>
              {t("labs.portal.next")}: {labels[tabIndex + 1]}
              <ChevronRight aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SettingsComponent({ component, ctx, targetId, onEvent }: { component: UiSimComponentOf<"settings">; ctx: TemplateContext; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  const [draft, setDraft] = React.useState<Record<string, UiSimFieldValue>>(() => Object.fromEntries(component.fields.map((field) => [field.id, fieldDefaultValue(field, ctx)])));
  return (
    <section data-sim-settings={component.id} className={cn("space-y-4 rounded-lg border bg-card p-4", highlight(component.id, targetId))}>
      {component.title ? <h2 className="font-semibold">{component.title}</h2> : null}
      {component.description ? <p className="text-sm text-muted-foreground">{component.description}</p> : null}
      {component.fields.filter((field) => passes(field.visibleWhen, ctx)).map((field) => <FieldControl key={field.id} field={field} value={draft[field.id]} ctx={ctx} onChange={(value) => { setDraft((current) => ({ ...current, [field.id]: value })); if (field.control === "toggle" || field.control === "select" || field.control === "radio" || field.control === "checkboxes") onEvent({ type: "setField", componentId: component.id, fieldId: field.id, value }); }} onCommit={() => onEvent({ type: "setField", componentId: component.id, fieldId: field.id, value: draft[field.id] ?? "" })} />)}
    </section>
  );
}

function PropertiesComponent({ component, ctx }: { component: UiSimComponentOf<"properties">; ctx: TemplateContext }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      {component.title ? <h2 className="mb-3 font-semibold">{component.title}</h2> : null}
      <dl className="grid gap-3 md:grid-cols-2">
        {component.items.map((item, index) => <div key={`${item.label}-${index}`} className="min-w-0"><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="mt-0.5 break-words font-medium"><FormattedValue value={renderTemplate(item.value, ctx)} format={item.format} ctx={ctx} /></dd></div>)}
      </dl>
    </section>
  );
}

function SqlEditor({ component, state, targetId, onEvent }: { component: UiSimComponentOf<"sqlEditor">; state: UiSimState; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  const { t } = useI18n();
  const [sql, setSql] = React.useState(component.placeholder ?? "SELECT * FROM c");
  const result = state.__meta.results?.[component.id];
  return (
    <section data-sim-sql={component.id} className={cn("space-y-3 rounded-lg border bg-card p-4", highlight(component.id, targetId))}>
      {component.title ? <h2 className="font-semibold">{component.title}</h2> : null}
      <div className="flex flex-wrap gap-2">{component.sampleQueries?.map((sample, index) => <Button key={index} size="sm" variant="outline" onClick={() => setSql(sample.sql)}>{sample.label}</Button>)}</div>
      <Field id={`${component.id}-sql`} label={t("labs.portal.sqlEditor")}><Textarea className="min-h-32 font-mono" value={sql} onChange={(event) => setSql(event.currentTarget.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") onEvent({ type: "query", componentId: component.id, sql }); }} /></Field>
      <Button data-sim-run="" onClick={() => onEvent({ type: "query", componentId: component.id, sql })}>{t("labs.portal.runQuery")}</Button>
      {result ? <SqlResultView result={result} /> : null}
    </section>
  );
}

function SqlResultView({ result }: { result: NonNullable<UiSimState["__meta"]["results"]>[string] }) {
  if (!result.ok) return <Alert variant="destructive">{result.error}</Alert>;
  if (result.kind === "documents") return <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(result.documents, null, 2)}</pre>;
  if (result.kind === "rows") return <Table><THead><TR>{result.columns?.map((c) => <TH key={c}>{c}</TH>)}</TR></THead><TBody>{result.rows?.map((row, i) => <TR key={i}>{row.map((cell, j) => <TD key={j}>{toText(cell)}</TD>)}</TR>)}</TBody></Table>;
  return <Alert variant="success">{result.message}</Alert>;
}

function ChatComponent({ component, state, targetId, onEvent }: { component: UiSimComponentOf<"chat">; state: UiSimState; targetId?: string | null; onEvent: (event: UiSimEvent) => void }) {
  const { t } = useI18n();
  const [message, setMessage] = React.useState("");
  const transcript = (getPath(state, component.transcriptPath ?? `chats.${component.id}`) as unknown[]) ?? [];
  return (
    <section data-sim-chat={component.id} className={cn("space-y-3 rounded-lg border bg-card p-4", highlight(component.id, targetId))}>
      {component.title ? <h2 className="font-semibold">{component.title}</h2> : null}
      {component.systemPrompt ? <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{t("labs.portal.systemPrompt")}</summary><Markdown compact>{component.systemPrompt}</Markdown></details> : null}
      <div className="max-h-96 space-y-3 overflow-auto rounded-lg border bg-background p-3" aria-live="polite">
        {transcript.map((entry, index) => {
          const msg = isRecord(entry) ? entry : {};
          return <div key={index} className={cn("rounded-lg p-3 text-sm", msg.role === "user" ? "ml-auto max-w-[80%] bg-primary text-primary-foreground" : "mr-auto max-w-[85%] bg-muted")}><div className="whitespace-pre-wrap">{toText(msg.text)}</div>{msg.blocked ? <Badge variant="warning" className="mt-2"><Shield className="h-3 w-3" aria-hidden="true" />{t("labs.portal.blocked")}</Badge> : null}{Array.isArray(msg.citations) ? <div className="mt-2 flex flex-wrap gap-1">{msg.citations.map((citation, citationIndex) => <Badge key={citationIndex} variant="outline">{toText(citation)}</Badge>)}</div> : null}</div>;
        })}
      </div>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!message.trim()) return; onEvent({ type: "chat", componentId: component.id, message }); setMessage(""); }}>
        <Field id={`${component.id}-message`} label={component.placeholder ?? t("labs.portal.chatMessage")} className="min-w-0 flex-1"><Input value={message} onChange={(event) => setMessage(event.currentTarget.value)} /></Field>
        <Button type="submit">{t("labs.portal.send")}</Button>
      </form>
    </section>
  );
}

function CodeComponent({ component }: { component: UiSimComponentOf<"code"> }) {
  const { t } = useI18n();
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">{component.title ? <h2 className="font-semibold">{component.title}</h2> : <span /> }<Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(component.content); toast.success(t("labs.portal.copied")); }}><Copy className="h-4 w-4" aria-hidden="true" />{t("labs.portal.copy")}</Button></div>
      <pre className="max-h-96 overflow-auto p-3 text-xs"><code>{component.content}</code></pre>
    </section>
  );
}

function DeploymentComponent({ component }: { component: UiSimComponentOf<"deployment"> }) {
  const { t } = useI18n();
  const [done, setDone] = React.useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const id = window.setTimeout(() => setDone(true), 1200);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-live="polite">
      <h2 className="flex items-center gap-2 font-semibold">{done ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" /> : <Spinner className="h-5 w-5" />}{done ? t("labs.portal.deploymentComplete") : t("labs.portal.deploymentProgress")}</h2>
      <p className="text-sm text-muted-foreground">{component.note ?? component.status}</p>
      {done && component.resources?.length ? <Table><THead><TR><TH>{t("labs.portal.name")}</TH><TH>{t("labs.portal.type")}</TH><TH>{t("labs.portal.status")}</TH></TR></THead><TBody>{component.resources.map((resource, index) => <TR key={`${resource.type}-${resource.name}-${index}`}><TD>{resource.name}</TD><TD>{resource.type}</TD><TD>{resource.status}</TD></TR>)}</TBody></Table> : null}
    </section>
  );
}

function ChartComponent({ component }: { component: UiSimComponentOf<"chart"> }) {
  const data = component.points.map((p) => ({ label: p.label, value: p.value }));
  const { t } = useI18n();
  return <section className="rounded-lg border bg-card p-4">{component.title ? <h2 className="mb-3 font-semibold">{component.title}</h2> : null}{component.type === "line" ? <LineChart data={data} caption={component.title ?? t("labs.portal.chart")} valueLabel={component.unit ?? t("labs.portal.value")} toggleLabel={t("labs.portal.showData")} /> : <BarList data={data} caption={component.title ?? t("labs.portal.chart")} valueSuffix={component.unit ?? ""} valueLabel={component.unit ?? t("labs.portal.value")} toggleLabel={t("labs.portal.showData")} />}</section>;
}
