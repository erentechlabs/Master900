import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * WinUI TextBox / ComboBox: 32px, 4px corners, subtle stroke with a stronger bottom edge that turns into the 2px accent
 * underline on focus (the focus indicator of text inputs).
 */
const fieldBase =
  "flex w-full rounded-md border border-control-stroke border-b-control-stroke-strong bg-control px-[11px] text-sm text-foreground transition-colors duration-100 placeholder:text-muted-foreground hover:bg-control-hover focus-visible:border-b-primary focus-visible:bg-control-focus focus-visible:shadow-[inset_0_-1px_0_hsl(var(--primary))] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-b-destructive aria-[invalid=true]:shadow-[inset_0_-1px_0_hsl(var(--destructive))] read-only:hover:bg-control";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type = "text", ...props }, ref) => (
  <input ref={ref} type={type} className={cn(fieldBase, "h-8", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-[90px] py-[6px]", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, "win-select h-8 cursor-pointer pr-8", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm leading-5", className)} {...props} />;
}

/** WinUI CheckBox / RadioButton (styled globally in globals.css). */
export const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(({ className, ...props }, ref) => (
  <input ref={ref} type="checkbox" className={cn("shrink-0", className)} {...props} />
));
Checkbox.displayName = "Checkbox";

export const Radio = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(({ className, ...props }, ref) => (
  <input ref={ref} type="radio" className={cn("shrink-0", className)} {...props} />
));
Radio.displayName = "Radio";

/** Accessible form field wrapper: label, hint and error wired with aria-describedby. */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean; required?: boolean }>;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="block">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {React.cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
