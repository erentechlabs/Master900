import { describe, expect, it } from "vitest";
import { isResponseComplete, normalizeAnswer, scoreQuestion } from "@/modules/assessment/engine/scoring";
import type { QuestionTypeValue, ScorableQuestion } from "@/modules/assessment/engine/types";

function choice(type: QuestionTypeValue, correct: string[], keys = ["A", "B", "C", "D"]): ScorableQuestion {
  return { type, options: keys.map((key) => ({ key, isCorrect: correct.includes(key) })), answerKey: null };
}

describe("normalizeAnswer", () => {
  it("normalizes case, accents, Turkish i, hyphens and punctuation", () => {
    expect(normalizeAnswer("  İstanbul ")).toBe("istanbul");
    expect(normalizeAnswer("Pay-as-you-go!")).toBe("pay as you go");
    expect(normalizeAnswer("Tüketime  Dayalı")).toBe("tuketime dayali");
    expect(normalizeAnswer("Consumption–based")).toBe("consumption based");
  });
});

describe("single-answer choice types", () => {
  for (const type of ["SINGLE_CHOICE", "SCENARIO", "COMMAND_SELECTION"] as const) {
    it(`${type}: scores the correct option`, () => {
      const q = choice(type, ["B"]);
      expect(scoreQuestion(q, { kind: "choice", selected: ["B"] })).toMatchObject({ isCorrect: true, score: 1 });
      expect(scoreQuestion(q, { kind: "choice", selected: ["A"] })).toMatchObject({ isCorrect: false, score: 0 });
    });
  }

  it("rejects multiple selections for a single-answer question", () => {
    expect(scoreQuestion(choice("SINGLE_CHOICE", ["B"]), { kind: "choice", selected: ["A", "B"] }).isCorrect).toBe(false);
  });

  it("ignores unknown option keys", () => {
    expect(scoreQuestion(choice("SINGLE_CHOICE", ["B"]), { kind: "choice", selected: ["Z"] }).isCorrect).toBe(false);
  });

  it("returns incorrect for a response of the wrong kind or no response", () => {
    const q = choice("SINGLE_CHOICE", ["B"]);
    expect(scoreQuestion(q, { kind: "ordering", order: ["B"] }).isCorrect).toBe(false);
    expect(scoreQuestion(q, null).isCorrect).toBe(false);
  });

  it("TRUE_FALSE uses TRUE and FALSE keys", () => {
    const q = choice("TRUE_FALSE", ["FALSE"], ["TRUE", "FALSE"]);
    expect(scoreQuestion(q, { kind: "choice", selected: ["FALSE"] }).isCorrect).toBe(true);
    expect(scoreQuestion(q, { kind: "choice", selected: ["TRUE"] }).isCorrect).toBe(false);
  });
});

describe("multiple response", () => {
  const q = choice("MULTIPLE_RESPONSE", ["A", "C"]);
  it("requires exactly the correct set", () => {
    expect(scoreQuestion(q, { kind: "choice", selected: ["C", "A"] })).toMatchObject({ isCorrect: true, score: 1 });
  });
  it("gives partial credit but marks incomplete answers incorrect", () => {
    const partial = scoreQuestion(q, { kind: "choice", selected: ["A"] });
    expect(partial.isCorrect).toBe(false);
    expect(partial.score).toBeCloseTo(0.5);
  });
  it("penalizes wrong selections", () => {
    const r = scoreQuestion(q, { kind: "choice", selected: ["A", "B", "C"] });
    expect(r.isCorrect).toBe(false);
    expect(r.score).toBeCloseTo(0.5);
    expect(scoreQuestion(q, { kind: "choice", selected: ["B", "D"] }).score).toBe(0);
  });
  it("reports per-option correctness", () => {
    const r = scoreQuestion(q, { kind: "choice", selected: ["A", "B"] });
    expect(r.items).toEqual({ A: true, B: false, C: false, D: true });
  });
});

describe("matching", () => {
  const q: ScorableQuestion = {
    type: "MATCHING",
    options: [],
    answerKey: { pairs: { p1: "a1", p2: "a2" }, explanations: { p1: "x", p2: "y" } },
  };
  it("scores all pairs", () => {
    expect(scoreQuestion(q, { kind: "matching", pairs: { p1: "a1", p2: "a2" } })).toMatchObject({ isCorrect: true, score: 1 });
    const half = scoreQuestion(q, { kind: "matching", pairs: { p1: "a1", p2: "a3" } });
    expect(half).toMatchObject({ isCorrect: false, score: 0.5, items: { p1: true, p2: false } });
  });
});

