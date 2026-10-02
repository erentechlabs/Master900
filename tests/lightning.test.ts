import { describe, expect, it } from "vitest";
import { computeLightningSummary, isNewLightningPersonalBest, lightningMultiplier, lightningTimeBonus } from "@/modules/assessment/engine/lightning";

const t = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 10, 0, seconds));

describe("lightning combo scoring", () => {
  it("uses x2 at a three-answer streak and x3 at six", () => {
    expect([1, 2, 3, 6, 7].map(lightningMultiplier)).toEqual([1, 1, 2, 3, 3]);
    const summary = computeLightningSummary({
      startedAt: t(0),
      deadline: t(120),
      submittedAt: t(100),
      answers: Array.from({ length: 10 }, (_, i) => ({ isCorrect: true, answeredAt: t(i + 1) })),
    });
    expect(summary).toMatchObject({ correct: 10, bestCombo: 10 });
    expect(summary.score).toBe(23 + 2);
  });

  it("resets combo on mistakes", () => {
    const summary = computeLightningSummary({
      startedAt: t(0),
      deadline: t(120),
      submittedAt: t(80),
      answers: [true, true, true, false, true, true, true, true].map((isCorrect, i) => ({ isCorrect, answeredAt: t(i + 1) })),
      total: 8,
    });
    expect(summary.correct).toBe(7);
    expect(summary.bestCombo).toBe(4);
    expect(summary.score).toBe(1 + 1 + 2 + 0 + 1 + 1 + 2 + 2 + 4);
  });

  it("adds only a small completion time bonus", () => {
    expect(lightningTimeBonus(0)).toBe(12);
    expect(lightningTimeBonus(65_000)).toBe(5);
    expect(lightningTimeBonus(119_000)).toBe(0);
  });

  it("ignores answers after the deadline", () => {
    const summary = computeLightningSummary({
      startedAt: t(0),
      deadline: t(120),
      submittedAt: t(130),
      total: 3,
      answers: [
        { isCorrect: true, answeredAt: t(10) },
        { isCorrect: true, answeredAt: t(121) },
        { isCorrect: true, answeredAt: t(122) },
      ],
    });
    expect(summary).toMatchObject({ correct: 1, countedAnswers: 1, bestCombo: 1, timeBonus: 0, score: 1 });
  });

  it("detects personal bests", () => {
    expect(isNewLightningPersonalBest(18, null)).toBe(true);
    expect(isNewLightningPersonalBest(18, 17)).toBe(true);
    expect(isNewLightningPersonalBest(18, 18)).toBe(false);
  });
});
