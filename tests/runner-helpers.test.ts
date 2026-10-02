import { describe, expect, it } from "vitest";
import { crossedSecondWarnings, crossedWarnings, hasContent, remainingTime } from "@/modules/assessment/engine/response";
import { plainSnippet } from "@/lib/text";
import { safeCallbackUrl } from "@/lib/urls";
import { errorText } from "@/i18n/errors";
import { createTranslator } from "@/i18n/translator";
import { en } from "@/i18n/messages/en";

describe("hasContent", () => {
  it("detects empty and filled responses for every response kind", () => {
    expect(hasContent(null)).toBe(false);
    expect(hasContent({ kind: "choice", selected: [] })).toBe(false);
    expect(hasContent({ kind: "choice", selected: ["A"] })).toBe(true);
    expect(hasContent({ kind: "matching", pairs: { p1: "" } })).toBe(false);
    expect(hasContent({ kind: "matching", pairs: { p1: "a1" } })).toBe(true);
    expect(hasContent({ kind: "categorization", placements: {} })).toBe(false);
    expect(hasContent({ kind: "categorization", placements: { i1: "c1" } })).toBe(true);
    expect(hasContent({ kind: "fill", blanks: { b1: "   " } })).toBe(false);
    expect(hasContent({ kind: "fill", blanks: { b1: "region" } })).toBe(true);
    expect(hasContent({ kind: "caseStudy", answers: {} })).toBe(false);
    expect(hasContent({ kind: "caseStudy", answers: { s1: false } })).toBe(true);
    expect(hasContent({ kind: "uiSimulation", values: {} })).toBe(false);
    expect(hasContent({ kind: "uiSimulation", values: { f1: false } })).toBe(true);
    expect(hasContent({ kind: "ordering", order: ["a", "b"] })).toBe(true);
  });
});

describe("exam timer helpers", () => {
  it("corrects remaining time for clock skew between server and client", () => {
    const serverNow = "2026-01-01T10:00:00.000Z";
    const expires = "2026-01-01T10:45:00.000Z";
    // Client clock is 2 minutes behind the server.
    const clientLoad = new Date("2026-01-01T09:58:00.000Z").getTime();
    expect(remainingTime(expires, serverNow, clientLoad, clientLoad)).toBe(45 * 60_000);
    expect(remainingTime(expires, serverNow, clientLoad, clientLoad + 60_000)).toBe(44 * 60_000);
  });

  it("announces each threshold once when it is crossed, never retroactively", () => {
    expect(crossedWarnings(null, 4 * 60_000)).toEqual([]);
    expect(crossedWarnings(10 * 60_000 + 500, 10 * 60_000 - 500)).toEqual([10]);
    expect(crossedWarnings(5 * 60_000 + 1, 5 * 60_000)).toEqual([5]);
    expect(crossedWarnings(4 * 60_000, 3 * 60_000)).toEqual([]);
    expect(crossedWarnings(61_000, 59_000)).toEqual([1]);
    expect(crossedWarnings(1_000, -1)).toEqual([]);
    // A long pause (e.g. sleeping laptop) can cross several thresholds at once.
    expect(crossedWarnings(11 * 60_000, 4 * 60_000)).toEqual([10, 5]);
  });

  it("announces short lightning thresholds in seconds", () => {
    expect(crossedSecondWarnings(null, 50_000)).toEqual([]);
    expect(crossedSecondWarnings(61_000, 59_000)).toEqual([60]);
    expect(crossedSecondWarnings(31_000, 9_000)).toEqual([30, 10]);
  });
});

describe("plainSnippet", () => {
  it("strips Markdown syntax and truncates", () => {
    expect(plainSnippet("**Which** service `az group create` [docs](https://x.test)?")).toBe("Which service az group create docs?");
    expect(plainSnippet("a".repeat(300), 20)).toHaveLength(20);
    expect(plainSnippet("```\ncode\n```\nText")).toBe("Text");
  });
});

describe("safeCallbackUrl", () => {
  it("allows only same-origin relative paths", () => {
    expect(safeCallbackUrl("/practice?mode=FULL")).toBe("/practice?mode=FULL");
    expect(safeCallbackUrl("//evil.example")).toBe("/dashboard");
    expect(safeCallbackUrl("/\\evil.example")).toBe("/dashboard");
    expect(safeCallbackUrl("https://evil.example")).toBe("/dashboard");
    expect(safeCallbackUrl("/ok\n/next")).toBe("/dashboard");
    expect(safeCallbackUrl(undefined, "/learn")).toBe("/learn");
  });
});

describe("errorText", () => {
  const t = createTranslator(en);
  it("maps known codes and falls back for unknown ones", () => {
    expect(errorText(t, "rate_limited")).toBe(en.errors.rate_limited);
    expect(errorText(t, "definitely_not_a_code")).toBe(en.errors.unknown);
    expect(errorText(t, undefined)).toBe(en.errors.unknown);
  });
});
