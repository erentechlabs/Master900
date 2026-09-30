import "server-only";
import type { LabAttempt, LabMode, LabType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError } from "@/lib/actions";
import type { CurrentUser } from "@/modules/auth/session";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { XP_RULES } from "@/modules/analytics/gamification";
import { awardBadges, computeAndStoreReadiness } from "@/modules/analytics/data";
import { architectureConfigSchema, architectureEventSchema, replayArchitecture, type ArchitectureEvent } from "./engine/architecture";
import { executeCommand, MAX_COMMAND_LENGTH, replaySandbox, sandboxConfigSchema } from "./engine/command-sandbox";
import { decisionAnswerSchema, decisionConfigSchema, initialDecisionState, submitDecisionStage, type StageFeedback } from "./engine/decision";
import { evaluateRules, type KeyedRule, type RuleOutcome } from "./engine/rules";
import { labConfigSchema, type LabTypeValue } from "./engine/schemas";
import { replayUiSim, uiSimConfigSchema, uiSimEventSchema, type UiSimEvent } from "./engine/ui-simulation";
import { localizedLabHint, projectLabContent, type PublicLabContent } from "./projection";

const MAX_EVENTS = 500;

export const labModeSchema = z.enum(["GUIDED", "CHALLENGE"]);
export const labEventInputSchema = z.object({
  attemptId: z.string().min(1),
  event: z.unknown(),
});
export const attemptInputSchema = z.object({ attemptId: z.string().min(1) });
export const startLabInputSchema = z.object({ labId: z.string().min(1), mode: labModeSchema.default("GUIDED") });
export const hintInputSchema = z.object({ attemptId: z.string().min(1), stepKey: z.string().min(1).max(80) });

export type LabSystemEvent =
  | { type: "LAB_STARTED"; at: string; mode: LabMode }
  | { type: "LAB_COMPLETED"; at: string; score: number }
  | { type: "HINT_USED"; at: string; stepKey: string }
  | { type: "SOLUTION_REVEALED"; at: string };
export type CommandLabEvent = { type: "command"; command: string };
export type DecisionLabEvent = { type: "decision"; stageId: string; answer: string | string[] };
export type LabEngineEvent = UiSimEvent | CommandLabEvent | ArchitectureEvent | DecisionLabEvent;
export type LabLogEvent = LabSystemEvent | LabEngineEvent;

export type PublicRuleOutcome = { passed: boolean; feedback?: string | null };
export type LabStepStatus = { key: string; passed: boolean; outcomes: PublicRuleOutcome[] };
export type LabActionFeedback =
  | { kind: "ui"; message?: { tone: "success" | "error"; text: string } | null }
  | { kind: "command"; output: string; isError: boolean; explanation?: string; hint?: string; clear?: boolean }
  | { kind: "architecture"; outcomes: PublicRuleOutcome[] }
  | { kind: "decision"; feedback: StageFeedback };

export type LabRunState = {
  attemptId: string;
  status: LabAttempt["status"];
  hintsUsed: number;
  solutionViewed: boolean;
  score: number | null;
  publicState: unknown;
  stepStatus: LabStepStatus[];
  finalOutcomes: PublicRuleOutcome[];
  feedback?: LabActionFeedback;
  completed: boolean;
  xpEarned: number;
};

type PrivateStepStatus = { key: string; passed: boolean; outcomes: RuleOutcome[] };

export type LabPlayerData = {
  lab: PublicLabContent;
  run: LabRunState;
};

const labInclude = {
  certification: { select: { id: true, code: true, name: true } },
  domain: { select: { id: true, key: true, title: true } },
  module: { select: { id: true, slug: true, title: true } },
  steps: { orderBy: { sortOrder: "asc" as const }, include: { rules: { orderBy: { sortOrder: "asc" as const } } } },
  rules: { where: { stepId: null }, orderBy: { sortOrder: "asc" as const } },
  sources: { include: { source: { select: { title: true, url: true, kind: true } } } },
};

