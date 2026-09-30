import * as React from "react";
import { cn } from "@/lib/utils";

/** WinUI card: card fill on the content layer, 1px stroke, 8px corners, no shadow. */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground", className)} {...props} />
));
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1 p-4 sm:p-5", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

/** Body Strong (14px semibold) as in WinUI card headers. */
export function CardTitle({ className, as: Tag = "h3", ...props }: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h1" | "h2" | "h3" | "h4" }) {
  return <Tag className={cn("text-sm font-semibold leading-5", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0 sm:p-5 sm:pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 p-4 pt-0 sm:p-5 sm:pt-0", className)} {...props} />;
}
