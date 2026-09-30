"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, runAction, type ActionResult } from "@/lib/actions";
import { getI18n } from "@/i18n/server";
import { authorize } from "@/modules/auth/session";
import { deleteTutorConversation, sendTutorMessage, tutorMessageSchema, type TutorConversationView, type TutorMessageView } from "@/modules/tutor/service";

export async function sendTutorMessageAction(input: unknown): Promise<ActionResult<{ conversation: TutorConversationView; assistant: TutorMessageView }>> {
  return runAction("tutor.send", async () => {
    const user = await authorize("learn:use");
    const i18n = await getI18n();
    const result = await sendTutorMessage(user, tutorMessageSchema.parse(input), i18n);
    revalidatePath("/tutor");
    return result;
  });
}

const deleteSchema = z.object({ conversationId: z.string().max(40) });

export async function deleteTutorConversationAction(input: unknown): Promise<ActionResult> {
  return runAction("tutor.deleteConversation", async () => {
    const user = await authorize("learn:use");
    const parsed = deleteSchema.parse(input);
    await deleteTutorConversation(user, parsed.conversationId);
    revalidatePath("/tutor");
    return undefined;
  });
}

export async function requireTutorEnabled(): Promise<void> {
  const user = await authorize("learn:use");
  if (!user.permissions.has("learn:use")) throw new ActionError("forbidden");
}