type LabWithDetails = Prisma.LabGetPayload<{ include: typeof labInclude }>;
type AttemptWithLab = LabAttempt & { lab: LabWithDetails };

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function logEvents(value: unknown): LabLogEvent[] {
  return Array.isArray(value) ? (value as LabLogEvent[]) : [];
}

function keyedRules(rules: { key: string; description: string; rule: Prisma.JsonValue; successFeedback: string | null; failureFeedback: string | null }[]): KeyedRule[] {
  return rules.map((r) => ({
    key: r.key,
    description: r.description,
    rule: r.rule as never,
    successFeedback: r.successFeedback,
    failureFeedback: r.failureFeedback,
  }));
}

function parseEngineEvent(type: LabType, event: unknown): LabEngineEvent {
  switch (type) {
    case "UI_SIMULATION":
      return uiSimEventSchema.parse(event);
    case "COMMAND_SANDBOX": {
      const parsed = z.object({ type: z.literal("command"), command: z.string().trim().min(1).max(MAX_COMMAND_LENGTH) }).parse(event);
      return parsed;
    }
    case "ARCHITECTURE":
      return architectureEventSchema.parse(event);
    case "TROUBLESHOOTING":
    case "BUSINESS_SCENARIO": {
      const parsed = decisionAnswerSchema.parse(event);
      return { type: "decision", stageId: parsed.stageId, answer: parsed.answer };
    }
  }
}

function engineEvents<T extends LabEngineEvent>(events: LabLogEvent[], predicate: (event: LabLogEvent) => event is T): T[] {
  return events.filter(predicate);
}

function replayLabState(lab: LabWithDetails, events: LabLogEvent[]): unknown {
  const type = lab.type as LabTypeValue;
  switch (lab.type) {
    case "UI_SIMULATION":
      return replayUiSim(uiSimConfigSchema.parse(lab.config), engineEvents(events, (e): e is UiSimEvent => ["navigate", "click", "setField", "submitForm"].includes(e.type)));
    case "COMMAND_SANDBOX":
      return replaySandbox(
        sandboxConfigSchema.parse(lab.config),
        engineEvents(events, (e): e is CommandLabEvent => e.type === "command").map((e) => e.command),
      );
    case "ARCHITECTURE":
      return replayArchitecture(architectureConfigSchema.parse(lab.config), engineEvents(events, (e): e is ArchitectureEvent => ["place", "remove", "connect", "disconnect"].includes(e.type)));
    case "TROUBLESHOOTING":
    case "BUSINESS_SCENARIO": {
      const config = decisionConfigSchema.parse(labConfigSchema(type).parse(lab.config));
      let state = initialDecisionState();
      for (const event of engineEvents(events, (e): e is DecisionLabEvent => e.type === "decision")) {
        const result = submitDecisionStage(config, state, event.stageId, event.answer);
        if (!("error" in result)) state = result.state;
      }
      return state;
    }
  }
}

function evaluateAttempt(lab: LabWithDetails, state: unknown): { stepStatus: PrivateStepStatus[]; finalOutcomes: RuleOutcome[]; allPassed: boolean; score: number } {
  const privateStepStatus = lab.steps.map((step) => {
    const outcomes = evaluateRules(keyedRules(step.rules), state);
    return { key: step.key, passed: outcomes.length === 0 ? false : outcomes.every((o) => o.passed), outcomes };
  });
  const finalOutcomes = evaluateRules(keyedRules(lab.rules), state);
  const outcomes = [...privateStepStatus.flatMap((s) => s.outcomes), ...finalOutcomes];
  const requiredGroups = privateStepStatus.length + (finalOutcomes.length ? 1 : 0);
  const allPassed = requiredGroups > 0 && privateStepStatus.every((s) => s.passed) && finalOutcomes.every((o) => o.passed);
  const score = outcomes.length ? Math.round((outcomes.filter((o) => o.passed).length / outcomes.length) * 100) : allPassed ? 100 : 0;
  return { stepStatus: privateStepStatus, finalOutcomes, allPassed, score };
}

function publicOutcomes(outcomes: RuleOutcome[]): PublicRuleOutcome[] {
  return outcomes.map((outcome) => ({ passed: outcome.passed, feedback: outcome.feedback ?? null }));
}

