"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FlaskConical, GraduationCap, Library, MousePointer2, Search } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translator";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

type Suggestion = { id: string; title: string; href: string; group: "goTo" | "lessons" | "labs" | "glossary" | "certifications"; description?: string };
type SuggestionGroup = { key: Suggestion["group"]; items: Suggestion[] };

const GROUP_ICON = { goTo: MousePointer2, lessons: BookOpen, labs: FlaskConical, glossary: Library, certifications: GraduationCap } as const;

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable || !!target.closest('[data-terminal], [data-sql-editor], [role="textbox"]');
}

export function TitleSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [groups, setGroups] = React.useState<SuggestionGroup[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const list = groups.flatMap((group) => group.items.map((item) => ({ group: group.key, item })));

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setExpanded(true);
        inputRef.current?.focus();
      } else if (event.key === "/") {
        event.preventDefault();
        setExpanded(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { groups: [] }))
        .then((data: { groups: SuggestionGroup[] }) => {
          setGroups(data.groups ?? []);
          setActive(0);
        })
        .catch(() => {});
    }, query ? 160 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  const commit = (href: string) => {
    setOpen(false);
    inputRef.current?.blur();
    router.push(href);
  };

  const submit = () => {
    const selected = list[active]?.item;
    if (selected) commit(selected.href);
    else if (query.trim()) commit(`/search?q=${encodeURIComponent(query.trim())}`);
    else commit("/search");
  };

  return (
    <div className={cn("relative mx-auto w-full max-w-md px-1 md:px-4", expanded ? "block" : "hidden md:block")}>
      <label htmlFor="global-search" className="sr-only">{t("common.search")}</label>
      <div className="relative">
        <input
          ref={inputRef}
          id="global-search"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-listbox"
          aria-activedescendant={open && list[active] ? `suggestion-${list[active].item.id}` : undefined}
          name="q"
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, Math.max(0, list.length - 1))); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
            else if (event.key === "Enter") { event.preventDefault(); submit(); }
            else if (event.key === "Escape") { setOpen(false); setExpanded(false); }
          }}
          placeholder={t("common.searchPlaceholder")}
          className="h-8 w-full rounded-md border border-control-stroke border-b-control-stroke-strong bg-control pl-3 pr-24 text-sm placeholder:text-muted-foreground hover:bg-control-hover focus-visible:border-b-primary focus-visible:bg-control-focus focus-visible:shadow-[inset_0_-1px_0_hsl(var(--primary))] focus-visible:outline-none"
        />
        <div className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-muted-foreground lg:flex">
          <Kbd>Ctrl</Kbd><Kbd>K</Kbd>
        </div>
      </div>
      {open ? (
        <div id="global-search-listbox" role="listbox" className="acrylic-surface absolute left-1 right-1 top-10 z-50 max-h-[70vh] overflow-auto rounded-lg border border-stroke-surface p-2 shadow-lg md:left-4 md:right-4">
          {groups.length ? groups.map((group) => {
            const Icon = GROUP_ICON[group.key];
            return (
              <div key={group.key} className="py-1">
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{t(`shell.search${group.key[0].toUpperCase()}${group.key.slice(1)}` as MessageKey)}</div>
                {group.items.map((item) => {
                  const index = list.findIndex((entry) => entry.item.id === item.id && entry.group === group.key);
                  return (
                    <button key={`${group.key}-${item.id}`} id={`suggestion-${item.id}`} role="option" aria-selected={index === active} type="button" className={cn("block w-full rounded-md px-3 py-2 text-left text-sm", index === active ? "bg-subtle-hover" : "hover:bg-subtle-hover")} onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => commit(item.href)}>
                      <span className="block font-medium">{item.title}</span>
                      {item.description ? <span className="line-clamp-1 block text-xs text-muted-foreground">{item.description}</span> : null}
                    </button>
                  );
                })}
              </div>
            );
          }) : <p className="px-3 py-2 text-sm text-muted-foreground">{t("shell.searchNoResults")}</p>}
        </div>
      ) : null}
      <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-0 w-8 md:hidden" aria-label={t("common.close")} onClick={() => setExpanded(false)}>
        <Search className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function MobileSearchButton() {
  const { t } = useI18n();
  return <Button variant="ghost" size="icon" className="w-10 md:hidden" aria-label={t("common.search")} onClick={() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "/" })); }}><Search aria-hidden="true" /></Button>;
}
