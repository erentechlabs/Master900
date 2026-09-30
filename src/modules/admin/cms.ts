import type {
  AuthorType,
  ContentBlockType,
  ContentEntityType,
  ContentStatus,
  Difficulty,
  LabComplexity,
  LabType,
  Prisma,
  QuestionType,
  TranslationStatus,
} from "@prisma/client";
import { z } from "zod";
import { CORE_BLOCKS } from "@/modules/content/blocks";
import { type QuestionInput } from "@/modules/content/package-schema";

export const contentStatuses = ["DRAFT", "TECHNICAL_REVIEW", "EDITORIAL_REVIEW", "APPROVED", "PUBLISHED", "OUTDATED", "ARCHIVED"] as const satisfies readonly ContentStatus[];
export const questionTypes = [
  "SINGLE_CHOICE",
  "MULTIPLE_RESPONSE",
  "TRUE_FALSE",
  "MATCHING",
  "ORDERING",
  "CATEGORIZATION",
  "FILL_IN_BLANK",
  "CASE_STUDY",
  "SCENARIO",
  "COMMAND_SELECTION",
  "UI_SIMULATION",
] as const satisfies readonly QuestionType[];
export const difficulties = ["EASY", "MEDIUM", "HARD"] as const satisfies readonly Difficulty[];
export const authorTypes = ["HUMAN", "AI_ASSISTED", "AI_GENERATED", "SEED_DEMO", "IMPORTED"] as const satisfies readonly AuthorType[];
export const labTypes = ["UI_SIMULATION", "COMMAND_SANDBOX", "ARCHITECTURE", "TROUBLESHOOTING", "BUSINESS_SCENARIO"] as const satisfies readonly LabType[];
export const labComplexities = ["INTRO", "BASIC", "INTERMEDIATE"] as const satisfies readonly LabComplexity[];
export const translationStatuses = ["MACHINE_DRAFT", "DRAFT", "IN_REVIEW", "APPROVED"] as const satisfies readonly TranslationStatus[];

export function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function optionalText(form: FormData, key: string): string | null {
  const value = text(form, key);
  return value ? value : null;
}

export function bool(form: FormData, key: string): boolean {
  return form.get(key) === "on" || form.get(key) === "true";
}

export function intOrNull(form: FormData, key: string): number | null {
  const value = text(form, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function dateOrNull(form: FormData, key: string): Date | null {
  const value = text(form, key);
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function lines(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function parseJson(value: string, fallback: unknown = null): unknown {
  if (!value.trim()) return fallback;
  return JSON.parse(value) as unknown;
}

export function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function coreBlockData(type: string): Prisma.InputJsonValue {
  if (type === "LEARNING_OBJECTIVES") return { items: [] };
  if (type === "TERMINOLOGY") return { terms: [] };
  if (type === "MISCONCEPTION") return { myth: "", reality: "" };
  return { markdown: "" };
}

export function initialLessonBlocks() {
  return CORE_BLOCKS.map((block) => ({
    key: block.key,
    type: block.type as ContentBlockType,
    sortOrder: block.sortOrder,
    data: coreBlockData(block.type),
  }));
}

export function contentSnapshot(entity: unknown): Prisma.InputJsonValue {
  return inputJson(entity);
}

export const sourceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url().refine((v) => v.startsWith("https://"), "https_only"),
});

export const simpleQuestionSchema = z.object({
  ref: z.string().trim().min(3).max(80),
  type: z.enum(questionTypes),
  domainKey: z.string().trim().min(1),
  objectiveCode: z.string().trim().optional(),
  difficulty: z.enum(difficulties),
  stem: z.string().trim().min(3),
  scenario: z.string().trim().optional(),
  explanation: z.string().trim().min(3),
  options: z
    .array(z.object({ key: z.string().min(1).max(8), text: z.string().min(1), correct: z.boolean(), explanation: z.string().min(1) }))
    .optional(),
  selectCount: z.number().int().min(2).max(6).optional(),
  interaction: z.unknown().optional(),
  answerKey: z.unknown().optional(),
  shuffleOptions: z.boolean().default(true),
  lessonSlug: z.string().optional(),
  sources: z.array(sourceSchema).default([]),
  needsVerification: z.boolean().default(false),
  translations: z.unknown().optional(),
});

export type SimpleQuestionInput = z.infer<typeof simpleQuestionSchema>;

export function questionToPackage(q: {
  code: string;
  type: QuestionType;
  difficulty: Difficulty;
  stem: string;
  scenario: string | null;
  explanation: string;
  interaction: unknown;
  answerKey: unknown;
  shuffleOptions: boolean;
  needsVerification: boolean;
  domain: { key: string };
  objective?: { code: string } | null;
  lesson?: { slug: string } | null;
  options: { key: string; text: string; isCorrect: boolean; explanation: string }[];
  sources?: { source: { title: string; url: string } }[];
  translations?: { locale: string; stem: string; scenario: string | null; explanation: string; options: unknown; interaction: unknown; answerExplanations: unknown; status: TranslationStatus }[];
}): QuestionInput {
  const base: QuestionInput = {
    ref: q.code.toLowerCase(),
    type: q.type,
    domainKey: q.domain.key,
    objectiveCode: q.objective?.code,
    difficulty: q.difficulty,
    stem: q.stem,
    scenario: q.scenario ?? undefined,
    explanation: q.explanation,
    shuffleOptions: q.shuffleOptions,
    lessonSlug: q.lesson?.slug,
    sources: (q.sources ?? []).map((s) => ({ title: s.source.title, url: s.source.url })),
    needsVerification: q.needsVerification,
  };
  if (q.options.length) {
    base.options = q.options
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((o) => ({ key: o.key, text: o.text, correct: o.isCorrect, explanation: o.explanation }));
    if (q.type === "MULTIPLE_RESPONSE") base.selectCount = base.options.filter((o) => o.correct).length;
  }
  const interaction = asRecord(q.interaction);
  for (const key of ["matching", "ordering", "categorization", "fillInBlank", "caseStudy", "uiSimulation"] as const) {
    if (interaction[key]) (base as Record<string, unknown>)[key] = interaction[key];
  }
  const tr = q.translations?.find((t) => t.locale === "tr");
  if (tr) {
    base.translations = {
      tr: {
        stem: tr.stem,
        scenario: tr.scenario ?? undefined,
        explanation: tr.explanation,
        options: tr.options as QuestionInput["translations"] extends { tr?: infer T } ? T extends { options?: infer O } ? O : never : never,
        status: tr.status,
      },
    };
  }
  return base;
}

export function entityHref(entityType: ContentEntityType, id: string): string {
  if (entityType === "LESSON") return `/admin/content/lessons/${id}`;
  if (entityType === "QUESTION") return `/admin/questions/${id}`;
  if (entityType === "LAB") return `/admin/labs/${id}`;
  if (entityType === "CERTIFICATION") return `/admin/certifications/${id}`;
  return "/admin";
}

export function entityEditorPath(entityType: ContentEntityType): string {
  if (entityType === "LESSON") return "/admin/content";
  if (entityType === "QUESTION") return "/admin/questions";
  if (entityType === "LAB") return "/admin/labs";
  if (entityType === "MODULE") return "/admin/content";
  return "/admin";
}
