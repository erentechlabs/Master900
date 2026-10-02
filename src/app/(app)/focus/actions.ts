"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError, enforceRateLimit, runAction, type ActionResult } from "@/lib/actions";
import { authorize } from "@/modules/auth/session";
import { awardBadges } from "@/modules/analytics/data";
import { XP_RULES } from "@/modules/analytics/gamification";
import { getFocusTodayStats, type FocusTodayStats } from "@/modules/learning/focus";
import { isPlausibleFocusCompletion } from "@/components/focus/focus-timer";

const completionSchema = z.object({ minutes: z.coerce.number().int().min(1).max(120), clientSessionId: z.string().trim().min(3).max(80) });

export async function completeFocusSessionAction(input: unknown): Promise<ActionResult<FocusTodayStats & { xp: number }>> {
  return runAction("focus.complete", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const parsed = completionSchema.parse(input);
    const tz = user.preference?.timezone ?? "UTC";
    const now = new Date();
    const existing = await prisma.learningEvent.findFirst({
      where: { userId: user.id, type: "FOCUS_SESSION_COMPLETED", metadata: { path: ["clientSessionId"], equals: parsed.clientSessionId } },
      select: { id: true },
    });
    if (!existing) {
      const stats = await getFocusTodayStats(user.id, tz, now);
      if (!isPlausibleFocusCompletion(parsed.minutes, stats.sessions, now)) throw new ActionError("invalid_input");
      await prisma.learningEvent.create({
        data: {
          userId: user.id,
          type: "FOCUS_SESSION_COMPLETED",
          xp: XP_RULES.focusSession,
          durationSeconds: null,
          metadata: { minutes: parsed.minutes, clientSessionId: parsed.clientSessionId } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
      await awardBadges(prisma, user.id, tz, now);
    }
    revalidatePath("/", "layout");
    return { ...(await getFocusTodayStats(user.id, tz, now)), xp: XP_RULES.focusSession };
  });
}
