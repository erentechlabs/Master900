import { describe, expect, it } from "vitest";
import { evaluateBadges, type BadgeStats } from "@/modules/analytics/gamification";

const stats: BadgeStats = {
  lessonsCompleted: 0,
  domainMastery: [],
  completedTracks: [],
  labsCompleted: 0,
  perfectQuizzes: 0,
  currentStreak: 0,
  gapBeforeLatestActivity: 0,
  fullExamBests: [],
  totalXp: 0,
  questDaysAllCompleted: 7,
  focusSessions: 10,
  threeStarLabs: 5,
  lightningRoundsAtLeast8: 1,
  bestLightningCorrect: 8,
  bestLightningCombo: 10,
  labCertificationsCompleted: 3,
};

describe("wave 2 badge criteria", () => {
  it("awards every new criterion", () => {
    const earned = evaluateBadges(
      [
        { key: "quest", criteria: { type: "quest_days", count: 7 } },
        { key: "focus", criteria: { type: "focus_sessions", count: 10 } },
        { key: "stars", criteria: { type: "three_star_labs", count: 5 } },
        { key: "lightning", criteria: { type: "lightning_correct", minCorrect: 8 } },
        { key: "combo", criteria: { type: "lightning_combo", combo: 10 } },
        { key: "explorer", criteria: { type: "lab_cert_explorer", count: 3 } },
      ],
      stats,
    );
    expect(earned.map((e) => e.key).sort()).toEqual(["combo", "explorer", "focus", "lightning", "quest", "stars"]);
  });

  it("does not award when measurable progress is short", () => {
    const earned = evaluateBadges(
      [
        { key: "quest", criteria: { type: "quest_days", count: 7 } },
        { key: "focus", criteria: { type: "focus_sessions", count: 10 } },
        { key: "stars", criteria: { type: "three_star_labs", count: 5 } },
        { key: "combo", criteria: { type: "lightning_combo", combo: 10 } },
        { key: "explorer", criteria: { type: "lab_cert_explorer", count: 3 } },
      ],
      { ...stats, questDaysAllCompleted: 6, focusSessions: 9, threeStarLabs: 4, bestLightningCombo: 9, labCertificationsCompleted: 2 },
    );
    expect(earned).toEqual([]);
  });
});
