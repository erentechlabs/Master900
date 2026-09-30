import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect, unstable_rethrow } from "next/navigation";
import type { UserPreference } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { authOptions } from "./options";
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

/**
 * The authenticated user for this request, loaded from the database so that
 * role changes, suspensions and session revocation take effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch (error) {
    // Let Next.js internals (dynamic rendering bailout, redirects) propagate.
    unstable_rethrow(error);
    logger.warn("auth.session_error", { error });
    return null;
  }
  if (!session?.user?.id) return null;
  const id = session.user.id;
  const user = await prisma.user.findUnique({
    where: { id },
    include: { roles: { include: { role: true } }, preference: true },
  });
  if (!user || user.status !== "ACTIVE" || user.sessionVersion !== session.sv) return null;

  if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 5 * 60_000) {
    prisma.user.update({ where: { id }, data: { lastActiveAt: new Date() } }).catch(() => undefined);
  }
  const roles = user.roles.map((r) => r.role.key as RoleKeyValue);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale,
    isDemo: user.isDemo,
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

/** For pages: redirect to sign-in when there is no session. */
export async function requireUser(callbackUrl?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`);
  return user;
}

/** For pages: require a permission or show the access-denied page. */
export async function requirePermission(permission: Permission, callbackUrl?: string): Promise<CurrentUser> {
  const user = await requireUser(callbackUrl);
  if (!user.permissions.has(permission)) redirect("/forbidden");
  return user;
}

/** For server actions and route handlers: throw instead of redirecting. */
export async function authorize(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("unauthorized");
  if (permission && !user.permissions.has(permission)) throw new AuthorizationError("forbidden");
  return user;
}

export function can(user: Pick<CurrentUser, "permissions"> | null, permission: Permission): boolean {
  return !!user && user.permissions.has(permission);
}
