import type { LessonInput } from "./package-schema";

/**
 * Editorial quality checks that the schema cannot express: lesson content copied between lessons (a sign of
 * template-generated text), learning objectives that just paste the lesson title into a generic sentence, repeated
 * question text and near-duplicate texts that only swap a topic name. Pure; reported as validator warnings.
 */
export type ContentQualityIssue = { field: string; lessons: string[]; sample: string };

type LessonLike = Pick<LessonInput, "slug" | "title"> & Partial<Pick<LessonInput, "summary" | "learningObjectives" | "flashcards" | "extraBlocks" | "misconception" | "examTakeaway" | "recap" | "simplerExplanation" | "anotherExample" | "businessScenario" | "technicalExample" | "knowledgeCheck">>;

const SINGLE_FIELDS = ["summary", "examTakeaway", "recap", "simplerExplanation", "anotherExample", "businessScenario", "technicalExample"] as const;

export function findRepeatedLessonContent(lessons: readonly LessonLike[]): ContentQualityIssue[] {
  const seen = new Map<string, { field: string; sample: string; lessons: Set<string> }>();
  const add = (field: string, value: unknown, slug: string) => {
    if (value === undefined || value === null || value === "") return;
    const text = typeof value === "string" ? value.trim() : JSON.stringify(value);
    const key = `${field}\u0000${text}`;
    const entry = seen.get(key) ?? { field, sample: text.slice(0, 90), lessons: new Set<string>() };
    entry.lessons.add(slug);
    seen.set(key, entry);
  };
  const issues: ContentQualityIssue[] = [];
  for (const lesson of lessons) {
    for (const field of SINGLE_FIELDS) add(field, lesson[field], lesson.slug);
    add("misconception", lesson.misconception?.myth, lesson.slug);
    for (const objective of lesson.learningObjectives ?? []) {
      add("learningObjectives", objective, lesson.slug);
      // Real templates paste a whole multi-word title; single words such as "tags" appear naturally in objectives.
      if (lesson.title && lesson.title.trim().split(/\s+/).length >= 3 && objective.includes(lesson.title.toLowerCase())) {
        issues.push({ field: "learningObjectives", lessons: [lesson.slug], sample: `objective repeats the lesson title in lower case: "${objective.slice(0, 90)}"` });
      }
    }
    for (const card of lesson.flashcards ?? []) add("flashcards.front", card.front, lesson.slug);
    for (const block of lesson.extraBlocks ?? []) add("extraBlocks", block, lesson.slug);
    for (const question of lesson.knowledgeCheck ?? []) add("knowledgeCheck.stem", question.stem, lesson.slug);
  }
  for (const entry of seen.values()) {
    if (entry.lessons.size > 1) issues.push({ field: entry.field, lessons: [...entry.lessons], sample: entry.sample });
  }
  return issues;
}

type QuestionLike = {
  ref: string;
  type?: string;
  stem: string;
  explanation?: string;
  options?: { key: string; text: string; explanation?: string }[];
  ordering?: { items?: { text: string }[] } | null;
  matching?: { prompts?: { text: string }[]; answers?: { text: string }[] } | null;
  categorization?: { items?: { text: string }[] } | null;
};

/** Question types whose stem is an instruction ("For each statement ...", "Match each ..."): their items carry the content. */
const INSTRUCTION_STEM_TYPES = new Set(["CASE_STUDY", "MATCHING", "ORDERING", "CATEGORIZATION", "FILL_IN_BLANK"]);

/**
 * Template tell-tales in questions: identical stems or explanations in different questions, long answer options that
 * reappear in three or more questions ("The option that directly satisfies the requirement"), and per-option
 * explanations copied across questions. Short options such as service names may legitimately repeat.
 */
