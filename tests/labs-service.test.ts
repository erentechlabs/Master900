import fs from "node:fs";
import path from "node:path";
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

/**
 * Portal form `checks` ({ rule, message }) are part of the simulated portal's behaviour: the client runs the same
 * reducer optimistically, so they are public by design (like `if`/`fail` actions). Grading rules must never be.
 */
function withoutFormChecks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFormChecks);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "checks").map(([key, child]) => [key, withoutFormChecks(child)]));
}

function allSeedLabs(): SeedLab[] {
  const root = path.resolve(__dirname, "../prisma/seed-data/courses");
  return fs
    .readdirSync(root)
    .flatMap((cert) => fs.readdirSync(path.join(root, cert)).filter((file) => file.startsWith("labs") && file.endsWith(".json")).map((file) => path.join(root, cert, file)))
    .flatMap((file) => (JSON.parse(fs.readFileSync(file, "utf8")) as { labs: SeedLab[] }).labs);
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
  it("strips solutions, grading rules and hidden decision answers from every seed lab", () => {
    const labs = allSeedLabs();
    expect(labs.length).toBeGreaterThanOrEqual(50);
    for (const lab of labs) {
      const content = projectLabContent(seedLabToProjectionInput(lab), "en");
      const json = JSON.stringify(content);
      expect(json, lab.slug).not.toContain(lab.solution.slice(0, 30));
      expect(json, lab.slug).not.toContain("finalRules");
      expect(content.steps.some((step) => "rules" in step || "hint" in step), lab.slug).toBe(false);
      // Grading rules (step rules, final rules) are never projected. Portal behaviour such as form `checks`, `if`
      // conditions or composite `when` rules is public by design because the client runs the same reducer, so the
      // key-name checks below only apply to the non-portal lab types.
      if (lab.type !== "UI_SIMULATION") {
        expect(JSON.stringify(withoutFormChecks(content)), lab.slug).not.toContain("\"rule\"");
        expect(json, lab.slug).not.toContain("\"rules\"");
      }
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
