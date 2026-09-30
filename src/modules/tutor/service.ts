import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError, enforceRateLimit } from "@/lib/actions";
import { logger } from "@/lib/logger";
import type { Locale } from "@/i18n/config";
import type { TFunction } from "@/i18n/translator";
import type { CurrentUser } from "@/modules/auth/session";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { checkTutorOutput, detectPromptInjection, isTutorMode, MAX_TUTOR_INPUT, sanitizeTutorInput, TUTOR_DEPTHS, TUTOR_MODES, type TutorDepth, type TutorMode } from "./guard";
import { buildIndex, searchIndex, type Chunk, type SearchIndex } from "./retrieval";
import { getTutorProvider } from "./provider";
import { lessonContextFromBlocks, mistakeContextFromAttempt, shouldUseQuestionContext, termInfoFromGlossary, type TutorCitation } from "./context";
import type { TutorContext, TutorPhrases } from "./providers/types";

const INDEX_TTL_MS = 5 * 60_000;
const HISTORY_TAKE = 12;
const glossaryVisibleWhere = { status: { in: ["PUBLISHED", "OUTDATED"] } } satisfies Prisma.GlossaryTermWhereInput;

export const tutorMessageSchema = z.object({
  conversationId: z.string().max(40).optional(),
  message: z.string().min(1).max(MAX_TUTOR_INPUT),
  mode: z.enum(TUTOR_MODES).default("explain"),
  depth: z.enum(TUTOR_DEPTHS).default("intermediate"),
  lessonId: z.string().max(40).optional(),
  questionId: z.string().max(40).optional(),
  certificationCode: z.string().max(20).optional(),
});
export type TutorMessageInput = z.infer<typeof tutorMessageSchema>;

export type TutorMessageView = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  mode: string | null;
  citations: TutorCitation[];
  flagged: boolean;
  provider: string | null;
  createdAt: string;
};

export type TutorConversationView = {
  id: string;
  title: string;
  certificationId: string | null;
  lessonId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: TutorMessageView[];
};

export type TutorRuntimeSettings = { enabled: boolean; dailyLimit: number };

type BlockRow = { key: string; type: string; data: Prisma.JsonValue };
type LessonRow = Prisma.LessonGetPayload<{
  include: {
    certification: { select: { code: true } };
    blocks: { orderBy: { sortOrder: "asc" } };
    translations: { select: { locale: true; title: true; summary: true; blocks: true; status: true; updatedAt: true } };
  };
}>;

type IndexCache = { locale: Locale; stamp: number; expiresAt: number; index: SearchIndex; chunks: Chunk[] };
let indexCache: IndexCache | null = null;

export async function getTutorRuntimeSettings(): Promise<TutorRuntimeSettings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: ["ai.enabled", "ai.tutorDailyLimit"] } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const enabled = typeof byKey.get("ai.enabled") === "boolean" ? (byKey.get("ai.enabled") as boolean) : true;
  const daily = byKey.get("ai.tutorDailyLimit");
  const dailyLimit = typeof daily === "number" && Number.isFinite(daily) ? Math.max(0, Math.floor(daily)) : 50;
  return { enabled, dailyLimit };
}

function jsonArray(value: unknown): TutorCitation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? (item as Partial<TutorCitation>) : null))
    .filter((item): item is Partial<TutorCitation> => !!item)
    .map((item): TutorCitation => ({
      id: String(item.id ?? ""),
      title: String(item.title ?? ""),
      url: String(item.url ?? ""),
      kind: item.kind === "glossary" || item.kind === "source" ? item.kind : "lesson",
    }))
    .filter((item) => item.id && item.title && item.url);
}

function messageView(m: { id: string; role: "USER" | "ASSISTANT"; content: string; mode: string | null; citations: Prisma.JsonValue | null; flagged: boolean; provider: string | null; createdAt: Date }): TutorMessageView {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    mode: m.mode,
    citations: jsonArray(m.citations),
    flagged: m.flagged,
    provider: m.provider,
    createdAt: m.createdAt.toISOString(),
  };
}

function conversationView(c: {
  id: string;
  title: string;
  certificationId: string | null;
  lessonId: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages: Parameters<typeof messageView>[0][];
}): TutorConversationView {
  return {
    id: c.id,
    title: c.title,
    certificationId: c.certificationId,
    lessonId: c.lessonId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    messages: c.messages.map(messageView),
  };
}

function titleFromMessage(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length <= 64 ? clean || "Tutor conversation" : `${clean.slice(0, 61)}...`;
}

