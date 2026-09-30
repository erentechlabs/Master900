/**
 * Course package format (schema version 1).
 *
 * A course package is the portable, data-driven representation of a learning
 * path. It is used for:
 *  - seeding demo content (prisma/seed-data/courses/<code>/*.json)
 *  - CMS bulk import / export (Admin -> Import & export)
 *  - adding new certification tracks without code changes
 *
 * This module is pure (no server-only imports) so it can be used by scripts,
 * tests, the seed and the server.
 */
import { z } from "zod";

export const CONTENT_LOCALES = ["en", "tr"] as const;

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and single hyphens")
  .min(2)
  .max(80);
const shortText = z.string().trim().min(1).max(300);
const md = z.string().trim().min(1).max(8000);
const httpsUrl = z.url().refine((u) => u.startsWith("https://"), "Only https URLs are allowed");

export const translationStatusSchema = z.enum(["MACHINE_DRAFT", "DRAFT", "IN_REVIEW", "APPROVED"]);
export const difficultySchema = z.enum(["EASY", "MEDIUM", "HARD"]);
export const questionTypeSchema = z.enum([
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
]);
export type QuestionTypeKey = z.infer<typeof questionTypeSchema>;

export const sourceKindSchema = z.enum([
  "CERTIFICATION_PAGE",
  "STUDY_GUIDE",
  "EXAM_PAGE",
  "DOCUMENTATION",
  "LEARN_MODULE",
  "OTHER",
]);

export const sourceRefSchema = z.object({
  title: z.string().trim().min(3).max(300),
  url: httpsUrl,
  kind: sourceKindSchema.optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,40}$/i, "Invalid id");
const optionKeySchema = z.string().regex(/^[A-Z0-9_]{1,12}$/, "Option keys are uppercase, e.g. A, B, TRUE");
const stringMap = z.record(z.string(), z.string().trim().min(1).max(4000));

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const questionOptionSchema = z.object({
  key: optionKeySchema,
  text: z.string().trim().min(1).max(1000),
  correct: z.boolean(),
  /** Why this option is correct, or why this distractor is incorrect. */
  explanation: z.string().trim().min(1).max(2000),
});

export const matchingSchema = z.object({
  prompts: z.array(z.object({ id: idSchema, text: shortText })).min(2).max(8),
  answers: z.array(z.object({ id: idSchema, text: shortText })).min(2).max(10),
  /** promptId -> answerId */
  pairs: z.record(z.string(), z.string()),
  /** promptId -> explanation */
  explanations: stringMap,
});

export const orderingSchema = z.object({
  items: z.array(z.object({ id: idSchema, text: shortText })).min(3).max(8),
  correctOrder: z.array(z.string()).min(3).max(8),
  explanations: stringMap.optional(),
});

export const categorizationSchema = z.object({
  categories: z.array(z.object({ id: idSchema, label: shortText })).min(2).max(5),
  items: z
    .array(
      z.object({
        id: idSchema,
        text: shortText,
        category: z.string(),
        explanation: z.string().trim().min(1).max(1000),
      }),
    )
    .min(3)
    .max(12),
});