function publicStepStatus(stepStatus: PrivateStepStatus[]): LabStepStatus[] {
  return stepStatus.map((step) => ({ key: step.key, passed: step.passed, outcomes: publicOutcomes(step.outcomes) }));
}

function xpForAttempt(attempt: Pick<LabAttempt, "solutionViewed" | "hintsUsed">, allPassed: boolean): number {
  if (!allPassed || attempt.solutionViewed) return 0;
  const penalty = Math.min(0.75, attempt.hintsUsed * 0.1);
  return Math.max(10, Math.round(XP_RULES.labCompleted * (1 - penalty)));
}

function runState(attempt: AttemptWithLab, feedback?: LabActionFeedback): LabRunState {
  const events = logEvents(attempt.actions);
  const state = replayLabState(attempt.lab, events);
  const evaluation = evaluateAttempt(attempt.lab, state);
  return {
    attemptId: attempt.id,
    status: attempt.status,
    hintsUsed: attempt.hintsUsed,
    solutionViewed: attempt.solutionViewed,
    score: attempt.score ?? evaluation.score,
    publicState: state,
    stepStatus: publicStepStatus(evaluation.stepStatus),
    finalOutcomes: publicOutcomes(evaluation.finalOutcomes),
    feedback,
    completed: attempt.status === "COMPLETED",
    xpEarned: attempt.status === "COMPLETED" ? xpForAttempt(attempt, evaluation.allPassed) : 0,
  };
}

async function loadVisibleLab(labId: string, now = new Date()): Promise<LabWithDetails> {
  const lab = await prisma.lab.findFirst({ where: { id: labId, AND: [learnerVisibleWhere(now)] }, include: labInclude });
  if (!lab) throw new ActionError("not_found");
  return lab;
}

async function loadOwnedAttempt(userId: string, attemptId: string): Promise<AttemptWithLab> {
  const attempt = await prisma.labAttempt.findFirst({ where: { id: attemptId, userId }, include: { lab: { include: labInclude } } });
  if (!attempt) throw new ActionError("not_found");
  return attempt;
}

async function finishIfPassed(user: CurrentUser, attempt: AttemptWithLab, events: LabLogEvent[], state: unknown): Promise<AttemptWithLab> {
  if (attempt.status !== "IN_PROGRESS") return attempt;
  const evaluation = evaluateAttempt(attempt.lab, state);
  if (!evaluation.allPassed) return attempt;
  const now = new Date();
  const completedEvents: LabLogEvent[] = [...events, { type: "LAB_COMPLETED", at: now.toISOString(), score: evaluation.score }];
  const xp = xpForAttempt(attempt, true);
  await prisma.$transaction(async (tx) => {
    await tx.labAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        actions: inputJson(completedEvents),
        state: inputJson(state),
        stepProgress: inputJson(publicStepStatus(evaluation.stepStatus)),
        score: evaluation.score,
      },
    });
    await tx.learningEvent.create({
      data: {
        userId: user.id,
        type: "LAB_COMPLETED",
        certificationId: attempt.lab.certificationId,
        labId: attempt.labId,
        xp,
        durationSeconds: Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000),
        metadata: { mode: attempt.mode, score: evaluation.score, hintsUsed: attempt.hintsUsed, solutionViewed: attempt.solutionViewed },
        occurredAt: now,
      },
    });
  });
  await computeAndStoreReadiness(prisma, user.id, attempt.lab.certificationId, user.preference?.timezone ?? "UTC", now);
  await awardBadges(prisma, user.id, user.preference?.timezone ?? "UTC", now);
  return loadOwnedAttempt(user.id, attempt.id);
}

