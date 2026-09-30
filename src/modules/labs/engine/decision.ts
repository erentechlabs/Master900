/**
 * Decision lab engine used for troubleshooting and business-scenario labs.
 * The learner works through stages (identify issue, choose diagnostics,
 * select a solution, explain reasoning). Correct flags and feedback are only
 * revealed by the server after each stage is submitted.
 */
import { z } from "zod";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/);

export const decisionStageSchema = z.object({
  id,
  prompt: z.string().min(1).max(1000),
  kind: z.enum(["single", "multiple", "text"]),
  options: z
    .array(z.object({ id, text: z.string().min(1).max(500), correct: z.boolean(), feedback: z.string().min(1).max(800) }))
    .max(8)
    .optional(),
  /** Minimum characters for a reasoning (text) answer. */
  minLength: z.number().int().min(10).max(2000).optional(),
  /** Model answer revealed after a text stage is submitted. */
  modelAnswer: z.string().max(3000).optional(),
});

export const decisionConfigSchema = z
  .object({
    context: z.object({
      environment: z.string().max(4000).optional(),
      requirements: z.array(z.string().max(400)).max(10).optional(),
      symptoms: z.array(z.string().max(400)).max(10).optional(),
      logs: z.string().max(4000).optional(),
      settings: z.array(z.object({ name: z.string().max(120), value: z.string().max(300) })).max(20).optional(),
      constraints: z.array(z.string().max(400)).max(10).optional(),
    }),
    stages: z.array(decisionStageSchema).min(1).max(8),
  })
  .superRefine((c, ctx) => {
    c.stages.forEach((s, i) => {
      if (s.kind !== "text") {
        const correct = (s.options ?? []).filter((o) => o.correct).length;
        if ((s.options ?? []).length < 2) ctx.addIssue({ code: "custom", message: "Choice stages need options", path: ["stages", i, "options"] });
        if (s.kind === "single" && correct !== 1) ctx.addIssue({ code: "custom", message: "Single stages need one correct option", path: ["stages", i] });
        if (s.kind === "multiple" && correct < 1) ctx.addIssue({ code: "custom", message: "Multiple stages need a correct option", path: ["stages", i] });
      }
    });
  });
export type DecisionConfig = z.infer<typeof decisionConfigSchema>;
export type DecisionStage = z.infer<typeof decisionStageSchema>;

export type DecisionStageState = { answer: string | string[]; correct: boolean; attempts: number };
export type DecisionState = { stages: Record<string, DecisionStageState> };

export const decisionAnswerSchema = z.object({
  stageId: id,
  answer: z.union([z.string().max(4000), z.array(id).max(8)]),
});

/** Client-safe projection: no correct flags, no feedback, no model answers. */
export function publicDecisionConfig(config: DecisionConfig) {
  return {
    context: config.context,
    stages: config.stages.map((s) => ({
      id: s.id,
      prompt: s.prompt,
      kind: s.kind,
      minLength: s.minLength,
      options: s.options?.map((o) => ({ id: o.id, text: o.text })),
    })),
  };
}
export type PublicDecisionConfig = ReturnType<typeof publicDecisionConfig>;

export type StageFeedback = {
  stageId: string;
  correct: boolean;
  options?: { id: string; correct: boolean; feedback: string; selected: boolean }[];
  modelAnswer?: string;
};

export function submitDecisionStage(
  config: DecisionConfig,
  state: DecisionState,
  stageId: string,
  answer: string | string[],
): { state: DecisionState; feedback: StageFeedback } | { error: "unknown_stage" | "invalid_answer" | "too_short" } {
  const stage = config.stages.find((s) => s.id === stageId);
  if (!stage) return { error: "unknown_stage" };
  const previous = state.stages[stageId];
  let correct: boolean;
  let feedback: StageFeedback;

  if (stage.kind === "text") {
    if (typeof answer !== "string") return { error: "invalid_answer" };
    const text = answer.trim();
    if (text.length < (stage.minLength ?? 20)) return { error: "too_short" };
    correct = true;
    feedback = { stageId, correct, modelAnswer: stage.modelAnswer };
  } else {
    const selected = Array.isArray(answer) ? answer : [answer];
    const validIds = new Set((stage.options ?? []).map((o) => o.id));
    if (selected.length === 0 || !selected.every((s) => validIds.has(s))) return { error: "invalid_answer" };
    if (stage.kind === "single" && selected.length !== 1) return { error: "invalid_answer" };
    const correctIds = (stage.options ?? []).filter((o) => o.correct).map((o) => o.id);
    correct = selected.length === correctIds.length && selected.every((s) => correctIds.includes(s));
    feedback = {
      stageId,
      correct,
      options: (stage.options ?? []).map((o) => ({ id: o.id, correct: o.correct, feedback: o.feedback, selected: selected.includes(o.id) })),
    };
  }

  const next: DecisionState = {
    stages: {
      ...state.stages,
      [stageId]: { answer, correct: correct || previous?.correct === true, attempts: (previous?.attempts ?? 0) + 1 },
    },
  };
  return { state: next, feedback };
}

export function initialDecisionState(): DecisionState {
  return { stages: {} };
}
