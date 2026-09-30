/**
 * Role-based access control. Permissions are defined in code (not in the
 * database) so that a database edit cannot silently grant new capabilities.
 */
export const ROLE_KEYS = ["LEARNER", "INSTRUCTOR", "ADMIN"] as const;
export type RoleKeyValue = (typeof ROLE_KEYS)[number];

export const PERMISSIONS = [
  "learn:use",
  "content:read_drafts",
  "content:edit",
  "content:review",
  "content:publish",
  "content:import",
  "content:export",
  "questions:edit",
  "labs:edit",
  "ai:generate_drafts",
  "analytics:view_anonymous",
  "catalog:manage",
  "users:manage",
  "roles:assign",
  "audit:view",
  "settings:manage",
  "ai:configure",
  "jobs:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const INSTRUCTOR_PERMISSIONS: readonly Permission[] = [
  "learn:use",
  "content:read_drafts",
  "content:edit",
  "content:review",
  "content:publish",
  "content:import",
  "content:export",
  "questions:edit",
  "labs:edit",
  "ai:generate_drafts",
  "analytics:view_anonymous",
];

export const ROLE_PERMISSIONS: Record<RoleKeyValue, readonly Permission[]> = {
  LEARNER: ["learn:use"],
  INSTRUCTOR: INSTRUCTOR_PERMISSIONS,
  ADMIN: PERMISSIONS,
};

export function isRoleKey(value: unknown): value is RoleKeyValue {
  return typeof value === "string" && (ROLE_KEYS as readonly string[]).includes(value);
}

export function permissionsFor(roles: readonly string[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) {
    if (!isRoleKey(role)) continue;
    for (const p of ROLE_PERMISSIONS[role]) set.add(p);
  }
  return set;
}

export function hasPermission(roles: readonly string[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

export function hasAnyPermission(roles: readonly string[], permissions: readonly Permission[]): boolean {
  const set = permissionsFor(roles);
  return permissions.some((p) => set.has(p));
}

/** Can the actor change the given user's roles? Admins cannot remove their own admin role (lock-out protection). */
export function canAssignRoles(
  actorRoles: readonly string[],
  actorId: string,
  targetId: string,
  nextRoles: readonly string[],
): { ok: true } | { ok: false; reason: "forbidden" | "self_demotion" | "invalid_role" | "empty" } {
  if (!hasPermission(actorRoles, "roles:assign")) return { ok: false, reason: "forbidden" };
  if (nextRoles.length === 0) return { ok: false, reason: "empty" };
  if (!nextRoles.every(isRoleKey)) return { ok: false, reason: "invalid_role" };
  if (actorId === targetId && !nextRoles.includes("ADMIN")) return { ok: false, reason: "self_demotion" };
  return { ok: true };
}

/** Admin area sections and the permission required to see them. */
export const ADMIN_SECTIONS = [
  { key: "overview", href: "/admin", permission: "content:read_drafts" },
  { key: "certifications", href: "/admin/certifications", permission: "catalog:manage" },
  { key: "content", href: "/admin/content", permission: "content:edit" },
  { key: "questions", href: "/admin/questions", permission: "questions:edit" },
  { key: "labs", href: "/admin/labs", permission: "labs:edit" },
  { key: "reviews", href: "/admin/reviews", permission: "content:review" },
  { key: "analytics", href: "/admin/analytics", permission: "analytics:view_anonymous" },
  { key: "importExport", href: "/admin/import-export", permission: "content:import" },
  { key: "users", href: "/admin/users", permission: "users:manage" },
  { key: "audit", href: "/admin/audit", permission: "audit:view" },
  { key: "jobs", href: "/admin/jobs", permission: "jobs:manage" },
  { key: "settings", href: "/admin/settings", permission: "settings:manage" },
] as const satisfies readonly { key: string; href: string; permission: Permission }[];

export function visibleAdminSections(roles: readonly string[]) {
  const set = permissionsFor(roles);
  return ADMIN_SECTIONS.filter((s) => set.has(s.permission));
}
