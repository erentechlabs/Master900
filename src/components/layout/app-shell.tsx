import Link from "next/link";
import { cookies } from "next/headers";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import type { CurrentUser } from "@/modules/auth/session";
import { getReminders } from "@/modules/learning/reminders";
import { Button } from "@/components/ui/button";
import { FocusSessions } from "@/components/focus/focus-sessions";
import { getFocusTodayStats } from "@/modules/learning/focus";
import { Logo } from "./logo";
import { HeaderOverflow, LocaleSwitcher, Reminders, ThemeToggle } from "./header-controls";
import { MobileNav, NavigationPane, PaneToggleButton } from "./sidebar-nav";
import { SiteFooter } from "./site-footer";
import { NAV_PANE_COOKIE, parseNavPaneMode, visibleNavItems } from "./nav-items";
import { KeyboardShortcuts, KeyboardShortcutsButton } from "./keyboard-shortcuts";
import { MobileSearchButton, TitleSearch } from "./title-search";

async function withNavBadges(items: ReturnType<typeof visibleNavItems>, user: CurrentUser) {
  const now = new Date();
  const tz = user.preference?.timezone ?? "UTC";
  const today = toISODate(now, tz);
  const [practiceDue, flashcardsDue, plannedSessions] = await Promise.all([
    prisma.reviewQueueItem.count({ where: { userId: user.id, status: "ACTIVE", dueAt: { lte: now }, questionId: { not: null } } }),
    prisma.reviewQueueItem.count({ where: { userId: user.id, status: "ACTIVE", dueAt: { lte: now }, flashcardId: { not: null } } }),
    prisma.studySession.findMany({ where: { userId: user.id, status: "PLANNED", scheduledAt: { gte: new Date(now.getTime() - 36 * 60 * 60_000), lte: new Date(now.getTime() + 36 * 60 * 60_000) } }, select: { scheduledAt: true }, take: 20 }),
  ]);
  const planToday = plannedSessions.filter((session) => toISODate(session.scheduledAt, tz) === today).length;
  return items.map((item) => {
    const badge = item.key === "practice" ? practiceDue : item.key === "plan" ? planToday : item.key === "flashcards" ? flashcardsDue : 0;
    return badge > 0 ? { ...item, badge } : item;
  });
}

/**
 * WinUI-style window frame: a title bar and a NavigationView pane on the Mica base, and a content layer with a rounded
 * top-left corner. On large screens the frame fills the viewport and only the content layer scrolls.
 */
export async function AppShell({
  user,
  children,
  variant = "app",
}: {
  user: CurrentUser | null;
  children: React.ReactNode;
  variant?: "app" | "marketing";
}) {
  const [{ t }, cookieStore] = await Promise.all([getI18n(), cookies()]);
  const [items, reminders, focusStats] = user
    ? await Promise.all([withNavBadges(visibleNavItems([...user.permissions]), user), getReminders(user, t), getFocusTodayStats(user.id, user.preference?.timezone ?? "UTC")])
    : [[], [], { minutes: 0, sessions: 0 }];
  const showPane = !!user && variant === "app";
  const paneMode = parseNavPaneMode(cookieStore.get(NAV_PANE_COOKIE)?.value);
  return (
    <div data-app-frame className="flex min-h-screen flex-col bg-background lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("common.skipToContent")}
      </a>
      <KeyboardShortcuts />
      <header data-titlebar className="no-print mica-surface sticky top-0 z-40 flex h-12 shrink-0 items-center gap-1 px-1 lg:relative">
        {showPane ? (
          <>
            <MobileNav items={items} />
            <PaneToggleButton initialMode={paneMode} />
          </>
        ) : null}
        <Logo label={t("common.appShortName")} className="ml-1 min-w-0" />
        <TitleSearch />
        <div className="ml-auto flex shrink-0 items-center gap-0.5 md:ml-0">
          <MobileSearchButton />
          {user ? <FocusSessions initialStats={focusStats} /> : null}
          <KeyboardShortcutsButton />
          <div className="hidden sm:contents">
            <LocaleSwitcher />
            <ThemeToggle />
            {user ? <Reminders items={reminders} /> : null}
          </div>
          <HeaderOverflow />
          {variant === "marketing" ? (
            <Button asChild size="sm" className="ml-1 mr-1 hidden sm:inline-flex">
              <Link href={user ? "/dashboard" : "/certifications"}>{user ? t("nav.dashboard") : t("nav.certifications")}</Link>
            </Button>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {showPane ? <NavigationPane items={items} initialMode={paneMode} /> : null}
        <div
          data-content-frame
          className={cn(
            "flex min-w-0 flex-1 flex-col border-t border-stroke-card bg-layer lg:overflow-y-auto lg:[scroll-padding-top:1rem]",
            showPane && "lg:rounded-tl-lg lg:border-l",
          )}
        >
          {variant === "marketing" ? (
            <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
              {children}
            </main>
          ) : (
            <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-9 lg:py-8">
              <div data-content-width className="mx-auto w-full max-w-6xl">
                {children}
              </div>
            </main>
          )}
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
