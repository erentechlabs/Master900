export const LIGHTNING_QUESTION_COUNT = 10;
export const LIGHTNING_DURATION_SECONDS = 120;
export const LIGHTNING_DURATION_MS = LIGHTNING_DURATION_SECONDS * 1000;

export type LightningAnswer = {
  isCorrect: boolean;
  answeredAt: Date | string | number;
};

export type LightningSummary = {
  correct: number;
  total: number;
  bestCombo: number;
  score: number;
  timeBonus: number;
  timeUsedMs: number;
  countedAnswers: number;
};

export function lightningMultiplier(streak: number): 1 | 2 | 3 {
  if (streak >= 6) return 3;
  if (streak >= 3) return 2;
  return 1;
}

export function lightningTimeBonus(timeUsedMs: number, durationMs = LIGHTNING_DURATION_MS): number {
  const remainingSeconds = Math.max(0, Math.floor((durationMs - timeUsedMs) / 1000));
  return Math.min(12, Math.floor(remainingSeconds / 10));
}

export function computeLightningSummary(input: {
  answers: LightningAnswer[];
  total?: number;
  startedAt: Date | string | number;
  deadline: Date | string | number;
  submittedAt?: Date | string | number;
}): LightningSummary {
  const total = input.total ?? LIGHTNING_QUESTION_COUNT;
  const started = new Date(input.startedAt).getTime();
  const deadline = new Date(input.deadline).getTime();
  const submitted = input.submittedAt ? new Date(input.submittedAt).getTime() : deadline;
  const counted = input.answers.filter((answer) => new Date(answer.answeredAt).getTime() <= deadline).slice(0, total);

  let streak = 0;
  let bestCombo = 0;
  let correct = 0;
  let weighted = 0;
  for (const answer of counted) {
    if (answer.isCorrect) {
      streak += 1;
      correct += 1;
      bestCombo = Math.max(bestCombo, streak);
      weighted += lightningMultiplier(streak);
    } else {
      streak = 0;
    }
  }

  const durationMs = Math.max(0, deadline - started);
  const timeUsedMs = Math.max(0, Math.min(submitted, deadline) - started);
  const timeBonus = counted.length >= total ? lightningTimeBonus(timeUsedMs, durationMs) : 0;
  return { correct, total, bestCombo, score: weighted + timeBonus, timeBonus, timeUsedMs, countedAnswers: counted.length };
}

export function isNewLightningPersonalBest(currentScore: number, previousBest: number | null | undefined): boolean {
  return currentScore > (previousBest ?? -1);
}