function localizedLesson(lesson: LessonRow, locale: Locale): { title: string; summary: string | null; blocks: BlockRow[] } {
  const translation = locale === "en" ? null : lesson.translations.find((tr) => tr.locale === locale && tr.status === "APPROVED");
  const translatedBlocks = translation && translation.blocks && typeof translation.blocks === "object" && !Array.isArray(translation.blocks) ? (translation.blocks as Record<string, Prisma.JsonValue>) : {};
  return {
    title: translation?.title || lesson.title,
    summary: translation?.summary ?? lesson.summary,
    blocks: lesson.blocks.map((b) => ({ key: b.key, type: b.type, data: translatedBlocks[b.key] ?? b.data })),
  };
}

function chunkTextForLesson(lesson: LessonRow, locale: Locale): string {
  const localized = localizedLesson(lesson, locale);
  return [localized.summary, ...localized.blocks.map((b) => lessonContextFromBlocks({ id: lesson.id, title: localized.title, href: lessonHref(lesson), certCode: lesson.certification.code, blocks: [b] }).explanation)]
    .filter(Boolean)
    .join("\n\n");
}

function lessonHref(lesson: Pick<LessonRow, "slug" | "certification">): string {
  return `/learn/${lesson.certification.code}/${lesson.slug}`;
}

async function contentStamp(): Promise<number> {
  const [lessons, glossary] = await Promise.all([
    prisma.lesson.aggregate({ _max: { updatedAt: true }, where: learnerVisibleWhere() }),
    prisma.glossaryTerm.aggregate({ _max: { updatedAt: true }, where: glossaryVisibleWhere }),
  ]);
  return Math.max(lessons._max.updatedAt?.getTime() ?? 0, glossary._max?.updatedAt?.getTime() ?? 0);
}

async function buildRetrieval(locale: Locale): Promise<IndexCache> {
  const stamp = await contentStamp();
  if (indexCache && indexCache.locale === locale && indexCache.stamp === stamp && indexCache.expiresAt > Date.now()) return indexCache;

  const [lessons, terms] = await Promise.all([
    prisma.lesson.findMany({
      where: learnerVisibleWhere(),
      include: {
        certification: { select: { code: true } },
        blocks: { orderBy: { sortOrder: "asc" } },
        translations: { select: { locale: true, title: true, summary: true, blocks: true, status: true, updatedAt: true } },
      },
      orderBy: [{ certification: { code: "asc" } }, { sortOrder: "asc" }],
    }),
    prisma.glossaryTerm.findMany({
      where: glossaryVisibleWhere,
      include: { certifications: { include: { certification: { select: { code: true } } } } },
      orderBy: { term: "asc" },
    }),
  ]);

  const chunks: Chunk[] = [
    ...lessons.map((lesson) => {
      const localized = localizedLesson(lesson, locale);
      return {
        id: `lesson:${lesson.id}`,
        title: localized.title,
        text: chunkTextForLesson(lesson, locale).slice(0, 5000),
        url: lessonHref(lesson),
        kind: "lesson" as const,
        certificationCode: lesson.certification.code,
        lessonId: lesson.id,
      };
    }),
    ...terms.flatMap((term) => {
      const certs = term.certifications.map((c) => c.certification.code);
      const base = { id: `glossary:${term.id}`, title: term.term, text: term.definition, url: `/glossary#${term.slug}`, kind: "glossary" as const };
      return certs.length ? certs.map((code) => ({ ...base, id: `${base.id}:${code}`, certificationCode: code })) : [base];
    }),
  ];
  indexCache = { locale, stamp, expiresAt: Date.now() + INDEX_TTL_MS, chunks, index: buildIndex(chunks) };
  return indexCache;
}

