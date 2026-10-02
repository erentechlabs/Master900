import { describe, expect, it } from "vitest";
import { attemptStars, bestLabStars, labStars, nextLabInCertification } from "@/modules/labs/stars";

describe("labStars", () => {
  it("awards stars by completion assistance", () => {
    expect(labStars({ completed: false, hintsUsed: 0, solutionViewed: false })).toBe(0);
    expect(labStars({ completed: true, hintsUsed: 0, solutionViewed: false })).toBe(3);
    expect(labStars({ completed: true, hintsUsed: 2, solutionViewed: false })).toBe(2);
    expect(labStars({ completed: true, hintsUsed: 0, solutionViewed: true })).toBe(1);
    expect(labStars({ completed: true, hintsUsed: 3, solutionViewed: true })).toBe(1);
  });

  it("selects the best stars across attempts and metadata", () => {
    expect(attemptStars({ status: "COMPLETED", hintsUsed: 1, solutionViewed: false })).toBe(2);
    expect(bestLabStars([
      { status: "COMPLETED", hintsUsed: 3, solutionViewed: true },
      { status: "COMPLETED", hintsUsed: 1, solutionViewed: false },
      { status: "IN_PROGRESS", hintsUsed: 0, solutionViewed: false },
      { stars: 3 },
    ])).toBe(3);
  });

  it("finds the next uncompleted lab in certification order", () => {
    const labs = [
      { id: "a", certificationId: "az", sortOrder: 1 },
      { id: "b", certificationId: "az", sortOrder: 2 },
      { id: "c", certificationId: "az", sortOrder: 3 },
      { id: "d", certificationId: "ai", sortOrder: 1 },
    ];
    expect(nextLabInCertification(labs, "a", new Set(["a"]))?.id).toBe("b");
    expect(nextLabInCertification(labs, "b", new Set(["a", "b"]))?.id).toBe("c");
    expect(nextLabInCertification(labs, "c", new Set(["a", "c"]))?.id).toBe("b");
    expect(nextLabInCertification(labs, "c", new Set(["a", "b", "c"]))?.id).toBeUndefined();
  });
});
