import type { PrismaClient, Prisma } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { mapQuestionPayload } from "@/modules/content/importer";
import { getAiConfig } from "@/modules/tutor/provider";
import { questionSchema, checkQuestionSemantics, type QuestionInput } from "@/modules/content/package-schema";
import { inputJson } from "./cms";

type Db = PrismaClient | Prisma.TransactionClient;

function termQuestions(lesson: { title: string; blocks: { key: string; data: unknown }[] }, refs: { domainKey: string; objectiveCode?: string; lessonSlug: string; source: { title: string; url: string }[] }, count: number): QuestionInput[] {
  const terms = lesson.blocks.flatMap((b) => {
    const data = b.data as { terms?: { term: string; definition: string }[]; myth?: string; reality?: string };
    if (Array.isArray(data.terms)) return data.terms;
    if (data.myth && data.reality) return [{ term: "True", definition: data.reality }];
    return [];
  });
  return terms.slice(0, count).map((term, index) => ({
    ref: `${refs.lessonSlug}-ai-${Date.now().toString(36)}-${index}`,
    type: "SINGLE_CHOICE",
    domainKey: refs.domainKey,
    objectiveCode: refs.objectiveCode,
    difficulty: "MEDIUM",
    stem: `Which statement best matches "${term.term}"?`,
    explanation: term.definition,
    options: [
      { key: "A", text: term.definition, correct: true, explanation: "This matches the lesson terminology." },
      { key: "B", text: "It is an unrelated Microsoft cloud concept.", correct: false, explanation: "This does not match the lesson terminology." },
      { key: "C", text: "It is only a billing feature.", correct: false, explanation: "The lesson does not define it this narrowly." },
      { key: "D", text: "It is a deprecated service.", correct: false, explanation: "The lesson does not identify it as deprecated." },
    ],
    shuffleOptions: true,
    lessonSlug: refs.lessonSlug,
    sources: refs.source.length ? refs.source : [{ title: lesson.title, url: "https://learn.microsoft.com/" }],
    needsVerification: true,
  }));
}

async function openAiQuestions(lesson: { title: string; blocks: { key: string; data: unknown }[] }, refs: { domainKey: string; objectiveCode?: string; lessonSlug: string; source: { title: string; url: string }[] }, count: number): Promise<QuestionInput[] | null> {
  const config = await getAiConfig();
  if (config.provider !== "openai") return null;
  const prompt = [
    "Generate original Microsoft Fundamentals Academy practice questions as JSON only.",
    "Never copy or approximate real exam questions. Ground every question only in the provided lesson blocks.",
    `Return an array of ${count} objects matching the course package QuestionInput schema.`,
    JSON.stringify({ lessonTitle: lesson.title, refs, blocks: lesson.blocks }, null, 2),
  ].join("\n");
  try {
    const env = getEnv();
    const res = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_API_KEY}`, "api-key": env.AI_API_KEY ?? "" },
      body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 2000 }),
      signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    const json = JSON.parse(content) as unknown;
    const raw = Array.isArray(json) ? json : [];
    const out: QuestionInput[] = [];
    for (const item of raw) {
      const parsed = questionSchema.safeParse(item);
      if (parsed.success && checkQuestionSemantics(parsed.data).length === 0) out.push(parsed.data);
    }
    return out.length ? out.slice(0, count) : null;
  } catch {
    return null;
  }
}

export async function generateDraftQuestions(db: Db, input: { lessonId: string; count: number; actor: { id: string; email: string } }) {
  const lesson = await db.lesson.findUnique({
    where: { id: input.lessonId },
    include: {
      domain: true,
      objective: true,
      blocks: { orderBy: { sortOrder: "asc" } },
      sources: { include: { source: true } },
    },
  });
  if (!lesson) throw new Error("lesson_not_found");
  const refs = {
    domainKey: lesson.domain.key,
    objectiveCode: lesson.objective?.code,
    lessonSlug: lesson.slug,
    source: lesson.sources.map((s) => ({ title: s.source.title, url: s.source.url })),
  };
  const ai = await openAiQuestions(lesson, refs, input.count);
  const source = ai ? "openai" : "local-template";
  const drafts = (ai ?? termQuestions(lesson, refs, input.count)).slice(0, input.count);
  const created: string[] = [];
  for (const q of drafts) {
    const payload = mapQuestionPayload(q);
    const record = await db.question.create({
      data: {
        code: q.ref,
        certificationId: lesson.certificationId,
        domainId: lesson.domainId,
        objectiveId: lesson.objectiveId,
        lessonId: lesson.id,
        type: q.type,
        difficulty: q.difficulty,
        stem: q.stem,
        scenario: q.scenario ?? null,
        explanation: q.explanation,
        interaction: inputJson(payload.interaction),
        answerKey: inputJson(payload.answerKey),
        shuffleOptions: q.shuffleOptions ?? true,
        status: "DRAFT",
        authorType: "AI_GENERATED",
        authorId: input.actor.id,
        generationSource: source,
        qualityFlags: ["ai_generated_needs_review"],
        needsVerification: true,
        options: {
          create: q.options?.map((o, index) => ({ key: o.key, text: o.text, isCorrect: o.correct, explanation: o.explanation, sortOrder: index })) ?? [],
        },
      },
    });
    created.push(record.id);
  }
  return { count: created.length, ids: created, source };
}
