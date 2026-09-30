import Link from "next/link";
import { Search } from "lucide-react";
import { getI18n } from "@/i18n/server";
import type { CurrentUser } from "@/modules/auth/session";
import { getReminders } from "@/modules/learning/reminders";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { LocaleSwitcher, Reminders, ThemeToggle, UserMenu } from "./header-controls";
import { MobileNav, SidebarNav } from "./sidebar-nav";
import { SiteFooter } from "./site-footer";
import { visibleNavItems } from "./nav-items";

export async function AppShell({
  user,
  children,
  variant = "app",
}: {
  user: CurrentUser | null;
  children: React.ReactNode;
  variant?: "app" | "marketing";
}) {
  const { t } = await getI18n();
  const items = user ? visibleNavItems([...user.permissions]) : [];
  const reminders = user ? await getReminders(user, t) : [];
  const showSidebar = !!user && variant === "app";
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("common.skipToContent")}
      </a>
      <header className="no-print sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 lg:px-6">
          {showSidebar ? <MobileNav items={items} /> : null}
          <Logo label={t("common.appShortName")} />
          <form action="/search" role="search" className="ml-2 hidden max-w-md flex-1 md:flex">
            <label htmlFor="global-search" className="sr-only">
              {t("common.search")}
            </label>
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="global-search"
                name="q"
                type="search"
                placeholder={t("common.searchPlaceholder")}
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </form>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="md:hidden" aria-label={t("common.search")}>
              <Link href="/search">
                <Search className="h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <LocaleSwitcher />
            <ThemeToggle />
            {user ? (
              <>
                <Reminders items={reminders} />
                {variant === "marketing" ? (
                  <Button asChild size="sm" className="hidden sm:inline-flex">
                    <Link href="/dashboard">{t("nav.dashboard")}</Link>
                  </Button>
                ) : null}
                <UserMenu name={user.name} email={user.email} />
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link href="/certifications">{t("nav.certifications")}</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/sign-in">{t("common.signIn")}</Link>
                </Button>
                <Button asChild size="sm" className="hidden sm:inline-flex">
                  <Link href="/sign-up">{t("common.signUp")}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        {showSidebar ? (
          <aside className="no-print sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto border-r bg-card/40 px-3 py-5 lg:block">
            <SidebarNav items={items} />
          </aside>
        ) : null}
        {variant === "marketing" ? (
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
            {children}
          </main>
        ) : (
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
