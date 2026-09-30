/**
 * Date helpers. Study plans use calendar dates (YYYY-MM-DD) in the learner's
 * time zone; timestamps are stored in UTC.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function toISODate(date: Date, timeZone = "UTC"): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Parse YYYY-MM-DD into a UTC midnight Date. */
export function parseISODate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error(`Invalid ISO date: ${value}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseISODate(value);
  return toISODate(d) === value;
}

export function addDaysISO(value: string, days: number): string {
  return toISODate(new Date(parseISODate(value).getTime() + days * DAY_MS));
}

/** Whole days from a to b (b - a) for ISO dates. */
export function diffDaysISO(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / DAY_MS);
}

/** Day of week 0 (Sunday) .. 6 (Saturday) for an ISO date. */
export function weekdayISO(value: string): number {
  return parseISODate(value).getUTCDay();
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function todayISO(timeZone = "UTC", now = new Date()): string {
  return toISODate(now, timeZone);
}

/** Count consecutive days (ending today or yesterday) that appear in the set. */
export function currentStreak(activeDays: Set<string>, today: string): number {
  let cursor = activeDays.has(today) ? today : addDaysISO(today, -1);
  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

export function longestStreak(activeDays: Set<string>): number {
  const sorted = [...activeDays].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    run = prev && diffDaysISO(prev, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}
