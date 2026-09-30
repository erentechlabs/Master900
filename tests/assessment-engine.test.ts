import { describe, expect, it } from "vitest";
import { allocateByBlueprint, buildExam, domainWeights, selectQuestions, type PoolQuestion } from "@/modules/assessment/engine/exam-builder";
import { initialAbility, selectNextAdaptive, updateAbility } from "@/modules/assessment/engine/adaptive";
import { classifyDomains, summarizeAttempt } from "@/modules/assessment/engine/results";
import { qualityFromAnswer, qualityFromRating, reviewSrs, INITIAL_SRS, shouldQueueForReview } from "@/modules/learning/srs";
import { createRng } from "@/lib/random";

const AZ900 = [
  { domainId: "cc", weightMin: 25, weightMax: 30 },
  { domainId: "aas", weightMin: 35, weightMax: 40 },
  { domainId: "amg", weightMin: 30, weightMax: 35 },
];

function pool(domain: string, n: number, difficulty: PoolQuestion["difficulty"] = "MEDIUM"): PoolQuestion[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${domain}-${difficulty}-${i}`, domainId: domain, difficulty }));
}

describe("blueprint allocation", () => {
  it("distributes questions proportionally to the official weight ranges", () => {
    const alloc = allocateByBlueprint(AZ900, 40);
    const total = [...alloc.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(40);
    const weights = domainWeights(AZ900);
    for (const d of AZ900) expect(Math.abs(alloc.get(d.domainId)! - weights.get(d.domainId)! * 40)).toBeLessThanOrEqual(1);
    expect(alloc.get("aas")).toBeGreaterThan(alloc.get("cc")!);
  });

  it("splits equally when weights are unknown", () => {
    const alloc = allocateByBlueprint(
      [
        { domainId: "a", weightMin: null, weightMax: null },
        { domainId: "b", weightMin: null, weightMax: null },
      ],
      10,
    );
    expect(alloc.get("a")).toBe(5);
    expect(alloc.get("b")).toBe(5);
  });

  it("gives every domain at least one question", () => {
    const alloc = allocateByBlueprint(
      [
        { domainId: "big", weightMin: 90, weightMax: 95 },
        { domainId: "tiny", weightMin: 1, weightMax: 2 },
      ],
      5,
    );
    expect(alloc.get("tiny")).toBeGreaterThanOrEqual(1);
    expect((alloc.get("big") ?? 0) + (alloc.get("tiny") ?? 0)).toBe(5);
  });
});

describe("question selection", () => {
  it("selects unique questions following the allocation", () => {
    const p = [...pool("cc", 20), ...pool("aas", 20), ...pool("amg", 20)];
    const ids = selectQuestions(p, allocateByBlueprint(AZ900, 30), { rng: createRng(1) });
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
  });

  it("fills shortfalls from other domains", () => {
    const p = [...pool("cc", 2), ...pool("aas", 20), ...pool("amg", 20)];
    const ids = selectQuestions(p, allocateByBlueprint(AZ900, 30), { rng: createRng(2) });
    expect(ids).toHaveLength(30);
    expect(ids.filter((id) => id.startsWith("cc"))).toHaveLength(2);
  });

  it("avoids recently seen questions when alternatives exist", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    const p: PoolQuestion[] = [
      { id: "seen", domainId: "cc", difficulty: "EASY", lastSeenAt: new Date("2026-09-30T08:00:00Z"), timesSeen: 3 },
      { id: "fresh", domainId: "cc", difficulty: "EASY" },
    ];
    const ids = selectQuestions(p, new Map([["cc", 1]]), { rng: createRng(3), now });
    expect(ids).toEqual(["fresh"]);
  });

  it("is deterministic for a seed", () => {
    const p = [...pool("cc", 10), ...pool("aas", 10), ...pool("amg", 10)];
    expect(buildExam(p, AZ900, 12, "seed")).toEqual(buildExam(p, AZ900, 12, "seed"));
  });
});

describe("adaptive selection", () => {
  it("raises ability after correct answers and lowers it after mistakes", () => {
    const start = { ability: 0, answers: [] };
    const up = updateAbility(start, { questionId: "a", domainId: "d", difficulty: "MEDIUM", correct: true });
    const down = updateAbility(start, { questionId: "a", domainId: "d", difficulty: "MEDIUM", correct: false });
    expect(up.ability).toBeGreaterThan(0);
    expect(down.ability).toBeLessThan(0);
    expect(initialAbility(0.9)).toBeGreaterThan(initialAbility(0.4));
  });

  it("never repeats answered questions and matches difficulty to ability", () => {
    const p = [...pool("d", 3, "EASY"), ...pool("d", 3, "HARD")];
    const state = { ability: 1.5, answers: [{ questionId: "d-HARD-0", domainId: "d", difficulty: "HARD" as const, correct: true }] };
    const next = selectNextAdaptive(p, state, new Map([["d", 0.5]]), "s");
    expect(next).not.toBe("d-HARD-0");
    expect(next?.startsWith("d-HARD")).toBe(true);
  });

  it("favours weak domains over mastered ones", () => {
    const p = [...pool("weak", 5), ...pool("strong", 5)];
    let weakPicks = 0;
    for (let i = 0; i < 20; i++) {
      const id = selectNextAdaptive(p, { ability: 0, answers: [] }, new Map([["weak", 0.2], ["strong", 0.95]]), `s${i}`);
      if (id?.startsWith("weak")) weakPicks++;
    }
    expect(weakPicks).toBeGreaterThanOrEqual(18);
  });

  it("returns null when the pool is exhausted", () => {
    expect(selectNextAdaptive([], { ability: 0, answers: [] }, new Map(), "s")).toBeNull();
  });
});

describe("results", () => {
  it("summarizes attempts by domain", () => {
    const s = summarizeAttempt(
      [
        { questionId: "1", domainId: "a", isCorrect: true, timeMs: 1000 },
        { questionId: "2", domainId: "a", isCorrect: false, timeMs: 3000 },
        { questionId: "3", domainId: "b", isCorrect: null },
      ],
      ["b", "a"],
    );
    expect(s).toMatchObject({ total: 3, answered: 2, correct: 1, unanswered: 1, scorePercent: 33, averageTimeMs: 2000 });
    expect(s.domains.map((d) => d.domainId)).toEqual(["b", "a"]);
    expect(classifyDomains(s.domains)).toEqual({ strong: [], weak: ["b", "a"] });
  });
});

describe("spaced repetition", () => {
  const now = new Date("2026-09-30T00:00:00Z");
  it("grows intervals for successful reviews", () => {
    let state = INITIAL_SRS;
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = reviewSrs(state, 5, now);
      state = r.state;
      intervals.push(state.intervalDays);
    }
    expect(intervals[0]).toBe(1);
    expect(intervals[1]).toBe(3);
    expect(intervals[2]!).toBeGreaterThan(3);
    expect(intervals[3]!).toBeGreaterThan(intervals[2]!);
  });

  it("resets after a lapse and never drops the ease factor below 1.3", () => {
    let state = { ...INITIAL_SRS, repetitions: 3, intervalDays: 10 };
    for (let i = 0; i < 10; i++) state = reviewSrs(state, 0, now).state;
    expect(state.repetitions).toBe(0);
    expect(state.intervalDays).toBe(1);
    expect(state.lapses).toBe(10);
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("marks items as mastered after repeated success over long intervals", () => {
    let state = INITIAL_SRS;
    let mastered = false;
    for (let i = 0; i < 8 && !mastered; i++) {
      const r = reviewSrs(state, 5, now);
      state = r.state;
      mastered = r.mastered;
    }
    expect(mastered).toBe(true);
  });

  it("maps answers and ratings to SM-2 quality", () => {
    expect(qualityFromAnswer(false, 3)).toBe(0);
    expect(qualityFromAnswer(true, 1)).toBe(3);
    expect(qualityFromAnswer(true)).toBe(5);
    expect(qualityFromRating("again")).toBe(1);
    expect(shouldQueueForReview(true, 1)).toBe(true);
    expect(shouldQueueForReview(true, 3)).toBe(false);
    expect(shouldQueueForReview(false)).toBe(true);
  });
});
