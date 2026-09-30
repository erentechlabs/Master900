import { addDaysISO, weekdayISO } from "@/lib/dates";

export type WeekGroup<T> = { weekStart: string; days: { date: string; items: T[] }[] };

export function weekStartISO(date: string): string {
  const day = weekdayISO(date);
  return addDaysISO(date, -day);
}

export function groupByWeek<T extends { date: string }>(items: T[]): WeekGroup<T>[] {
  const weeks = new Map<string, Map<string, T[]>>();
  for (const item of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
    const week = weekStartISO(item.date);
    const days = weeks.get(week) ?? new Map<string, T[]>();
    days.set(item.date, [...(days.get(item.date) ?? []), item]);
    weeks.set(week, days);
  }
  return [...weeks.entries()].map(([weekStart, days]) => ({
    weekStart,
    days: [...days.entries()].map(([date, grouped]) => ({ date, items: grouped })),
  }));
}

