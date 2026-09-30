/**
 * Builds client-safe question payloads (no answer keys) and post-submission
 * reviews, applying translations and deterministic shuffling.
 */
import { createRng, shuffle } from "@/lib/random";
import {
  isChoiceQuestion,
  type CaseStudyKey,
  type CaseStudyPublic,
  type CategorizationKey,
  type CategorizationPublic,
  type DifficultyValue,
  type FillInBlankKey,
  type FillInBlankPublic,
  type InteractionPublic,
  type MatchingKey,
  type MatchingPublic,
  type OrderingKey,
  type OrderingPublic,
  type PublicQuestion,
  type QuestionResponse,
  type QuestionReview,
  type QuestionTypeValue,
  type ScoreResult,
  type UiSimulationKey,
  type UiSimulationPublic,
} from "./types";

export type TranslationRecord = {
  locale: string;
  stem: string;
  scenario: string | null;
  explanation: string;
  options: unknown;
  interaction: unknown;
  answerExplanations: unknown;
  status: string;
};

export type QuestionRecord = {
  id: string;
  code: string;
  type: QuestionTypeValue;
  difficulty: DifficultyValue;
  domainId: string;
  stem: string;
  scenario: string | null;
  explanation: string;
  interaction: unknown;
  answerKey: unknown;
  shuffleOptions: boolean;
  sourceLocale: string;
  options: { key: string; text: string; isCorrect: boolean; explanation: string; sortOrder: number }[];
  translations?: TranslationRecord[];
};

export type ReviewLabels = { yes: string; no: string; on: string; off: string; true: string; false: string; blank: string; position: string };

export const DEFAULT_REVIEW_LABELS: ReviewLabels = {
  yes: "Yes",
  no: "No",
  on: "On",
  off: "Off",
  true: "True",
  false: "False",
  blank: "Blank {n}",
  position: "Position {n}",
};

type Map = Record<string, string>;
const asMap = (v: unknown): Map => (v && typeof v === "object" ? (v as Map) : {});
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function findTranslation(q: QuestionRecord, locale: string): TranslationRecord | null {
  if (locale === q.sourceLocale) return null;
  return q.translations?.find((t) => t.locale === locale) ?? null;
}

function tx(map: unknown, id: string, fallback: string): string {
  const value = asMap(map)[id];
  return typeof value === "string" && value.trim() ? value : fallback;
}

/** Default (unshuffled) option order. */
export function defaultOptionOrder(q: Pick<QuestionRecord, "options">): string[] {
  return [...q.options].sort((a, b) => a.sortOrder - b.sortOrder).map((o) => o.key);
}

/** Option order for a new attempt: shuffled when allowed; True/False keeps a stable order. */
export function buildOptionOrder(q: Pick<QuestionRecord, "options" | "type" | "shuffleOptions">, seed: string): string[] {
  const keys = defaultOptionOrder(q);
  if (q.type === "TRUE_FALSE") return ["TRUE", "FALSE"].filter((k) => keys.includes(k));
  if (!isChoiceQuestion(q.type) || !q.shuffleOptions) return keys;
  return shuffle(keys, createRng(`${seed}:options`));
}

function shuffledNotIdentity<T extends { id: string }>(items: T[], seed: string): T[] {
  if (items.length < 2) return items;
  const rng = createRng(seed);
  let out = shuffle(items, rng);
  for (let i = 0; i < 5 && out.every((x, idx) => x.id === items[idx]!.id); i++) out = shuffle(items, rng);
  return out;
}

function projectInteraction(q: QuestionRecord, t: TranslationRecord | null, seed: string): InteractionPublic | undefined {
  const base = obj(q.interaction);
  const ti = obj(t?.interaction);
  switch (q.type) {
    case "MATCHING": {
      const m = base as unknown as MatchingPublic;
      const prompts = (m.prompts ?? []).map((p) => ({ id: p.id, text: tx(ti.prompts, p.id, p.text) }));
      const answers = (m.answers ?? []).map((a) => ({ id: a.id, text: tx(ti.answers, a.id, a.text) }));
      return { prompts, answers: shuffledNotIdentity(answers, `${seed}:answers`) } satisfies MatchingPublic;
    }
    case "ORDERING": {
      const o = base as unknown as OrderingPublic;
      const items = (o.items ?? []).map((i) => ({ id: i.id, text: tx(ti.items, i.id, i.text) }));
      return { items: shuffledNotIdentity(items, `${seed}:items`) } satisfies OrderingPublic;
    }
    case "CATEGORIZATION": {
      const c = base as unknown as CategorizationPublic;
      const categories = (c.categories ?? []).map((x) => ({ id: x.id, label: tx(ti.categories, x.id, x.label) }));
      const items = (c.items ?? []).map((i) => ({ id: i.id, text: tx(ti.items, i.id, i.text) }));
      return { categories, items: shuffledNotIdentity(items, `${seed}:items`) } satisfies CategorizationPublic;
    }
    case "FILL_IN_BLANK": {
      const f = base as unknown as FillInBlankPublic;
      const template = typeof ti.template === "string" && ti.template.trim() ? ti.template : f.template;
      const bank = Array.isArray(ti.wordBank) && ti.wordBank.length ? (ti.wordBank as string[]) : f.wordBank;
      return {
        template,
        blanks: f.blanks ?? [],
        wordBank: bank ? shuffle(bank, createRng(`${seed}:bank`)) : undefined,
      } satisfies FillInBlankPublic;
    }
    case "CASE_STUDY": {
      const cs = base as unknown as CaseStudyPublic;
      return { statements: (cs.statements ?? []).map((s) => ({ id: s.id, text: tx(ti.statements, s.id, s.text) })) } satisfies CaseStudyPublic;
    }
    case "UI_SIMULATION": {
      const u = base as unknown as UiSimulationPublic;
      const tf = obj(ti.fields);
      return {
        title: typeof ti.title === "string" && ti.title ? ti.title : u.title,
        description: typeof ti.description === "string" && ti.description ? ti.description : u.description,
        fields: (u.fields ?? []).map((f) => {
          const tField = obj(tf[f.id]);
          return {
            id: f.id,
            label: typeof tField.label === "string" && tField.label ? tField.label : f.label,
            control: f.control,
            options: f.options?.map((o) => ({ value: o.value, label: tx(tField.options, o.value, o.label) })),
          };
        }),
      } satisfies UiSimulationPublic;
    }
    default:
      return undefined;
  }
}

