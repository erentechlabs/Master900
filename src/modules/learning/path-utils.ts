export type OrderedLesson = {
  id: string;
  slug: string;
  title: string;
  domainId: string;
  domainSort: number;
  moduleId: string;
  moduleSort: number;
  sortOrder: number;
  progressStatus: "IN_PROGRESS" | "COMPLETED" | null;
};

export function orderLessons<T extends OrderedLesson>(lessons: T[]): T[] {
  return [...lessons].sort((a, b) => a.domainSort - b.domainSort || a.moduleSort - b.moduleSort || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

export function progressPercent(completed: number, total: number): number {
  return total <= 0 ? 0 : Math.round((completed / total) * 100);
}

export function recommendedNextLesson<T extends OrderedLesson>(lessons: T[], weakDomainIds: string[] = []): T | null {
  const ordered = orderLessons(lessons);
  const weak = ordered.find((lesson) => lesson.progressStatus !== "COMPLETED" && weakDomainIds.includes(lesson.domainId));
  return weak ?? ordered.find((lesson) => lesson.progressStatus !== "COMPLETED") ?? ordered[0] ?? null;
}
