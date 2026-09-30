import type { QuestionResponse } from "./types";

/** Whether a response contains anything worth saving or checking. */
export function hasContent(response: QuestionResponse | null | undefined): boolean {
  if (!response) return false;
  switch (response.kind) {
    case "choice":
      return response.selected.length > 0;
    case "ordering":
      return response.order.length > 0;
    case "matching":
      return Object.values(response.pairs).some(Boolean);
    case "categorization":
      return Object.values(response.placements).some(Boolean);
    case "fill":
      return Object.values(response.blanks).some((v) => v.trim().length > 0);
    case "caseStudy":
      return Object.keys(response.answers).length > 0;
    case "uiSimulation":
      return Object.keys(response.values).length > 0;
  }
}

/** Remaining time in ms for a timed attempt, corrected for the offset between server and client clocks. */
export function remainingTime(expiresAtISO: string, serverNowISO: string, clientNowAtLoad: number, clientNow: number): number {
  const offset = new Date(serverNowISO).getTime() - clientNowAtLoad;
  return new Date(expiresAtISO).getTime() - (clientNow + offset);
}

/**
 * Time warnings (in minutes) that should be announced when moving from `previousMs` to `currentMs` remaining.
 * Thresholds already passed before the first tick (previousMs === null) are not announced retroactively.
 */
export function crossedWarnings(previousMs: number | null, currentMs: number, thresholds: readonly number[] = [10, 5, 1]): number[] {
  if (previousMs === null || currentMs <= 0) return [];
  return thresholds.filter((m) => previousMs > m * 60_000 && currentMs <= m * 60_000);
}
