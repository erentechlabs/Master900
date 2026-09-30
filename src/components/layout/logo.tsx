import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

/** Product mark: a graduation cap on a blue-to-purple tile (intentionally not resembling any Microsoft logo). */
export function Logo({ className, label = "Fundamentals Academy" }: { className?: string; label?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 rounded-md font-semibold tracking-tight", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-blue to-brand-purple text-white shadow-sm">
        <GraduationCap className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="hidden text-base sm:inline">{label}</span>
    </Link>
  );
}
