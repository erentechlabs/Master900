import "server-only";
import { z } from "zod";
import type { AttemptContext, PracticeMode, Prisma, QuestionType, QuizKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ActionError } from "@/lib/actions";
import { addDays, addMinutes, todayISO } from "@/lib/dates";
import { createRng, randomToken, shuffle } from "@/lib/random";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { localizedField, type TFunction } from "@/i18n/translator";
import type { CurrentUser } from "@/modules/auth/session";
import { computeAndStoreReadiness, awardBadges, domainMastery } from "@/modules/analytics/data";
import { XP_RULES } from "@/modules/analytics/gamification";
import { qualityFromAnswer, reviewSrs, shouldQueueForReview } from "@/modules/learning/srs";
import { buildStudyPlan, defaultTargetDate, planSettingsFromPlan } from "@/modules/planner/service";
import { toISODate } from "@/lib/dates";
import { getSettings } from "@/modules/admin/settings";
import { allocateByBlueprint, buildExam, selectQuestions, type BlueprintDomain, type PoolQuestion } from "./engine/exam-builder";
import { initialAbility, selectNextAdaptive, updateAbility, type AdaptiveState } from "./engine/adaptive";
import { buildOptionOrder, buildReview, extraAcceptedAnswers, projectQuestion, type QuestionRecord, type ReviewLabels } from "./engine/projection";
import { scoreQuestion } from "./engine/scoring";
import { classifyDomains, summarizeAttempt } from "./engine/results";
import { expectedResponseKind, responseSchema, type PublicQuestion, type QuestionResponse, type QuestionReview } from "./engine/types";
import { computeLightningSummary, LIGHTNING_DURATION_MS, LIGHTNING_QUESTION_COUNT, type LightningSummary } from "./engine/lightning";

export type AttemptKind = "quiz" | "practice";
export type AttemptItem = { questionId: string; version: number; optionOrder: string[]; marked?: boolean };
export type PracticeSettings = {
  immediateFeedback: boolean;
  restrictions?: boolean;
  questionCount: number;
  explainFirst?: boolean;
  lightning?: { durationSeconds: number };
  domainIds?: string[];
  adaptive?: { ability: number; length: number; answers: AdaptiveState["answers"] };
};

const GRACE_MS = 30_000;
const QUESTION_INCLUDE = {
  options: true,
  translations: true,
  lesson: { select: { slug: true, title: true, translations: { select: { locale: true, title: true } } } },
  certification: { select: { code: true } },
} satisfies Prisma.QuestionInclude;
type QuestionRow = Prisma.QuestionGetPayload<{ include: typeof QUESTION_INCLUDE }>;

export function toQuestionRecord(q: QuestionRow | (Omit<QuestionRow, "lesson" | "certification"> & Partial<QuestionRow>)): QuestionRecord {
  return {
    id: q.id,
    code: q.code,
    type: q.type,
    difficulty: q.difficulty,
    domainId: q.domainId,
    stem: q.stem,
    scenario: q.scenario,
    explanation: q.explanation,
    interaction: q.interaction,
    answerKey: q.answerKey,
    shuffleOptions: q.shuffleOptions,
    sourceLocale: q.sourceLocale,
    options: q.options.map((o) => ({ key: o.key, text: o.text, isCorrect: o.isCorrect, explanation: o.explanation, sortOrder: o.sortOrder })),
    translations: q.translations,
  };
}

export function reviewLabels(t: TFunction): ReviewLabels {
  return {
    yes: t("assessment.runner.yes"),
    no: t("assessment.runner.no"),
    on: t("assessment.runner.on"),
    off: t("assessment.runner.off"),
    true: t("assessment.runner.trueLabel"),
    false: t("assessment.runner.falseLabel"),
    blank: t("assessment.runner.blank", { n: "{n}" }),
    position: t("assessment.runner.position", { n: "{n}" }),
  };
}

// ------------------------------------------------------------------ pools

async function questionPool(userId: string, where: Prisma.QuestionWhereInput): Promise<PoolQuestion[]> {
  const qs = await prisma.question.findMany({ where: { AND: [where, learnerVisibleWhere()] }, select: { id: true, domainId: true, difficulty: true } });
  if (qs.length === 0) return [];
  const ids = qs.map((q) => q.id);
  const [seen, mastered] = await Promise.all([
    prisma.questionAttempt.groupBy({ by: ["questionId"], where: { userId, questionId: { in: ids } }, _max: { answeredAt: true }, _count: { _all: true } }),
    prisma.reviewQueueItem.findMany({ where: { userId, status: "MASTERED", questionId: { in: ids } }, select: { questionId: true } }),
  ]);
  const seenMap = new Map(seen.map((s) => [s.questionId, s]));
  const masteredSet = new Set(mastered.map((m) => m.questionId));
  return qs.map((q) => ({
    id: q.id,
    domainId: q.domainId,
    difficulty: q.difficulty,
    lastSeenAt: seenMap.get(q.id)?._max.answeredAt ?? null,
    timesSeen: seenMap.get(q.id)?._count._all ?? 0,
    mastered: masteredSet.has(q.id),
  }));
}

async function blueprint(certificationId: string, domainIds?: string[]): Promise<BlueprintDomain[]> {
  const domains = await prisma.examDomain.findMany({ where: { certificationId, ...(domainIds?.length ? { id: { in: domainIds } } : {}) }, orderBy: { sortOrder: "asc" } });
  return domains.map((d) => ({ domainId: d.id, weightMin: d.weightMin, weightMax: d.weightMax }));
}

async function buildItems(questionIds: string[], seed: string): Promise<AttemptItem[]> {
  const qs = await prisma.question.findMany({ where: { id: { in: questionIds } }, select: { id: true, version: true, type: true, shuffleOptions: true, options: { select: { key: true, sortOrder: true, text: true, isCorrect: true, explanation: true } } } });
  const byId = new Map(qs.map((q) => [q.id, q]));
  await prisma.question.updateMany({ where: { id: { in: questionIds } }, data: { timesServed: { increment: 1 } } });
  return questionIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => ({ questionId: q.id, version: q.version, optionOrder: buildOptionOrder(q, `${seed}:${q.id}`), marked: false }));
}

// ------------------------------------------------------------------ quizzes

