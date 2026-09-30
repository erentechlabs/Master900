import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserPreference } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureLocalUser } from "./local-user";
import { permissionsFor, type Permission, type RoleKeyValue } from "./permissions";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  isDemo: boolean;
  createdAt: Date;
  onboardingCompletedAt: Date | null;
  roles: RoleKeyValue[];
  permissions: Set<Permission>;
  preference: UserPreference | null;
};

/** The single local learner/admin profile for this request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const user = await ensureLocalUser(prisma);
  const roles = user.roles.map((r) => r.role.key as RoleKeyValue);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale,
    isDemo: false,
    createdAt: user.createdAt,
    onboardingCompletedAt: user.onboardingCompletedAt,
    roles,
    permissions: permissionsFor(roles),
    preference: user.preference,
  };
});

export class AuthorizationError extends Error {
  constructor(public readonly code: "unauthorized" | "forbidden") {
    super(code);
    this.name = "AuthorizationError";
  }
}

/** For pages: return the local profile. The legacy redirect URL argument is ignored. */
export async function requireUser(_redirectUrl?: string): Promise<CurrentUser> {
  return getCurrentUser();
}

/** For pages: require a permission or show the access-denied page. */
export async function requirePermission(permission: Permission, _redirectUrl?: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.permissions.has(permission)) redirect("/forbidden");
  return user;
}

/** For server actions and route handlers: throw instead of redirecting. */
export async function authorize(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (permission && !user.permissions.has(permission)) throw new AuthorizationError("forbidden");
  return user;
}

export function can(user: Pick<CurrentUser, "permissions"> | null, permission: Permission): boolean {
  return !!user && user.permissions.has(permission);
}
