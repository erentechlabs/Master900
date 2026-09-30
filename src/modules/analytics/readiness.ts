/**
 * Internal readiness model. Produces an explainable score from the learner's
 * own activity. It is NOT an official prediction and never guarantees a result.
 */
import { clamp, round } from "@/lib/utils";

export type ReadinessLevelValue = "STARTING" | "DEVELOPING" | "NEARLY_READY" | "PRACTICE_EXAM_READY";
export type SignalKey = "performance" | "coverage" | "difficulty" | "consistency" | "practiceExams" | "labs" | "recency";

export type ReadinessInput = {
  now: Date;
  domains: { id: string; weightMin: number | null; weightMax: number | null; lessonsTotal: number; lessonsCompleted: number }[];
  /** Answers from roughly the last 90 days. */
  attempts: { domainId: string; difficulty: "EASY" | "MEDIUM" | "HARD"; isCorrect: boolean; answeredAt: Date }[];
  /** Submitted full practice exams. */
  fullExams: { scorePercent: number; submittedAt: Date }[];
  labs: { total: number; completed: number; completedWithoutSolution: number };
  /** ISO dates with learning activity. */
  activeDays: string[];
  lastActivityAt: Date | null;
  /** Internal practice target, default 75%. */
  targetPercent?: number;
};

export type ReadinessSignal = {
  key: SignalKey;
  /** 0..1 */
  value: number;
  /** Effective weight after redistribution, 0..1 */
  weight: number;
  /** Contribution to the 0..100 score */
  points: number;
  detail: Record<string, number>;
};

export type ReadinessResult = {
  score: number;
  level: ReadinessLevelValue;
  signals: ReadinessSignal[];
  cappedReason: "insufficient_data" | "no_full_exam" | "low_coverage" | null;
};

export const BASE_WEIGHTS: Record<SignalKey, number> = {
  performance: 0.35,
  coverage: 0.2,
  difficulty: 0.1,
  consistency: 0.1,
  practiceExams: 0.15,
  labs: 0.05,
  recency: 0.05,
};

const DAY = 86_400_000;
const DIFF_WEIGHT = { EASY: 0.8, MEDIUM: 1, HARD: 1.25 } as const;
export const MIN_ANSWERS_FOR_RATING = 10;

function daysAgo(now: Date, d: Date): number {
  return Math.max(0, (now.getTime() - d.getTime()) / DAY);
}