export const fillInBlankSchema = z.object({
  /** Text containing {{blankId}} markers. */
  template: z.string().trim().min(5).max(2000),
  blanks: z
    .array(
      z.object({
        id: idSchema,
        accepted: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
        explanation: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(4),
  /** Optional word bank; when present the learner picks from a list (more reliable scoring). */
  wordBank: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
});

export const caseStudySchema = z.object({
  statements: z
    .array(
      z.object({
        id: idSchema,
        text: z.string().trim().min(1).max(600),
        answer: z.boolean(),
        explanation: z.string().trim().min(1).max(1000),
      }),
    )
    .min(2)
    .max(6),
});

export const uiSimulationQuestionSchema = z.object({
  title: shortText,
  description: z.string().trim().max(1000).optional(),
  fields: z
    .array(
      z.object({
        id: idSchema,
        label: shortText,
        control: z.enum(["select", "radio", "toggle"]),
        options: z.array(z.object({ value: z.string().min(1).max(80), label: shortText })).max(8).optional(),
        correct: z.union([z.string(), z.boolean()]),
        explanation: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(6),
});

export const questionTranslationSchema = z.object({
  stem: md,
  scenario: md.optional(),
  explanation: md,
  options: z.record(z.string(), z.object({ text: z.string().min(1), explanation: z.string().min(1) })).optional(),
  matching: z
    .object({ prompts: stringMap.optional(), answers: stringMap.optional(), explanations: stringMap.optional() })
    .optional(),
  ordering: z.object({ items: stringMap.optional(), explanations: stringMap.optional() }).optional(),
  categorization: z
    .object({ categories: stringMap.optional(), items: stringMap.optional(), explanations: stringMap.optional() })
    .optional(),
  fillInBlank: z
    .object({
      template: z.string().optional(),
      accepted: z.record(z.string(), z.array(z.string())).optional(),
      explanations: stringMap.optional(),
      wordBank: z.array(z.string()).optional(),
    })
    .optional(),
  caseStudy: z.object({ statements: stringMap.optional(), explanations: stringMap.optional() }).optional(),
  uiSimulation: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      fields: z
        .record(z.string(), z.object({ label: z.string().optional(), options: stringMap.optional() }))
        .optional(),
      explanations: stringMap.optional(),
    })
    .optional(),
  status: translationStatusSchema.default("DRAFT"),
});
export type QuestionTranslationInput = z.infer<typeof questionTranslationSchema>;

export const questionSchema = z.object({
  /** Stable reference, unique within the package, e.g. az900-cc-001 */
  ref: z.string().regex(/^[a-z0-9][a-z0-9-]{2,80}$/),
  type: questionTypeSchema,
  domainKey: slug,
  objectiveCode: z.string().max(20).optional(),
  difficulty: difficultySchema,
  stem: md,
  scenario: md.optional(),
  /** Why the correct answer is correct. */
  explanation: md,
  options: z.array(questionOptionSchema).min(2).max(8).optional(),
  /** For MULTIPLE_RESPONSE: how many answers the learner must select. */
  selectCount: z.number().int().min(2).max(6).optional(),
  matching: matchingSchema.optional(),
  ordering: orderingSchema.optional(),
  categorization: categorizationSchema.optional(),
  fillInBlank: fillInBlankSchema.optional(),
  caseStudy: caseStudySchema.optional(),
  uiSimulation: uiSimulationQuestionSchema.optional(),
  shuffleOptions: z.boolean().optional(),
  lessonSlug: slug.optional(),
  sources: z.array(sourceRefSchema).min(1).max(6),
  needsVerification: z.boolean().optional(),
  translations: z.object({ tr: questionTranslationSchema.optional() }).optional(),
});
export type QuestionInput = z.infer<typeof questionSchema>;

const CHOICE_TYPES = new Set<QuestionTypeKey>([
  "SINGLE_CHOICE",
  "MULTIPLE_RESPONSE",
  "TRUE_FALSE",
  "SCENARIO",
  "COMMAND_SELECTION",
]);

export function isChoiceType(type: QuestionTypeKey): boolean {
  return CHOICE_TYPES.has(type);
}

type Issue = { path: (string | number)[]; message: string };

/** Semantic checks that cannot be expressed structurally. Returns a list of issues. */
export function checkQuestionSemantics(q: QuestionInput): Issue[] {
  const issues: Issue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });

  if (isChoiceType(q.type)) {
    if (!q.options) {
      add(["options"], `${q.type} requires options`);
      return issues;
    }
    const keys = q.options.map((o) => o.key);
    if (new Set(keys).size !== keys.length) add(["options"], "Option keys must be unique");
    const correct = q.options.filter((o) => o.correct).length;
    if (q.type === "MULTIPLE_RESPONSE") {
      if (correct < 2) add(["options"], "MULTIPLE_RESPONSE needs at least two correct options");
      if (q.options.length < 4) add(["options"], "MULTIPLE_RESPONSE needs at least four options");
      if (q.selectCount !== undefined && q.selectCount !== correct)
        add(["selectCount"], "selectCount must equal the number of correct options");
    } else if (correct !== 1) {
      add(["options"], `${q.type} needs exactly one correct option`);
    }
    if (q.type === "TRUE_FALSE") {
      const sorted = [...keys].sort().join(",");
      if (sorted !== "FALSE,TRUE") add(["options"], "TRUE_FALSE options must use keys TRUE and FALSE");
    } else if (q.options.length < 3 && q.type !== "MULTIPLE_RESPONSE") {
      add(["options"], `${q.type} needs at least three options`);
    }
  }

  if (q.type === "MATCHING") {
    const m = q.matching;
    if (!m) add(["matching"], "MATCHING requires a matching block");
    else {
      const answerIds = new Set(m.answers.map((a) => a.id));
      for (const p of m.prompts) {
        const target = m.pairs[p.id];
        if (!target) add(["matching", "pairs", p.id], `Missing pair for prompt ${p.id}`);
        else if (!answerIds.has(target)) add(["matching", "pairs", p.id], `Unknown answer id ${target}`);
        if (!m.explanations[p.id]) add(["matching", "explanations", p.id], `Missing explanation for ${p.id}`);
      }
    }
  }

  if (q.type === "ORDERING") {
    const o = q.ordering;
    if (!o) add(["ordering"], "ORDERING requires an ordering block");
    else {
      const ids = o.items.map((i) => i.id).sort().join(",");
      const order = [...o.correctOrder].sort().join(",");
      if (ids !== order) add(["ordering", "correctOrder"], "correctOrder must be a permutation of the item ids");
    }
  }

  if (q.type === "CATEGORIZATION") {
    const c = q.categorization;
    if (!c) add(["categorization"], "CATEGORIZATION requires a categorization block");
    else {
      const cats = new Set(c.categories.map((x) => x.id));
      c.items.forEach((item, i) => {
        if (!cats.has(item.category)) add(["categorization", "items", i, "category"], `Unknown category ${item.category}`);
      });
    }
  }

  if (q.type === "FILL_IN_BLANK") {
    const f = q.fillInBlank;
    if (!f) add(["fillInBlank"], "FILL_IN_BLANK requires a fillInBlank block");
    else {
      for (const b of f.blanks) {
        if (!f.template.includes(`{{${b.id}}}`)) add(["fillInBlank", "template"], `Template is missing {{${b.id}}}`);
        if (f.wordBank && !b.accepted.some((a) => f.wordBank!.includes(a)))
          add(["fillInBlank", "wordBank"], `Word bank must contain an accepted answer for ${b.id}`);
      }
    }
  }

  if (q.type === "CASE_STUDY") {
    if (!q.caseStudy) add(["caseStudy"], "CASE_STUDY requires a caseStudy block");
    if (!q.scenario) add(["scenario"], "CASE_STUDY requires a scenario");
  }

  if (q.type === "SCENARIO" && !q.scenario) add(["scenario"], "SCENARIO questions require a scenario");

  if (q.type === "UI_SIMULATION") {
    const u = q.uiSimulation;
    if (!u) add(["uiSimulation"], "UI_SIMULATION requires a uiSimulation block");
    else {
      u.fields.forEach((f, i) => {
        if (f.control === "toggle") {
          if (typeof f.correct !== "boolean") add(["uiSimulation", "fields", i, "correct"], "Toggle answers must be boolean");
        } else {
          const values = (f.options ?? []).map((o) => o.value);
          if (values.length < 2) add(["uiSimulation", "fields", i, "options"], "Select/radio fields need options");
          if (typeof f.correct !== "string" || !values.includes(f.correct))
            add(["uiSimulation", "fields", i, "correct"], "Correct value must be one of the options");
        }
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Lessons, modules, domains
// ---------------------------------------------------------------------------

export const comparisonBlockSchema = z.object({
  type: z.literal("COMPARISON"),
  data: z.object({
    title: z.string().max(200).optional(),
    columns: z
      .array(z.object({ title: shortText, points: z.array(z.string().min(1).max(400)).min(1).max(8) }))
      .min(2)
      .max(4),
  }),
});

export const diagramBlockSchema = z.object({
  type: z.literal("DIAGRAM"),
  data: z.object({
    title: z.string().max(200).optional(),
    kind: z.enum(["flow", "layers", "hub"]),
    nodes: z.array(z.object({ id: idSchema, label: shortText, detail: z.string().max(300).optional() })).min(2).max(10),
    edges: z
      .array(z.object({ from: z.string(), to: z.string(), label: z.string().max(80).optional() }))
      .max(15)
      .optional(),
    /** Text alternative describing the diagram (required for accessibility). */
    caption: md,
  }),
});

export const activityBlockSchema = z.object({
  type: z.literal("ACTIVITY"),
  data: z.object({
    title: shortText,
    instructions: z.string().max(1000),
    items: z
      .array(z.object({ prompt: z.string().min(1).max(500), answer: z.string().min(1).max(1000) }))
      .min(1)
      .max(6),
  }),
});

export const calloutBlockSchema = z.object({
  type: z.literal("CALLOUT"),
  data: z.object({ variant: z.enum(["info", "tip", "warning"]), title: z.string().max(200).optional(), body: md }),
});

export const videoBlockSchema = z.object({
  type: z.literal("VIDEO"),
  data: z.object({
    title: shortText,
    url: httpsUrl,
    durationMinutes: z.number().int().min(1).max(180).optional(),
    transcript: z.string().max(20000).optional(),
    transcriptUrl: httpsUrl.optional(),
  }),
});

export const extraBlockSchema = z.discriminatedUnion("type", [
  comparisonBlockSchema,
  diagramBlockSchema,
  activityBlockSchema,
  calloutBlockSchema,
  videoBlockSchema,
]);
export type ExtraBlockInput = z.infer<typeof extraBlockSchema>;

const termSchema = z.object({ term: shortText, definition: z.string().trim().min(1).max(800) });

export const lessonTranslationSchema = z.object({
  title: shortText,
  summary: z.string().max(400).optional(),
  learningObjectives: z.array(z.string().min(1)).optional(),
  explanation: md.optional(),
  terminology: z.array(termSchema).optional(),
  businessScenario: md.optional(),
  technicalExample: md.optional(),
  misconception: z.object({ myth: md, reality: md }).optional(),
  examTakeaway: md.optional(),
  recap: md.optional(),
  simplerExplanation: md.optional(),
  anotherExample: md.optional(),
  /** Aligned by index with lesson.extraBlocks (translated `data` objects). */
  extraBlocks: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Aligned by index with lesson.flashcards */
  flashcards: z.array(z.object({ front: z.string().min(1), back: z.string().min(1) })).optional(),
  status: translationStatusSchema.default("DRAFT"),
});
export type LessonTranslationInput = z.infer<typeof lessonTranslationSchema>;

export const lessonSchema = z.object({
  slug,
  title: z.string().trim().min(3).max(160),
  objectiveCode: z.string().max(20).optional(),
  estimatedMinutes: z.number().int().min(3).max(60),
  /** One or two sentence description used on cards. */
  summary: z.string().trim().min(10).max(400),
  learningObjectives: z.array(z.string().trim().min(3).max(300)).min(2).max(6),
  explanation: md,
  terminology: z.array(termSchema).min(2).max(12),
  businessScenario: md,
  technicalExample: md,
  misconception: z.object({ myth: md, reality: md }),
  examTakeaway: md,
  /** The lesson's short summary / recap block. */
  recap: md,
  /** Pre-authored content for "Explain it more simply". */
  simplerExplanation: md,
  /** Pre-authored content for "Give me another example". */
  anotherExample: md,
  extraBlocks: z.array(extraBlockSchema).max(5).default([]),
  flashcards: z
    .array(z.object({ front: z.string().trim().min(1).max(300), back: z.string().trim().min(1).max(800) }))
    .min(2)
    .max(10),
  sources: z.array(sourceRefSchema).min(1).max(8),
  knowledgeCheck: z.array(questionSchema).min(3).max(8),
  needsVerification: z.boolean().optional(),
  verificationNote: z.string().max(1000).optional(),
  translations: z.object({ tr: lessonTranslationSchema.optional() }).optional(),
});
export type LessonInput = z.infer<typeof lessonSchema>;

const titleTranslation = z.object({
  title: shortText,
  summary: z.string().max(1000).optional(),
  description: z.string().max(2000).optional(),
  status: translationStatusSchema.default("DRAFT"),
});

export const moduleSchema = z.object({
  slug,
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(10).max(600),
  lessons: z.array(lessonSchema).min(1).max(12),
  translations: z.object({ tr: titleTranslation.optional() }).optional(),
});
export type ModuleInput = z.infer<typeof moduleSchema>;

export const objectiveSchema = z.object({
  code: z.string().min(1).max(20),
  title: z.string().trim().min(3).max(300),
  translations: z.object({ tr: titleTranslation.optional() }).optional(),
});

export const domainSchema = z.object({
  key: slug,
  title: z.string().trim().min(3).max(200),
  description: z.string().max(1000).optional(),
  weightMin: z.number().int().min(0).max(100).nullable(),
  weightMax: z.number().int().min(0).max(100).nullable(),
  objectives: z.array(objectiveSchema).min(1).max(20),
  modules: z.array(moduleSchema).default([]),
  translations: z.object({ tr: titleTranslation.optional() }).optional(),
});
export type DomainInput = z.infer<typeof domainSchema>;

// ---------------------------------------------------------------------------
// Glossary, labs, certification configuration
// ---------------------------------------------------------------------------

export const glossaryTermSchema = z.object({
  slug,
  term: z.string().trim().min(1).max(160),
  definition: z.string().trim().min(10).max(1500),
  kind: z.enum(["TERM", "SERVICE", "CONCEPT"]),
  attributes: z
    .object({
      category: z.string().max(120).optional(),
      useCases: z.array(z.string().max(300)).max(6).optional(),
      keyFeatures: z.array(z.string().max(300)).max(6).optional(),
      serviceModel: z.string().max(60).optional(),
      comparesWith: z.array(slug).max(6).optional(),
    })
    .optional(),
  source: sourceRefSchema.optional(),
  certifications: z.array(z.string().regex(/^[A-Z]{2,3}-\d{3}$/)).optional(),
  translations: z
    .object({
      tr: z
        .object({
          term: z.string().optional(),
          definition: z.string().min(1),
          useCases: z.array(z.string()).optional(),
          keyFeatures: z.array(z.string()).optional(),
          status: translationStatusSchema.default("DRAFT"),
        })
        .optional(),
    })
    .optional(),
});
export type GlossaryTermInput = z.infer<typeof glossaryTermSchema>;

export const labTypeSchema = z.enum(["UI_SIMULATION", "COMMAND_SANDBOX", "ARCHITECTURE", "TROUBLESHOOTING", "BUSINESS_SCENARIO"]);

export const labRuleSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/),
  description: z.string().min(3).max(400),
  rule: z.record(z.string(), z.unknown()),
  successFeedback: z.string().max(600).optional(),
  failureFeedback: z.string().max(600).optional(),
});

export const labStepSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/),
  title: shortText,
  instruction: md,
  hint: z.string().max(800).optional(),
  explanation: md,
  targetId: z.string().max(80).optional(),
  rules: z.array(labRuleSchema).default([]),
});

export const labSchema = z.object({
  slug,
  type: labTypeSchema,
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(10).max(400),
  scenario: md,
  domainKey: slug.optional(),
  moduleSlug: slug.optional(),
  objectiveCode: z.string().max(20).optional(),
  complexity: z.enum(["INTRO", "BASIC", "INTERMEDIATE"]),
  estimatedMinutes: z.number().int().min(3).max(120),
  learningObjectives: z.array(z.string().min(3).max(300)).min(1).max(8),
  prerequisites: z.array(z.string().min(1).max(300)).max(8).default([]),
  sources: z.array(sourceRefSchema).min(1).max(8),
  config: z.record(z.string(), z.unknown()),
  steps: z.array(labStepSchema).min(1).max(20),
  /** Rules evaluated for challenge mode / final completion, in addition to step rules. */
  finalRules: z.array(labRuleSchema).default([]),
  solution: md,
  translations: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});
export type LabInput = z.infer<typeof labSchema>;

export const certificationStatusSchema = z.enum(["ACTIVE", "ANNOUNCED", "RETIRING", "RETIRED"]);
const certCode = z.string().regex(/^[A-Z]{2,3}-\d{3}$/, "Certification codes look like AZ-900");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const certificationConfigSchema = z.object({
  code: certCode,
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(2000),
  audience: z.string().max(1000).optional(),
  status: certificationStatusSchema,
  /** e.g. "Skills measured as of July 20, 2026". null => verification required */
  examVersion: z.string().max(200).nullable(),
  officialUrl: httpsUrl.nullable(),
  studyGuideUrl: httpsUrl.nullable(),
  lastCurriculumReviewAt: isoDate.nullable(),
  retirementDate: isoDate.nullable(),
  replacementCode: certCode.nullable(),
  estimatedStudyHours: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }).nullable(),
  recommendedPrerequisites: z.array(z.string().max(300)).max(10).default([]),
  relatedCodes: z.array(certCode).max(10).default([]),
  icon: z.string().max(40),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.number().int().optional(),
  unverifiedFields: z.array(z.string()).default([]),
  verificationNotes: z.string().max(2000).optional(),
  domains: z.array(domainSchema.omit({ modules: true })).default([]),
  translations: z
    .object({
      tr: z
        .object({
          name: z.string().optional(),
          description: z.string().min(1),
          audience: z.string().optional(),
          status: translationStatusSchema.default("DRAFT"),
        })
        .optional(),
    })
    .optional(),
});
export type CertificationConfigInput = z.infer<typeof certificationConfigSchema>;

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------

