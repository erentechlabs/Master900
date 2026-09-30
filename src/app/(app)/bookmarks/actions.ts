"use server";

import { revalidatePath } from "next/cache";
import { ActionError, enforceRateLimit, runAction, type ActionResult } from "@/lib/actions";
import { authorize } from "@/modules/auth/session";
import { bookmarkInputSchema, toggleBookmark } from "@/modules/learning/bookmarks";

export async function toggleBookmarkAction(input: unknown): Promise<ActionResult<{ bookmarked: boolean }>> {
  return runAction("bookmarks.toggle", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const result = await toggleBookmark(user.id, bookmarkInputSchema.parse(input));
    if (result.missing) throw new ActionError("not_found");
    revalidatePath("/bookmarks");
    return { bookmarked: result.bookmarked };
  });
}