export function levelForScore(score: number): ReadinessLevelValue {
  if (score >= 80) return "PRACTICE_EXAM_READY";
  if (score >= 60) return "NEARLY_READY";
  if (score >= 40) return "DEVELOPING";
  return "STARTING";
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const { now } = input;
  const target = input.targetPercent ?? 75;
  const recent = [...input.attempts].sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime()).slice(0, 60);

  // Performance: difficulty- and recency-weighted accuracy, damped when data is thin.
  let wSum = 0;
  let wCorrect = 0;
  for (const a of recent) {
    const w = DIFF_WEIGHT[a.difficulty] * 0.5 ** (daysAgo(now, a.answeredAt) / 21);
    wSum += w;
    if (a.isCorrect) wCorrect += w;
  }
  const rawAccuracy = wSum ? wCorrect / wSum : 0;
  const dataFactor = Math.min(1, recent.length / 20);
  const performance = rawAccuracy * dataFactor;

  // Coverage: weighted by official domain weights; combines practice volume and lesson completion.
  const weightOf = (d: ReadinessInput["domains"][number]) =>
    d.weightMin === null && d.weightMax === null ? 1 : ((d.weightMin ?? d.weightMax ?? 0) + (d.weightMax ?? d.weightMin ?? 0)) / 2;
  const totalWeight = input.domains.reduce((s, d) => s + weightOf(d), 0) || 1;
  let coverage = 0;
  for (const d of input.domains) {
    const answered = input.attempts.filter((a) => a.domainId === d.id).length;
    const practice = Math.min(1, answered / 8);
    const lessons = d.lessonsTotal > 0 ? d.lessonsCompleted / d.lessonsTotal : practice;
    coverage += (weightOf(d) / totalWeight) * (0.5 * practice + 0.5 * lessons);
  }

  // Difficulty: accuracy on medium and hard questions.
  const harder = recent.filter((a) => a.difficulty !== "EASY");
  const difficulty = harder.length ? (harder.filter((a) => a.isCorrect).length / harder.length) * Math.min(1, harder.length / 10) : 0;

  // Consistency: active days in the last 14 days (7 or more is full credit).
  const cutoff = new Date(now.getTime() - 14 * DAY).toISOString().slice(0, 10);
  const recentDays = input.activeDays.filter((d) => d >= cutoff).length;
  const consistency = Math.min(1, recentDays / 7);

  // Practice exams: best recent full exam relative to the internal target.
  const recentExams = input.fullExams.filter((e) => daysAgo(now, e.submittedAt) <= 60);
  const best = recentExams.reduce((m, e) => Math.max(m, e.scorePercent), 0);
  const practiceExams = recentExams.length ? clamp((best - 40) / (target + 15 - 40), 0, 1) * Math.min(1, 0.7 + 0.15 * recentExams.length) : 0;

  // Labs.
  const labs = input.labs.total > 0 ? (input.labs.completed + input.labs.completedWithoutSolution * 0.25) / (input.labs.total * 1.25) : 0;

  // Recency: time since last review.
  const idle = input.lastActivityAt ? daysAgo(now, input.lastActivityAt) : Infinity;
  const recency = idle <= 3 ? 1 : idle >= 21 ? 0.2 : 1 - ((idle - 3) / 18) * 0.8;

  const values: Record<SignalKey, number> = {
    performance,
    coverage,
    difficulty,
    consistency,
    practiceExams,
    labs,
    recency: input.lastActivityAt ? recency : 0,
  };

  // Redistribute the lab weight when the track has no labs.
  const weights = { ...BASE_WEIGHTS };
  if (input.labs.total === 0) {
    const extra = weights.labs;
    weights.labs = 0;
    const rest = Object.entries(weights).filter(([k]) => k !== "labs");
    const restTotal = rest.reduce((s, [, v]) => s + v, 0);
    for (const [k, v] of rest) weights[k as SignalKey] = v + (extra * v) / restTotal;
  }

  const details: Record<SignalKey, Record<string, number>> = {
    performance: { answers: recent.length, accuracy: Math.round(rawAccuracy * 100) },
    coverage: { percent: Math.round(coverage * 100), domains: input.domains.length },
    difficulty: {
      answers: harder.length,
      accuracy: harder.length ? Math.round((harder.filter((a) => a.isCorrect).length / harder.length) * 100) : 0,
    },
    consistency: { activeDays: recentDays },
    practiceExams: { exams: recentExams.length, best: Math.round(best), target },
    labs: { completed: input.labs.completed, total: input.labs.total },
    recency: { idleDays: Number.isFinite(idle) ? Math.round(idle) : -1 },
  };

  const signals: ReadinessSignal[] = (Object.keys(BASE_WEIGHTS) as SignalKey[]).map((key) => {
    const value = clamp(values[key], 0, 1);
    return {
      key,
      value: round(value, 3),
      weight: round(weights[key], 3),
      points: round(value * weights[key] * 100, 1),
      detail: details[key],
    };
  });

  let score = Math.round(signals.reduce((s, x) => s + x.points, 0));
  score = clamp(score, 0, 100);
  let level = levelForScore(score);
  let cappedReason: ReadinessResult["cappedReason"] = null;

  if (input.attempts.length < MIN_ANSWERS_FOR_RATING) {
    level = "STARTING";
    cappedReason = "insufficient_data";
  } else if (level === "PRACTICE_EXAM_READY") {
    if (!recentExams.some((e) => e.scorePercent >= target)) {
      level = "NEARLY_READY";
      cappedReason = "no_full_exam";
    } else if (coverage < 0.75) {
      level = "NEARLY_READY";
      cappedReason = "low_coverage";
    }
  }

  return { score, level, signals, cappedReason };
}
