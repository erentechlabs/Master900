import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = {
  info: "border-primary/30 bg-primary/5 text-foreground [&_svg]:text-primary",
  success: "border-success/30 bg-success/5 text-foreground [&_svg]:text-success",
  warning: "border-warning/40 bg-warning/10 text-foreground [&_svg]:text-warning",
  destructive: "border-destructive/40 bg-destructive/5 text-foreground [&_svg]:text-destructive",
} as const;

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, destructive: XCircle } as const;

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
  const Icon = icons[variant];
  return (
    <div role={role} className={cn("flex gap-3 rounded-lg border p-4 text-sm", styles[variant], className)}>
      {icon ? <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold leading-tight">{title}</p> : null}
        {children ? <div className="text-muted-foreground [&_a]:text-primary [&_a]:underline">{children}</div> : null}
      </div>
    </div>
  );
}