function phrases(t: TFunction): TutorPhrases {
  return {
    insufficient: t("tutor.p_insufficient"),
    groundedIntro: t("tutor.p_groundedIntro"),
    simplerIntro: t("tutor.p_simplerIntro"),
    analogyIntro: t("tutor.p_analogyIntro"),
    technicalIntro: t("tutor.p_technicalIntro"),
    keyTerms: t("tutor.p_keyTerms"),
    takeaway: t("tutor.p_takeaway"),
    compareIntro: t("tutor.p_compareIntro"),
    compareDifference: t("tutor.p_compareDifference"),
    compareSameCategory: t("tutor.p_compareSameCategory"),
    definition: t("tutor.p_definition"),
    category: t("tutor.p_category"),
    useCases: t("tutor.p_useCases"),
    keyFeatures: t("tutor.p_keyFeatures"),
    serviceModel: t("tutor.p_serviceModel"),
    scenarioIntro: t("tutor.p_scenarioIntro"),
    scenarioDisclaimer: t("tutor.p_scenarioDisclaimer"),
    scenarioQuestion: t("tutor.p_scenarioQuestion"),
    socraticIntro: t("tutor.p_socraticIntro"),
    socraticClosing: t("tutor.p_socraticClosing"),
    mistakeIntro: t("tutor.p_mistakeIntro"),
    mistakeYourAnswer: t("tutor.p_mistakeYourAnswer"),
    mistakeCorrect: t("tutor.p_mistakeCorrect"),
    mistakeTip: t("tutor.p_mistakeTip"),
    summarizeIntro: t("tutor.p_summarizeIntro"),
    objectives: t("tutor.p_objectives"),
    flashcardsIntro: t("tutor.p_flashcardsIntro"),
    nextIntro: t("tutor.p_nextIntro"),
    noLesson: t("tutor.p_noLesson"),
    noCompare: t("tutor.p_noCompare"),
    noMistake: t("tutor.p_noMistake"),
    misconception: t("tutor.p_misconception"),
  };
}

async function buildLessonContext(lessonId: string | undefined, locale: Locale) {
  if (!lessonId) return null;
  const lesson = await prisma.lesson.findFirst({
    where: { AND: [{ id: lessonId }, learnerVisibleWhere()] },
    include: {
      certification: { select: { code: true } },
      blocks: { orderBy: { sortOrder: "asc" } },
      translations: { select: { locale: true, title: true, summary: true, blocks: true, status: true, updatedAt: true } },
    },
  });
  if (!lesson) return null;
  const localized = localizedLesson(lesson, locale);
  return lessonContextFromBlocks({ id: lesson.id, title: localized.title, href: lessonHref(lesson), certCode: lesson.certification.code, blocks: localized.blocks });
}

async function buildMistakeContext(userId: string, questionId: string | undefined) {
  if (!questionId) return null;
  const attempt = await prisma.questionAttempt.findFirst({
    where: { userId, questionId },
    orderBy: { answeredAt: "desc" },
    include: { question: { include: { options: { orderBy: { sortOrder: "asc" } }, lesson: { select: { title: true } } } } },
  });
  if (!attempt || !shouldUseQuestionContext(questionId, true)) return null;
  return mistakeContextFromAttempt({
    stem: attempt.question.stem,
    explanation: attempt.question.explanation,
    response: attempt.response,
    options: attempt.question.options,
    lessonTitle: attempt.question.lesson?.title,
  });
}

async function buildCompareContext(message: string) {
  const names = message
    .split(/\b(?:vs\.?|versus|and|ile|ve)\b/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
    .slice(0, 2);
  if (names.length < 2) return null;
  const terms = await prisma.glossaryTerm.findMany({
    where: {
      AND: [
        glossaryVisibleWhere,
        {
          OR: names.flatMap((name) => [{ term: { contains: name, mode: "insensitive" as const } }, { slug: { contains: name.toLowerCase().replace(/\s+/g, "-") } }]),
        },
      ],
    },
    take: 6,
  });
  const found = names.map((name) => terms.find((t) => t.term.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(t.term.toLowerCase()))).filter(Boolean);
  return found.length >= 2 ? { a: termInfoFromGlossary(found[0]!), b: termInfoFromGlossary(found[1]!) } : null;
}

async function buildTutorContext(input: { userId: string; lessonId?: string; questionId?: string; message: string; mode: TutorMode; locale: Locale }): Promise<TutorContext> {
  const [lesson, mistake, compare] = await Promise.all([
    buildLessonContext(input.lessonId, input.locale),
    buildMistakeContext(input.userId, input.questionId),
    input.mode === "compare" ? buildCompareContext(input.message) : Promise.resolve(null),
  ]);
  return { lesson, mistake, compare };
}

async function enforceDailyTutorLimit(userId: string, limit: number) {
  if (limit <= 0) return;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const count = await prisma.learningEvent.count({ where: { userId, type: "TUTOR_MESSAGE", occurredAt: { gte: since } } });
  if (count >= limit) throw new ActionError("tutor_daily_limit");
}

async function certificationIdFromCode(code: string | undefined) {
  if (!code) return null;
  const cert = await prisma.certification.findUnique({ where: { code }, select: { id: true } });
  return cert?.id ?? null;
}

function citationsFor(chunks: Chunk[], ids: string[]): TutorCitation[] {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return ids
    .map((id) => byId.get(id))
    .filter((c): c is Chunk => !!c)
    .map((c) => ({ id: c.id, title: c.title, url: c.url, kind: c.kind }));
}

export async function listTutorConversations(userId: string): Promise<TutorConversationView[]> {
  const rows = await prisma.tutorConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 25,
    include: { messages: { orderBy: { createdAt: "asc" }, take: 80 } },
  });
  return rows.map(conversationView);
}

