import { describe, expect, it } from "vitest";
import { buildSnippet, clampSearchQuery, highlightSegments } from "@/modules/learning/search-utils";
import { orderLessons, progressPercent, recommendedNextLesson, type OrderedLesson } from "@/modules/learning/path-utils";

const lessons: OrderedLesson[] = [
  { id: "2", slug: "b", title: "B", domainId: "weak", domainSort: 2, moduleId: "m2", moduleSort: 1, sortOrder: 1, progressStatus: null },
  { id: "1", slug: "a", title: "A", domainId: "strong", domainSort: 1, moduleId: "m1", moduleSort: 1, sortOrder: 1, progressStatus: "COMPLETED" },
  { id: "3", slug: "c", title: "C", domainId: "strong", domainSort: 1, moduleId: "m1", moduleSort: 1, sortOrder: 2, progressStatus: null },
];

describe("learning path helpers", () => {
  it("orders lessons by domain, module and lesson sort", () => {
    expect(orderLessons(lessons).map((lesson) => lesson.id)).toEqual(["1", "3", "2"]);
  });

  it("recommends weak unfinished lessons before normal path order", () => {
    expect(recommendedNextLesson(lessons, ["weak"])?.id).toBe("2");
    expect(recommendedNextLesson(lessons)?.id).toBe("3");
  });

  it("computes whole-number progress", () => {
    expect(progressPercent(2, 3)).toBe(67);
    expect(progressPercent(0, 0)).toBe(0);
  });
});

describe("search helpers", () => {
  it("clamps and trims queries", () => {
    expect(clampSearchQuery(`  ${"a".repeat(120)}  `)).toHaveLength(100);
  });

  it("builds a bounded snippet around the first match", () => {
    expect(buildSnippet("Azure compute storage networking identity", "storage", 8)).toBe("…compute storage network…");
  });

  it("returns escaped text segments for highlighting", () => {
    expect(highlightSegments("Azure AI and azure data", "azure")).toEqual([
      { text: "Azure", match: true },
      { text: " AI and ", match: false },
      { text: "azure", match: true },
      { text: " data", match: false },
    ]);
  });
});
