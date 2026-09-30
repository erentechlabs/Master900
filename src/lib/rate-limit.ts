/**
 * Sliding-window rate limiter.
 *
 * The default store is in-memory, which is correct for a single application
 * instance. For horizontally scaled deployments, implement `RateLimitStore`
 * with a shared backend (for example Redis) and call `setRateLimitStore`.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): number[];
  reset(key?: string): void;
}

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, number[]>();
  private lastSweep = 0;

  hit(key: string, windowMs: number, now: number): number[] {
    if (now - this.lastSweep > 60_000) this.sweep(now);
    const hits = (this.buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    this.buckets.set(key, hits);
    return hits;
  }

  reset(key?: string) {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }

  private sweep(now: number) {
    this.lastSweep = now;
    for (const [key, hits] of this.buckets) {
      if (hits.length === 0 || now - hits[hits.length - 1]! > 60 * 60_000) this.buckets.delete(key);
    }
    if (this.buckets.size > 50_000) this.buckets.clear();
  }
}

let store: RateLimitStore = new MemoryStore();

export function setRateLimitStore(next: RateLimitStore) {
  store = next;
}

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterMs: number };

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const hits = store.hit(key, windowMs, now);
  if (hits.length >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: Math.max(0, windowMs - (now - hits[0]!)) };
  }
  hits.push(now);
  return { ok: true, remaining: limit - hits.length, retryAfterMs: 0 };
}

export function resetRateLimits(key?: string) {
  store.reset(key);
}

export const RATE_LIMITS = {
  signIn: { limit: 8, windowMs: 15 * 60_000 },
  signInIp: { limit: 40, windowMs: 15 * 60_000 },
  signUp: { limit: 5, windowMs: 60 * 60_000 },
  tutor: { limit: 20, windowMs: 60_000 },
  answer: { limit: 120, windowMs: 60_000 },
  labAction: { limit: 240, windowMs: 60_000 },
  mutation: { limit: 60, windowMs: 60_000 },
  export: { limit: 5, windowMs: 60 * 60_000 },
  import: { limit: 10, windowMs: 10 * 60_000 },
  upload: { limit: 20, windowMs: 10 * 60_000 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

export function limitBy(name: RateLimitName, key: string): RateLimitResult {
  const cfg = RATE_LIMITS[name];
  return rateLimit(`${name}:${key}`, cfg.limit, cfg.windowMs);
}
