import * as React from "react";
import { cn } from "@/lib/utils";

/** WinUI ProgressBar: 1px track with a 3-4px rounded accent indicator. */
export function Progress({
  value,
  max = 100,
  label,
  className,
  indicatorClassName,
  style,
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
  indicatorClassName?: string;
  style?: React.CSSProperties;
}) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className={cn("relative h-1 w-full rounded-full", className)}
    >
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[hsl(var(--input))] opacity-70" aria-hidden="true" />
      <div className={cn("relative h-full rounded-full bg-primary transition-[width] duration-300 ease-fluent", indicatorClassName)} style={{ width: `${pct}%`, ...style }} />
    </div>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden="true" {...props} />;
}

export function Separator({ className, orientation = "horizontal" }: { className?: string; orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn("shrink-0 bg-stroke-divider", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
    />
  );
}

/** WinUI ProgressRing (indeterminate). */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2", className)}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent border-t-transparent" aria-hidden="true" />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-control-stroke border-b-control-stroke-strong bg-control px-1.5 py-0.5 font-mono text-[11px]">{children}</kbd>;
}
