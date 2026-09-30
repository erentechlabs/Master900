import { describe, expect, it } from "vitest";
import { onboardingInputSchema } from "@/modules/learning/onboarding";
import { evaluateCertificateCriteria, certificateVerificationId } from "@/modules/learning/certificates";
import { groupByWeek, weekStartISO } from "@/modules/planner/grouping";

describe("onboarding validation", () => {
  it("normalizes selected certifications and study days", () => {
    const parsed = onboardingInputSchema.parse({
      certificationCodes: ["az-900", "AZ-900", "AI-901"],
      experienceLevel: "NEW_TO_TECH",
      studyDays: [5, 1, 1],
      sessionMinutes: 30,
      learningStyle: "READING",
      locale: "en",
      timezone: "UTC",
    });
    expect(parsed.certificationCodes).toEqual(["AZ-900", "AI-901"]);
    expect(parsed.studyDays).toEqual([1, 5]);
  });

  it("rejects past target dates", () => {
    expect(() =>
      onboardingInputSchema.parse({
        certificationCodes: ["AZ-900"],
        experienceLevel: "NEW_TO_TECH",
        targetExamDate: "2000-01-01",
        studyDays: [1],
        sessionMinutes: 30,
        learningStyle: "READING",
        locale: "en",
        timezone: "UTC",
      }),
    ).toThrow();
  });
});

describe("certificate criteria", () => {
  it("requires all visible lessons and a full practice exam", () => {
    expect(evaluateCertificateCriteria({ visibleLessons: 10, completedLessons: 10, fullPracticeSubmitted: 0 }).earned).toBe(false);
    expect(evaluateCertificateCriteria({ visibleLessons: 10, completedLessons: 9, fullPracticeSubmitted: 1 }).earned).toBe(false);
    expect(evaluateCertificateCriteria({ visibleLessons: 10, completedLessons: 10, fullPracticeSubmitted: 1 }).earned).toBe(true);
  });

  it("uses stable deterministic verification ids", () => {
    expect(certificateVerificationId("user-1", "cert-1")).toBe(certificateVerificationId("user-1", "cert-1"));
    expect(certificateVerificationId("user-1", "cert-1")).not.toBe(certificateVerificationId("user-2", "cert-1"));
  });
});

describe("planner week grouping", () => {
  it("groups sessions by Sunday-start weeks", () => {
    expect(weekStartISO("2026-09-30")).toBe("2026-09-27");
    const groups = groupByWeek([
      { id: "b", date: "2026-10-04" },
      { id: "a", date: "2026-09-30" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.weekStart).toBe("2026-09-27");
    expect(groups[0]?.days[0]?.items[0]?.id).toBe("a");
  });
});

