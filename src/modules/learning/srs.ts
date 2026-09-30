/**
 * Spaced repetition (SM-2 variant) for the review queue and flashcards.
 * Quality: 0-5 (0-2 = failed recall, 3 = hard, 4 = good, 5 = easy).
 */
export type SrsState = { easeFactor: number; intervalDays: number; repetitions: number; lapses: number };
export type SrsQuality = 0 | 1 | 2 | 3 | 4 | 5;
export type FlashcardRating = "again" | "hard" | "good" | "easy";

export const INITIAL_SRS: SrsState = { easeFactor: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };
export const MASTERY_REPETITIONS = 4;
export const MASTERY_INTERVAL_DAYS = 21;

const DAY = 24 * 60 * 60 * 1000;

export function reviewSrs(state: SrsState, quality: SrsQuality, now = new Date()): { state: SrsState; dueAt: Date; mastered: boolean } {
  let { easeFactor, intervalDays, repetitions, lapses } = state;
  if (quality < 3) {
    repetitions = 0;
    lapses += 1;
    intervalDays = 1;
  } else {
    repetitions += 1;
    intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.max(1, Math.round(intervalDays * easeFactor));
    if (quality === 3) intervalDays = Math.max(1, Math.round(intervalDays * 0.8));
  }
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  easeFactor = Math.round(easeFactor * 100) / 100;
  const mastered = repetitions >= MASTERY_REPETITIONS && intervalDays >= MASTERY_INTERVAL_DAYS;
  return {
    state: { easeFactor, intervalDays, repetitions, lapses },
    dueAt: new Date(now.getTime() + intervalDays * DAY),
    mastered,
  };
}

/** Map an answered question (with optional self-rated confidence 1-3) to an SM-2 quality. */
export function qualityFromAnswer(correct: boolean, confidence?: number | null): SrsQuality {
  if (!correct) return confidence === 3 ? 0 : confidence === 1 ? 2 : 1;
  if (confidence === 1) return 3;
  if (confidence === 2) return 4;
  return 5;
}

export function qualityFromRating(rating: FlashcardRating): SrsQuality {
  switch (rating) {
    case "again":
      return 1;
    case "hard":
      return 3;
    case "good":
      return 4;
    case "easy":
      return 5;
  }
}

/** Should a question enter the review queue after this answer? */
export function shouldQueueForReview(correct: boolean, confidence?: number | null): boolean {
  return !correct || confidence === 1;
}