export type ProjectOptions = {
  locale: string;
  /** Option order stored with the attempt. */
  optionOrder?: string[];
  /** Seed for deterministic shuffles (e.g. attempt id). */
  seed: string;
  labels?: Partial<ReviewLabels>;
};

export function projectQuestion(q: QuestionRecord, opts: ProjectOptions): PublicQuestion {
  const t = findTranslation(q, opts.locale);
  const labels = { ...DEFAULT_REVIEW_LABELS, ...opts.labels };
  const translatedOptions = obj(t?.options);
  const seed = `${opts.seed}:${q.id}`;
  let options: PublicQuestion["options"];
  if (isChoiceQuestion(q.type)) {
    const order = opts.optionOrder?.length ? opts.optionOrder : buildOptionOrder(q, seed);
    const byKey = new Map(q.options.map((o) => [o.key, o]));
    options = order
      .map((key) => byKey.get(key))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => {
        if (q.type === "TRUE_FALSE" && (o.key === "TRUE" || o.key === "FALSE")) {
          return { key: o.key, text: o.key === "TRUE" ? labels.true : labels.false };
        }
        const tOpt = obj(translatedOptions[o.key]);
        return { key: o.key, text: typeof tOpt.text === "string" && tOpt.text ? tOpt.text : o.text };
      });
  }
  const interaction = projectInteraction(q, t, seed);
  const selectCount =
    q.type === "MULTIPLE_RESPONSE"
      ? (obj(q.interaction).selectCount as number | undefined) ?? q.options.filter((o) => o.isCorrect).length
      : undefined;

  return {
    id: q.id,
    code: q.code,
    type: q.type,
    difficulty: q.difficulty,
    domainId: q.domainId,
    stem: t?.stem || q.stem,
    scenario: t ? t.scenario || q.scenario : q.scenario,
    selectCount,
    options,
    interaction,
    translationNotice: opts.locale !== q.sourceLocale ? (t ? (t.status === "APPROVED" ? null : "pending") : "fallback") : null,
  };
}

function fmt(template: string, n: number): string {
  return template.replace("{n}", String(n));
}

