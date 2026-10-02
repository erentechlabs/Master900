"use server";

import { revalidatePath } from "next/cache";
import { runAction, enforceRateLimit, type ActionResult } from "@/lib/actions";
import { authorize } from "@/modules/auth/session";
import { flashcardReviewSchema, reviewFlashcard } from "@/modules/learning/flashcards";

export async function reviewFlashcardAction(input: unknown): Promise<ActionResult<{ reviewed: boolean; dueAt: string | null }>> {
  return runAction("flashcards.review", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const data = flashcardReviewSchema.parse(input);
    const result = await reviewFlashcard(user, data.flashcardId, data.rating);
    revalidatePath("/flashcards");
    return { reviewed: result.reviewed, dueAt: result.dueAt?.toISOString() ?? null };
  });
}
