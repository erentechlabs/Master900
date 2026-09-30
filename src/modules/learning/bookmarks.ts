import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import type { BookmarkTarget } from "@prisma/client";

export const bookmarkInputSchema = z.object({ targetType: z.enum(["CERTIFICATION", "LESSON", "QUESTION", "LAB", "GLOSSARY"]), targetId: z.string().min(1).max(80) });
export type BookmarkInput = z.infer<typeof bookmarkInputSchema>;

export async function validateBookmarkTarget(input: BookmarkInput): Promise<boolean> {
  switch (input.targetType) {
    case "CERTIFICATION":
      return (await prisma.certification.count({ where: { id: input.targetId, isVisible: true } })) > 0;
    case "LESSON":
      return (await prisma.lesson.count({ where: { id: input.targetId, AND: [learnerVisibleWhere()] } })) > 0;
    case "QUESTION":
      return (await prisma.question.count({ where: { id: input.targetId, AND: [learnerVisibleWhere()] } })) > 0;
    case "LAB":
      return (await prisma.lab.count({ where: { id: input.targetId, AND: [learnerVisibleWhere()] } })) > 0;
    case "GLOSSARY":
      return (await prisma.glossaryTerm.count({ where: { id: input.targetId, status: { in: ["PUBLISHED", "OUTDATED"] } } })) > 0;
  }
}

export async function toggleBookmark(userId: string, input: BookmarkInput) {
  if (!(await validateBookmarkTarget(input))) return { bookmarked: false, missing: true };
  const where = { userId_targetType_targetId: { userId, targetType: input.targetType, targetId: input.targetId } };
  const existing = await prisma.bookmark.findUnique({ where });
  if (existing) {
    await prisma.bookmark.delete({ where });
    return { bookmarked: false, missing: false };
  }
  await prisma.bookmark.create({ data: { userId, targetType: input.targetType, targetId: input.targetId } });
  return { bookmarked: true, missing: false };
}

export type BookmarkListItem = { id: string; targetType: BookmarkTarget; targetId: string; label: string; href: string; createdAt: Date };

export async function listBookmarks(userId: string): Promise<BookmarkListItem[]> {
  const bookmarks = await prisma.bookmark.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const items = await Promise.all(
    bookmarks.map(async (bookmark): Promise<BookmarkListItem | null> => {
      switch (bookmark.targetType) {
        case "CERTIFICATION": {
          const cert = await prisma.certification.findUnique({ where: { id: bookmark.targetId }, select: { code: true, name: true } });
          return cert ? { ...bookmark, label: cert.name, href: `/certifications/${cert.code}` } : null;
        }
        case "LESSON": {
          const lesson = await prisma.lesson.findUnique({ where: { id: bookmark.targetId }, select: { slug: true, title: true, certification: { select: { code: true } } } });
          return lesson ? { ...bookmark, label: lesson.title, href: `/learn/${lesson.certification.code}/${lesson.slug}` } : null;
        }
        case "LAB": {
          const lab = await prisma.lab.findUnique({ where: { id: bookmark.targetId }, select: { id: true, title: true } });
          return lab ? { ...bookmark, label: lab.title, href: `/labs/${lab.id}` } : null;
        }
        case "GLOSSARY": {
          const term = await prisma.glossaryTerm.findUnique({ where: { id: bookmark.targetId }, select: { slug: true, term: true } });
          return term ? { ...bookmark, label: term.term, href: `/glossary#${term.slug}` } : null;
        }
        case "QUESTION":
          return { ...bookmark, label: bookmark.label ?? bookmark.targetId, href: "/practice" };
      }
    }),
  );
  return items.filter((item): item is BookmarkListItem => item !== null);
}

export async function bookmarkedTargetIds(userId: string, targetType: BookmarkTarget): Promise<Set<string>> {
  const rows = await prisma.bookmark.findMany({ where: { userId, targetType }, select: { targetId: true } });
  return new Set(rows.map((row) => row.targetId));
}
