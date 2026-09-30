import type { Permission } from "@/modules/auth/permissions";

export type NavKey =
  | "dashboard"
  | "certifications"
  | "learn"
  | "practice"
  | "labs"
  | "plan"
  | "progress"
  | "tutor"
  | "bookmarks"
  | "flashcards"
  | "glossary"
  | "compare"
  | "concepts"
  | "admin"
  | "settings";

/** `footer` items are pinned to the bottom of the navigation pane (WinUI FooterMenuItems, Settings last). */
export type NavItem = { key: NavKey; href: string; group: "main" | "knowledge" | "footer"; permission?: Permission };

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/dashboard", group: "main" },
  { key: "certifications", href: "/certifications", group: "main" },
  { key: "learn", href: "/learn", group: "main" },
  { key: "practice", href: "/practice", group: "main" },
  { key: "labs", href: "/labs", group: "main" },
  { key: "plan", href: "/plan", group: "main" },
  { key: "progress", href: "/progress", group: "main" },
  { key: "tutor", href: "/tutor", group: "main" },
  { key: "bookmarks", href: "/bookmarks", group: "main" },
  { key: "flashcards", href: "/flashcards", group: "knowledge" },
  { key: "glossary", href: "/glossary", group: "knowledge" },
  { key: "compare", href: "/compare", group: "knowledge" },
  { key: "concepts", href: "/concepts", group: "knowledge" },
  { key: "admin", href: "/admin", group: "footer", permission: "content:read_drafts" },
  { key: "settings", href: "/settings", group: "footer" },
];

export function visibleNavItems(permissions: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.permission || permissions.includes(i.permission));
}

/** Cookie that remembers whether the navigation pane is expanded or compact (icons only). */
export const NAV_PANE_COOKIE = "fa-nav";
export type NavPaneMode = "expanded" | "compact";

export function parseNavPaneMode(value: string | undefined): NavPaneMode {
  return value === "compact" ? "compact" : "expanded";
}

/** Immersive pages (the lab VM) open with a compact pane so the workspace gets the width. */
export function isImmersivePath(pathname: string): boolean {
  return /^\/labs\/[^/]+$/.test(pathname);
}
