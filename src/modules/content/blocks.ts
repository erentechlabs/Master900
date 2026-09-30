/**
 * Mapping between course-package lesson fields and stored ContentBlocks.
 * Block keys are stable so translations can be mapped block-by-block.
 */
import type { LessonInput, LessonTranslationInput } from "./package-schema";

export type CoreBlockKey =
  | "objectives"
  | "explanation"
  | "terminology"
  | "scenario"
  | "technical"
  | "misconception"
  | "takeaway"
  | "recap"
  | "simpler"
  | "another";

export const CORE_BLOCKS: { key: CoreBlockKey; type: string; sortOrder: number }[] = [
  { key: "objectives", type: "LEARNING_OBJECTIVES", sortOrder: 0 },
  { key: "explanation", type: "EXPLANATION", sortOrder: 10 },
  { key: "terminology", type: "TERMINOLOGY", sortOrder: 40 },
  { key: "scenario", type: "BUSINESS_SCENARIO", sortOrder: 50 },
  { key: "technical", type: "TECHNICAL_EXAMPLE", sortOrder: 60 },
  { key: "misconception", type: "MISCONCEPTION", sortOrder: 70 },
  { key: "takeaway", type: "EXAM_TAKEAWAY", sortOrder: 80 },
  { key: "recap", type: "SUMMARY", sortOrder: 90 },
  { key: "simpler", type: "SIMPLER_EXPLANATION", sortOrder: 100 },
  { key: "another", type: "ANOTHER_EXAMPLE", sortOrder: 110 },
];

/** Blocks revealed on demand ("Explain it more simply", "Give me another example"). */
export const ON_DEMAND_BLOCK_KEYS: CoreBlockKey[] = ["simpler", "another"];

export type BlockRecord = { key: string; type: string; sortOrder: number; data: Record<string, unknown> };

export function lessonToBlocks(lesson: LessonInput): BlockRecord[] {
  const core: Record<CoreBlockKey, Record<string, unknown>> = {
    objectives: { items: lesson.learningObjectives },
    explanation: { markdown: lesson.explanation },
    terminology: { terms: lesson.terminology },
    scenario: { markdown: lesson.businessScenario },
    technical: { markdown: lesson.technicalExample },
    misconception: { myth: lesson.misconception.myth, reality: lesson.misconception.reality },
    takeaway: { markdown: lesson.examTakeaway },
    recap: { markdown: lesson.recap },
    simpler: { markdown: lesson.simplerExplanation },
    another: { markdown: lesson.anotherExample },
  };
  const blocks: BlockRecord[] = CORE_BLOCKS.map((b) => ({ key: b.key, type: b.type, sortOrder: b.sortOrder, data: core[b.key] }));
  lesson.extraBlocks.forEach((extra, i) => {
    blocks.push({ key: `extra-${i + 1}`, type: extra.type, sortOrder: 20 + i, data: extra.data as Record<string, unknown> });
  });
  return blocks.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Translation map: block key -> translated data (same shape as the source block data). */
export function lessonTranslationBlocks(tr: LessonTranslationInput): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  if (tr.learningObjectives) map.objectives = { items: tr.learningObjectives };
  if (tr.explanation) map.explanation = { markdown: tr.explanation };
  if (tr.terminology) map.terminology = { terms: tr.terminology };
  if (tr.businessScenario) map.scenario = { markdown: tr.businessScenario };
  if (tr.technicalExample) map.technical = { markdown: tr.technicalExample };
  if (tr.misconception) map.misconception = tr.misconception;
  if (tr.examTakeaway) map.takeaway = { markdown: tr.examTakeaway };
  if (tr.recap) map.recap = { markdown: tr.recap };
  if (tr.simplerExplanation) map.simpler = { markdown: tr.simplerExplanation };
  if (tr.anotherExample) map.another = { markdown: tr.anotherExample };
  tr.extraBlocks?.forEach((data, i) => {
    map[`extra-${i + 1}`] = data;
  });
  return map;
}

const md = (data: unknown): string => {
  const v = (data as { markdown?: unknown } | null)?.markdown;
  return typeof v === "string" ? v : "";
};

/** Reverse mapping used by the exporter. */
export function blocksToLessonFields(blocks: { key: string; type: string; data: unknown }[]) {
  const byKey = new Map(blocks.map((b) => [b.key, b]));
  const extraBlocks = blocks
    .filter((b) => b.key.startsWith("extra-"))
    .sort((a, b) => Number(a.key.slice(6)) - Number(b.key.slice(6)))
    .map((b) => ({ type: b.type, data: b.data }));
  const misconception = (byKey.get("misconception")?.data ?? {}) as { myth?: string; reality?: string };
  return {
    learningObjectives: ((byKey.get("objectives")?.data as { items?: string[] } | undefined)?.items ?? []) as string[],
    explanation: md(byKey.get("explanation")?.data),
    terminology: ((byKey.get("terminology")?.data as { terms?: { term: string; definition: string }[] } | undefined)?.terms ?? []),
    businessScenario: md(byKey.get("scenario")?.data),
    technicalExample: md(byKey.get("technical")?.data),
    misconception: { myth: misconception.myth ?? "", reality: misconception.reality ?? "" },
    examTakeaway: md(byKey.get("takeaway")?.data),
    recap: md(byKey.get("recap")?.data),
    simplerExplanation: md(byKey.get("simpler")?.data),
    anotherExample: md(byKey.get("another")?.data),
    extraBlocks,
  };
}
