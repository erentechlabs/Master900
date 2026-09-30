"use client";

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
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/radix";
import { Button } from "@/components/ui/button";
import type { NavItem, NavKey } from "./nav-items";
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
  admin: Settings,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const groups: { key: NavItem["group"]; label: string | null }[] = [
    { key: "main", label: null },
    { key: "knowledge", label: t("learner.path.knowledgeTools") },
    { key: "admin", label: null },
  ];
  return (
    <nav aria-label={t("nav.mainNavigation")} className="space-y-5">
      {groups.map((g) => {
        const list = items.filter((i) => i.group === g.key);
        if (list.length === 0) return null;
        return (
          <div key={g.key}>
            {g.label ? <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p> : null}
            <ul className="space-y-0.5">
              {list.map((item) => {
                const Icon = ICONS[item.key];
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {t(`nav.${item.key}`)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  return <NavList items={items} />;
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const { t } = useI18n();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("common.openMenu")}>
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" title={t("common.menu")} closeLabel={t("common.closeMenu")}>
        <div className="pr-8">
          <Logo />
        </div>
        <MobileNavList items={items} />
      </SheetContent>
    </Sheet>
  );
}

function MobileNavList({ items }: { items: NavItem[] }) {
  return <NavList items={items} />;
}
