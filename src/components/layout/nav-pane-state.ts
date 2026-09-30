"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { isImmersivePath, NAV_PANE_COOKIE, parseNavPaneMode, type NavPaneMode } from "./nav-items";

/**
 * Navigation pane state shared by the pane and the title-bar toggle: the user's preference (cookie, so the server
 * renders the right width) and a per-visit override on immersive pages, which start compact.
 */
let preference: NavPaneMode | null = null;
let immersiveExpanded = false;
const listeners = new Set<() => void>();

function readPreference(): NavPaneMode {
  if (preference) return preference;
  const match = typeof document === "undefined" ? null : new RegExp(`(?:^|; )${NAV_PANE_COOKIE}=([^;]+)`).exec(document.cookie);
  preference = parseNavPaneMode(match?.[1]);
  return preference;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return `${readPreference()}|${immersiveExpanded ? 1 : 0}`;
}

/** Effective pane mode for the current page and a toggle that updates the right setting. */
export function useNavPane(initialPreference: NavPaneMode): { mode: NavPaneMode; toggle: () => void } {
  const pathname = usePathname();
  const immersive = isImmersivePath(pathname);
  const state = React.useSyncExternalStore(subscribe, snapshot, () => `${initialPreference}|0`);
  const [pref, override] = state.split("|") as [NavPaneMode, string];
  const lastPath = React.useRef(pathname);

  React.useEffect(() => {
    // The override only lasts while the learner stays on the immersive page.
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      if (immersiveExpanded) {
        immersiveExpanded = false;
        emit();
      }
    }
  }, [pathname]);

  const mode: NavPaneMode = immersive ? (override === "1" ? "expanded" : "compact") : pref;
  const toggle = React.useCallback(() => {
    if (isImmersivePath(window.location.pathname)) {
      immersiveExpanded = !immersiveExpanded;
    } else {
      preference = readPreference() === "compact" ? "expanded" : "compact";
      document.cookie = `${NAV_PANE_COOKIE}=${preference}; path=/; max-age=31536000; samesite=lax`;
    }
    emit();
  }, []);
  return { mode, toggle };
}
