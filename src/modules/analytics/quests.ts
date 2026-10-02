import { addDaysISO, toISODate } from "@/lib/dates";
import { XP_RULES } from "./gamification";

export type QuestCategory = "learn" | "practice" | "habit";
export type QuestMetric =
  | "lesson_completed"
  | "flashcards_reviewed"
  | "questions_answered"
  | "questions_correct"
  | "daily_challenge_completed"
  | "lightning_round_completed"
  | "lab_completed"
  | "focus_session_completed"
  | "study_minutes";

export type QuestDefinition = {
  key: string;
  category: QuestCategory;
  metric: QuestMetric;
  baseTarget: number;
  xp: number;
  titleKey: string;
  descriptionKey: string;
  requires?: "flashcards" | "labs";
  adapt?: "dailyGoalHalf" | "dailyGoal" | "questions" | "flashcards";
};

export type QuestAvailability = { hasFlashcards: boolean; hasLabs: boolean; dailyGoalMinutes: number };
export type QuestSelection = QuestDefinition & { target: number };
export type QuestEvent = { type: string; occurredAt: Date; durationSeconds: number | null; xp?: number; metadata?: unknown };
export type QuestClaim = { questKey: string; date: string };
export type QuestProgress = QuestSelection & { progress: number; completed: boolean; claimed: boolean };

export const QUEST_POOL: QuestDefinition[] = [
  { key: "lesson", category: "learn", metric: "lesson_completed", baseTarget: 1, xp: XP_RULES.questCompleted, titleKey: "learner.quests.lessonTitle", descriptionKey: "learner.quests.lessonDescription" },
  { key: "flashcards", category: "learn", metric: "flashcards_reviewed", baseTarget: 5, xp: XP_RULES.questCompleted, titleKey: "learner.quests.flashcardsTitle", descriptionKey: "learner.quests.flashcardsDescription", requires: "flashcards", adapt: "flashcards" },
  { key: "questions", category: "practice", metric: "questions_answered", baseTarget: 8, xp: XP_RULES.questCompleted, titleKey: "learner.quests.questionsTitle", descriptionKey: "learner.quests.questionsDescription", adapt: "questions" },
  { key: "correct", category: "practice", metric: "questions_correct", baseTarget: 5, xp: XP_RULES.questCompleted, titleKey: "learner.quests.correctTitle", descriptionKey: "learner.quests.correctDescription", adapt: "questions" },
  { key: "daily-challenge", category: "practice", metric: "daily_challenge_completed", baseTarget: 1, xp: XP_RULES.questCompleted, titleKey: "learner.quests.dailyChallengeTitle", descriptionKey: "learner.quests.dailyChallengeDescription" },
  { key: "lightning", category: "practice", metric: "lightning_round_completed", baseTarget: 1, xp: XP_RULES.questCompleted, titleKey: "learner.quests.lightningTitle", descriptionKey: "learner.quests.lightningDescription" },
  { key: "lab", category: "habit", metric: "lab_completed", baseTarget: 1, xp: XP_RULES.questCompleted, titleKey: "learner.quests.labTitle", descriptionKey: "learner.quests.labDescription", requires: "labs" },
  { key: "focus", category: "habit", metric: "focus_session_completed", baseTarget: 1, xp: XP_RULES.questCompleted, titleKey: "learner.quests.focusTitle", descriptionKey: "learner.quests.focusDescription" },
  { key: "minutes", category: "habit", metric: "study_minutes", baseTarget: 15, xp: XP_RULES.questCompleted, titleKey: "learner.quests.minutesTitle", descriptionKey: "learner.quests.minutesDescription", adapt: "dailyGoalHalf" },
];

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(items: T[], seed: string): T {
  if (!items.length) throw new Error("No quest candidates");
  return items[hash(seed) % items.length]!;
}

export function adaptQuestTarget(def: QuestDefinition, availability: QuestAvailability): number {
  const goal = Math.max(5, availability.dailyGoalMinutes || 20);
  if (def.adapt === "dailyGoalHalf") return Math.max(5, Math.min(30, Math.round(goal / 2)));
  if (def.adapt === "dailyGoal") return Math.max(10, Math.min(60, goal));
  if (def.adapt === "questions") return goal >= 30 ? Math.max(def.baseTarget, 10) : Math.min(def.baseTarget, 5);
  if (def.adapt === "flashcards") return goal >= 30 ? Math.max(def.baseTarget, 8) : Math.min(def.baseTarget, 4);
  return def.baseTarget;
}