describe("ordering", () => {
  const q: ScorableQuestion = { type: "ORDERING", options: [], answerKey: { correctOrder: ["s1", "s2", "s3"] } };
  it("requires the exact order", () => {
    expect(scoreQuestion(q, { kind: "ordering", order: ["s1", "s2", "s3"] }).isCorrect).toBe(true);
    const swapped = scoreQuestion(q, { kind: "ordering", order: ["s2", "s1", "s3"] });
    expect(swapped.isCorrect).toBe(false);
    expect(swapped.score).toBeCloseTo(1 / 3);
  });
  it("gives no credit when items are missing or duplicated", () => {
    expect(scoreQuestion(q, { kind: "ordering", order: ["s1", "s2"] }).score).toBe(0);
    expect(scoreQuestion(q, { kind: "ordering", order: ["s1", "s1", "s3"] }).score).toBe(0);
  });
});

describe("categorization", () => {
  const q: ScorableQuestion = {
    type: "CATEGORIZATION",
    options: [],
    answerKey: { placements: { i1: "customer", i2: "provider", i3: "customer" }, explanations: {} },
  };
  it("scores every item", () => {
    expect(scoreQuestion(q, { kind: "categorization", placements: { i1: "customer", i2: "provider", i3: "customer" } }).isCorrect).toBe(true);
    const r = scoreQuestion(q, { kind: "categorization", placements: { i1: "customer", i2: "customer" } });
    expect(r.isCorrect).toBe(false);
    expect(r.score).toBeCloseTo(1 / 3);
  });
});

describe("fill in the blank", () => {
  const q: ScorableQuestion = {
    type: "FILL_IN_BLANK",
    options: [],
    answerKey: { blanks: { b1: { accepted: ["consumption-based", "pay-as-you-go"], explanation: "x" } } },
    extraAccepted: { b1: ["tüketime dayalı"] },
  };
  it("accepts normalized variants and translated answers", () => {
    expect(scoreQuestion(q, { kind: "fill", blanks: { b1: "Consumption based" } }).isCorrect).toBe(true);
    expect(scoreQuestion(q, { kind: "fill", blanks: { b1: "PAY AS YOU GO" } }).isCorrect).toBe(true);
    expect(scoreQuestion(q, { kind: "fill", blanks: { b1: "Tuketime dayali" } }).isCorrect).toBe(true);
  });
  it("rejects empty or wrong answers", () => {
    expect(scoreQuestion(q, { kind: "fill", blanks: { b1: "" } }).isCorrect).toBe(false);
    expect(scoreQuestion(q, { kind: "fill", blanks: { b1: "reserved" } }).isCorrect).toBe(false);
  });
});

describe("case study", () => {
  const q: ScorableQuestion = { type: "CASE_STUDY", options: [], answerKey: { answers: { s1: true, s2: false }, explanations: {} } };
  it("scores yes/no statements", () => {
    expect(scoreQuestion(q, { kind: "caseStudy", answers: { s1: true, s2: false } }).isCorrect).toBe(true);
    expect(scoreQuestion(q, { kind: "caseStudy", answers: { s1: true } })).toMatchObject({ isCorrect: false, score: 0.5 });
  });
});

describe("UI simulation", () => {
  const q: ScorableQuestion = { type: "UI_SIMULATION", options: [], answerKey: { values: { who: "org", mfa: true }, explanations: {} } };
  it("requires every field to match with the right type", () => {
    expect(scoreQuestion(q, { kind: "uiSimulation", values: { who: "org", mfa: true } }).isCorrect).toBe(true);
    expect(scoreQuestion(q, { kind: "uiSimulation", values: { who: "org", mfa: "true" } }).isCorrect).toBe(false);
    expect(scoreQuestion(q, { kind: "uiSimulation", values: { who: "anyone", mfa: true } }).score).toBe(0.5);
  });
});

describe("isResponseComplete", () => {
  it("detects unanswered questions", () => {
    expect(isResponseComplete("SINGLE_CHOICE", null)).toBe(false);
    expect(isResponseComplete("SINGLE_CHOICE", { kind: "choice", selected: ["A"] })).toBe(true);
    expect(isResponseComplete("MULTIPLE_RESPONSE", { kind: "choice", selected: ["A"] }, 2)).toBe(false);
    expect(isResponseComplete("MATCHING", { kind: "matching", pairs: { p1: "a1" } }, 2)).toBe(false);
  });
});
