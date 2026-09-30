import type { Prisma } from "@prisma/client";
import type { LessonContext, MistakeContext, TermInfo } from "./providers/types";

type JsonObject = Record<string, unknown>;
type LessonBlock = { key: string; type: string; data: unknown };

export type TutorCitation = {
  id: string;
  title: string;
  url: string;
  kind: "lesson" | "glossary" | "source";
};

export function shouldUseQuestionContext(questionId: string | null | undefined, hasAttempt: boolean): questionId is string {
  return !!questionId && hasAttempt;
}

function obj(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
}

function markdown(data: unknown): string {
  const o = obj(data);
  return typeof o.markdown === "string" ? o.markdown : "";
}

export function extractTextFromBlock(block: LessonBlock): string {
  const data = obj(block.data);
  switch (block.type) {
    case "LEARNING_OBJECTIVES":
      return stringArray(data.items).join("\n");
    case "TERMINOLOGY":
      return ((Array.isArray(data.terms) ? data.terms : []) as unknown[])
        .map((t) => {
          const term = obj(t);
          return [term.term, term.definition].filter((v): v is string => typeof v === "string").join(": ");
        })
        .join("\n");
    case "MISCONCEPTION":
      return [data.myth, data.reality].filter((v): v is string => typeof v === "string").join("\n");
    case "COMPARISON":
      return ((Array.isArray(data.columns) ? data.columns : []) as unknown[])
        .map((c) => {
          const col = obj(c);
          return [col.title, ...stringArray(col.points)].filter((v): v is string => typeof v === "string").join("\n");
        })
        .join("\n");
    default:
      return [
        data.title,
        data.body,
        data.caption,
        data.instructions,
        data.transcript,
        data.scenario,
        markdown(data),
        ...stringArray(data.items),
      ]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .join("\n");
  }
}

export function lessonContextFromBlocks(input: {
  id: string;
  title: string;
  href: string;
  certCode: string;
  blocks: LessonBlock[];
}): LessonContext {
  const byType = new Map<string, LessonBlock[]>();
  for (const block of input.blocks) byType.set(block.type, [...(byType.get(block.type) ?? []), block]);
  const firstText = (type: string) => byType.get(type)?.map((b) => extractTextFromBlock(b)).find(Boolean) ?? "";
  const terms =
    byType
      .get("TERMINOLOGY")
      ?.flatMap((b) => {
        const raw = obj(b.data).terms;
        return (Array.isArray(raw) ? raw : []).map((t) => obj(t));
      })
      .map((t) => ({ term: String(t.term ?? ""), definition: String(t.definition ?? "") }))
      .filter((t) => t.term && t.definition) ?? [];
  const objectives = byType.get("LEARNING_OBJECTIVES")?.flatMap((b) => stringArray(obj(b.data).items)) ?? [];
  const misconceptionBlock = byType.get("MISCONCEPTION")?.[0];
  const misconceptionData = misconceptionBlock ? obj(misconceptionBlock.data) : null;
  return {
    id: input.id,
    title: input.title,
    href: input.href,
    certCode: input.certCode,
    objectives,
    explanation: firstText("EXPLANATION") || input.blocks.map(extractTextFromBlock).filter(Boolean).join("\n\n").slice(0, 4000),
    simpler: firstText("SIMPLER_EXPLANATION") || undefined,
    another: firstText("ANOTHER_EXAMPLE") || undefined,
    technical: firstText("TECHNICAL_EXAMPLE") || undefined,
    scenario: firstText("BUSINESS_SCENARIO") || undefined,
    recap: firstText("SUMMARY") || undefined,
    takeaway: firstText("EXAM_TAKEAWAY") || undefined,
    misconception:
      typeof misconceptionData?.myth === "string" && typeof misconceptionData.reality === "string"
        ? { myth: misconceptionData.myth, reality: misconceptionData.reality }
        : undefined,
    terminology: terms,
    flashcards: terms.map((t) => ({ front: t.term, back: t.definition })),
  };
}

export function termInfoFromGlossary(term: { term: string; definition: string; attributes: Prisma.JsonValue | null; slug: string }): TermInfo {
  const attrs = obj(term.attributes);
  return {
    term: term.term,
    definition: term.definition,
    category: typeof attrs.category === "string" ? attrs.category : undefined,
    useCases: stringArray(attrs.useCases),
    keyFeatures: stringArray(attrs.keyFeatures),
    serviceModel: typeof attrs.serviceModel === "string" ? attrs.serviceModel : undefined,
    url: `/glossary#${term.slug}`,
  };
}

export function formatQuestionResponse(response: unknown, optionTextByKey: Map<string, string>): string {
  const r = obj(response);
  if (r.kind === "choice") return stringArray(r.selected).map((key) => optionTextByKey.get(key) ?? key).join(", ");
  if (r.kind === "matching") return Object.entries(obj(r.pairs)).map(([k, v]) => `${k}: ${String(v)}`).join("; ");
  if (r.kind === "ordering") return stringArray(r.order).join(" > ");
  if (r.kind === "categorization") return Object.entries(obj(r.placements)).map(([k, v]) => `${k}: ${String(v)}`).join("; ");
  if (r.kind === "fill") return Object.entries(obj(r.blanks)).map(([k, v]) => `${k}: ${String(v)}`).join("; ");
  if (r.kind === "caseStudy") return Object.entries(obj(r.answers)).map(([k, v]) => `${k}: ${String(v)}`).join("; ");
  if (r.kind === "uiSimulation") return Object.entries(obj(r.values)).map(([k, v]) => `${k}: ${String(v)}`).join("; ");
  return "";
}

export function mistakeContextFromAttempt(input: {
  stem: string;
  explanation: string;
  response: unknown;
  options: { key: string; text: string; isCorrect: boolean; explanation: string }[];
  lessonTitle?: string | null;
}): MistakeContext {
  const options = new Map(input.options.map((o) => [o.key, o.text]));
  const correct = input.options.filter((o) => o.isCorrect);
  return {
    stem: input.stem,
    given: formatQuestionResponse(input.response, options) || "No answer recorded",
    correct: correct.length ? correct.map((o) => o.text).join(", ") : "See the reviewed explanation.",
    explanation: input.explanation,
    givenExplanation: input.options.find((o) => formatQuestionResponse(input.response, options).includes(o.text))?.explanation,
    lessonTitle: input.lessonTitle ?? undefined,
  };
}
