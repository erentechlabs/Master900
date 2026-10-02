import { describe, expect, it } from "vitest";
import { canClaimQuest, computeQuestProgress, formatCountdown, millisecondsUntilLocalMidnight, questClaims, selectDailyQuests, type QuestEvent } from "@/modules/analytics/quests";

const availability = { hasFlashcards: true, hasLabs: true, dailyGoalMinutes: 30 };

describe("daily quests", () => {
  it("selects three deterministic balanced quests per local day", () => {
    const first = selectDailyQuests("user-1", "2026-10-02", availability);
    const second = selectDailyQuests("user-1", "2026-10-02", availability);
    expect(first.map((q) => q.key)).toEqual(second.map((q) => q.key));
    expect(first.map((q) => q.category)).toEqual(["learn", "practice", "habit"]);
  });

  it("avoids impossible flashcard and lab quests", () => {
    const quests = selectDailyQuests("user-2", "2026-10-02", { hasFlashcards: false, hasLabs: false, dailyGoalMinutes: 20 });
    expect(quests.map((q) => q.key)).not.toContain("flashcards");
    expect(quests.map((q) => q.key)).not.toContain("lab");
  });

  it("computes progress from today's events", () => {
    const quests = [
      { key: "lesson", category: "learn" as const, metric: "lesson_completed" as const, target: 1, baseTarget: 1, xp: 10, titleKey: "x", descriptionKey: "x" },
      { key: "lightning", category: "practice" as const, metric: "lightning_round_completed" as const, target: 1, baseTarget: 1, xp: 10, titleKey: "x", descriptionKey: "x" },
      { key: "minutes", category: "habit" as const, metric: "study_minutes" as const, target: 15, baseTarget: 15, xp: 10, titleKey: "x", descriptionKey: "x" },
    ];
    const events: QuestEvent[] = [
      { type: "LESSON_COMPLETED", occurredAt: new Date(), durationSeconds: null },
      { type: "PRACTICE_COMPLETED", occurredAt: new Date(), durationSeconds: 120, metadata: { mode: "LIGHTNING" } },
      { type: "QUESTION_ANSWERED", occurredAt: new Date(), durationSeconds: 60, xp: 2 },
      { type: "LAB_COMPLETED", occurredAt: new Date(), durationSeconds: 900 },
    ];
    const progress = computeQuestProgress(quests, events, "2026-10-02");
    expect(progress.map((q) => q.completed)).toEqual([true, true, true]);
    expect(progress[2]!.progress).toBe(18);
  });

  it("checks claim eligibility and idempotent claim metadata", () => {
    const events: QuestEvent[] = [{ type: "QUEST_COMPLETED", occurredAt: new Date(), durationSeconds: null, metadata: { questKey: "lesson", date: "2026-10-02" } }];
    const progress = computeQuestProgress([{ key: "lesson", category: "learn", metric: "lesson_completed", target: 1, baseTarget: 1, xp: 10, titleKey: "x", descriptionKey: "x" }], events, "2026-10-02");
    expect(questClaims(events, "2026-10-02")).toEqual([{ questKey: "lesson", date: "2026-10-02" }]);
    expect(canClaimQuest("lesson", progress)).toBe(false);
  });

  it("computes the local midnight countdown", () => {
    const ms = millisecondsUntilLocalMidnight(new Date("2026-10-02T20:30:00Z"), "Europe/Istanbul");
    expect(formatCountdown(ms)).toEqual({ hours: 0, minutes: 30 });
  });
});