/** Build the post-submission review with correct answers and explanations. */
export function buildReview(
  q: QuestionRecord,
  response: QuestionResponse | null,
  result: ScoreResult,
  opts: ProjectOptions,
): QuestionReview {
  const labels = { ...DEFAULT_REVIEW_LABELS, ...opts.labels };
  const t = findTranslation(q, opts.locale);
  const question = projectQuestion(q, opts);
  const explanationMaps = obj(t?.answerExplanations);
  const texp = (id: string, fallback?: string) => tx(explanationMaps.explanations, id, fallback ?? "");
  const review: QuestionReview = {
    question,
    explanation: t?.explanation || q.explanation,
    isCorrect: result.isCorrect,
    score: result.score,
    response,
  };

  if (isChoiceQuestion(q.type)) {
    const selected = response?.kind === "choice" ? response.selected : [];
    const translatedOptions = obj(t?.options);
    const byKey = new Map(q.options.map((o) => [o.key, o]));
    review.options = (question.options ?? []).map((po) => {
      const o = byKey.get(po.key)!;
      const tOpt = obj(translatedOptions[o.key]);
      return {
        key: o.key,
        text: po.text,
        isCorrect: o.isCorrect,
        explanation: typeof tOpt.explanation === "string" && tOpt.explanation ? tOpt.explanation : o.explanation,
        selected: selected.includes(o.key),
      };
    });
    return review;
  }

  const key = obj(q.answerKey);
  const inter = question.interaction;
  switch (q.type) {
    case "MATCHING": {
      const m = inter as MatchingPublic;
      const k = key as unknown as MatchingKey;
      const answers = new Map(m.answers.map((a) => [a.id, a.text]));
      const given = response?.kind === "matching" ? response.pairs : {};
      review.details = {
        kind: "matching",
        rows: m.prompts.map((p) => ({
          id: p.id,
          label: p.text,
          expected: answers.get(k.pairs[p.id] ?? "") ?? "",
          given: given[p.id] ? answers.get(given[p.id]!) ?? null : null,
          correct: result.items[p.id] ?? false,
          explanation: texp(p.id, k.explanations?.[p.id]),
        })),
      };
      break;
    }
    case "ORDERING": {
      const o = inter as OrderingPublic;
      const k = key as unknown as OrderingKey;
      const texts = new Map(o.items.map((i) => [i.id, i.text]));
      const order = response?.kind === "ordering" ? response.order : [];
      review.details = {
        kind: "ordering",
        rows: k.correctOrder.map((id, idx) => ({
          id,
          label: fmt(labels.position, idx + 1),
          expected: texts.get(id) ?? id,
          given: order[idx] ? texts.get(order[idx]!) ?? null : null,
          correct: result.items[id] ?? false,
          explanation: texp(id, k.explanations?.[id]),
        })),
      };
      break;
    }
    case "CATEGORIZATION": {
      const c = inter as CategorizationPublic;
      const k = key as unknown as CategorizationKey;
      const cats = new Map(c.categories.map((x) => [x.id, x.label]));
      const given = response?.kind === "categorization" ? response.placements : {};
      const baseItems = (obj(q.interaction).items as { id: string; text: string }[] | undefined) ?? [];
      const itemText = new Map(c.items.map((i) => [i.id, i.text]));
      review.details = {
        kind: "categorization",
        rows: baseItems.map((i) => ({
          id: i.id,
          label: itemText.get(i.id) ?? i.text,
          expected: cats.get(k.placements[i.id] ?? "") ?? "",
          given: given[i.id] ? cats.get(given[i.id]!) ?? null : null,
          correct: result.items[i.id] ?? false,
          explanation: texp(i.id, k.explanations?.[i.id]),
        })),
      };
      break;
    }
    case "FILL_IN_BLANK": {
      const k = key as unknown as FillInBlankKey;
      const given = response?.kind === "fill" ? response.blanks : {};
      const accepted = obj(explanationMaps.accepted);
      review.details = {
        kind: "fill",
        rows: Object.entries(k.blanks).map(([id, b], idx) => {
          const localized = Array.isArray(accepted[id]) ? (accepted[id] as string[]) : [];
          return {
            id,
            label: fmt(labels.blank, idx + 1),
            expected: (localized[0] ?? b.accepted[0]) || "",
            given: given[id] ?? null,
            correct: result.items[id] ?? false,
            explanation: texp(id, b.explanation),
          };
        }),
      };
      break;
    }
    case "CASE_STUDY": {
      const cs = inter as CaseStudyPublic;
      const k = key as unknown as CaseStudyKey;
      const given = response?.kind === "caseStudy" ? response.answers : {};
      review.details = {
        kind: "caseStudy",
        rows: cs.statements.map((s) => ({
          id: s.id,
          label: s.text,
          expected: k.answers[s.id] ? labels.yes : labels.no,
          given: typeof given[s.id] === "boolean" ? (given[s.id] ? labels.yes : labels.no) : null,
          correct: result.items[s.id] ?? false,
          explanation: texp(s.id, k.explanations?.[s.id]),
        })),
      };
      break;
    }
    case "UI_SIMULATION": {
      const u = inter as UiSimulationPublic;
      const k = key as unknown as UiSimulationKey;
      const given = response?.kind === "uiSimulation" ? response.values : {};
      const show = (field: UiSimulationPublic["fields"][number], value: string | boolean | undefined) => {
        if (value === undefined) return null;
        if (typeof value === "boolean") return value ? labels.on : labels.off;
        return field.options?.find((o) => o.value === value)?.label ?? value;
      };
      review.details = {
        kind: "uiSimulation",
        rows: u.fields.map((f) => ({
          id: f.id,
          label: f.label,
          expected: show(f, k.values[f.id]) ?? "",
          given: show(f, given[f.id]),
          correct: result.items[f.id] ?? false,
          explanation: texp(f.id, k.explanations?.[f.id]),
        })),
      };
      break;
    }
  }
  return review;
}

/** Accepted fill-in-the-blank answers from all translations (answers are language specific). */
export function extraAcceptedAnswers(q: QuestionRecord): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of q.translations ?? []) {
    const accepted = obj(obj(t.answerExplanations).accepted);
    for (const [id, list] of Object.entries(accepted)) {
      if (Array.isArray(list)) out[id] = [...(out[id] ?? []), ...list.filter((x): x is string => typeof x === "string")];
    }
  }
  return out;
}
