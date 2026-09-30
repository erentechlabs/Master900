import Link from "next/link";
import { cookies } from "next/headers";
import { Search } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import type { CurrentUser } from "@/modules/auth/session";
import { getReminders } from "@/modules/learning/reminders";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { LocaleSwitcher, Reminders, ThemeToggle } from "./header-controls";
import { MobileNav, NavigationPane, PaneToggleButton } from "./sidebar-nav";
import { SiteFooter } from "./site-footer";
import { NAV_PANE_COOKIE, parseNavPaneMode, visibleNavItems } from "./nav-items";

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
  const items = user ? visibleNavItems([...user.permissions]) : [];
  const reminders = user ? await getReminders(user, t) : [];
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
      <header className="no-print sticky top-0 z-40 flex h-12 shrink-0 items-center gap-1 bg-background px-1 lg:static">
        {showPane ? (
          <>
            <MobileNav items={items} />
            <PaneToggleButton initialMode={paneMode} />
          </>
        ) : null}
        <Logo label={t("common.appShortName")} className="ml-1 min-w-0" />
        <form action="/search" role="search" className="mx-auto hidden w-full max-w-md px-4 md:block">
          <label htmlFor="global-search" className="sr-only">
            {t("common.search")}
          </label>
          <div className="relative">
            <input
              id="global-search"
              name="q"
              type="search"
              placeholder={t("common.searchPlaceholder")}
              className="h-8 w-full rounded-md border border-control-stroke border-b-control-stroke-strong bg-control pl-3 pr-9 text-sm placeholder:text-muted-foreground hover:bg-control-hover focus-visible:border-b-primary focus-visible:bg-control-focus focus-visible:shadow-[inset_0_-1px_0_hsl(var(--primary))] focus-visible:outline-none"
            />
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          </div>
        </form>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 md:ml-0">
          <Button asChild variant="ghost" size="icon" className="w-10 md:hidden" aria-label={t("common.search")}>
            <Link href="/search">
              <Search aria-hidden="true" />
            </Link>
          </Button>
          <LocaleSwitcher />
          <ThemeToggle />
          {user ? <Reminders items={reminders} /> : null}
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