export function availableQuests(category: QuestCategory, availability: QuestAvailability): QuestDefinition[] {
  return QUEST_POOL.filter((q) => q.category === category).filter((q) => {
    if (q.requires === "flashcards") return availability.hasFlashcards;
    if (q.requires === "labs") return availability.hasLabs;
    return true;
  });
}

export function selectDailyQuests(userId: string, localDate: string, availability: QuestAvailability): QuestSelection[] {
  return (["learn", "practice", "habit"] as const).map((category) => {
    const def = pick(availableQuests(category, availability), `${userId}:${localDate}:${category}`);
    return { ...def, target: adaptQuestTarget(def, availability) };
  });
}

function metadataOf(event: QuestEvent): Record<string, unknown> {
  return event.metadata && typeof event.metadata === "object" ? (event.metadata as Record<string, unknown>) : {};
}

export function isLightningRound(event: QuestEvent): boolean {
  return event.type === "PRACTICE_COMPLETED" && metadataOf(event).mode === "LIGHTNING";
}

export function questValue(metric: QuestMetric, events: QuestEvent[]): number {
  switch (metric) {
    case "lesson_completed":
      return events.filter((e) => e.type === "LESSON_COMPLETED").length;
    case "flashcards_reviewed":
      return events.filter((e) => e.type === "FLASHCARD_REVIEWED").length;
    case "questions_answered":
      return events.filter((e) => e.type === "QUESTION_ANSWERED").length;
    case "questions_correct":
      return events.filter((e) => e.type === "QUESTION_ANSWERED" && (metadataOf(e).correct === true || (e.xp ?? 0) > 0)).length;
    case "daily_challenge_completed":
      return events.some((e) => e.type === "DAILY_CHALLENGE_COMPLETED" || (e.type === "PRACTICE_COMPLETED" && metadataOf(e).mode === "DAILY")) ? 1 : 0;
    case "lightning_round_completed":
      return events.some(isLightningRound) ? 1 : 0;
    case "lab_completed":
      return events.filter((e) => e.type === "LAB_COMPLETED").length;
    case "focus_session_completed":
      return events.filter((e) => e.type === "FOCUS_SESSION_COMPLETED").length;
    case "study_minutes":
      return Math.floor(events.reduce((sum, e) => sum + (e.durationSeconds ?? 0), 0) / 60);
  }
}

export function questClaims(events: QuestEvent[], localDate: string): QuestClaim[] {
  return events
    .filter((e) => e.type === "QUEST_COMPLETED")
    .map((e) => metadataOf(e))
    .filter((m) => m.date === localDate && typeof m.questKey === "string")
    .map((m) => ({ questKey: String(m.questKey), date: localDate }));
}

export function computeQuestProgress(quests: QuestSelection[], events: QuestEvent[], localDate: string): QuestProgress[] {
  const claimed = new Set(questClaims(events, localDate).map((c) => c.questKey));
  return quests.map((q) => {
    const progress = questValue(q.metric, events);
    return { ...q, progress, completed: progress >= q.target, claimed: claimed.has(q.key) };
  });
}

export function canClaimQuest(questKey: string, progress: QuestProgress[]): boolean {
  const q = progress.find((item) => item.key === questKey);
  return !!q && q.completed && !q.claimed;
}

export function allQuestBonusClaimable(progress: QuestProgress[], claims: QuestClaim[]): boolean {
  const claimed = new Set(claims.map((c) => c.questKey));
  return progress.length === 3 && progress.every((q) => q.completed && (q.claimed || claimed.has(q.key))) && !claimed.has("all");
}

function offsetMinutesAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

export function localDateTimeToUtc(date: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  let utc = Date.UTC(y!, m! - 1, d!, 0, 0, 0);
  utc -= offsetMinutesAt(new Date(utc), timeZone) * 60000;
  utc = Date.UTC(y!, m! - 1, d!, 0, 0, 0) - offsetMinutesAt(new Date(utc), timeZone) * 60000;
  return new Date(utc);
}

export function localDayRange(localDate: string, timeZone: string): { start: Date; end: Date } {
  return { start: localDateTimeToUtc(localDate, timeZone), end: localDateTimeToUtc(addDaysISO(localDate, 1), timeZone) };
}

export function millisecondsUntilLocalMidnight(now: Date, timeZone: string): number {
  const tomorrow = addDaysISO(toISODate(now, timeZone), 1);
  return Math.max(0, localDateTimeToUtc(tomorrow, timeZone).getTime() - now.getTime());
}

export function formatCountdown(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}
