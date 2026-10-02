import "server-only";
import { Prisma, type LabType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { labProductFromParts, type LabProductInfo } from "./products";

/**
 * Loads only the product-related JSON paths of many labs. Lab configs are large (whole simulated portals), so list
 * pages must not select `config` just to show the product name.
 */
export async function loadLabProducts(labIds: readonly string[]): Promise<Map<string, LabProductInfo>> {
  const ids = [...new Set(labIds)];
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw<{ id: string; type: LabType; name: string | null; theme: string | null; apps: unknown }[]>(Prisma.sql`
    SELECT "id", "type"::text AS "type", "config" #>> '{portal,name}' AS "name", "config" #>> '{portal,theme}' AS "theme", "config" #> '{vm,apps}' AS "apps"
    FROM "Lab"
    WHERE "id" IN (${Prisma.join(ids)})
  `);
  return new Map(rows.map((row) => [row.id, labProductFromParts(row.type, row.name, row.theme, row.apps)]));
}
