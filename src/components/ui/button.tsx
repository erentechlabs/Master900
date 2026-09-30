import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * WinUI buttons: accent (default), standard (secondary/outline) with the elevation stroke (darker bottom edge),
 * subtle (ghost), hyperlink (link) and status fills. 32px control height, 4px corners, 16px icons.
 */
export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-[inset_0_-1px_0_var(--accent-stroke-bottom)] hover:bg-primary/90 active:bg-primary/80 active:text-primary-foreground/80 active:shadow-none",
        secondary:
          "border-control-stroke border-b-control-stroke-bottom bg-control text-foreground hover:bg-control-hover active:border-b-control-stroke active:bg-control-pressed active:text-muted-foreground",
        outline:
          "border-control-stroke border-b-control-stroke-bottom bg-control text-foreground hover:bg-control-hover active:border-b-control-stroke active:bg-control-pressed active:text-muted-foreground",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-subtle-hover active:bg-subtle-pressed active:text-muted-foreground",
        link: "border-transparent px-1 text-primary underline-offset-4 hover:underline active:opacity-80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-[inset_0_-1px_0_var(--accent-stroke-bottom)] hover:bg-destructive/90 active:bg-destructive/80 active:shadow-none",
        success:
          "border-transparent bg-success text-success-foreground shadow-[inset_0_-1px_0_var(--accent-stroke-bottom)] hover:bg-success/90 active:bg-success/80 active:shadow-none",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5 text-[13px]",
        lg: "h-10 px-5",
        icon: "h-8 w-8",
        iconSm: "h-7 w-7",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, type, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} type={asChild ? undefined : (type ?? "button")} {...props} />;
});
Button.displayName = "Button";
