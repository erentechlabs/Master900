/**
 * Question scoring for every supported question type.
 * Pure functions - never trust client-side scoring.
 */
import {
  expectedResponseKind,
  isChoiceQuestion,
  type CaseStudyKey,
  type CategorizationKey,
  type FillInBlankKey,
  type MatchingKey,
  type OrderingKey,
  type QuestionResponse,
  type ScorableQuestion,
  type ScoreResult,
  type UiSimulationKey,
} from "./types";

const EMPTY: ScoreResult = { isCorrect: false, score: 0, items: {} };

/** Normalize free-text answers: case, accents, Turkish dotless i, punctuation, hyphens and whitespace. */
export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[İIı]/g, "i")
    .toLowerCase()
    .replace(/[‐‑‒–—―-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fraction(items: Record<string, boolean>, total: number): number {
  if (total <= 0) return 0;
  const correct = Object.values(items).filter(Boolean).length;
  return Math.max(0, Math.min(1, correct / total));
}

function scoreChoice(q: ScorableQuestion, selected: string[]): ScoreResult {
  const valid = new Set(q.options.map((o) => o.key));
  const picked = [...new Set(selected)].filter((k) => valid.has(k));
  const correctKeys = q.options.filter((o) => o.isCorrect).map((o) => o.key);
  const items: Record<string, boolean> = {};
  for (const o of q.options) items[o.key] = o.isCorrect === picked.includes(o.key);

  if (q.type === "MULTIPLE_RESPONSE") {
    const hits = picked.filter((k) => correctKeys.includes(k)).length;
    const wrong = picked.length - hits;
    const isCorrect = hits === correctKeys.length && wrong === 0;
    const score = correctKeys.length ? Math.max(0, (hits - wrong) / correctKeys.length) : 0;
    return { isCorrect, score: isCorrect ? 1 : Math.min(score, 0.99), items };
  }

  const isCorrect = picked.length === 1 && correctKeys.length === 1 && picked[0] === correctKeys[0];
  return { isCorrect, score: isCorrect ? 1 : 0, items };
}

function scoreMatching(key: MatchingKey, pairs: Record<string, string>): ScoreResult {
  const prompts = Object.keys(key.pairs);
  const items: Record<string, boolean> = {};
  for (const p of prompts) items[p] = pairs[p] === key.pairs[p];
  const score = fraction(items, prompts.length);
  return { isCorrect: prompts.length > 0 && score === 1, score, items };
}

function scoreOrdering(key: OrderingKey, order: string[]): ScoreResult {
  const expected = key.correctOrder;
  const items: Record<string, boolean> = {};
  expected.forEach((id, index) => {
    items[id] = order[index] === id;
  });
  const sameSet = order.length === expected.length && expected.every((id) => order.includes(id));
  const score = sameSet ? fraction(items, expected.length) : 0;
  return { isCorrect: sameSet && score === 1, score, items };
}

function scoreCategorization(key: CategorizationKey, placements: Record<string, string>): ScoreResult {
  const ids = Object.keys(key.placements);
  const items: Record<string, boolean> = {};
  for (const id of ids) items[id] = placements[id] === key.placements[id];
  const score = fraction(items, ids.length);
  return { isCorrect: ids.length > 0 && score === 1, score, items };
}

function scoreFill(key: FillInBlankKey, blanks: Record<string, string>, extra?: Record<string, string[]>): ScoreResult {
  const ids = Object.keys(key.blanks);
  const items: Record<string, boolean> = {};
  for (const id of ids) {
    const given = normalizeAnswer(blanks[id] ?? "");
    const accepted = [...(key.blanks[id]?.accepted ?? []), ...(extra?.[id] ?? [])].map(normalizeAnswer);
    items[id] = given.length > 0 && accepted.includes(given);
  }
  const score = fraction(items, ids.length);
  return { isCorrect: ids.length > 0 && score === 1, score, items };
}

function scoreCaseStudy(key: CaseStudyKey, answers: Record<string, boolean>): ScoreResult {
  const ids = Object.keys(key.answers);
  const items: Record<string, boolean> = {};
  for (const id of ids) items[id] = typeof answers[id] === "boolean" && answers[id] === key.answers[id];
  const score = fraction(items, ids.length);
  return { isCorrect: ids.length > 0 && score === 1, score, items };
}

function scoreUiSimulation(key: UiSimulationKey, values: Record<string, string | boolean>): ScoreResult {
  const ids = Object.keys(key.values);
  const items: Record<string, boolean> = {};
  for (const id of ids) {
    const expected = key.values[id];
    const given = values[id];
    items[id] = typeof expected === "boolean" ? given === expected : typeof given === "string" && given === expected;
  }
  const score = fraction(items, ids.length);
  return { isCorrect: ids.length > 0 && score === 1, score, items };
}

export function scoreQuestion(question: ScorableQuestion, response: QuestionResponse | null | undefined): ScoreResult {
  if (!response || response.kind !== expectedResponseKind(question.type)) return EMPTY;
  const key = question.answerKey as Record<string, unknown> | null;

  if (isChoiceQuestion(question.type)) {
    return response.kind === "choice" ? scoreChoice(question, response.selected) : EMPTY;
  }
  if (!key || typeof key !== "object") return EMPTY;

  switch (response.kind) {
    case "matching":
      return scoreMatching(key as MatchingKey, response.pairs);
    case "ordering":
      return scoreOrdering(key as OrderingKey, response.order);
    case "categorization":
      return scoreCategorization(key as CategorizationKey, response.placements);
    case "fill":
      return scoreFill(key as FillInBlankKey, response.blanks, question.extraAccepted);
    case "caseStudy":
      return scoreCaseStudy(key as CaseStudyKey, response.answers);
    case "uiSimulation":
      return scoreUiSimulation(key as UiSimulationKey, response.values);
    default:
      return EMPTY;
  }
}

/** Is the response complete enough to count as "answered" (used for unanswered warnings)? */
export function isResponseComplete(type: ScorableQuestion["type"], response: QuestionResponse | null | undefined, expectedCount?: number): boolean {
  if (!response) return false;
  switch (response.kind) {
    case "choice":
      return type === "MULTIPLE_RESPONSE" ? response.selected.length >= Math.max(1, expectedCount ?? 1) : response.selected.length === 1;
    case "matching":
    case "categorization":
    case "fill":
      return Object.values(response.kind === "matching" ? response.pairs : response.kind === "categorization" ? response.placements : response.blanks).filter((v) => v.trim() !== "").length >= (expectedCount ?? 1);
    case "ordering":
      return response.order.length > 0;
    case "caseStudy":
      return Object.keys(response.answers).length >= (expectedCount ?? 1);
    case "uiSimulation":
      return Object.keys(response.values).length >= (expectedCount ?? 1);
    default:
      return false;
  }
}
