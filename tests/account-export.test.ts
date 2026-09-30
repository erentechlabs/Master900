import { describe, expect, it } from "vitest";
import { serializeAccountExport } from "@/modules/account/export";

describe("account export serialization", () => {
  it("does not include authentication secrets or practice item answer ordering", () => {
    const now = new Date("2026-09-30T10:00:00Z");
    const data = serializeAccountExport(
      {
        id: "u1",
        email: "learner@example.com",
        name: "Learner",
        status: "ACTIVE",
        locale: "en",
        onboardingCompletedAt: null,
        isDemo: false,
        createdAt: now,
        updatedAt: now,
        passwordHash: "secret",
        sessionVersion: 9,
        preference: { userId: "u1", timezone: "UTC" },
        enrollments: [],
        lessonProgress: [],
        questionAttempts: [
          {
            id: "qa1",
            questionId: "q1",
            questionVersion: 1,
            certificationId: "c1",
            domainId: "d1",
            difficulty: "EASY",
            context: "PRACTICE",
            response: { kind: "choice", selected: ["A"] },
            isCorrect: false,
            score: 0,
            timeMs: 1000,
            confidence: 2,
            reasoning: null,
            answeredAt: now,
            question: { code: "Q1", stem: "Stem", explanation: "Reviewed explanation", type: "SINGLE_CHOICE", certification: { code: "AZ-900" } },
          },
        ],
        quizAttempts: [],
        practiceAttempts: [{ id: "pa1", items: [{ questionId: "q1", optionOrder: ["A"] }], settings: { immediateFeedback: true } }],
        notes: [],
        bookmarks: [],
        studyPlans: [],
        badges: [],
        tutorConversations: [],
      } as never,
      now,
    );
    const json = JSON.stringify(data);
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("sessionVersion");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("optionOrder");
    expect(json).not.toContain("answerKey");
    expect(data.profile.email).toBe("learner@example.com");
    expect(data.questionAttempts[0]).toMatchObject({ question: { explanation: "Reviewed explanation" } });
  });
});
