import * as React from "react";
import { cn } from "@/lib/utils";

/** List/data table on a card surface: sentence-case caption headers, dividers, subtle row hover. */
export function Table({ className, caption, children }: { className?: string; caption?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border bg-card">
      <table className={cn("w-full caption-bottom text-sm", className)}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b text-left text-xs font-semibold text-muted-foreground">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-[color:var(--divider)]">{children}</tbody>;
}

export function TR({ className, children }: { className?: string; children: React.ReactNode }) {
  return <tr className={cn("align-top transition-colors hover:bg-subtle-hover", className)}>{children}</tr>;
}

export function TH({ className, children, scope = "col" }: { className?: string; children?: React.ReactNode; scope?: "col" | "row" }) {
  return (
    <th scope={scope} className={cn("px-3 py-2 font-semibold", className)}>
      {children}
    </th>
  );
}

export function TD({ className, children, colSpan }: { className?: string; children?: React.ReactNode; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-3 py-2", className)}>
      {children}
    </td>
  );
}
