"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enforceRateLimit, runAction, type ActionResult } from "@/lib/actions";
import { authorize } from "@/modules/auth/session";
import { claimQuest } from "@/modules/analytics/quest-service";

const claimSchema = z.object({ questKey: z.string().min(1).max(80) });

export async function claimQuestReward(input: unknown): Promise<ActionResult<{ claimed: boolean; bonusAwarded?: boolean }>> {
  return runAction("dashboard.claimQuest", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const { questKey } = claimSchema.parse(input);
    const result = await claimQuest(user.id, questKey, user.preference?.timezone ?? "UTC", new Date(), prisma);
    revalidatePath("/dashboard");
    revalidatePath("/progress");
    return { claimed: result.claimed, bonusAwarded: result.bonusAwarded };
  });
}
