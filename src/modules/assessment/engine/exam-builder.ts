/**
 * Exam assembly: blueprint-based allocation, question selection and ordering.
 */
import { createRng, shuffle, type Rng } from "@/lib/random";
import type { DifficultyValue } from "./types";

export type BlueprintDomain = { domainId: string; weightMin: number | null; weightMax: number | null };

export type PoolQuestion = {
  id: string;
  domainId: string;
  difficulty: DifficultyValue;
  /** When the learner last saw this question (null = never). */
  lastSeenAt?: Date | null;
  /** How many times the learner has answered it. */
  timesSeen?: number;
  /** Whether the learner has mastered it (e.g. review item mastered or answered correctly repeatedly). */
  mastered?: boolean;
};

/** Relative weight of a domain = midpoint of its official weight range (equal share when unknown). */
export function domainWeights(domains: BlueprintDomain[]): Map<string, number> {
  const known = domains.filter((d) => d.weightMin !== null || d.weightMax !== null);
  const knownTotal = known.reduce((s, d) => s + ((d.weightMin ?? d.weightMax ?? 0) + (d.weightMax ?? d.weightMin ?? 0)) / 2, 0);
  const unknownCount = domains.length - known.length;
  const unknownShare = unknownCount ? Math.max(0, 100 - knownTotal) / unknownCount || 100 / domains.length : 0;
  const raw = new Map<string, number>();
  for (const d of domains) {
    const mid =
      d.weightMin === null && d.weightMax === null
        ? unknownShare
        : ((d.weightMin ?? d.weightMax ?? 0) + (d.weightMax ?? d.weightMin ?? 0)) / 2;
    raw.set(d.domainId, Math.max(0, mid));
  }
  const total = [...raw.values()].reduce((a, b) => a + b, 0) || 1;
  return new Map([...raw].map(([k, v]) => [k, v / total]));
}

/**
 * Allocate `total` questions across domains proportionally to the blueprint
 * (largest remainder method). Every domain gets at least one question when possible.
 */
export function allocateByBlueprint(domains: BlueprintDomain[], total: number): Map<string, number> {
  const result = new Map<string, number>();
  if (domains.length === 0 || total <= 0) return result;
  const weights = domainWeights(domains);
  const exact = domains.map((d) => ({ id: d.domainId, value: (weights.get(d.domainId) ?? 0) * total }));
  let assigned = 0;
  for (const e of exact) {
    const base = Math.floor(e.value);
    result.set(e.id, base);
    assigned += base;
  }
  const byRemainder = [...exact].sort((a, b) => b.value - Math.floor(b.value) - (a.value - Math.floor(a.value)) || a.id.localeCompare(b.id));
  for (let i = 0; assigned < total; i++, assigned++) {
    const e = byRemainder[i % byRemainder.length]!;
    result.set(e.id, (result.get(e.id) ?? 0) + 1);
  }
  if (total >= domains.length) {
    for (const d of domains) {
      if ((result.get(d.domainId) ?? 0) === 0) {
        const donor = [...result.entries()].sort((a, b) => b[1] - a[1])[0]!;
        result.set(donor[0], donor[1] - 1);
        result.set(d.domainId, 1);
      }
    }
  }
  return result;
}

const DAY = 24 * 60 * 60 * 1000;

/** Lower is better: prefer unseen, then least recently seen, then non-mastered questions. */
function freshnessPenalty(q: PoolQuestion, now: number): number {
  let penalty = 0;
  if (q.lastSeenAt) {
    const days = (now - q.lastSeenAt.getTime()) / DAY;
    penalty += days < 1 ? 100 : days < 3 ? 60 : days < 7 ? 30 : days < 30 ? 10 : 2;
  }
  penalty += (q.timesSeen ?? 0) * 3;
  if (q.mastered) penalty += 25;
  return penalty;
}

export type SelectOptions = {
  rng?: Rng;
  now?: Date;
  /** Optional per-difficulty targets as fractions, e.g. { EASY: 0.3, MEDIUM: 0.5, HARD: 0.2 } */
  difficultyMix?: Partial<Record<DifficultyValue, number>>;
};

function pickFromDomain(pool: PoolQuestion[], count: number, rng: Rng, now: number, mix?: SelectOptions["difficultyMix"]): PoolQuestion[] {
  const ranked = shuffle(pool, rng).sort((a, b) => freshnessPenalty(a, now) - freshnessPenalty(b, now));
  if (!mix) return ranked.slice(0, count);
  const chosen: PoolQuestion[] = [];
  const used = new Set<string>();
  for (const level of ["EASY", "MEDIUM", "HARD"] as const) {
    const target = Math.round((mix[level] ?? 0) * count);
    for (const q of ranked) {
      if (chosen.length >= count || chosen.filter((c) => c.difficulty === level).length >= target) break;
      if (q.difficulty === level && !used.has(q.id)) {
        chosen.push(q);
        used.add(q.id);
      }
    }
  }
  for (const q of ranked) {
    if (chosen.length >= count) break;
    if (!used.has(q.id)) {
      chosen.push(q);
      used.add(q.id);
    }
  }
  return chosen;
}

/**
 * Select questions following an allocation. Shortfalls in one domain are
 * filled from other domains so the exam still reaches the requested size when possible.
 */
export function selectQuestions(pool: PoolQuestion[], allocation: Map<string, number>, options: SelectOptions = {}): string[] {
  const rng = options.rng ?? Math.random;
  const now = (options.now ?? new Date()).getTime();
  const byDomain = new Map<string, PoolQuestion[]>();
  for (const q of pool) byDomain.set(q.domainId, [...(byDomain.get(q.domainId) ?? []), q]);

  const chosen: PoolQuestion[] = [];
  const used = new Set<string>();
  let shortfall = 0;
  for (const [domainId, count] of allocation) {
    const picked = pickFromDomain(byDomain.get(domainId) ?? [], count, rng, now, options.difficultyMix);
    picked.forEach((q) => used.add(q.id));
    chosen.push(...picked);
    shortfall += count - picked.length;
  }
  if (shortfall > 0) {
    const rest = pool.filter((q) => !used.has(q.id));
    chosen.push(...pickFromDomain(rest, shortfall, rng, now));
  }
  return shuffle(chosen, rng).map((q) => q.id);
}

/** Convenience: allocate by blueprint then select. */
export function buildExam(pool: PoolQuestion[], domains: BlueprintDomain[], total: number, seed: string, now = new Date()): string[] {
  const rng = createRng(seed);
  const allocation = allocateByBlueprint(domains, Math.min(total, pool.length));
  return selectQuestions(pool, allocation, { rng, now });
}
