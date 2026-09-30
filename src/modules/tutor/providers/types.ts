import type { TutorDepth, TutorMode } from "../guard";
import type { ScoredChunk } from "../retrieval";

export type TermInfo = {
  term: string;
  definition: string;
  category?: string;
  useCases?: string[];
  keyFeatures?: string[];
  serviceModel?: string;
  url?: string;
};

export type LessonContext = {
  id: string;
  title: string;
  href: string;
  certCode: string;
  objectives: string[];
  explanation: string;
  simpler?: string;
  another?: string;
  technical?: string;
  scenario?: string;
  recap?: string;
  takeaway?: string;
  misconception?: { myth: string; reality: string };
  terminology: { term: string; definition: string }[];
  flashcards: { front: string; back: string }[];
};

export type MistakeContext = {
  stem: string;
  given: string;
  correct: string;
  explanation: string;
  givenExplanation?: string;
  lessonTitle?: string;
};

export type TutorContext = {
  lesson?: LessonContext | null;
  compare?: { a: TermInfo; b: TermInfo } | null;
  mistake?: MistakeContext | null;
  recommendation?: { title: string; reason: string } | null;
};

/** Localized phrases used by the local provider (from the i18n dictionary). */
export type TutorPhrases = Record<
  | "insufficient"
  | "groundedIntro"
  | "simplerIntro"
  | "analogyIntro"
  | "technicalIntro"
  | "keyTerms"
  | "takeaway"
  | "compareIntro"
  | "compareDifference"
  | "compareSameCategory"
  | "definition"
  | "category"
  | "useCases"
  | "keyFeatures"
  | "serviceModel"
  | "scenarioIntro"
  | "scenarioDisclaimer"
  | "scenarioQuestion"
  | "socraticIntro"
  | "socraticClosing"
  | "mistakeIntro"
  | "mistakeYourAnswer"
  | "mistakeCorrect"
  | "mistakeTip"
  | "summarizeIntro"
  | "objectives"
  | "flashcardsIntro"
  | "nextIntro"
  | "noLesson"
  | "noCompare"
  | "noMistake"
  | "misconception",
  string
>;

export type TutorRequest = {
  mode: TutorMode;
  depth: TutorDepth;
  message: string;
  locale: "en" | "tr";
  chunks: ScoredChunk[];
  context: TutorContext;
  history: { role: "user" | "assistant"; content: string }[];
  phrases: TutorPhrases;
};

export type TutorResponse = {
  text: string;
  /** Ids of retrieved chunks cited in the answer, in citation order. */
  usedChunkIds: string[];
  insufficient: boolean;
  provider: string;
};

export interface TutorProvider {
  readonly name: string;
  generate(request: TutorRequest): Promise<TutorResponse>;
}
