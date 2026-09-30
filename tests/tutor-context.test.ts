import { describe, expect, it } from "vitest";
import { lessonContextFromBlocks, mistakeContextFromAttempt, shouldUseQuestionContext } from "@/modules/tutor/context";

describe("tutor context rules", () => {
  it("ignores question context without a learner attempt", () => {
    expect(shouldUseQuestionContext("q1", false)).toBe(false);
    expect(shouldUseQuestionContext("q1", true)).toBe(true);
    expect(shouldUseQuestionContext(undefined, true)).toBe(false);
  });

  it("builds lesson context from approved learner-visible blocks", () => {
    const lesson = lessonContextFromBlocks({
      id: "l1",
      title: "Shared responsibility",
      href: "/learn/AZ-900/shared",
      certCode: "AZ-900",
      blocks: [
        { key: "obj", type: "LEARNING_OBJECTIVES", data: { items: ["Describe cloud responsibility"] } },
        { key: "exp", type: "EXPLANATION", data: { markdown: "Customers own data and identities." } },
        { key: "term", type: "TERMINOLOGY", data: { terms: [{ term: "IaaS", definition: "Infrastructure as a service" }] } },
      ],
    });
    expect(lesson.objectives).toEqual(["Describe cloud responsibility"]);
    expect(lesson.explanation).toContain("Customers own data");
    expect(lesson.terminology).toEqual([{ term: "IaaS", definition: "Infrastructure as a service" }]);
  });

  it("includes correct answers only from answered attempts", () => {
    const mistake = mistakeContextFromAttempt({
      stem: "Which service is PaaS?",
      explanation: "App Service is PaaS.",
      response: { kind: "choice", selected: ["A"] },
      options: [
        { key: "A", text: "Virtual Machines", isCorrect: false, explanation: "VMs are IaaS." },
        { key: "B", text: "App Service", isCorrect: true, explanation: "App Service is PaaS." },
      ],
      lessonTitle: "Cloud services",
    });
    expect(mistake.given).toBe("Virtual Machines");
    expect(mistake.correct).toBe("App Service");
    expect(mistake.explanation).toBe("App Service is PaaS.");
  });
});
