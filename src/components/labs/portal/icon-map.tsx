"use client";

import * as React from "react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PORTAL_ICON_NAMES, type PortalIconName } from "@/modules/labs/engine/ui-simulation";
import { cn } from "@/lib/utils";

export const PORTAL_ICONS = Object.fromEntries(PORTAL_ICON_NAMES.map((name) => [name, LucideIcons[name] as LucideIcon])) as Record<PortalIconName, LucideIcon>;

/** Renders the named portal icon; nothing when no name is given (unless a fallback icon is passed). */
export function PortalIcon({ name, className, fallback: Fallback }: { name?: PortalIconName; className?: string; fallback?: LucideIcon }) {
  const Icon = name ? PORTAL_ICONS[name] : Fallback;
  if (!Icon) return null;
  return <Icon className={cn("h-4 w-4", className)} aria-hidden="true" />;
}
