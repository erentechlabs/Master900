import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, caption, children }: { className?: string; caption?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border">
      <table className={cn("w-full caption-bottom text-sm", className)}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y">{children}</tbody>;
}

export function TR({ className, children }: { className?: string; children: React.ReactNode }) {
  return <tr className={cn("align-top hover:bg-muted/30", className)}>{children}</tr>;
}

export function TH({ className, children, scope = "col" }: { className?: string; children?: React.ReactNode; scope?: "col" | "row" }) {
  return (
    <th scope={scope} className={cn("px-3 py-2.5 font-semibold", className)}>
      {children}
    </th>
  );
}

export function TD({ className, children, colSpan }: { className?: string; children?: React.ReactNode; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-3 py-2.5", className)}>
      {children}
    </td>
  );
}
