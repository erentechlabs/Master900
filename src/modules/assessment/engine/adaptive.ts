/**
 * Adaptive question selection. A simple Elo/Rasch-style ability estimate
 * moves up after correct answers and down after incorrect ones. The next
 * question targets the current ability, favours weak domains and avoids
 * recently seen or already answered questions.
 */
import { clamp } from "@/lib/utils";
import { createRng } from "@/lib/random";
import type { DifficultyValue } from "./types";
import type { PoolQuestion } from "./exam-builder";

export const DIFFICULTY_VALUE: Record<DifficultyValue, number> = { EASY: -1, MEDIUM: 0, HARD: 1 };

export type AdaptiveAnswer = { questionId: string; domainId: string; difficulty: DifficultyValue; correct: boolean };
export type AdaptiveState = { ability: number; answers: AdaptiveAnswer[] };

export function expectedCorrect(ability: number, difficulty: DifficultyValue): number {
  return 1 / (1 + Math.exp(-1.4 * (ability - DIFFICULTY_VALUE[difficulty])));
}

export function updateAbility(state: AdaptiveState, answer: AdaptiveAnswer): AdaptiveState {
  const k = Math.max(0.25, 0.8 / Math.sqrt(state.answers.length + 1));
  const delta = k * ((answer.correct ? 1 : 0) - expectedCorrect(state.ability, answer.difficulty));
  return { ability: clamp(state.ability + delta, -2, 2), answers: [...state.answers, answer] };
}

export function initialAbility(recentAccuracy: number | null): number {
  if (recentAccuracy === null) return 0;
  return clamp((recentAccuracy - 0.6) * 3, -1.5, 1.5);
}

/**
 * Pick the next question.
 * @param domainMastery domainId -> mastery 0..1 (weaker domains are favoured; mastered ones appear less often)
 */
export function selectNextAdaptive(
  pool: PoolQuestion[],
  state: AdaptiveState,
  domainMastery: Map<string, number>,
  seed: string,
  now = new Date(),
): string | null {
  const answered = new Set(state.answers.map((a) => a.questionId));
  const candidates = pool.filter((q) => !answered.has(q.id));
  if (candidates.length === 0) return null;
  const rng = createRng(`${seed}:${state.answers.length}`);
  const nowMs = now.getTime();
  const lastDomain = state.answers[state.answers.length - 1]?.domainId;

  let best: { id: string; score: number } | null = null;
  for (const q of candidates) {
    const mastery = domainMastery.get(q.domainId) ?? 0.5;
    const domainWeight = mastery >= 0.85 ? 0.35 : 1.6 - mastery;
    const difficultyFit = -Math.abs(DIFFICULTY_VALUE[q.difficulty] - state.ability);
    const seenDays = q.lastSeenAt ? (nowMs - q.lastSeenAt.getTime()) / 86_400_000 : Infinity;
    const recencyPenalty = seenDays < 1 ? 2 : seenDays < 3 ? 1 : seenDays < 7 ? 0.4 : 0;
    const masteredPenalty = q.mastered ? 0.8 : 0;
    const varietyPenalty = q.domainId === lastDomain ? 0.2 : 0;
    const score = difficultyFit * 1.2 + Math.log(domainWeight) - recencyPenalty - masteredPenalty - varietyPenalty + rng() * 0.3;
    if (!best || score > best.score) best = { id: q.id, score };
  }
  return best?.id ?? null;
}
