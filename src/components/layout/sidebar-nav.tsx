"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Bookmark,
  Bot,
  CalendarDays,
  ClipboardCheck,
  FlaskConical,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Library,
  Menu,
  Network,
  Scale,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, Tooltip } from "@/components/ui/radix";
import { Button } from "@/components/ui/button";
import type { NavItem, NavKey, NavPaneMode } from "./nav-items";
import { useNavPane } from "./nav-pane-state";
import { Logo } from "./logo";

const ICONS: Record<NavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  certifications: GraduationCap,
  learn: BookOpen,
  practice: ClipboardCheck,
  labs: FlaskConical,
  plan: CalendarDays,
  progress: BarChart3,
  tutor: Bot,
  bookmarks: Bookmark,
  flashcards: Layers,
  glossary: Library,
  compare: Scale,
  concepts: Network,
  admin: Wrench,
  settings: Settings,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** WinUI NavigationViewItem: 36px, subtle hover fill, accent selection pill on the leading edge. */
function NavLink({ item, active, compact, onNavigate }: { item: NavItem; active: boolean; compact: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const Icon = ICONS[item.key];
  const label = t(`nav.${item.key}`);
  const accessibleLabel = item.badge ? `${label}, ${item.badge} due` : label;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={accessibleLabel}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md text-sm text-foreground transition-colors duration-150 ease-fluent hover:bg-subtle-hover active:bg-subtle-pressed active:text-muted-foreground",
        compact ? "w-10 justify-center" : "px-3",
        active && "bg-subtle-hover font-medium",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary transition-opacity duration-150", active ? "opacity-100" : "opacity-0")}
      />
      <span className="relative shrink-0">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {compact && item.badge ? (
          <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {item.badge > 9 ? "9+" : item.badge}
          </span>
        ) : null}
      </span>
      <span className={compact ? "sr-only" : "truncate"}>{label}</span>
      {!compact && item.badge ? (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-tint-brand px-1.5 text-xs font-semibold text-primary">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
  return compact ? (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

function NavList({ items, compact = false, onNavigate }: { items: NavItem[]; compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const byGroup = (group: NavItem["group"]) => items.filter((i) => i.group === group);
  const renderItems = (list: NavItem[]) => (
    <ul className="space-y-0.5">
      {list.map((item) => (
        <li key={item.key}>
          <NavLink item={item} active={isActive(pathname, item.href)} compact={compact} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
  const knowledge = byGroup("knowledge");
  const footer = byGroup("footer");
  return (
    <nav aria-label={t("nav.mainNavigation")} className="flex min-h-full flex-col">
      {renderItems(byGroup("main"))}
      {knowledge.length ? (
        <div className="mt-2">
          {compact ? (
            <div role="separator" className="mx-2 my-2 h-px bg-stroke-divider" />
          ) : (
            <p className="px-3 pb-1.5 pt-3 text-xs font-semibold text-muted-foreground">{t("learner.path.knowledgeTools")}</p>
          )}
          {renderItems(knowledge)}
        </div>
      ) : null}
      {footer.length ? (
        <div className="mt-auto pt-3">
          <div role="separator" className="mx-2 mb-2 h-px bg-stroke-divider" />
          {renderItems(footer)}
        </div>
      ) : null}
    </nav>
  );
}

/** Docked NavigationView pane (large screens): expanded (labels) or compact (icons only). */
export function NavigationPane({ items, initialMode }: { items: NavItem[]; initialMode: NavPaneMode }) {
  const { mode } = useNavPane(initialMode);
  const compact = mode === "compact";
  return (
    <aside
      data-app-sidebar
      className={cn(
        "no-print hidden shrink-0 overflow-y-auto overflow-x-hidden px-1 pb-1 pt-0.5 transition-[width] duration-200 ease-fluent lg:block",
        compact ? "w-12" : "w-64",
      )}
    >
      <NavList items={items} compact={compact} />
    </aside>
  );
}

/** Title-bar button that expands or collapses the docked pane (WinUI "global navigation" button). */
export function PaneToggleButton({ initialMode }: { initialMode: NavPaneMode }) {
  const { t } = useI18n();
  const { mode, toggle } = useNavPane(initialMode);
  const expanded = mode === "expanded";
  return (
    <Button data-pane-toggle variant="ghost" size="icon" className="hidden w-10 lg:inline-flex" aria-expanded={expanded} aria-label={expanded ? t("common.collapseNavigation") : t("common.expandNavigation")} onClick={toggle}>
      <Menu aria-hidden="true" />
    </Button>
  );
}

/** Small screens: the pane opens as an overlay (WinUI minimal display mode). */
export function MobileNav({ items }: { items: NavItem[] }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="w-10 lg:hidden" aria-label={t("common.openMenu")}>
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" title={t("common.menu")} closeLabel={t("common.closeMenu")}>
        <div className="flex h-8 items-center px-2 pr-10">
          <Logo label={t("common.appShortName")} />
        </div>
        <div className="flex-1">
          <NavList items={items} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
