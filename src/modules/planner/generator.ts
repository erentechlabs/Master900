/**
 * Study plan generator (pure). Works with calendar dates (YYYY-MM-DD).
 *
 * - Lessons from weak domains are scheduled first, the rest follow path order.
 * - Knowledge checks are included in lesson time.
 * - Labs are scheduled after their module's lessons.
 * - A checkpoint practice session is added mid-way and a full practice exam
 *   before the target date. The final weeks are reserved for revision.
 */
import { addDaysISO, diffDaysISO, weekdayISO } from "@/lib/dates";

export const KNOWLEDGE_CHECK_MINUTES = 5;

export type PlannerLesson = {
  id: string;
  title: string;
  domainId: string;
  moduleId: string;
  estimatedMinutes: number;
  completed: boolean;
};
export type PlannerLab = { id: string; title: string; moduleId: string | null; estimatedMinutes: number; completed: boolean };

export type PlannerInput = {
  startDate: string;
  targetDate: string;
  studyDays: number[];
  sessionMinutes: number;
  lessons: PlannerLesson[];
  labs: PlannerLab[];
  weakDomainIds: string[];
  revisionWeeks: number;
  includePracticeExams: boolean;
  fullExamMinutes?: number;
};

export type PlannedSessionType = "LESSON" | "REVIEW" | "PRACTICE_EXAM" | "LAB" | "REVISION";

export type PlannedSession = {
  date: string;
  type: PlannedSessionType;
  durationMinutes: number;
  lessonIds: string[];
  labId?: string;
  domainIds?: string[];
  practiceMode?: "FULL" | "QUICK";
};

export type PlanWarning = "no_study_days" | "target_too_soon" | "tight_schedule" | "insufficient_time";

export type PlanResult = {
  sessions: PlannedSession[];
  warnings: PlanWarning[];
  stats: { slots: number; lessonMinutes: number; capacityMinutes: number; lessonsScheduled: number };
};

export function availableDates(startDate: string, targetDate: string, studyDays: number[]): string[] {
  const days = new Set(studyDays.filter((d) => d >= 0 && d <= 6));
  const out: string[] = [];
  const span = diffDaysISO(startDate, targetDate);
  for (let i = 0; i < span; i++) {
    const date = addDaysISO(startDate, i);
    if (days.has(weekdayISO(date))) out.push(date);
  }
  return out;
}

export function orderLessons(lessons: PlannerLesson[], weakDomainIds: string[]): PlannerLesson[] {
  const weak = new Set(weakDomainIds);
  const pending = lessons.filter((l) => !l.completed);
  return [...pending.filter((l) => weak.has(l.domainId)), ...pending.filter((l) => !weak.has(l.domainId))];
}

function lessonCost(l: PlannerLesson): number {
  return Math.max(1, l.estimatedMinutes) + KNOWLEDGE_CHECK_MINUTES;
}

/** Greedy packing into sessions of `capacity` minutes (always at least one lesson per group). */
export function packLessons(lessons: PlannerLesson[], capacity: number): PlannerLesson[][] {
  const groups: PlannerLesson[][] = [];
  let current: PlannerLesson[] = [];
  let used = 0;
  for (const l of lessons) {
    const cost = lessonCost(l);
    if (current.length > 0 && used + cost > capacity) {
      groups.push(current);
      current = [];
      used = 0;
    }
    current.push(l);
    used += cost;
  }
  if (current.length) groups.push(current);
  return groups;
}

function splitEvenly<T>(items: T[], parts: number): T[][] {
  const out: T[][] = Array.from({ length: Math.max(1, parts) }, () => []);
  items.forEach((item, i) => out[Math.floor((i * out.length) / items.length)]!.push(item));
  return out.filter((g) => g.length > 0);
}

