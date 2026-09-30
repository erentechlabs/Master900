import "server-only";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";
import { limitBy, type RateLimitName } from "@/lib/rate-limit";
import { AuthorizationError } from "@/modules/auth/session";

/** Standard result returned by server actions (serializable). */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export class ActionError extends Error {
  constructor(
    public readonly code: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(code);
    this.name = "ActionError";
  }
}

export function fieldErrorsFromZod(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  } catch {
    return "local";
  }
}

/** Enforce a named rate limit for a key (user id or IP). Throws ActionError("rate_limited"). */
export function enforceRateLimit(name: RateLimitName, key: string) {
  if (!limitBy(name, key).ok) throw new ActionError("rate_limited");
}

/** Wrap server action logic: maps auth, validation and known errors to ActionResult. */
export async function runAction<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    // Next.js control flow (redirect / notFound / dynamic bailout) must propagate.
    unstable_rethrow(error);
    if (error instanceof AuthorizationError) return { ok: false, error: error.code };
    if (error instanceof ActionError) return { ok: false, error: error.code, fieldErrors: error.fieldErrors };
    if (error instanceof ZodError) return { ok: false, error: "invalid_input", fieldErrors: fieldErrorsFromZod(error) };
    logger.error("action.failed", { action: name, error });
    return { ok: false, error: "unknown" };
  }
}
