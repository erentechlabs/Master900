import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

type Db = PrismaClient | Prisma.TransactionClient;
type Actor = { id: string; email: string } | null;

async function requestMetadata(): Promise<Record<string, string>> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
    const salt = process.env.APP_URL ?? "fundamentals-academy";
    return {
      ipHash: createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16),
      userAgent: (h.get("user-agent") ?? "").slice(0, 160),
    };
  } catch {
    return {};
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Record an administrative or content action in the audit log. Never throws. */
export async function audit(
  actor: Actor,
  action: string,
  details: { entityType?: string; entityId?: string; summary?: string; before?: unknown; after?: unknown; metadata?: Record<string, unknown> } = {},
  db: Db = prisma,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        action,
        entityType: details.entityType,
        entityId: details.entityId,
        summary: details.summary?.slice(0, 500),
        before: toJson(details.before),
        after: toJson(details.after),
        metadata: toJson({ ...(await requestMetadata()), ...details.metadata }),
      },
    });
    logger.info("audit", { action, entityType: details.entityType, entityId: details.entityId, actorId: actor?.id });
  } catch (error) {
    logger.error("audit.failed", { action, error });
  }
}
