import * as React from "react";
import { cn } from "@/lib/utils";

/** WinUI InfoBar: tinted surface, 4px corners, status glyph in a filled circle. */
const styles = {
  info: "bg-tint-info text-primary",
  success: "bg-tint-success text-success",
  warning: "bg-tint-warning text-warning",
  destructive: "bg-tint-danger text-destructive",
} as const;

const glyphs = {
  info: (
    <>
      <circle cx="8" cy="5" r="1" fill="hsl(var(--background))" />
      <path d="M8 7.3v4" stroke="hsl(var(--background))" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  success: <path d="M4.9 8.3 7 10.3l4.1-4.5" fill="none" stroke="hsl(var(--background))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  warning: (
    <>
      <path d="M8 4.3v4.4" stroke="hsl(var(--background))" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="1" fill="hsl(var(--background))" />
    </>
  ),
  destructive: <path d="M5.7 5.7l4.6 4.6m0-4.6-4.6 4.6" stroke="hsl(var(--background))" strokeWidth="1.6" strokeLinecap="round" />,
} as const;

export function StatusGlyph({ variant, className }: { variant: keyof typeof styles; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("h-4 w-4 shrink-0", className)} aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      {glyphs[variant]}
    </svg>
  );
}

export function Alert({
  variant = "info",
  title,
  children,
  className,
  role,
  icon = true,
}: {
  variant?: keyof typeof styles;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  role?: "alert" | "status";
  icon?: boolean;
}) {
  return (
    <div role={role} className={cn("flex gap-3 rounded-md border border-stroke-card px-4 py-3 text-sm", styles[variant], className)}>
      {icon ? <StatusGlyph variant={variant} className="mt-0.5" /> : null}
      <div className="min-w-0 flex-1 space-y-0.5 text-foreground">
        {title ? <p className="font-semibold leading-5">{title}</p> : null}
        {children ? <div className="leading-5 [&_a]:text-primary [&_a]:underline">{children}</div> : null}
      </div>
    </div>
  );
}
