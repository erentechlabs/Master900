import { describe, expect, it } from "vitest";
import azLabs from "../prisma/seed-data/courses/az-900/labs.json";
import aiLabs from "../prisma/seed-data/courses/ai-901/labs.json";
import { projectLabContent, publicLabConfig } from "@/modules/labs/projection";

type SeedLab = {
  slug: string;
  type: "UI_SIMULATION" | "COMMAND_SANDBOX" | "ARCHITECTURE" | "TROUBLESHOOTING" | "BUSINESS_SCENARIO";
  title: string;
  summary: string;
  scenario: string;
  learningObjectives?: string[];
  prerequisites?: string[];
  complexity?: "INTRO" | "BASIC" | "INTERMEDIATE";
  estimatedMinutes?: number;
  config: unknown;
  steps?: { key: string; title: string; instruction: string; hint?: string; explanation: string; rules?: unknown[] }[];
  finalRules?: unknown[];
  solution: string;
};

function hasForbiddenKey(value: unknown, keys: Set<string>): boolean {
  if (Array.isArray(value)) return value.some((item) => hasForbiddenKey(item, keys));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => keys.has(key) || hasForbiddenKey(child, keys));
}

function seedLabToProjectionInput(lab: SeedLab) {
  return {
    id: lab.slug,
    slug: lab.slug,
    type: lab.type,
    title: lab.title,
    summary: lab.summary,
    scenario: lab.scenario,
    learningObjectives: lab.learningObjectives ?? [],
    prerequisites: lab.prerequisites ?? [],
    complexity: lab.complexity ?? "INTRO",
    estimatedMinutes: lab.estimatedMinutes ?? 15,
    status: "PUBLISHED" as const,
    version: 1,
    translations: null,
    config: lab.config,
    solution: lab.solution,
    certification: { id: "cert", code: lab.slug.startsWith("choose-ai") || lab.slug.startsWith("configure-safe") ? "AI-901" : "AZ-900", name: "Test cert" },
    domain: null,
    module: null,
    steps: (lab.steps ?? []).map((s, index) => ({
      key: s.key,
      title: s.title,
      instruction: s.instruction,
      hint: s.hint ?? null,
      explanation: s.explanation,
      targetId: null,
      sortOrder: index,
    })),
    sources: [],
  };
}

const seedLabs = [...(azLabs.labs as SeedLab[]), ...(aiLabs.labs as SeedLab[])];

describe("lab public projection", () => {
  it("strips solutions, validation rules and hidden decision answers from every seed lab", () => {
    expect(seedLabs).toHaveLength(6);
    for (const lab of seedLabs) {
      const content = projectLabContent(seedLabToProjectionInput(lab), "en");
      const json = JSON.stringify(content);
      expect(json).not.toContain(lab.solution.slice(0, 30));
      expect(json).not.toContain("finalRules");
      expect(json).not.toContain("\"rule\"");
      expect(json).not.toContain("\"rules\"");
      expect(content.steps.some((step) => "hint" in step)).toBe(false);
      if (lab.type === "TROUBLESHOOTING" || lab.type === "BUSINESS_SCENARIO") {
        expect(hasForbiddenKey(content.config, new Set(["correct", "feedback", "modelAnswer"]))).toBe(false);
      }
    }
  });

  it("only includes a solution when reveal projection is explicitly requested", () => {
    const lab = seedLabs[0]!;
    const input = seedLabToProjectionInput(lab);
    expect(projectLabContent(input, "en").solution).toBeUndefined();
    expect(projectLabContent(input, "en", { includeSolution: true }).solution).toBe(lab.solution);
  });

  it("validates public config shape for each lab type", () => {
    for (const lab of seedLabs) {
      expect(() => publicLabConfig(lab.type, lab.config)).not.toThrow();
    }
  });
});