export async function startLab(user: CurrentUser, input: z.infer<typeof startLabInputSchema>, locale: string): Promise<LabPlayerData> {
  const data = startLabInputSchema.parse(input);
  const lab = await loadVisibleLab(data.labId);
  const existing = await prisma.labAttempt.findFirst({
    where: { userId: user.id, labId: lab.id, status: "IN_PROGRESS", mode: data.mode },
    orderBy: { updatedAt: "desc" },
    include: { lab: { include: labInclude } },
  });
  if (existing) return { lab: projectLabContent(existing.lab, locale, { includeSolution: existing.solutionViewed, mode: existing.mode }), run: runState(existing) };
  const now = new Date();
  const attempt = await prisma.labAttempt.create({
    data: {
      userId: user.id,
      labId: lab.id,
      labVersion: lab.version,
      mode: data.mode,
      actions: inputJson([{ type: "LAB_STARTED", at: now.toISOString(), mode: data.mode } satisfies LabSystemEvent]),
    },
    include: { lab: { include: labInclude } },
  });
  await prisma.learningEvent.create({ data: { userId: user.id, type: "LAB_STARTED", certificationId: lab.certificationId, labId: lab.id, occurredAt: now } });
  return { lab: projectLabContent(attempt.lab, locale, { includeSolution: false, mode: attempt.mode }), run: runState(attempt) };
}

export async function getLabPlayer(user: CurrentUser, labId: string, locale: string): Promise<LabPlayerData> {
  const lab = await loadVisibleLab(labId);
  const attempt =
    (await prisma.labAttempt.findFirst({ where: { userId: user.id, labId: lab.id, status: "IN_PROGRESS" }, orderBy: { updatedAt: "desc" }, include: { lab: { include: labInclude } } })) ??
    (await prisma.labAttempt.findFirst({ where: { userId: user.id, labId: lab.id }, orderBy: { updatedAt: "desc" }, include: { lab: { include: labInclude } } }));
  if (attempt) return { lab: projectLabContent(attempt.lab, locale, { includeSolution: attempt.solutionViewed, mode: attempt.mode }), run: runState(attempt) };
  return startLab(user, { labId, mode: "GUIDED" }, locale);
}

export async function applyLabEvent(user: CurrentUser, attemptId: string, eventInput: unknown, locale: string): Promise<LabPlayerData> {
  let attempt = await loadOwnedAttempt(user.id, attemptId);
  if (attempt.status !== "IN_PROGRESS") throw new ActionError("attempt_closed");
  const events = logEvents(attempt.actions);
  if (events.length >= MAX_EVENTS) throw new ActionError("invalid_input", { event: "event_log_limit" });
  const event = parseEngineEvent(attempt.lab.type, eventInput);

  let feedback: LabActionFeedback | undefined;
  if (attempt.lab.type === "COMMAND_SANDBOX") {
    const before = replayLabState(attempt.lab, events);
    const result = executeCommand(sandboxConfigSchema.parse(attempt.lab.config), before as never, (event as CommandLabEvent).command);
    feedback = { kind: "command", output: result.output, isError: result.isError, explanation: result.explanation, hint: result.hint, clear: result.clear };
  } else if (attempt.lab.type === "TROUBLESHOOTING" || attempt.lab.type === "BUSINESS_SCENARIO") {
    const config = decisionConfigSchema.parse(attempt.lab.config);
    const before = replayLabState(attempt.lab, events);
    const decision = event as DecisionLabEvent;
    const result = submitDecisionStage(config, before as never, decision.stageId, decision.answer);
    if ("error" in result) throw new ActionError("invalid_input", { event: result.error });
    feedback = { kind: "decision", feedback: result.feedback };
  }

  const nextEvents = [...events, event];
  let state = replayLabState(attempt.lab, nextEvents);
  const evaluation = evaluateAttempt(attempt.lab, state);
  if (attempt.lab.type === "UI_SIMULATION") feedback = { kind: "ui", message: (state as { __meta?: { message?: { tone: "success" | "error"; text: string } | null } }).__meta?.message ?? null };
  if (attempt.lab.type === "ARCHITECTURE") feedback = { kind: "architecture", outcomes: publicOutcomes([...evaluation.stepStatus.flatMap((s) => s.outcomes), ...evaluation.finalOutcomes]) };

  await prisma.labAttempt.update({
    where: { id: attempt.id },
    data: {
      actions: inputJson(nextEvents),
      state: inputJson(state),
      stepProgress: inputJson(publicStepStatus(evaluation.stepStatus)),
      score: evaluation.score,
      failedChecks: evaluation.stepStatus.flatMap((s) => s.outcomes).filter((o) => !o.passed).length + evaluation.finalOutcomes.filter((o) => !o.passed).length,
    },
  });
  attempt = await loadOwnedAttempt(user.id, attempt.id);
  state = replayLabState(attempt.lab, logEvents(attempt.actions));
  attempt = await finishIfPassed(user, attempt, logEvents(attempt.actions), state);
  return { lab: projectLabContent(attempt.lab, locale, { includeSolution: attempt.solutionViewed, mode: attempt.mode }), run: runState(attempt, feedback) };
}