export const coursePackageSchema = z.object({
  schemaVersion: z.literal(1),
  certificationCode: certCode,
  /** Label of this content release, e.g. "demo-2026.09". */
  contentVersionLabel: z.string().min(1).max(60),
  sourceLocale: z.enum(CONTENT_LOCALES).default("en"),
  /** Demonstration content is labelled in the UI and never presented as a complete curriculum. */
  isDemo: z.boolean().default(true),
  /** Optional: create or update the certification record from this package. */
  certification: certificationConfigSchema.optional(),
  domains: z.array(domainSchema).min(1),
  practiceQuestions: z.array(questionSchema).default([]),
  glossary: z.array(glossaryTermSchema).default([]),
  labs: z.array(labSchema).default([]),
});
export type CoursePackage = z.infer<typeof coursePackageSchema>;
export type CoursePackageInput = z.input<typeof coursePackageSchema>;

export type PackageIssue = { path: string; message: string; severity: "error" | "warning" };

export function formatIssuePath(path: readonly PropertyKey[]): string {
  return path
    .map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`))
    .join("")
    .replace(/^\./, "");
}

/** Iterate every question in a package together with its JSON path. */
export function* iterateQuestions(
  pkg: CoursePackage,
): Generator<{ q: QuestionInput; path: string; lessonSlug?: string }> {
  for (const [di, d] of pkg.domains.entries()) {
    for (const [mi, m] of d.modules.entries()) {
      for (const [li, l] of m.lessons.entries()) {
        for (const [qi, q] of l.knowledgeCheck.entries()) {
          yield { q, path: `domains[${di}].modules[${mi}].lessons[${li}].knowledgeCheck[${qi}]`, lessonSlug: l.slug };
        }
      }
    }
  }
  for (const [qi, q] of pkg.practiceQuestions.entries()) {
    yield { q, path: `practiceQuestions[${qi}]` };
  }
}

/**
 * Validate a package structurally (Zod) and semantically (cross references).
 * `strictReferences` turns unresolved lesson/module references into errors.
 */
export function validateCoursePackage(
  input: unknown,
  options: { strictReferences?: boolean } = {},
): { ok: true; pkg: CoursePackage; issues: PackageIssue[] } | { ok: false; issues: PackageIssue[] } {
  const parsed = coursePackageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: formatIssuePath(i.path),
        message: i.message,
        severity: "error" as const,
      })),
    };
  }
  const pkg = parsed.data;
  const issues: PackageIssue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message, severity: "error" });
  const warn = (path: string, message: string) => issues.push({ path, message, severity: "warning" });

  const domainKeys = new Map(pkg.domains.map((d) => [d.key, d]));
  if (domainKeys.size !== pkg.domains.length) err("domains", "Domain keys must be unique");

  const lessonSlugs = new Set<string>();
  const moduleSlugs = new Set<string>();
  for (const [di, d] of pkg.domains.entries()) {
    const codes = d.objectives.map((o) => o.code);
    if (new Set(codes).size !== codes.length) err(`domains[${di}].objectives`, "Objective codes must be unique");
    if (d.weightMin !== null && d.weightMax !== null && d.weightMin > d.weightMax)
      err(`domains[${di}]`, "weightMin cannot exceed weightMax");
    for (const [mi, m] of d.modules.entries()) {
      if (moduleSlugs.has(m.slug)) err(`domains[${di}].modules[${mi}].slug`, `Duplicate module slug ${m.slug}`);
      moduleSlugs.add(m.slug);
      for (const [li, l] of m.lessons.entries()) {
        const lp = `domains[${di}].modules[${mi}].lessons[${li}]`;
        if (lessonSlugs.has(l.slug)) err(`${lp}.slug`, `Duplicate lesson slug ${l.slug}`);
        lessonSlugs.add(l.slug);
        if (l.objectiveCode && !codes.includes(l.objectiveCode))
          err(`${lp}.objectiveCode`, `Unknown objective ${l.objectiveCode} for domain ${d.key}`);
        const tr = l.translations?.tr;
        if (tr?.extraBlocks && tr.extraBlocks.length !== l.extraBlocks.length)
          err(`${lp}.translations.tr.extraBlocks`, "Translated extraBlocks must align with extraBlocks");
        if (tr?.flashcards && tr.flashcards.length !== l.flashcards.length)
          err(`${lp}.translations.tr.flashcards`, "Translated flashcards must align with flashcards");
        for (const [qi, q] of l.knowledgeCheck.entries()) {
          if (q.domainKey !== d.key) err(`${lp}.knowledgeCheck[${qi}].domainKey`, `Must be ${d.key}`);
        }
      }
    }
  }

  const refs = new Set<string>();
  for (const { q, path } of iterateQuestions(pkg)) {
    if (refs.has(q.ref)) err(`${path}.ref`, `Duplicate question ref ${q.ref}`);
    refs.add(q.ref);
    const domain = domainKeys.get(q.domainKey);
    if (!domain) err(`${path}.domainKey`, `Unknown domain ${q.domainKey}`);
    else if (q.objectiveCode && !domain.objectives.some((o) => o.code === q.objectiveCode))
      err(`${path}.objectiveCode`, `Unknown objective ${q.objectiveCode} in ${q.domainKey}`);
    if (q.lessonSlug && !lessonSlugs.has(q.lessonSlug)) {
      (options.strictReferences ? err : warn)(`${path}.lessonSlug`, `Lesson ${q.lessonSlug} not found in package`);
    }
    for (const i of checkQuestionSemantics(q)) err(`${path}.${formatIssuePath(i.path)}`, i.message);
  }

  const glossarySlugs = new Set<string>();
  for (const [gi, g] of pkg.glossary.entries()) {
    if (glossarySlugs.has(g.slug)) err(`glossary[${gi}].slug`, `Duplicate glossary slug ${g.slug}`);
    glossarySlugs.add(g.slug);
  }
  for (const [gi, g] of pkg.glossary.entries()) {
    for (const c of g.attributes?.comparesWith ?? []) {
      if (!glossarySlugs.has(c)) warn(`glossary[${gi}].attributes.comparesWith`, `Unknown glossary slug ${c}`);
    }
  }

  const labSlugs = new Set<string>();
  for (const [li, lab] of pkg.labs.entries()) {
    if (labSlugs.has(lab.slug)) err(`labs[${li}].slug`, `Duplicate lab slug ${lab.slug}`);
    labSlugs.add(lab.slug);
    if (lab.domainKey && !domainKeys.has(lab.domainKey)) err(`labs[${li}].domainKey`, `Unknown domain ${lab.domainKey}`);
    if (lab.moduleSlug && !moduleSlugs.has(lab.moduleSlug)) {
      (options.strictReferences ? err : warn)(`labs[${li}].moduleSlug`, `Module ${lab.moduleSlug} not found in package`);
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return hasErrors ? { ok: false, issues } : { ok: true, pkg, issues };
}