export async function deleteTutorConversation(user: CurrentUser, conversationId: string): Promise<void> {
  const deleted = await prisma.tutorConversation.deleteMany({ where: { id: conversationId, userId: user.id } });
  if (deleted.count === 0) throw new ActionError("not_found");
}

export async function sendTutorMessage(user: CurrentUser, raw: TutorMessageInput, deps: { t: TFunction; locale: Locale }): Promise<{ conversation: TutorConversationView; assistant: TutorMessageView }> {
  enforceRateLimit("tutor", user.id);
  const settings = await getTutorRuntimeSettings();
  if (!settings.enabled) throw new ActionError("tutor_disabled");
  await enforceDailyTutorLimit(user.id, settings.dailyLimit);

  const input = tutorMessageSchema.parse(raw);
  const mode: TutorMode = isTutorMode(input.mode) ? input.mode : "explain";
  const depth: TutorDepth = TUTOR_DEPTHS.includes(input.depth) ? input.depth : "intermediate";
  const message = sanitizeTutorInput(input.message);
  const certId = await certificationIdFromCode(input.certificationCode);

  let conversation = input.conversationId
    ? await prisma.tutorConversation.findFirst({ where: { id: input.conversationId, userId: user.id }, include: { messages: { orderBy: { createdAt: "asc" }, take: HISTORY_TAKE } } })
    : null;
  if (input.conversationId && !conversation) throw new ActionError("not_found");

  const injection = detectPromptInjection(message);
  const context = await buildTutorContext({ userId: user.id, lessonId: input.lessonId, questionId: input.questionId, message, mode, locale: deps.locale });
  const retrieval = await buildRetrieval(deps.locale);
  const query = [message, context.lesson?.title, context.mistake?.stem].filter(Boolean).join("\n");
  const chunks = searchIndex(retrieval.index, query, { k: 5, certificationCode: input.certificationCode ?? context.lesson?.certCode ?? null, boostLessonId: context.lesson?.id ?? null });

  if (!conversation) {
    conversation = await prisma.tutorConversation.create({
      data: { userId: user.id, title: titleFromMessage(message), certificationId: certId, lessonId: context.lesson?.id ?? input.lessonId ?? null },
      include: { messages: { orderBy: { createdAt: "asc" }, take: HISTORY_TAKE } },
    });
  }

  await prisma.tutorMessage.create({
    data: { conversationId: conversation.id, role: "USER", content: message, mode, flagged: injection.flagged },
  });

  let answerText: string;
  let providerName = "safety";
  let cited: TutorCitation[] = [];
  let flagged = injection.flagged;
  if (injection.flagged) {
    logger.warn("tutor.prompt_injection", { userId: user.id, conversationId: conversation.id, reasons: injection.reasons });
    answerText = deps.t("tutor.injectionWarning");
  } else {
    const history = conversation.messages.map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content }));
    const providers = await getTutorProvider();
    let response;
    try {
      response = await providers.provider.generate({ mode, depth, message, locale: deps.locale, chunks, context, history, phrases: phrases(deps.t) });
    } catch (error) {
      logger.warn("tutor.provider_fallback", { userId: user.id, provider: providers.config.provider, error });
      response = await providers.fallback.generate({ mode, depth, message, locale: deps.locale, chunks, context, history, phrases: phrases(deps.t) });
    }
    const checked = checkTutorOutput(response.text);
    answerText = checked.text || deps.t("tutor.p_insufficient");
    flagged = checked.modified;
    providerName = response.provider;
    cited = citationsFor(chunks, response.usedChunkIds);
  }

  const assistantRow = await prisma.tutorMessage.create({
    data: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      content: answerText,
      mode,
      citations: cited as unknown as Prisma.InputJsonValue,
      flagged,
      provider: providerName,
    },
  });
  await prisma.learningEvent.create({
    data: {
      userId: user.id,
      type: "TUTOR_MESSAGE",
      certificationId: certId,
      lessonId: context.lesson?.id ?? null,
      questionId: shouldUseQuestionContext(input.questionId, !!context.mistake) ? input.questionId : null,
      xp: 0,
      metadata: { mode, depth, provider: providerName, citations: cited.length } as Prisma.InputJsonValue,
    },
  });

  const updated = await prisma.tutorConversation.findUniqueOrThrow({
    where: { id: conversation.id },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 80 } },
  });
  return { conversation: conversationView(updated), assistant: messageView(assistantRow) };
}
