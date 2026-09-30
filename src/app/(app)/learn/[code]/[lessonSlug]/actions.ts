"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, enforceRateLimit, type ActionResult } from "@/lib/actions";
import { authorize } from "@/modules/auth/session";
import { completeLesson } from "@/modules/learning/lesson";
import { noteInputSchema, saveLessonNote } from "@/modules/learning/notes";

const completeSchema = z.object({ lessonId: z.string().min(1).max(80) });

export async function completeLessonAction(input: unknown): Promise<ActionResult<{ completed: boolean; xp: number }>> {
  return runAction("lesson.complete", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const data = completeSchema.parse(input);
    const result = await completeLesson(user, data.lessonId);
    revalidatePath("/learn");
    return { completed: result.completed, xp: result.xp ?? 0 };
  });
}

export async function saveNoteAction(input: unknown): Promise<ActionResult> {
  return runAction("lesson.note", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const data = noteInputSchema.parse(input);
    await saveLessonNote(user.id, data);
    revalidatePath("/bookmarks");
    return undefined;
  });
}

export async function saveNoteFormAction(lessonId: string, formData: FormData): Promise<void> {
  const user = await authorize("learn:use");
  enforceRateLimit("mutation", user.id);
  await saveLessonNote(user.id, noteInputSchema.parse({ lessonId, body: String(formData.get("body") ?? "") }));
  revalidatePath("/bookmarks");
}

export async function completeLessonFormAction(lessonId: string): Promise<void> {
  const user = await authorize("learn:use");
  enforceRateLimit("mutation", user.id);
  await completeLesson(user, lessonId);
  revalidatePath("/learn");
}
