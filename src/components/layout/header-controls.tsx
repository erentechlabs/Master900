"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTheme } from "next-themes";
import { Bell, Languages, Monitor, Moon, Sun } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { LOCALE_LABELS, LOCALES } from "@/i18n/config";
import { setLocaleAction } from "@/app/actions/locale";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/radix";

export function LocaleSwitcher() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="w-10" aria-label={t("common.changeLanguage")} disabled={pending}>
          <Languages className="h-5 w-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) =>
            start(async () => {
              await setLocaleAction(value);
              router.refresh();
            })
          }
        >
          {LOCALES.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l}>
              {LOCALE_LABELS[l]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeToggle() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="w-10" aria-label={t("common.toggleTheme")}>
          <Sun className="h-5 w-5 dark:hidden" aria-hidden="true" />
          <Moon className="hidden h-5 w-5 dark:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden="true" />
            {t("common.themeLight")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden="true" />
            {t("common.themeDark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden="true" />
            {t("common.themeSystem")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type ReminderView = { id: string; text: string; href: string };

export function Reminders({ items }: { items: ReminderView[] }) {
  const { t } = useI18n();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative w-10" aria-label={`${t("nav.reminders")} (${items.length})`}>
          <Bell className="h-5 w-5" aria-hidden="true" />
          {items.length > 0 ? (
            <span className="absolute right-1 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {items.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="mb-2 font-display text-base font-semibold">{t("nav.reminders")}</p>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("nav.noReminders")}</p>
        ) : (
          <ul className="space-y-1">
            {items.map((r) => (
              <li key={r.id}>
                <Link href={r.href} className="block rounded-md px-3 py-2 text-sm hover:bg-subtle-hover active:bg-subtle-pressed">
                  {r.text}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
