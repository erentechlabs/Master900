import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

/** App icon and title as shown in a WinUI title bar (graduation cap tile; intentionally not resembling any Microsoft logo). */
export function Logo({ className, label = "Fundamentals Academy" }: { className?: string; label?: string }) {
  return (
    <Link href="/" className={cn("flex h-8 items-center gap-3 rounded-md px-1", className)}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-gradient-to-br from-[#0078d4] to-[#6b4fbb] text-white">
        <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="truncate text-xs">{label}</span>
    </Link>
  );
}