export function findRepeatedQuestionContent(questions: readonly QuestionLike[]): ContentQualityIssue[] {
  const groups = new Map<string, { field: string; sample: string; refs: Set<string>; min: number }>();
  const add = (field: string, value: string | undefined, ref: string, min: number) => {
    const text = value?.trim();
    if (!text) return;
    const key = `${field}\u0000${text}`;
    const entry = groups.get(key) ?? { field, sample: text.slice(0, 90), refs: new Set<string>(), min };
    entry.refs.add(ref);
    groups.set(key, entry);
  };
  for (const question of questions) {
    add("question.stem", question.stem, question.ref, 2);
    add("question.explanation", question.explanation, question.ref, 2);
    for (const option of question.options ?? []) {
      if (option.key === "TRUE" || option.key === "FALSE") {
        // A True/False option should explain this statement, not say "This statement is accurate." everywhere.
        add("question.trueFalseExplanation", option.explanation, question.ref, 2);
        continue;
      }
      if (option.text.trim().length >= 25) add("question.option", option.text, question.ref, 3);
      if (option.explanation && option.explanation.trim().length >= 25) add("question.optionExplanation", option.explanation, question.ref, 3);
    }
  }
  return [...groups.values()].filter((entry) => entry.refs.size >= entry.min).map((entry) => ({ field: entry.field, lessons: [...entry.refs], sample: entry.sample }));
}

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

/** Longest common subsequence of two word lists (dynamic programming over two rows). */
function lcsLength(a: readonly string[], b: readonly string[]): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) current[j] = a[i - 1] === b[j - 1] ? previous[j - 1]! + 1 : Math.max(previous[j]!, current[j - 1]!);
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * Near-duplicates: texts that keep the same word skeleton as another text and only swap a topic in ("Put the <topic>
 * decision steps in the correct order."), which exact-match checks miss. Two texts of at least `minWords` words are
 * near-duplicates when their longest common word subsequence covers `threshold` of the longer text.
 */
export function findNearDuplicateTexts(entries: readonly { id: string; field: string; text: string }[], threshold = 0.6, minWords = 8): ContentQualityIssue[] {
  const byField = new Map<string, { id: string; text: string; words: string[]; set: Set<string> }[]>();
  for (const entry of entries) {
    const list = words(entry.text);
    if (list.length < minWords) continue;
    const group = byField.get(entry.field) ?? [];
    group.push({ id: entry.id, text: entry.text, words: list, set: new Set(list) });
    byField.set(entry.field, group);
  }
  const issues: ContentQualityIssue[] = [];
  for (const [field, list] of byField) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.id === b.id || a.text === b.text) continue;
        const longer = Math.max(a.words.length, b.words.length);
        let sharedWords = 0;
        for (const word of a.set) if (b.set.has(word)) sharedWords += 1;
        if (sharedWords < threshold * Math.min(a.set.size, b.set.size)) continue;
        if (lcsLength(a.words, b.words) / longer >= threshold) issues.push({ field: `${field} (near-duplicate)`, lessons: [a.id, b.id], sample: a.text.slice(0, 90) });
      }
    }
  }
  return issues;
}

/** Text fields of questions and lessons used for the near-duplicate check. */
export function nearDuplicateEntries(lessons: readonly LessonLike[], questions: readonly QuestionLike[]): { id: string; field: string; text: string }[] {
  const entries: { id: string; field: string; text: string }[] = [];
  for (const lesson of lessons) {
    for (const field of SINGLE_FIELDS) {
      const value = lesson[field];
      if (typeof value === "string") entries.push({ id: lesson.slug, field, text: value });
    }
    if (lesson.misconception?.myth) entries.push({ id: lesson.slug, field: "misconception", text: lesson.misconception.myth });
  }
  for (const question of questions) {
    if (!question.type || !INSTRUCTION_STEM_TYPES.has(question.type)) entries.push({ id: question.ref, field: "question.stem", text: question.stem });
    if (question.explanation) entries.push({ id: question.ref, field: "question.explanation", text: question.explanation });
    if (question.ordering?.items?.length) entries.push({ id: question.ref, field: "question.orderingItems", text: question.ordering.items.map((item) => item.text).join(". ") });
    if (question.matching?.prompts?.length) entries.push({ id: question.ref, field: "question.matchingItems", text: [...question.matching.prompts, ...(question.matching.answers ?? [])].map((item) => item.text).join(". ") });
    if (question.categorization?.items?.length) entries.push({ id: question.ref, field: "question.categorizationItems", text: question.categorization.items.map((item) => item.text).join(". ") });
    for (const option of question.options ?? []) {
      if (!option.explanation) continue;
      const field = option.key === "TRUE" || option.key === "FALSE" ? "question.trueFalseExplanation" : "question.optionExplanation";
      entries.push({ id: question.ref, field, text: option.explanation });
    }
  }
  return entries;
}
