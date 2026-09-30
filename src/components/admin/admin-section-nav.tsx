"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Admin sections as a WinUI SelectorBar: text items with an accent pill under the current one. */
export function AdminSectionNav({ label, sections }: { label: string; sections: { key: string; href: string; label: string }[] }) {
  const pathname = usePathname();
  const current = [...sections].sort((a, b) => b.href.length - a.href.length).find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
  return (
    <nav aria-label={label} className="-mx-1 flex flex-wrap gap-x-1 border-b border-stroke-divider px-1 pb-1">
      {sections.map((section) => {
        const active = current?.key === section.key;
        return (
          <Link
            key={section.key}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm transition-colors hover:bg-subtle-hover active:bg-subtle-pressed",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {section.label}
            <span aria-hidden="true" className={cn("absolute bottom-0.5 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-primary", active ? "opacity-100" : "opacity-0")} />
          </Link>
        );
      })}
    </nav>
  );
}