export function generateStudyPlan(input: PlannerInput): PlanResult {
  const warnings: PlanWarning[] = [];
  const sessionMinutes = Math.max(10, input.sessionMinutes);
  const fullExamMinutes = input.fullExamMinutes ?? 45;
  const empty = (w: PlanWarning[]): PlanResult => ({
    sessions: [],
    warnings: w,
    stats: { slots: 0, lessonMinutes: 0, capacityMinutes: 0, lessonsScheduled: 0 },
  });

  if (input.studyDays.length === 0) return empty(["no_study_days"]);
  const slots = availableDates(input.startDate, input.targetDate, input.studyDays);
  if (slots.length === 0) return empty(["target_too_soon"]);

  const queue = orderLessons(input.lessons, input.weakDomainIds);
  const lessonMinutes = queue.reduce((s, l) => s + lessonCost(l), 0);
  const allDomainIds = [...new Set(input.lessons.map((l) => l.domainId))];
  const revisionDomains = [...input.weakDomainIds.filter((d) => allDomainIds.includes(d)), ...allDomainIds.filter((d) => !input.weakDomainIds.includes(d))];

  // Reserve revision slots at the end (at most 30% of all slots).
  const perWeek = new Set(input.studyDays).size;
  const revisionCount = slots.length >= 4 ? Math.min(Math.max(0, input.revisionWeeks) * perWeek, Math.floor(slots.length * 0.3)) : 0;
  const learningSlots = slots.slice(0, slots.length - revisionCount);
  const revisionSlots = slots.slice(slots.length - revisionCount);

  const pendingLabs = input.labs.filter((l) => !l.completed);
  const wantsCheckpoint = input.includePracticeExams && learningSlots.length >= 6 && queue.length >= 4;
  const reserved = (wantsCheckpoint ? 1 : 0) + pendingLabs.length;

  let groups = packLessons(queue, sessionMinutes);
  if (groups.length + reserved > learningSlots.length) {
    groups = packLessons(queue, Math.round(sessionMinutes * 1.5));
    warnings.push("tight_schedule");
    if (groups.length + reserved > learningSlots.length) {
      const room = Math.max(1, learningSlots.length - (wantsCheckpoint ? 1 : 0));
      groups = splitEvenly(queue, room);
      warnings.push("insufficient_time");
    }
  }

  const sessions: PlannedSession[] = [];
  const spare = Math.max(0, learningSlots.length - groups.length - reserved);
  const reviewEvery = spare > 0 ? Math.max(3, Math.floor(groups.length / spare) + 1) : Infinity;
  const moduleRemaining = new Map<string, number>();
  for (const l of queue) moduleRemaining.set(l.moduleId, (moduleRemaining.get(l.moduleId) ?? 0) + 1);
  const labsByModule = new Map<string, PlannerLab[]>();
  const orphanLabs: PlannerLab[] = [];
  for (const lab of pendingLabs) {
    if (lab.moduleId && moduleRemaining.has(lab.moduleId)) labsByModule.set(lab.moduleId, [...(labsByModule.get(lab.moduleId) ?? []), lab]);
    else orphanLabs.push(lab);
  }

  let slot = 0;
  let scheduledLessons = 0;
  let checkpointDone = !wantsCheckpoint;
  let learningSessions = 0;
  let sparesUsed = 0;
  const labQueue: PlannerLab[] = [];

  const take = () => (slot < learningSlots.length ? learningSlots[slot++]! : null);

  for (const group of groups) {
    const date = take();
    if (!date) break;
    const minutes = group.reduce((s, l) => s + lessonCost(l), 0);
    const session: PlannedSession = { date, type: "LESSON", durationMinutes: minutes, lessonIds: group.map((l) => l.id) };
    sessions.push(session);
    scheduledLessons += group.length;
    learningSessions += 1;

    for (const l of group) {
      const left = (moduleRemaining.get(l.moduleId) ?? 1) - 1;
      moduleRemaining.set(l.moduleId, left);
      if (left === 0) labQueue.push(...(labsByModule.get(l.moduleId) ?? []));
    }
    // Attach a lab to the same session when there is room, otherwise give it its own session.
    while (labQueue.length) {
      const lab = labQueue[0]!;
      if (!session.labId && session.durationMinutes + lab.estimatedMinutes <= sessionMinutes) {
        session.labId = lab.id;
        session.durationMinutes += lab.estimatedMinutes;
        labQueue.shift();
        continue;
      }
      const labDate = take();
      if (!labDate) break;
      sessions.push({ date: labDate, type: "LAB", durationMinutes: lab.estimatedMinutes, lessonIds: [], labId: lab.id });
      labQueue.shift();
    }

    if (!checkpointDone && scheduledLessons >= Math.ceil(queue.length / 2)) {
      const d = take();
      if (d) sessions.push({ date: d, type: "PRACTICE_EXAM", durationMinutes: Math.min(30, sessionMinutes + 10), lessonIds: [], practiceMode: "QUICK" });
      checkpointDone = true;
    }
    if (learningSessions % reviewEvery === 0 && sparesUsed < spare) {
      const d = take();
      if (d) {
        sessions.push({ date: d, type: "REVIEW", durationMinutes: Math.min(sessionMinutes, 25), lessonIds: [] });
        sparesUsed += 1;
      }
    }
  }

  for (const lab of [...labQueue, ...orphanLabs]) {
    const d = take();
    if (!d) break;
    sessions.push({ date: d, type: "LAB", durationMinutes: lab.estimatedMinutes, lessonIds: [], labId: lab.id });
  }

  // Remaining learning slots become spaced reviews and quick practice.
  let alternate = 0;
  for (let d = take(); d; d = take()) {
    const practice = input.includePracticeExams && alternate % 2 === 1;
    sessions.push({
      date: d,
      type: practice ? "PRACTICE_EXAM" : "REVIEW",
      durationMinutes: practice ? Math.min(30, sessionMinutes + 10) : Math.min(sessionMinutes, 25),
      lessonIds: [],
      practiceMode: practice ? "QUICK" : undefined,
    });
    alternate += 1;
  }

  // Revision period.
  const fullExamIndex = input.includePracticeExams && revisionSlots.length > 0 ? Math.max(0, revisionSlots.length - 2) : -1;
  revisionSlots.forEach((date, i) => {
    if (i === fullExamIndex) {
      sessions.push({ date, type: "PRACTICE_EXAM", durationMinutes: fullExamMinutes, lessonIds: [], practiceMode: "FULL" });
    } else if (i === revisionSlots.length - 1 && revisionSlots.length >= 2) {
      sessions.push({ date, type: "REVIEW", durationMinutes: Math.min(sessionMinutes, 25), lessonIds: [] });
    } else {
      const domain = revisionDomains.length ? revisionDomains[i % revisionDomains.length]! : undefined;
      sessions.push({ date, type: "REVISION", durationMinutes: sessionMinutes, lessonIds: [], domainIds: domain ? [domain] : [] });
    }
  });

  if (scheduledLessons < queue.length && !warnings.includes("insufficient_time")) warnings.push("insufficient_time");

  return {
    sessions: sessions.sort((a, b) => a.date.localeCompare(b.date)),
    warnings,
    stats: { slots: slots.length, lessonMinutes, capacityMinutes: slots.length * sessionMinutes, lessonsScheduled: scheduledLessons },
  };
}

/** Planned sessions dated before today are missed. */
export function findMissedSessions<T extends { date: string; status: string }>(sessions: T[], today: string): T[] {
  return sessions.filter((s) => s.status === "PLANNED" && s.date < today);
}