export async function checkLab(user: CurrentUser, attemptId: string, locale: string): Promise<LabPlayerData> {
  let attempt = await loadOwnedAttempt(user.id, attemptId);
  const events = logEvents(attempt.actions);
  const state = replayLabState(attempt.lab, events);
  await prisma.labAttempt.update({
    where: { id: attempt.id },
    data: { state: inputJson(state), stepProgress: inputJson(publicStepStatus(evaluateAttempt(attempt.lab, state).stepStatus)), score: evaluateAttempt(attempt.lab, state).score },
  });
  attempt = await loadOwnedAttempt(user.id, attempt.id);
  attempt = await finishIfPassed(user, attempt, logEvents(attempt.actions), state);
  return { lab: projectLabContent(attempt.lab, locale, { includeSolution: attempt.solutionViewed, mode: attempt.mode }), run: runState(attempt) };
}

export async function useHint(user: CurrentUser, input: z.infer<typeof hintInputSchema>, locale: string): Promise<LabPlayerData & { hint: string }> {
  const { attemptId, stepKey } = hintInputSchema.parse(input);
  const attempt = await loadOwnedAttempt(user.id, attemptId);
  if (attempt.status !== "IN_PROGRESS") throw new ActionError("attempt_closed");
  const step = attempt.lab.steps.find((s) => s.key === stepKey);
  if (!step?.hint) throw new ActionError("not_found");
  const events = logEvents(attempt.actions);
  const alreadyUsed = events.some((e) => e.type === "HINT_USED" && e.stepKey === stepKey);
  const nextEvents = alreadyUsed ? events : [...events, { type: "HINT_USED", at: new Date().toISOString(), stepKey } satisfies LabSystemEvent];
  const updated = alreadyUsed
    ? attempt
    : await prisma.labAttempt.update({ where: { id: attempt.id }, data: { actions: inputJson(nextEvents), hintsUsed: attempt.hintsUsed + 1 }, include: { lab: { include: labInclude } } });
  const projected = projectLabContent(updated.lab, locale, { includeSolution: updated.solutionViewed, mode: updated.mode });
  const hint = localizedLabHint(step, updated.lab.translations, locale);
  if (!hint) throw new ActionError("not_found");
  return { lab: projected, run: runState(updated), hint };
}

export async function revealSolution(user: CurrentUser, attemptId: string, locale: string): Promise<LabPlayerData> {
  const attempt = await loadOwnedAttempt(user.id, attemptId);
  const events = logEvents(attempt.actions);
  const nextEvents = attempt.solutionViewed ? events : [...events, { type: "SOLUTION_REVEALED", at: new Date().toISOString() } satisfies LabSystemEvent];
  const updated = attempt.solutionViewed
    ? attempt
    : await prisma.labAttempt.update({ where: { id: attempt.id }, data: { solutionViewed: true, actions: inputJson(nextEvents) }, include: { lab: { include: labInclude } } });
  return { lab: projectLabContent(updated.lab, locale, { includeSolution: true, mode: updated.mode }), run: runState(updated) };
}

export async function resetLab(user: CurrentUser, attemptId: string, locale: string): Promise<LabPlayerData> {
  const attempt = await loadOwnedAttempt(user.id, attemptId);
  await prisma.labAttempt.update({ where: { id: attempt.id }, data: { status: "ABANDONED" } });
  return startLab(user, { labId: attempt.labId, mode: attempt.mode }, locale);
}
