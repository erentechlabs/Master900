import type { LabComplexity, LabMode, LabType, ContentStatus } from "@prisma/client";
import { localizedField, pickTranslated } from "@/i18n/translator";
import { architectureConfigSchema } from "./engine/architecture";
import { sandboxConfigSchema } from "./engine/command-sandbox";
import { publicDecisionConfig } from "./engine/decision";
import { labConfigSchema, type LabTypeValue } from "./engine/schemas";
import { uiSimConfigSchema } from "./engine/ui-simulation";

export type PublicLabStep = {
  key: string;
  title: string;
  instruction: string;
  hintAvailable: boolean;
  explanation?: string;
  targetId?: string | null;
};

export type PublicLabContent = {
  id: string;
  slug: string;
  type: LabType;
  title: string;
  summary: string;
  scenario: string;
  learningObjectives: string[];
  prerequisites: string[];
  complexity: LabComplexity;
  estimatedMinutes: number;
  mode?: LabMode;
  status: ContentStatus;
  version: number;
  certification: { id: string; code: string; name: string };
  domain?: { id: string; key: string; title: string } | null;
  module?: { id: string; slug: string; title: string } | null;
  steps: PublicLabStep[];
  config: unknown;
  sources: { title: string; url: string; kind?: string | null }[];
  solution?: string;
};

type SourceRow = { source: { title: string; url: string; kind?: string | null } };
type StepRow = {
  key: string;
  title: string;
  instruction: string;
  hint: string | null;
  explanation: string;
  targetId: string | null;
};
type LabRow = {
  id: string;
  slug: string;
  type: LabType;
  title: string;
  summary: string;
  scenario: string;
  learningObjectives: string[];
  prerequisites: string[];
  complexity: LabComplexity;
  estimatedMinutes: number;
  status: ContentStatus;
  version: number;
  translations: unknown;
  config: unknown;
  solution: string;
  certification: { id: string; code: string; name: string };
  domain?: { id: string; key: string; title: string } | null;
  module?: { id: string; slug: string; title: string } | null;
  steps: StepRow[];
  sources: SourceRow[];
};

export function publicLabConfig(type: LabTypeValue, config: unknown): unknown {
  const parsed = labConfigSchema(type).parse(config);
  switch (type) {
    case "UI_SIMULATION":
      return uiSimConfigSchema.parse(parsed);
    case "COMMAND_SANDBOX": {
      const sandbox = sandboxConfigSchema.parse(parsed);
      return { ...sandbox, initialState: sandbox.initialState };
    }
    case "ARCHITECTURE":
      return architectureConfigSchema.parse(parsed);
    case "TROUBLESHOOTING":
    case "BUSINESS_SCENARIO":
      return publicDecisionConfig(parsed as never);
  }
}

export function localizedLabSteps(steps: StepRow[], translations: unknown, locale: string): PublicLabStep[] {
  const translated = pickTranslated<{ steps?: Record<string, Partial<StepRow>> }>(translations, locale)?.steps;
  return steps.map((step) => {
    const t = translated?.[step.key];
    return {
      key: step.key,
      title: typeof t?.title === "string" && t.title.trim() ? t.title : step.title,
      instruction: typeof t?.instruction === "string" && t.instruction.trim() ? t.instruction : step.instruction,
      hintAvailable: !!(typeof t?.hint === "string" ? t.hint : step.hint),
      explanation: typeof t?.explanation === "string" && t.explanation.trim() ? t.explanation : step.explanation,
      targetId: step.targetId,
    };
  });
}

export function localizedLabHint(step: StepRow, translations: unknown, locale: string): string | null {
  const translated = pickTranslated<{ steps?: Record<string, Partial<StepRow>> }>(translations, locale)?.steps?.[step.key];
  const hint = typeof translated?.hint === "string" && translated.hint.trim() ? translated.hint : step.hint;
  return hint?.trim() ? hint : null;
}

export function projectLabContent(lab: LabRow, locale: string, options?: { includeSolution?: boolean; mode?: LabMode }): PublicLabContent {
  return {
    id: lab.id,
    slug: lab.slug,
    type: lab.type,
    title: localizedField(lab.title, lab.translations, locale, "title"),
    summary: localizedField(lab.summary, lab.translations, locale, "summary"),
    scenario: localizedField(lab.scenario, lab.translations, locale, "scenario"),
    learningObjectives: lab.learningObjectives,
    prerequisites: lab.prerequisites,
    complexity: lab.complexity,
    estimatedMinutes: lab.estimatedMinutes,
    mode: options?.mode,
    status: lab.status,
    version: lab.version,
    certification: lab.certification,
    domain: lab.domain,
    module: lab.module,
    steps: localizedLabSteps(lab.steps, lab.translations, locale),
    config: publicLabConfig(lab.type, lab.config),
    sources: lab.sources.map((s) => ({ title: s.source.title, url: s.source.url, kind: s.source.kind })),
    ...(options?.includeSolution ? { solution: lab.solution } : {}),
  };
}
