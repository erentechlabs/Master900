import { describe, expect, it } from "vitest";
import { buildOptionOrder, buildReview, extraAcceptedAnswers, projectQuestion, type QuestionRecord } from "@/modules/assessment/engine/projection";
import { scoreQuestion } from "@/modules/assessment/engine/scoring";
import type { OrderingPublic } from "@/modules/assessment/engine/types";

const single: QuestionRecord = {
  id: "q1",
  code: "T-1",
  type: "SINGLE_CHOICE",
  difficulty: "EASY",
  domainId: "d1",
  stem: "Which option minimizes patching?",
  scenario: null,
  explanation: "SECRET-EXPLANATION managed platforms are patched by the provider",
  interaction: null,
  answerKey: null,
  shuffleOptions: true,
  sourceLocale: "en",
  options: [
    { key: "A", text: "Managed platform", isCorrect: true, explanation: "SECRET-A", sortOrder: 0 },
    { key: "B", text: "More servers", isCorrect: false, explanation: "SECRET-B", sortOrder: 1 },
    { key: "C", text: "Self-managed VMs", isCorrect: false, explanation: "SECRET-C", sortOrder: 2 },
  ],
  translations: [
    {
      locale: "tr",
      stem: "Hangi seçenek yama işini azaltır?",
      scenario: null,
      explanation: "Açıklama",
      options: { A: { text: "Yönetilen platform", explanation: "TR-A" } },
      interaction: null,
      answerExplanations: null,
      status: "DRAFT",
    },
  ],
};

const ordering: QuestionRecord = {
  ...single,
  id: "q2",
  code: "T-2",
  type: "ORDERING",
  options: [],
  interaction: {
    items: [
      { id: "s1", text: "Create" },
      { id: "s2", text: "Deploy" },
      { id: "s3", text: "Test" },
      { id: "s4", text: "Monitor" },
    ],
  },
  answerKey: { correctOrder: ["s1", "s2", "s3", "s4"], explanations: { s1: "SECRET-S1" } },
  translations: [],
};

const fill: QuestionRecord = {
  ...single,
  id: "q3",
  code: "T-3",
  type: "FILL_IN_BLANK",
  options: [],
  interaction: { template: "Paying for use is {{b1}} pricing.", blanks: [{ id: "b1" }], wordBank: ["consumption-based", "reserved"] },
  answerKey: { blanks: { b1: { accepted: ["consumption-based"], explanation: "SECRET-B1" } } },
  translations: [
    {
      locale: "tr",
      stem: "Tamamlayın",
      scenario: null,
      explanation: "x",
      options: null,
      interaction: { template: "Kullandıkça ödemek {{b1}} fiyatlandırmadır.", wordBank: ["tüketime dayalı", "rezerve"] },
      answerExplanations: { accepted: { b1: ["tüketime dayalı"] }, explanations: { b1: "TR-B1" } },
      status: "APPROVED",
    },
  ],
};

describe("projectQuestion", () => {
  it("never exposes answer keys or explanations before submission", () => {
    for (const q of [single, ordering, fill]) {
      const json = JSON.stringify(projectQuestion(q, { locale: "en", seed: "attempt-1" }));
      expect(json).not.toContain("SECRET");
      expect(json).not.toContain("isCorrect");
      expect(json).not.toContain("correctOrder");
      expect(json).not.toContain("accepted");
    }
  });

  it("applies translations and flags unapproved ones", () => {
    const tr = projectQuestion(single, { locale: "tr", seed: "a" });
    expect(tr.stem).toBe("Hangi seçenek yama işini azaltır?");
    expect(tr.options?.find((o) => o.key === "A")?.text).toBe("Yönetilen platform");
    expect(tr.options?.find((o) => o.key === "B")?.text).toBe("More servers");
    expect(tr.translationNotice).toBe("pending");
    expect(projectQuestion(ordering, { locale: "tr", seed: "a" }).translationNotice).toBe("fallback");
    expect(projectQuestion(single, { locale: "en", seed: "a" }).translationNotice).toBeNull();
    expect(projectQuestion(fill, { locale: "tr", seed: "a" }).translationNotice).toBeNull();
  });

  it("shuffles ordering items so the correct order is not revealed", () => {
    for (let i = 0; i < 20; i++) {
      const p = projectQuestion(ordering, { locale: "en", seed: `seed-${i}` });
      const ids = (p.interaction as OrderingPublic).items.map((x) => x.id);
      expect(ids).not.toEqual(["s1", "s2", "s3", "s4"]);
      expect([...ids].sort()).toEqual(["s1", "s2", "s3", "s4"]);
    }
  });

  it("is deterministic for the same seed", () => {
    expect(projectQuestion(ordering, { locale: "en", seed: "x" })).toEqual(projectQuestion(ordering, { locale: "en", seed: "x" }));
  });

  it("respects the stored option order and localizes True/False labels", () => {
    const p = projectQuestion(single, { locale: "en", seed: "a", optionOrder: ["C", "A", "B"] });
    expect(p.options?.map((o) => o.key)).toEqual(["C", "A", "B"]);
    const tf: QuestionRecord = {
      ...single,
      type: "TRUE_FALSE",
      options: [
        { key: "TRUE", text: "True", isCorrect: true, explanation: "e", sortOrder: 0 },
        { key: "FALSE", text: "False", isCorrect: false, explanation: "e", sortOrder: 1 },
      ],
      translations: [],
    };
    expect(buildOptionOrder(tf, "s")).toEqual(["TRUE", "FALSE"]);
    const ptf = projectQuestion(tf, { locale: "tr", seed: "a", labels: { true: "Doğru", false: "Yanlış" } });
    expect(ptf.options?.map((o) => o.text)).toEqual(["Doğru", "Yanlış"]);
  });

  it("uses translated templates and word banks", () => {
    const p = projectQuestion(fill, { locale: "tr", seed: "a" });
    expect((p.interaction as { template: string }).template).toContain("Kullandıkça");
  });
});

describe("buildReview", () => {
  it("reveals correctness, explanations and the learner's selection after submission", () => {
    const response = { kind: "choice" as const, selected: ["B"] };
    const result = scoreQuestion({ type: single.type, options: single.options, answerKey: null }, response);
    const review = buildReview(single, response, result, { locale: "en", seed: "a" });
    expect(review.isCorrect).toBe(false);
    expect(review.explanation).toContain("SECRET-EXPLANATION");
    const b = review.options?.find((o) => o.key === "B");
    expect(b).toMatchObject({ selected: true, isCorrect: false, explanation: "SECRET-B" });
  });

  it("builds per-item rows for ordering", () => {
    const response = { kind: "ordering" as const, order: ["s2", "s1", "s3", "s4"] };
    const result = scoreQuestion({ type: "ORDERING", options: [], answerKey: ordering.answerKey }, response);
    const review = buildReview(ordering, response, result, { locale: "en", seed: "a" });
    expect(review.details?.rows).toHaveLength(4);
    expect(review.details?.rows[0]).toMatchObject({ expected: "Create", given: "Deploy", correct: false, explanation: "SECRET-S1" });
  });

  it("collects translated accepted answers for scoring", () => {
    expect(extraAcceptedAnswers(fill)).toEqual({ b1: ["tüketime dayalı"] });
  });
});
