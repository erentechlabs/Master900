import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const noteInputSchema = z.object({ lessonId: z.string().min(1).max(80), body: z.string().trim().max(5000) });

export async function saveLessonNote(userId: string, input: z.infer<typeof noteInputSchema>) {
  const lesson = await prisma.lesson.findUnique({ where: { id: input.lessonId }, select: { id: true, certificationId: true } });
  if (!lesson) return null;
  if (!input.body) {
    await prisma.note.deleteMany({ where: { userId, lessonId: lesson.id } });
    return null;
  }
  const existing = await prisma.note.findFirst({ where: { userId, lessonId: lesson.id }, select: { id: true } });
  if (existing) return prisma.note.update({ where: { id: existing.id }, data: { body: input.body } });
  return prisma.note.create({ data: { userId, lessonId: lesson.id, certificationId: lesson.certificationId, body: input.body } });
}