export async function startQuiz(user: CurrentUser, quizId: string): Promise<string> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: { orderBy: { sortOrder: "asc" } } } });
  if (!quiz) throw new ActionError("not_found");
  const existing = await prisma.quizAttempt.findFirst({ where: { userId: user.id, quizId, status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" } });
  if (existing && Date.now() - existing.startedAt.getTime() < 24 * 3600_000) return existing.id;

  const seed = randomToken(6);
  let ids: string[] = [];
  if (quiz.kind === "KNOWLEDGE_CHECK") {
    const visible = await prisma.question.findMany({ where: { AND: [{ id: { in: quiz.questions.map((q) => q.questionId) } }, learnerVisibleWhere()] }, select: { id: true } });
    const allowed = new Set(visible.map((v) => v.id));
    ids = quiz.questions.map((q) => q.questionId).filter((id) => allowed.has(id));
  } else if (quiz.kind === "DOMAIN_ASSESSMENT" && quiz.domainId) {
    const pool = await questionPool(user.id, { domainId: quiz.domainId });
    ids = selectQuestions(pool, new Map([[quiz.domainId, Math.min(quiz.questionCount, pool.length)]]), {
      rng: createRng(seed),
      difficultyMix: { EASY: 0.3, MEDIUM: 0.5, HARD: 0.2 },
    });
  } else {
    const pool = await questionPool(user.id, { certificationId: quiz.certificationId, difficulty: { in: ["EASY", "MEDIUM"] } });
    ids = buildExam(pool, await blueprint(quiz.certificationId), quiz.questionCount, seed);
  }
  if (ids.length === 0) throw new ActionError("no_questions");
  const items = await buildItems(ids, seed);
  if (existing) await prisma.quizAttempt.update({ where: { id: existing.id }, data: { status: "ABANDONED" } });
  const attempt = await prisma.quizAttempt.create({ data: { userId: user.id, quizId, items: items as unknown as Prisma.InputJsonValue, totalCount: items.length } });
  return attempt.id;
}

// ------------------------------------------------------------------ practice

export const practiceStartSchema = z.object({
  mode: z.enum(["QUICK", "DOMAIN", "FULL", "ADAPTIVE", "DAILY", "MISTAKE_REVIEW", "LIGHTNING"]),
  certificationCode: z.string().regex(/^[A-Z]{2,3}-\d{3}$/).optional(),
  questionCount: z.coerce.number().int().min(1).max(60).optional(),
  domainIds: z.array(z.string().max(40)).max(12).optional(),
  domainId: z.string().max(40).optional(),
  immediateFeedback: z.boolean().optional(),
  restrictions: z.boolean().optional(),
  questionIds: z.array(z.string().max(40)).max(10).optional(),
  mistakes: z
    .object({
      certificationCode: z.string().regex(/^[A-Z]{2,3}-\d{3}$/).optional(),
      domainId: z.string().max(40).optional(),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dueOnly: z.boolean().optional(),
      explainFirst: z.boolean().optional(),
    })
    .optional(),
});
export type PracticeStartInput = z.infer<typeof practiceStartSchema>;

async function resolveCert(user: CurrentUser, code?: string) {
  if (code) {
    const cert = await prisma.certification.findUnique({ where: { code } });
    if (!cert) throw new ActionError("not_found");
    return cert;
  }
  const primary = await prisma.enrollment.findFirst({ where: { userId: user.id, status: "ACTIVE" }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], include: { certification: true } });
  if (!primary) throw new ActionError("no_questions");
  return primary.certification;
}

export async function mistakeQuestionIds(userId: string, f: NonNullable<PracticeStartInput["mistakes"]>, limit = 200): Promise<string[]> {
  if (f.dueOnly) {
    const due = await prisma.reviewQueueItem.findMany({
      where: {
        userId,
        status: "ACTIVE",
        dueAt: { lte: new Date() },
        questionId: { not: null },
        ...(f.domainId ? { domainId: f.domainId } : {}),
        ...(f.certificationCode || f.difficulty
          ? { question: { ...(f.certificationCode ? { certification: { code: f.certificationCode } } : {}), ...(f.difficulty ? { difficulty: f.difficulty } : {}) } }
          : {}),
      },
      orderBy: { dueAt: "asc" },
      take: limit,
      select: { questionId: true },
    });
    return due.map((d) => d.questionId!);
  }
  const wrong = await prisma.questionAttempt.findMany({
    where: {
      userId,
      isCorrect: false,
      ...(f.domainId ? { domainId: f.domainId } : {}),
      ...(f.difficulty ? { difficulty: f.difficulty } : {}),
      ...(f.certificationCode ? { question: { certification: { code: f.certificationCode } } } : {}),
      ...(f.from || f.to ? { answeredAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59Z`) } : {}) } } : {}),
    },
    orderBy: { answeredAt: "desc" },
    select: { questionId: true },
    take: 2000,
  });
  return [...new Set(wrong.map((w) => w.questionId))].slice(0, limit);
}

export async function startPractice(user: CurrentUser, raw: PracticeStartInput): Promise<string> {
  const input = practiceStartSchema.parse(raw);
  const tz = user.preference?.timezone ?? "UTC";
  const seed = randomToken(6);
  const rng = createRng(seed);
  const settingsDefaults = await getSettings();
  const now = new Date();

  if (input.mode === "DAILY") {
    const challengeDate = todayISO(tz);
    const existing = await prisma.practiceExamAttempt.findUnique({ where: { userId_challengeDate: { userId: user.id, challengeDate } } });
    if (existing) return existing.id;
    const enrollments = await prisma.enrollment.findMany({ where: { userId: user.id, status: "ACTIVE" }, orderBy: [{ isPrimary: "desc" }] });
    const certIds = enrollments.map((e) => e.certificationId);
    if (certIds.length === 0) throw new ActionError("no_questions");
    const due = await prisma.reviewQueueItem.findMany({
      where: { userId: user.id, status: "ACTIVE", dueAt: { lte: now }, questionId: { not: null }, question: { certificationId: { in: certIds } } },
      orderBy: { dueAt: "asc" },
      take: 2,
      select: { questionId: true },
    });
    const dueIds = due.map((d) => d.questionId!);
    const pool = (await questionPool(user.id, { certificationId: { in: certIds } })).filter((q) => !dueIds.includes(q.id));
    const fresh = shuffle(pool, rng).sort((a, b) => (a.timesSeen ?? 0) - (b.timesSeen ?? 0)).slice(0, 5 - dueIds.length);
    const ids = shuffle([...dueIds, ...fresh.map((q) => q.id)], rng);
    if (ids.length === 0) throw new ActionError("no_questions");
    const items = await buildItems(ids, seed);
    const attempt = await prisma.practiceExamAttempt.create({
      data: {
        userId: user.id,
        certificationId: certIds[0],
        mode: "DAILY",
        challengeDate,
        settings: { immediateFeedback: true, questionCount: items.length },
        items: items as unknown as Prisma.InputJsonValue,
        totalCount: items.length,
      },
    });
    return attempt.id;
  }

  if (input.mode === "MISTAKE_REVIEW") {
    const filters = input.mistakes ?? {};
    const ids = shuffle(await mistakeQuestionIds(user.id, filters), rng).slice(0, input.questionCount ?? 10);
    const visible = await prisma.question.findMany({ where: { AND: [{ id: { in: ids } }, learnerVisibleWhere()] }, select: { id: true, certificationId: true } });
    if (visible.length === 0) throw new ActionError("no_questions");
    const items = await buildItems(ids.filter((id) => visible.some((v) => v.id === id)), seed);
    const cert = filters.certificationCode ? await prisma.certification.findUnique({ where: { code: filters.certificationCode } }) : null;
    const attempt = await prisma.practiceExamAttempt.create({
      data: {
        userId: user.id,
        certificationId: cert?.id ?? visible[0]!.certificationId,
        mode: "MISTAKE_REVIEW",
        settings: { immediateFeedback: true, questionCount: items.length, explainFirst: !!filters.explainFirst },
        items: items as unknown as Prisma.InputJsonValue,
        totalCount: items.length,
      },
    });
    return attempt.id;
  }

  const cert = await resolveCert(user, input.certificationCode);

  if (input.mode === "LIGHTNING") {
    const quickTypes: QuestionType[] = ["SINGLE_CHOICE", "TRUE_FALSE", "SCENARIO", "MULTIPLE_RESPONSE"];
    let pool = await questionPool(user.id, { certificationId: cert.id, type: { in: quickTypes }, difficulty: { in: ["EASY", "MEDIUM"] } });
    if (pool.length < LIGHTNING_QUESTION_COUNT) {
      pool = await questionPool(user.id, { certificationId: cert.id, type: { in: quickTypes } });
    }
    const count = Math.min(LIGHTNING_QUESTION_COUNT, pool.length);
    const bp = await blueprint(cert.id);
    const ids = selectQuestions(pool, allocateByBlueprint(bp, count), { rng, now, difficultyMix: { EASY: 0.55, MEDIUM: 0.4, HARD: 0.05 } });
    if (ids.length === 0) throw new ActionError("no_questions");
    const items = await buildItems(ids, seed);
    const settings: PracticeSettings = { immediateFeedback: true, questionCount: items.length, lightning: { durationSeconds: LIGHTNING_DURATION_MS / 1000 } };
    const attempt = await prisma.practiceExamAttempt.create({
      data: {
        userId: user.id,
        certificationId: cert.id,
        mode: "LIGHTNING",
        settings: settings as unknown as Prisma.InputJsonValue,
        items: items as unknown as Prisma.InputJsonValue,
        totalCount: items.length,
        expiresAt: new Date(now.getTime() + LIGHTNING_DURATION_MS),
      },
    });
    return attempt.id;
  }

  if (input.questionIds?.length) {
    const items = await buildItems(input.questionIds, seed);
    if (items.length === 0) throw new ActionError("no_questions");
    const attempt = await prisma.practiceExamAttempt.create({
      data: { userId: user.id, certificationId: cert.id, mode: "QUICK", settings: { immediateFeedback: true, questionCount: items.length }, items: items as unknown as Prisma.InputJsonValue, totalCount: items.length },
    });
    return attempt.id;
  }

  if (input.mode === "FULL") {
    const existing = await prisma.practiceExamAttempt.findFirst({ where: { userId: user.id, certificationId: cert.id, mode: "FULL", status: "IN_PROGRESS", expiresAt: { gt: now } } });
    if (existing) return existing.id;
    const template = await prisma.practiceExam.findFirst({ where: { certificationId: cert.id, mode: "FULL", isActive: true } });
    const count = template?.questionCount ?? settingsDefaults["practice.fullExamQuestions"];
    const minutes = template?.timeLimitMinutes ?? settingsDefaults["practice.fullExamMinutes"];
    const pool = await questionPool(user.id, { certificationId: cert.id });
    const ids = buildExam(pool, await blueprint(cert.id), count, seed, now);
    if (ids.length === 0) throw new ActionError("no_questions");
    const items = await buildItems(ids, seed);
    const attempt = await prisma.practiceExamAttempt.create({
      data: {
        userId: user.id,
        certificationId: cert.id,
        practiceExamId: template?.id,
        mode: "FULL",
        settings: { immediateFeedback: false, restrictions: !!input.restrictions, questionCount: items.length },
        items: items as unknown as Prisma.InputJsonValue,
        totalCount: items.length,
        expiresAt: addMinutes(now, minutes),
      },
    });
    return attempt.id;
  }

  if (input.mode === "ADAPTIVE") {
    const length = [10, 15, 20].includes(input.questionCount ?? 0) ? input.questionCount! : 15;
    const pool = await questionPool(user.id, { certificationId: cert.id });
    if (pool.length === 0) throw new ActionError("no_questions");
    const recent = await prisma.questionAttempt.findMany({ where: { userId: user.id, certificationId: cert.id }, orderBy: { answeredAt: "desc" }, take: 30, select: { isCorrect: true } });
    const ability = initialAbility(recent.length >= 5 ? recent.filter((r) => r.isCorrect).length / recent.length : null);
    const mastery = await domainMasteryRatio(user.id, cert.id);
    const first = selectNextAdaptive(pool, { ability, answers: [] }, mastery, seed, now);
    const items = await buildItems(first ? [first] : [], seed);
    const settings: PracticeSettings = { immediateFeedback: true, questionCount: Math.min(length, pool.length), adaptive: { ability, length: Math.min(length, pool.length), answers: [] } };
    const attempt = await prisma.practiceExamAttempt.create({
      data: { userId: user.id, certificationId: cert.id, mode: "ADAPTIVE", settings: settings as unknown as Prisma.InputJsonValue, items: items as unknown as Prisma.InputJsonValue, totalCount: settings.questionCount },
    });
    return attempt.id;
  }

  // QUICK and DOMAIN
  const domainIds = input.mode === "DOMAIN" ? (input.domainId ? [input.domainId] : []) : input.domainIds?.filter(Boolean) ?? [];
  if (input.mode === "DOMAIN" && domainIds.length === 0) throw new ActionError("invalid_input");
  const count = input.mode === "DOMAIN" ? input.questionCount ?? 10 : [5, 10, 20, 30].includes(input.questionCount ?? 0) ? input.questionCount! : 10;
  const pool = await questionPool(user.id, { certificationId: cert.id, ...(domainIds.length ? { domainId: { in: domainIds } } : {}) });
  const bp = await blueprint(cert.id, domainIds.length ? domainIds : undefined);
  const ids = selectQuestions(pool, allocateByBlueprint(bp, Math.min(count, pool.length)), { rng, now });
  if (ids.length === 0) throw new ActionError("no_questions");
  const items = await buildItems(ids, seed);
  const settings: PracticeSettings = {
    immediateFeedback: input.mode === "QUICK" ? input.immediateFeedback ?? true : input.immediateFeedback ?? false,
    questionCount: items.length,
    domainIds,
  };
  const attempt = await prisma.practiceExamAttempt.create({
    data: { userId: user.id, certificationId: cert.id, mode: input.mode as PracticeMode, settings: settings as unknown as Prisma.InputJsonValue, items: items as unknown as Prisma.InputJsonValue, totalCount: items.length },
  });
  return attempt.id;
}

async function domainMasteryRatio(userId: string, certificationId: string): Promise<Map<string, number>> {
  const m = await domainMastery(prisma, userId, certificationId, addDays(new Date(), -60));
  return new Map([...m].map(([k, v]) => [k, v.answers >= 3 ? v.correct / v.answers : 0.5]));
}

// ------------------------------------------------------------------ loading attempts

type LoadedAttempt = {
  kind: AttemptKind;
  id: string;
  userId: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED" | "ABANDONED";
  items: AttemptItem[];
  startedAt: Date;
  expiresAt: Date | null;
  submittedAt: Date | null;
  mode: PracticeMode | QuizKind;
  settings: PracticeSettings;
  certificationId: string | null;
  quiz?: { id: string; kind: QuizKind; title: string; passPercent: number; lessonId: string | null; domainId: string | null; certificationId: string };
  practiceExamId?: string | null;
  score: number | null;
  correctCount: number | null;
  totalCount: number;
  timeSpentMs?: number | null;
  challengeDate?: string | null;
};

export async function loadAttempt(user: CurrentUser, kind: AttemptKind, attemptId: string): Promise<LoadedAttempt> {
  if (kind === "quiz") {
    const a = await prisma.quizAttempt.findUnique({ where: { id: attemptId }, include: { quiz: true } });
    if (!a || a.userId !== user.id) throw new ActionError("not_found");
    const immediate = a.quiz.kind !== "DIAGNOSTIC";
    return {
      kind,
      id: a.id,
      userId: a.userId,
      status: a.status,
      items: a.items as unknown as AttemptItem[],
      startedAt: a.startedAt,
      expiresAt: null,
      submittedAt: a.submittedAt,
      mode: a.quiz.kind,
      settings: { immediateFeedback: immediate, questionCount: a.totalCount },
      certificationId: a.quiz.certificationId,
      quiz: { id: a.quiz.id, kind: a.quiz.kind, title: a.quiz.title, passPercent: a.quiz.passPercent, lessonId: a.quiz.lessonId, domainId: a.quiz.domainId, certificationId: a.quiz.certificationId },
      score: a.score,
      correctCount: a.correctCount,
      totalCount: a.totalCount,
    };
  }
  const a = await prisma.practiceExamAttempt.findUnique({ where: { id: attemptId } });
  if (!a || a.userId !== user.id) throw new ActionError("not_found");
  return {
    kind,
    id: a.id,
    userId: a.userId,
    status: a.status,
    items: a.items as unknown as AttemptItem[],
    startedAt: a.startedAt,
    expiresAt: a.expiresAt,
    submittedAt: a.submittedAt,
    mode: a.mode,
    settings: a.settings as unknown as PracticeSettings,
    certificationId: a.certificationId,
    practiceExamId: a.practiceExamId,
    score: a.score,
    correctCount: a.correctCount,
    totalCount: a.totalCount,
    timeSpentMs: a.timeSpentMs,
    challengeDate: a.challengeDate,
  };
}

function isExpired(a: LoadedAttempt, now = new Date()): boolean {
  const grace = a.kind === "practice" && a.mode === "LIGHTNING" ? 0 : GRACE_MS;
  return !!a.expiresAt && now.getTime() > a.expiresAt.getTime() + grace;
}

function contextFor(a: LoadedAttempt): AttemptContext {
  if (a.kind === "practice") return a.mode === "MISTAKE_REVIEW" ? "REVIEW" : "PRACTICE";
  return a.mode === "DIAGNOSTIC" ? "DIAGNOSTIC" : a.mode === "DOMAIN_ASSESSMENT" ? "DOMAIN_ASSESSMENT" : "KNOWLEDGE_CHECK";
}

async function attemptAnswers(a: LoadedAttempt) {
  return prisma.questionAttempt.findMany({ where: a.kind === "quiz" ? { quizAttemptId: a.id } : { practiceAttemptId: a.id } });
}

export type RunnerQuestion = {
  index: number;
  question: PublicQuestion;
  response: QuestionResponse | null;
  review: QuestionReview | null;
  marked: boolean;
  lessonHref: string | null;
};

export type RunnerData = {
  kind: AttemptKind;
  attemptId: string;
  mode: string;
  title: string;
  certificationCode: string | null;
  immediateFeedback: boolean;
  restrictions: boolean;
  explainFirst: boolean;
  adaptive: boolean;
  total: number;
  expiresAt: string | null;
  lightningDurationSeconds: number | null;
  serverNow: string;
  showTimer: boolean;
  questions: RunnerQuestion[];
  exitHref: string;
};

function lessonHref(q: QuestionRow): string | null {
  return q.lesson ? `/learn/${q.certification.code}/${q.lesson.slug}` : null;
}

export async function getRunnerData(user: CurrentUser, kind: AttemptKind, attemptId: string, locale: string, t: TFunction): Promise<RunnerData | { redirect: string }> {
  const a = await loadAttempt(user, kind, attemptId);
  const resultsHref = kind === "quiz" ? `/quiz/${a.id}/results` : `/practice/${a.id}/results`;
  if (a.status !== "IN_PROGRESS") return { redirect: resultsHref };
  if (isExpired(a)) {
    await submitAttempt(user, kind, attemptId, { expired: true, t, locale });
    return { redirect: `${resultsHref}?expired=1` };
  }
  const ids = a.items.map((i) => i.questionId);
  const [questions, answers, cert] = await Promise.all([
    prisma.question.findMany({ where: { id: { in: ids } }, include: QUESTION_INCLUDE }),
    attemptAnswers(a),
    a.certificationId ? prisma.certification.findUnique({ where: { id: a.certificationId }, select: { code: true } }) : null,
  ]);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answerById = new Map(answers.map((x) => [x.questionId, x]));
  const labels = reviewLabels(t);
  const runnerQuestions: RunnerQuestion[] = [];
  a.items.forEach((item, index) => {
    const q = byId.get(item.questionId);
    if (!q) return;
    const record = toQuestionRecord(q);
    const opts = { locale, seed: a.id, optionOrder: item.optionOrder, labels };
    const ans = answerById.get(q.id);
    const response = ans ? (ans.response as unknown as QuestionResponse) : null;
    const review =
      ans && a.settings.immediateFeedback
        ? buildReview(record, response, scoreQuestion({ type: q.type, options: record.options, answerKey: q.answerKey, extraAccepted: extraAcceptedAnswers(record) }, response), opts)
        : null;
    runnerQuestions.push({ index, question: projectQuestion(record, opts), response, review, marked: !!item.marked, lessonHref: lessonHref(q) });
  });

  let title = t(`enums.practiceMode.${a.mode as PracticeMode}` as never);
  let exitHref = "/practice";
  if (a.quiz) {
    if (a.quiz.kind === "KNOWLEDGE_CHECK" && a.quiz.lessonId) {
      const lesson = await prisma.lesson.findUnique({ where: { id: a.quiz.lessonId }, select: { slug: true, title: true, translations: { where: { locale } } } });
      title = t("assessment.quiz.knowledgeCheckTitle", { lesson: lesson?.translations[0]?.title || lesson?.title || a.quiz.title });
      exitHref = lesson ? `/learn/${cert?.code}/${lesson.slug}` : "/learn";
    } else if (a.quiz.kind === "DOMAIN_ASSESSMENT") {
      const domain = a.quiz.domainId ? await prisma.examDomain.findUnique({ where: { id: a.quiz.domainId } }) : null;
      title = t("assessment.quiz.domainAssessmentTitle", { domain: domain ? localizedField(domain.title, domain.translations, locale, "title") : a.quiz.title });
      exitHref = `/learn/${cert?.code ?? ""}`;
    } else {
      title = t("assessment.quiz.diagnosticTitle", { code: cert?.code ?? "" });
      exitHref = "/dashboard";
    }
  }

  return {
    kind,
    attemptId: a.id,
    mode: a.mode,
    title,
    certificationCode: cert?.code ?? null,
    immediateFeedback: a.settings.immediateFeedback,
    restrictions: !!a.settings.restrictions,
    explainFirst: !!a.settings.explainFirst,
    adaptive: a.mode === "ADAPTIVE",
    total: a.settings.adaptive?.length ?? a.items.length,
    expiresAt: a.expiresAt?.toISOString() ?? null,
    lightningDurationSeconds: a.settings.lightning?.durationSeconds ?? null,
    serverNow: new Date().toISOString(),
    showTimer: user.preference?.showTimerByDefault ?? true,
    questions: runnerQuestions,
    exitHref,
  };
}

// ------------------------------------------------------------------ answering

export const answerSchema = z.object({
  kind: z.enum(["quiz", "practice"]),
  attemptId: z.string().min(1).max(40),
  questionId: z.string().min(1).max(40),
  response: responseSchema,
  timeMs: z.number().int().min(0).max(3_600_000).optional(),
  confidence: z.number().int().min(1).max(3).optional(),
  reasoning: z.string().max(2000).optional(),
});
export type AnswerInput = z.infer<typeof answerSchema>;

export type AnswerOutcome = {
  saved: true;
  review: QuestionReview | null;
  addedToReview: boolean;
  lessonHref: string | null;
  next: RunnerQuestion | null;
  done: boolean;
};

async function updateReviewQueue(
  userId: string,
  q: { id: string; certificationId: string; domainId: string; lessonId: string | null },
  correct: boolean,
  confidence: number | undefined,
  now: Date,
): Promise<boolean> {
  const existing = await prisma.reviewQueueItem.findUnique({ where: { userId_questionId: { userId, questionId: q.id } } });
  if (shouldQueueForReview(correct, confidence)) {
    if (!existing) {
      await prisma.reviewQueueItem.create({
        data: {
          userId,
          questionId: q.id,
          certificationId: q.certificationId,
          domainId: q.domainId,
          lessonId: q.lessonId,
          reason: correct ? "LOW_CONFIDENCE" : "INCORRECT_ANSWER",
          dueAt: correct ? addDays(now, 1) : now,
        },
      });
      return true;
    }
    const r = reviewSrs(existing, qualityFromAnswer(correct, confidence), now);
    await prisma.reviewQueueItem.update({ where: { id: existing.id }, data: { ...r.state, dueAt: r.dueAt, lastReviewedAt: now, status: "ACTIVE" } });
    return existing.status !== "ACTIVE";
  }
  if (existing && existing.status === "ACTIVE") {
    const r = reviewSrs(existing, qualityFromAnswer(true, confidence), now);
    await prisma.reviewQueueItem.update({ where: { id: existing.id }, data: { ...r.state, dueAt: r.dueAt, lastReviewedAt: now, status: r.mastered ? "MASTERED" : "ACTIVE" } });
  }
  return false;
}

export async function answerQuestion(user: CurrentUser, input: AnswerInput, locale: string, t: TFunction): Promise<AnswerOutcome> {
  const a = await loadAttempt(user, input.kind, input.attemptId);
  if (a.status !== "IN_PROGRESS") throw new ActionError("attempt_closed");
  if (isExpired(a)) {
    await submitAttempt(user, input.kind, input.attemptId, { expired: true, t, locale });
    throw new ActionError("attempt_expired");
  }
  const itemIndex = a.items.findIndex((i) => i.questionId === input.questionId);
  if (itemIndex === -1) throw new ActionError("not_found");
  const item = a.items[itemIndex]!;
  const q = await prisma.question.findUnique({ where: { id: input.questionId }, include: QUESTION_INCLUDE });
  if (!q) throw new ActionError("not_found");
  if (input.response.kind !== expectedResponseKind(q.type)) throw new ActionError("invalid_input");
  if (a.settings.explainFirst && (input.reasoning ?? "").trim().length < 15) throw new ActionError("invalid_input", { reasoning: "reasoning_required" });

  const record = toQuestionRecord(q);
  const result = scoreQuestion({ type: q.type, options: record.options, answerKey: q.answerKey, extraAccepted: extraAcceptedAnswers(record) }, input.response);
  const where = input.kind === "quiz" ? { quizAttemptId_questionId: { quizAttemptId: a.id, questionId: q.id } } : { practiceAttemptId_questionId: { practiceAttemptId: a.id, questionId: q.id } };
  const existing = await prisma.questionAttempt.findUnique({ where });
  const now = new Date();
  const opts = { locale, seed: a.id, optionOrder: item.optionOrder, labels: reviewLabels(t) };

  if (existing && a.settings.immediateFeedback) {
    // Answers are final once feedback has been shown.
    const prev = existing.response as unknown as QuestionResponse;
    const prevScore = scoreQuestion({ type: q.type, options: record.options, answerKey: q.answerKey, extraAccepted: extraAcceptedAnswers(record) }, prev);
    return { saved: true, review: buildReview(record, prev, prevScore, opts), addedToReview: false, lessonHref: lessonHref(q), next: null, done: false };
  }

  const data = {
    response: input.response as unknown as Prisma.InputJsonValue,
    isCorrect: result.isCorrect,
    score: result.score,
    timeMs: input.timeMs,
    confidence: input.confidence,
    reasoning: input.reasoning?.trim() || null,
    answeredAt: now,
  };
  if (existing) {
    await prisma.questionAttempt.update({ where: { id: existing.id }, data });
  } else {
    await prisma.questionAttempt.create({
      data: {
        ...data,
        userId: user.id,
        questionId: q.id,
        questionVersion: item.version,
        certificationId: q.certificationId,
        domainId: q.domainId,
        difficulty: q.difficulty,
        context: contextFor(a),
        quizAttemptId: input.kind === "quiz" ? a.id : null,
        practiceAttemptId: input.kind === "practice" ? a.id : null,
      },
    });
    await prisma.question.update({
      where: { id: q.id },
      data: { timesAnswered: { increment: 1 }, timesCorrect: { increment: result.isCorrect ? 1 : 0 }, totalTimeMs: { increment: input.timeMs ?? 0 } },
    });
  }

  let addedToReview = false;
  let review: QuestionReview | null = null;
  if (a.settings.immediateFeedback) {
    addedToReview = await updateReviewQueue(user.id, q, result.isCorrect, input.confidence, now);
    await prisma.learningEvent.create({
      data: { userId: user.id, type: "QUESTION_ANSWERED", certificationId: q.certificationId, questionId: q.id, xp: result.isCorrect ? XP_RULES.correctAnswer : 0, durationSeconds: input.timeMs ? Math.round(input.timeMs / 1000) : null },
    });
    review = buildReview(record, input.response, result, opts);
  }

  // Adaptive: pick the next question.
  let next: RunnerQuestion | null = null;
  let done = false;
  if (a.kind === "practice" && a.mode === "ADAPTIVE" && a.settings.adaptive && !existing) {
    const state = updateAbility({ ability: a.settings.adaptive.ability, answers: a.settings.adaptive.answers }, { questionId: q.id, domainId: q.domainId, difficulty: q.difficulty, correct: result.isCorrect });
    const settings: PracticeSettings = { ...a.settings, adaptive: { ...a.settings.adaptive, ability: state.ability, answers: state.answers } };
    let items = a.items;
    if (state.answers.length < a.settings.adaptive.length) {
      const pool = await questionPool(user.id, { certificationId: a.certificationId! });
      const nextId = selectNextAdaptive(pool, state, await domainMasteryRatio(user.id, a.certificationId!), a.id, now);
      if (nextId) {
        const [newItem] = await buildItems([nextId], a.id);
        if (newItem) {
          items = [...a.items, newItem];
          const nq = await prisma.question.findUnique({ where: { id: nextId }, include: QUESTION_INCLUDE });
          if (nq) next = { index: items.length - 1, question: projectQuestion(toQuestionRecord(nq), { locale, seed: a.id, optionOrder: newItem.optionOrder, labels: reviewLabels(t) }), response: null, review: null, marked: false, lessonHref: lessonHref(nq) };
        }
      } else done = true;
    } else done = true;
    await prisma.practiceExamAttempt.update({
      where: { id: a.id },
      data: { settings: settings as unknown as Prisma.InputJsonValue, items: items as unknown as Prisma.InputJsonValue, totalCount: done ? state.answers.length : settings.questionCount },
    });
  }
  return { saved: true, review, addedToReview, lessonHref: lessonHref(q), next, done };
}

export async function toggleMark(user: CurrentUser, kind: AttemptKind, attemptId: string, questionId: string, marked: boolean) {
  const a = await loadAttempt(user, kind, attemptId);
  if (a.status !== "IN_PROGRESS") throw new ActionError("attempt_closed");
  const items = a.items.map((i) => (i.questionId === questionId ? { ...i, marked } : i));
  if (kind === "quiz") await prisma.quizAttempt.update({ where: { id: a.id }, data: { items: items as unknown as Prisma.InputJsonValue } });
  else await prisma.practiceExamAttempt.update({ where: { id: a.id }, data: { items: items as unknown as Prisma.InputJsonValue } });
}

// ------------------------------------------------------------------ submission

export async function submitAttempt(user: CurrentUser, kind: AttemptKind, attemptId: string, opts: { expired?: boolean; t: TFunction; locale: string }): Promise<string> {
  const a = await loadAttempt(user, kind, attemptId);
  let resultsHref = kind === "quiz" ? `/quiz/${a.id}/results` : `/practice/${a.id}/results`;
  if (a.mode === "DIAGNOSTIC" && a.certificationId) {
    const c = await prisma.certification.findUnique({ where: { id: a.certificationId }, select: { code: true } });
    resultsHref = `/diagnostic/${c?.code ?? ""}/results?attempt=${a.id}`;
  }
  if (a.status !== "IN_PROGRESS") return resultsHref;
  const now = new Date();
  const allAnswers = await attemptAnswers(a);
  const answers =
    a.kind === "practice" && a.mode === "LIGHTNING" && a.expiresAt
      ? allAnswers.filter((answer) => answer.answeredAt.getTime() <= a.expiresAt!.getTime())
      : allAnswers;
  const answerMap = new Map(answers.map((x) => [x.questionId, x]));
  const questions = await prisma.question.findMany({ where: { id: { in: a.items.map((i) => i.questionId) } }, select: { id: true, domainId: true, certificationId: true, lessonId: true } });
  const qMap = new Map(questions.map((q) => [q.id, q]));
  const domainOrder = a.certificationId ? (await prisma.examDomain.findMany({ where: { certificationId: a.certificationId }, orderBy: { sortOrder: "asc" }, select: { id: true } })).map((d) => d.id) : [];
  const results = a.items
    .filter((i) => qMap.has(i.questionId))
    .map((i) => ({ questionId: i.questionId, domainId: qMap.get(i.questionId)!.domainId, isCorrect: answerMap.has(i.questionId) ? answerMap.get(i.questionId)!.isCorrect : null, timeMs: answerMap.get(i.questionId)?.timeMs ?? null }));
  const summary = summarizeAttempt(results, domainOrder);
  const expired = !!opts.expired || isExpired(a, now);
  const status = expired ? "EXPIRED" : "SUBMITTED";
  const lightning =
    a.kind === "practice" && a.mode === "LIGHTNING" && a.expiresAt
      ? computeLightningSummary({
          answers: allAnswers.map((answer) => ({ isCorrect: answer.isCorrect, answeredAt: answer.answeredAt })),
          total: results.length,
          startedAt: a.startedAt,
          deadline: a.expiresAt,
          submittedAt: now,
        })
      : null;

  // Deferred side effects for exam-style attempts (no feedback during the attempt).
  if (!a.settings.immediateFeedback) {
    for (const ans of answers) {
      const q = qMap.get(ans.questionId);
      if (!q) continue;
      await updateReviewQueue(user.id, q, ans.isCorrect, ans.confidence ?? undefined, now);
    }
    if (answers.length) {
      await prisma.learningEvent.createMany({
        data: answers.map((ans) => ({ userId: user.id, type: "QUESTION_ANSWERED" as const, certificationId: ans.certificationId, questionId: ans.questionId, xp: ans.isCorrect ? XP_RULES.correctAnswer : 0, occurredAt: now })),
      });
    }
  }

  const certificationId = a.certificationId;
  if (kind === "quiz") {
    const updated = await prisma.quizAttempt.updateMany({
      where: { id: a.id, status: "IN_PROGRESS" },
      data: { status, submittedAt: now, score: summary.scorePercent, correctCount: summary.correct, domainBreakdown: summary.domains as unknown as Prisma.InputJsonValue },
    });
    if (updated.count === 0) return resultsHref;
    const quiz = a.quiz!;
    const perfect = summary.total > 0 && summary.correct === summary.total;
    if (quiz.kind === "DIAGNOSTIC") {
      await prisma.learningEvent.create({ data: { userId: user.id, type: "DIAGNOSTIC_COMPLETED", certificationId, xp: XP_RULES.diagnosticCompleted, durationSeconds: Math.round((now.getTime() - a.startedAt.getTime()) / 1000) } });
      await completeDiagnostic(user, quiz.certificationId, a.id, summary, opts);
    } else {
      await prisma.learningEvent.create({
        data: { userId: user.id, type: "QUIZ_COMPLETED", certificationId, lessonId: quiz.lessonId, xp: XP_RULES.quizCompleted + (perfect ? XP_RULES.perfectQuiz : 0), metadata: { kind: quiz.kind, score: summary.scorePercent } },
      });
      if (quiz.kind === "KNOWLEDGE_CHECK" && quiz.lessonId) {
        await recordKnowledgeCheck(user.id, quiz.lessonId, certificationId, summary.scorePercent, quiz.passPercent, now);
      }
    }
  } else {
    const updated = await prisma.practiceExamAttempt.updateMany({
      where: { id: a.id, status: "IN_PROGRESS" },
      data: {
        status,
        submittedAt: now,
        score: lightning ? lightning.score : summary.scorePercent,
        correctCount: lightning ? lightning.correct : summary.correct,
        totalCount: results.length,
        domainBreakdown: summary.domains as unknown as Prisma.InputJsonValue,
        timeSpentMs: lightning ? lightning.timeUsedMs : Math.min(now.getTime() - a.startedAt.getTime(), a.expiresAt ? a.expiresAt.getTime() - a.startedAt.getTime() : Infinity),
      },
    });
    if (updated.count === 0) return resultsHref;
    const type = a.mode === "DAILY" ? "DAILY_CHALLENGE_COMPLETED" : "PRACTICE_COMPLETED";
    const xp =
      a.mode === "DAILY"
        ? XP_RULES.dailyChallenge
        : a.mode === "FULL"
          ? XP_RULES.fullExamCompleted
          : a.mode === "LIGHTNING" && lightning
            ? XP_RULES.lightningRound + lightning.correct * XP_RULES.correctAnswer
            : XP_RULES.practiceCompleted;
    await prisma.learningEvent.create({
      data: {
        userId: user.id,
        type,
        certificationId,
        xp,
        durationSeconds: Math.round((lightning ? lightning.timeUsedMs : now.getTime() - a.startedAt.getTime()) / 1000),
        metadata: lightning ? { mode: "LIGHTNING", attemptId: a.id, correct: lightning.correct, total: lightning.total, bestCombo: lightning.bestCombo, score: lightning.score } : { mode: a.mode, score: summary.scorePercent },
      },
    });
    if ((a.mode === "FULL" || a.mode === "DOMAIN") && certificationId) {
      const weak = summary.domains.filter((d) => d.total >= 3 && d.percent < 60);
      if (weak.length) await adjustPlan(user, certificationId, "weak_domain", opts);
    }
  }

  if (certificationId) await computeAndStoreReadiness(prisma, user.id, certificationId, user.preference?.timezone ?? "UTC", now);
  await awardBadges(prisma, user.id, user.preference?.timezone ?? "UTC", now);
  return expired ? `${resultsHref}${resultsHref.includes("?") ? "&" : "?"}expired=1` : resultsHref;
}

async function recordKnowledgeCheck(userId: string, lessonId: string, certificationId: string | null, score: number, passPercent: number, now: Date) {
  const progress = await prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } });
  const passed = score >= passPercent;
  const bestScore = Math.max(progress?.knowledgeCheckScore ?? 0, score);
  if (!progress) {
    await prisma.lessonProgress.create({ data: { userId, lessonId, knowledgeCheckScore: score, status: passed ? "COMPLETED" : "IN_PROGRESS", completedAt: passed ? now : null } });
  } else {
    await prisma.lessonProgress.update({
      where: { id: progress.id },
      data: { knowledgeCheckScore: bestScore, lastViewedAt: now, ...(passed && progress.status !== "COMPLETED" ? { status: "COMPLETED", completedAt: now } : {}) },
    });
  }
  if (passed && progress?.status !== "COMPLETED") {
    await prisma.learningEvent.create({ data: { userId, type: "LESSON_COMPLETED", certificationId, lessonId, xp: XP_RULES.lessonCompleted } });
  }
}

async function completeDiagnostic(user: CurrentUser, certificationId: string, attemptId: string, summary: ReturnType<typeof summarizeAttempt>, opts: { t: TFunction; locale: string }) {
  const classified = classifyDomains(summary.domains);
  const enrollment = await prisma.enrollment.upsert({
    where: { userId_certificationId: { userId: user.id, certificationId } },
    create: { userId: user.id, certificationId, isPrimary: (await prisma.enrollment.count({ where: { userId: user.id } })) === 0 },
    update: {},
  });
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      diagnosticCompletedAt: new Date(),
      diagnosticResult: { attemptId, scorePercent: summary.scorePercent, domains: summary.domains, weakDomainIds: classified.weak, strongDomainIds: classified.strong } as unknown as Prisma.InputJsonValue,
    },
  });
  const tz = user.preference?.timezone ?? "UTC";
  const existingPlan = await prisma.studyPlan.findFirst({ where: { userId: user.id, certificationId, status: "ACTIVE" } });
  const settings = existingPlan
    ? planSettingsFromPlan(existingPlan)
    : {
        certificationId,
        targetDate: enrollment.targetExamDate ? toISODate(enrollment.targetExamDate) : defaultTargetDate(tz),
        studyDays: user.preference?.studyDays?.length ? user.preference.studyDays : [1, 3, 5],
        sessionMinutes: user.preference?.sessionMinutes ?? 30,
        revisionWeeks: 1,
        includePracticeExams: true,
        preferredTime: "18:00",
      };
  await buildStudyPlan(prisma, user.id, settings, { t: opts.t, locale: opts.locale, timeZone: tz, reason: existingPlan ? "weak_domain" : "regenerated" });
}

export async function adjustPlan(user: CurrentUser, certificationId: string, reason: "weak_domain" | "finished_early" | "missed" | "curriculum_changed" | "target_changed", opts: { t: TFunction; locale: string }) {
  const plan = await prisma.studyPlan.findFirst({ where: { userId: user.id, certificationId, status: "ACTIVE" } });
  if (!plan) return;
  await buildStudyPlan(prisma, user.id, planSettingsFromPlan(plan), { t: opts.t, locale: opts.locale, timeZone: user.preference?.timezone ?? "UTC", reason });
}

// ------------------------------------------------------------------ results

export type ResultsData = {
  kind: AttemptKind;
  attemptId: string;
  mode: string;
  title: string;
  certificationCode: string | null;
  status: string;
  score: number;
  correct: number;
  total: number;
  startedAt: Date;
  submittedAt: Date | null;
  timeSpentMs: number | null;
  targetPercent: number | null;
  domains: { domainId: string; title: string; total: number; correct: number; percent: number }[];
  reviews: (QuestionReview & { lessonHref: string | null; questionId: string; domainTitle: string })[];
  incorrectCount: number;
  newBadges: { key: string; name: string }[];
  backHref: string;
  passPercent: number | null;
  lightning: (LightningSummary & { personalBest: number | null; isPersonalBest: boolean }) | null;
};

export async function getResults(user: CurrentUser, kind: AttemptKind, attemptId: string, locale: string, t: TFunction): Promise<ResultsData | { redirect: string }> {
  const a = await loadAttempt(user, kind, attemptId);
  if (a.status === "IN_PROGRESS") return { redirect: kind === "quiz" ? `/quiz/${a.id}` : `/practice/${a.id}` };
  const [questions, allAnswers, cert] = await Promise.all([
    prisma.question.findMany({ where: { id: { in: a.items.map((i) => i.questionId) } }, include: { ...QUESTION_INCLUDE, domain: { select: { title: true, translations: true } } } }),
    attemptAnswers(a),
    a.certificationId ? prisma.certification.findUnique({ where: { id: a.certificationId }, select: { code: true } }) : null,
  ]);
  const answers =
    kind === "practice" && a.mode === "LIGHTNING" && a.expiresAt
      ? allAnswers.filter((answer) => answer.answeredAt.getTime() <= a.expiresAt!.getTime())
      : allAnswers;
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answerMap = new Map(answers.map((x) => [x.questionId, x]));
  const labels = reviewLabels(t);
  const reviews: ResultsData["reviews"] = [];
  for (const item of a.items) {
    const q = byId.get(item.questionId);
    if (!q) continue;
    const record = toQuestionRecord(q);
    const ans = answerMap.get(q.id);
    const response = ans ? (ans.response as unknown as QuestionResponse) : null;
    const scored = scoreQuestion({ type: q.type, options: record.options, answerKey: q.answerKey, extraAccepted: extraAcceptedAnswers(record) }, response);
    reviews.push({
      ...buildReview(record, response, scored, { locale, seed: a.id, optionOrder: item.optionOrder, labels }),
      lessonHref: lessonHref(q),
      questionId: q.id,
      domainTitle: localizedField(q.domain.title, q.domain.translations, locale, "title"),
    });
  }
  const domainRows = (await prisma.examDomain.findMany({ where: { id: { in: [...new Set(questions.map((q) => q.domainId))] } }, orderBy: { sortOrder: "asc" } })).map((d) => {
    const inDomain = reviews.filter((r) => byId.get(r.questionId)?.domainId === d.id);
    const correct = inDomain.filter((r) => r.isCorrect).length;
    return { domainId: d.id, title: localizedField(d.title, d.translations, locale, "title"), total: inDomain.length, correct, percent: inDomain.length ? Math.round((correct / inDomain.length) * 100) : 0 };
  });
  const settings = await getSettings();
  const template = a.practiceExamId ? await prisma.practiceExam.findUnique({ where: { id: a.practiceExamId } }) : null;
  const badges = await prisma.userBadge.findMany({
    where: { userId: user.id, earnedAt: { gte: a.startedAt, lte: new Date((a.submittedAt ?? new Date()).getTime() + 60_000) } },
    include: { badge: true },
  });
  const correct = reviews.filter((r) => r.isCorrect).length;
  const data = await getRunnerTitle(a, cert?.code ?? null, locale, t);
  const lightning =
    kind === "practice" && a.mode === "LIGHTNING" && a.expiresAt
      ? computeLightningSummary({
          answers: allAnswers.map((answer) => ({ isCorrect: answer.isCorrect, answeredAt: answer.answeredAt })),
          total: reviews.length,
          startedAt: a.startedAt,
          deadline: a.expiresAt,
          submittedAt: a.submittedAt ?? new Date(),
        })
      : null;
  const previousLightningBest =
    lightning && a.certificationId
      ? await prisma.practiceExamAttempt.findFirst({
          where: { userId: user.id, certificationId: a.certificationId, mode: "LIGHTNING", status: { in: ["SUBMITTED", "EXPIRED"] }, id: { not: a.id }, startedAt: { lt: a.startedAt }, score: { not: null } },
          orderBy: { score: "desc" },
          select: { score: true },
        })
      : null;
  return {
    kind,
    attemptId: a.id,
    mode: a.mode,
    title: data.title,
    certificationCode: cert?.code ?? null,
    status: a.status,
    score: lightning ? lightning.score : reviews.length ? Math.round((correct / reviews.length) * 100) : 0,
    correct: lightning ? lightning.correct : correct,
    total: reviews.length,
    startedAt: a.startedAt,
    submittedAt: a.submittedAt,
    timeSpentMs: a.timeSpentMs ?? (a.submittedAt ? a.submittedAt.getTime() - a.startedAt.getTime() : null),
    targetPercent: a.mode === "FULL" || a.mode === "DOMAIN" ? template?.targetPercent ?? settings["practice.targetPercent"] : null,
    passPercent: a.quiz && a.quiz.kind !== "DIAGNOSTIC" ? a.quiz.passPercent : null,
    domains: domainRows,
    reviews,
    incorrectCount: reviews.filter((r) => !r.isCorrect).length,
    newBadges: badges.map((b) => ({ key: b.badge.key, name: localizedField(b.badge.name, b.badge.translations, locale, "name") })),
    backHref: data.backHref,
    lightning: lightning
      ? { ...lightning, personalBest: previousLightningBest?.score ?? null, isPersonalBest: lightning.score > (previousLightningBest?.score ?? -1) }
      : null,
  };
}

async function getRunnerTitle(a: LoadedAttempt, code: string | null, locale: string, t: TFunction) {
  if (!a.quiz) return { title: t(`enums.practiceMode.${a.mode as PracticeMode}` as never), backHref: "/practice" };
  if (a.quiz.kind === "KNOWLEDGE_CHECK" && a.quiz.lessonId) {
    const lesson = await prisma.lesson.findUnique({ where: { id: a.quiz.lessonId }, select: { slug: true, title: true, translations: { where: { locale } } } });
    return { title: t("assessment.quiz.knowledgeCheckTitle", { lesson: lesson?.translations[0]?.title || lesson?.title || "" }), backHref: lesson && code ? `/learn/${code}/${lesson.slug}` : "/learn" };
  }
  if (a.quiz.kind === "DOMAIN_ASSESSMENT") return { title: t("assessment.quiz.domainAssessmentTitle", { domain: a.quiz.title }), backHref: code ? `/learn/${code}` : "/learn" };
  return { title: t("assessment.quiz.diagnosticTitle", { code: code ?? "" }), backHref: "/dashboard" };
}

/** Questions similar to a given one (same objective, else same domain) for "Try a similar question". */
export async function similarQuestionIds(user: CurrentUser, questionId: string, count = 3): Promise<{ certificationCode: string; ids: string[] }> {
  const q = await prisma.question.findUnique({ where: { id: questionId }, include: { certification: { select: { code: true } } } });
  if (!q) throw new ActionError("not_found");
  const baseWhere: Prisma.QuestionWhereInput = { id: { not: q.id }, certificationId: q.certificationId };
  let pool = await questionPool(user.id, { ...baseWhere, ...(q.objectiveId ? { objectiveId: q.objectiveId } : { domainId: q.domainId }) });
  if (pool.length < count) pool = await questionPool(user.id, { ...baseWhere, domainId: q.domainId });
  const ids = selectQuestions(pool, new Map([[q.domainId, Math.min(count, pool.length)]]), { rng: createRng(randomToken(4)) });
  return { certificationCode: q.certification.code, ids };
}
