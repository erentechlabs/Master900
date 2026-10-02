export type FocusTimerState =
  | { status: "idle"; durationMinutes: number; remainingMs: number; clientSessionId: string | null; endsAt: null; pausedAt: null }
  | { status: "running"; durationMinutes: number; remainingMs: number; clientSessionId: string; endsAt: number; pausedAt: null }
  | { status: "paused"; durationMinutes: number; remainingMs: number; clientSessionId: string; endsAt: null; pausedAt: number };

export const FOCUS_DURATIONS = [15, 25, 45, 60] as const;

export function createClientSessionId(now = Date.now(), random = Math.random()): string {
  return `${now.toString(36)}-${Math.floor(random * 1_000_000).toString(36)}`;
}

export function validateFocusMinutes(value: unknown): number {
  const minutes = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw new Error("invalid_minutes");
  return minutes;
}

export function remainingFromEnd(endsAt: number, now = Date.now()): number {
  return Math.max(0, endsAt - now);
}

export function startFocusSession(durationMinutes: number, now = Date.now(), clientSessionId = createClientSessionId(now)): FocusTimerState {
  const minutes = validateFocusMinutes(durationMinutes);
  return { status: "running", durationMinutes: minutes, remainingMs: minutes * 60_000, clientSessionId, endsAt: now + minutes * 60_000, pausedAt: null };
}

export function pauseFocusSession(state: FocusTimerState, now = Date.now()): FocusTimerState {
  if (state.status !== "running") return state;
  return { status: "paused", durationMinutes: state.durationMinutes, remainingMs: remainingFromEnd(state.endsAt, now), clientSessionId: state.clientSessionId, endsAt: null, pausedAt: now };
}

export function resumeFocusSession(state: FocusTimerState, now = Date.now()): FocusTimerState {
  if (state.status !== "paused" || !state.clientSessionId) return state;
  return { status: "running", durationMinutes: state.durationMinutes, remainingMs: state.remainingMs, clientSessionId: state.clientSessionId, endsAt: now + state.remainingMs, pausedAt: null };
}

export function endFocusSession(durationMinutes = 25): FocusTimerState {
  return { status: "idle", durationMinutes, remainingMs: durationMinutes * 60_000, clientSessionId: null, endsAt: null, pausedAt: null };
}

export function isPlausibleFocusCompletion(minutes: number, completedToday: number, now = new Date()): boolean {
  const valid = validateFocusMinutes(minutes);
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", second: "numeric", hour12: false }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const elapsedMinutes = get("hour") * 60 + get("minute") + get("second") / 60;
  return completedToday < Math.floor(elapsedMinutes / valid) + 1;
}
