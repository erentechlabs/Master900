import * as React from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

/** Page title (WinUI "Title", 28px semibold) with an optional caption above and a description below. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow ? <div className="text-sm text-primary">{eyebrow}</div> : null}
        <h1 className="font-display text-[24px] font-semibold leading-8 sm:text-title">{title}</h1>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: { label: string; href: string };
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border bg-card px-6 py-10 text-center", className)}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-tint-brand text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="font-display text-base font-semibold">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? (
        <Button asChild className="mt-5">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-tint-brand text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** Section heading (WinUI "Subtitle", 20px semibold). */
export function SectionTitle({ children, action, id }: { children: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 id={id} className="font-display text-subtitle">
        {children}
      </h2>
      {action}
    </div>
  );
}
