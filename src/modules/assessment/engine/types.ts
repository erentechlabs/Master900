/**
 * Assessment engine types. The "public" shapes are safe to send to the client
 * before submission; answer keys stay on the server.
 */
import { z } from "zod";

export const QUESTION_TYPES = [
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
] as const;
export type QuestionTypeValue = (typeof QUESTION_TYPES)[number];
export type DifficultyValue = "EASY" | "MEDIUM" | "HARD";

export const CHOICE_TYPES: readonly QuestionTypeValue[] = [
  "SINGLE_CHOICE",
  "MULTIPLE_RESPONSE",
  "TRUE_FALSE",
  "SCENARIO",
  "COMMAND_SELECTION",
];

export function isChoiceQuestion(type: QuestionTypeValue): boolean {
  return CHOICE_TYPES.includes(type);
}

type Item = { id: string; text: string };

// ----------------------------- public interaction -----------------------------
export type MatchingPublic = { prompts: Item[]; answers: Item[] };
export type OrderingPublic = { items: Item[] };
export type CategorizationPublic = { categories: { id: string; label: string }[]; items: Item[] };
export type FillInBlankPublic = { template: string; blanks: { id: string }[]; wordBank?: string[] };
export type CaseStudyPublic = { statements: Item[] };
export type UiSimulationField = {
  id: string;
  label: string;
  control: "select" | "radio" | "toggle";
  options?: { value: string; label: string }[];
};
export type UiSimulationPublic = { title: string; description?: string; fields: UiSimulationField[] };

export type InteractionPublic =
  | MatchingPublic
  | OrderingPublic
  | CategorizationPublic
  | FillInBlankPublic
  | CaseStudyPublic
  | UiSimulationPublic;

// ----------------------------- answer keys -----------------------------
export type MatchingKey = { pairs: Record<string, string>; explanations: Record<string, string> };
export type OrderingKey = { correctOrder: string[]; explanations?: Record<string, string> };
export type CategorizationKey = { placements: Record<string, string>; explanations: Record<string, string> };
export type FillInBlankKey = { blanks: Record<string, { accepted: string[]; explanation: string }> };
export type CaseStudyKey = { answers: Record<string, boolean>; explanations: Record<string, string> };
export type UiSimulationKey = { values: Record<string, string | boolean>; explanations: Record<string, string> };

export type AnswerKey = MatchingKey | OrderingKey | CategorizationKey | FillInBlankKey | CaseStudyKey | UiSimulationKey;

// ----------------------------- responses -----------------------------
const shortString = z.string().max(200);
const idMap = z.record(z.string().max(64), shortString).refine((v) => Object.keys(v).length <= 20, "Too many entries");

export const responseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), selected: z.array(z.string().max(16)).max(10) }),
  z.object({ kind: z.literal("matching"), pairs: idMap }),
  z.object({ kind: z.literal("ordering"), order: z.array(z.string().max(64)).max(20) }),
  z.object({ kind: z.literal("categorization"), placements: idMap }),
  z.object({ kind: z.literal("fill"), blanks: idMap }),
  z.object({
    kind: z.literal("caseStudy"),
    answers: z.record(z.string().max(64), z.boolean()).refine((v) => Object.keys(v).length <= 20, "Too many entries"),
  }),
  z.object({
    kind: z.literal("uiSimulation"),
    values: z
      .record(z.string().max(64), z.union([shortString, z.boolean()]))
      .refine((v) => Object.keys(v).length <= 20, "Too many entries"),
  }),
]);
export type QuestionResponse = z.infer<typeof responseSchema>;

export function expectedResponseKind(type: QuestionTypeValue): QuestionResponse["kind"] {
  switch (type) {
    case "MATCHING":
      return "matching";
    case "ORDERING":
      return "ordering";
    case "CATEGORIZATION":
      return "categorization";
    case "FILL_IN_BLANK":
      return "fill";
    case "CASE_STUDY":
      return "caseStudy";
    case "UI_SIMULATION":
      return "uiSimulation";
    default:
      return "choice";
  }
}

// ----------------------------- scoring input/output -----------------------------
export type ScorableQuestion = {
  type: QuestionTypeValue;
  options: { key: string; isCorrect: boolean }[];
  answerKey: unknown;
  /** Extra accepted answers for fill-in-the-blank from translations: blankId -> answers */
  extraAccepted?: Record<string, string[]>;
};

export type ScoreResult = {
  isCorrect: boolean;
  /** Partial credit 0..1 (used for analytics; exam scoring is all-or-nothing). */
  score: number;
  /** Per item correctness (option key, prompt id, item id, blank id, statement id or field id). */
  items: Record<string, boolean>;
};

// ----------------------------- public question -----------------------------
export type PublicQuestion = {
  id: string;
  code: string;
  type: QuestionTypeValue;
  difficulty: DifficultyValue;
  domainId: string;
  stem: string;
  scenario?: string | null;
  selectCount?: number;
  options?: { key: string; text: string }[];
  interaction?: InteractionPublic;
  /** Set when a non-approved translation is displayed. */
  translationNotice?: "pending" | "fallback" | null;
};

export type ReviewedOption = { key: string; text: string; isCorrect: boolean; explanation: string; selected: boolean };

export type QuestionReview = {
  question: PublicQuestion;
  explanation: string;
  isCorrect: boolean;
  score: number;
  response: QuestionResponse | null;
  options?: ReviewedOption[];
  /** Type-specific correct answers with explanations. */
  details?: {
    kind: QuestionResponse["kind"];
    rows: { id: string; label: string; expected: string; given: string | null; correct: boolean; explanation?: string }[];
  };
};
