import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Fluent badges: 4px corners, caption text, tinted status backgrounds. */
export const badgeVariants = cva(
  "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded border px-1.5 text-xs font-semibold leading-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-control-stroke bg-control text-foreground",
        success: "border-transparent bg-tint-success text-success",
        warning: "border-transparent bg-tint-warning text-warning",
        destructive: "border-transparent bg-tint-danger text-destructive",
        info: "border-transparent bg-tint-brand text-primary",
        purple: "border-transparent bg-accent text-accent-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
