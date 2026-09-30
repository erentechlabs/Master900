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
  | "admin";

export type NavItem = { key: NavKey; href: string; group: "main" | "knowledge" | "admin"; permission?: Permission };

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
  { key: "admin", href: "/admin", group: "admin", permission: "content:read_drafts" },
];

export function visibleNavItems(permissions: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.permission || permissions.includes(i.permission));
}
