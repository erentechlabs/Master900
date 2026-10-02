import { describe, expect, it } from "vitest";
import { endFocusSession, isPlausibleFocusCompletion, pauseFocusSession, remainingFromEnd, resumeFocusSession, startFocusSession, validateFocusMinutes } from "@/components/focus/focus-timer";

describe("focus session timer helpers", () => {
  it("starts, pauses and resumes with absolute end timestamps", () => {
    const started = startFocusSession(25, 1_000, "session-1");
    expect(started.status).toBe("running");
    if (started.status !== "running") throw new Error("expected running state");
    expect(started.endsAt).toBe(1_501_000);
    expect(remainingFromEnd(started.endsAt, 61_000)).toBe(1_440_000);
    const paused = pauseFocusSession(started, 61_000);
    expect(paused).toMatchObject({ status: "paused", remainingMs: 1_440_000 });
    const resumed = resumeFocusSession(paused, 121_000);
    expect(resumed).toMatchObject({ status: "running", endsAt: 1_561_000 });
  });

  it("validates duration limits", () => {
    expect(validateFocusMinutes("15")).toBe(15);
    expect(() => validateFocusMinutes(0)).toThrow();
    expect(() => validateFocusMinutes(121)).toThrow();
    expect(endFocusSession(45)).toMatchObject({ status: "idle", remainingMs: 2_700_000 });
  });

  it("rejects implausible completions for the local wall clock", () => {
    const tenThirty = new Date(2026, 0, 1, 10, 30, 0);
    expect(isPlausibleFocusCompletion(25, 1, tenThirty)).toBe(true);
    expect(isPlausibleFocusCompletion(60, 30, tenThirty)).toBe(false);
  });
});
