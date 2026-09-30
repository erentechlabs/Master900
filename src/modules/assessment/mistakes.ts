import "server-only";
import { prisma } from "@/lib/db";
import { plainSnippet } from "@/lib/text";
import { localizedField } from "@/i18n/translator";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import type { CurrentUser } from "@/modules/auth/session";
import { mistakeQuestionIds, type PracticeStartInput } from "./service";

export type MistakeFilters = NonNullable<PracticeStartInput["mistakes"]>;

export type MistakeRow = {
  questionId: string;
  code: string;
  snippet: string;
  certificationCode: string;
  domainTitle: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  timesWrong: number;
  lastWrongAt: Date | null;
  correctSince: boolean;
  review: { status: "ACTIVE" | "MASTERED" | "SUSPENDED"; dueAt: Date; due: boolean } | null;
};

export async function listMistakes(user: CurrentUser, filters: MistakeFilters, locale: string, limit = 100) {
  const now = new Date();
  const ids = await mistakeQuestionIds(user.id, filters, 500);
  const [questions, wrongStats, rightStats, reviewItems] = await Promise.all([
    prisma.question.findMany({
      where: { AND: [{ id: { in: ids } }, learnerVisibleWhere(now)] },
      select: {
        id: true,
        code: true,
        stem: true,
        difficulty: true,
        translations: { where: { locale }, select: { stem: true, status: true } },
        certification: { select: { code: true } },
        domain: { select: { title: true, translations: true } },
      },
    }),
    prisma.questionAttempt.groupBy({ by: ["questionId"], where: { userId: user.id, isCorrect: false, questionId: { in: ids } }, _count: { _all: true }, _max: { answeredAt: true } }),
    prisma.questionAttempt.groupBy({ by: ["questionId"], where: { userId: user.id, isCorrect: true, questionId: { in: ids } }, _max: { answeredAt: true } }),
    prisma.reviewQueueItem.findMany({ where: { userId: user.id, questionId: { in: ids } }, select: { questionId: true, status: true, dueAt: true } }),
  ]);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const wrong = new Map(wrongStats.map((w) => [w.questionId, w]));
  const right = new Map(rightStats.map((r) => [r.questionId, r._max.answeredAt]));
  const reviews = new Map(reviewItems.map((r) => [r.questionId, r]));

  const rows: MistakeRow[] = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (!q) continue;
    const w = wrong.get(id);
    const lastWrongAt = w?._max.answeredAt ?? null;
    const lastRight = right.get(id) ?? null;
    const r = reviews.get(id);
    const translated = q.translations[0]?.stem;
    rows.push({
      questionId: id,
      code: q.code,
      snippet: plainSnippet(translated && translated.trim() ? translated : q.stem),
      certificationCode: q.certification.code,
      domainTitle: localizedField(q.domain.title, q.domain.translations, locale, "title"),
      difficulty: q.difficulty,
      timesWrong: w?._count._all ?? 0,
      lastWrongAt,
      correctSince: !!(lastRight && lastWrongAt && lastRight > lastWrongAt),
      review: r ? { status: r.status, dueAt: r.dueAt, due: r.status === "ACTIVE" && r.dueAt <= now } : null,
    });
  }
  return { rows: rows.slice(0, limit), total: rows.length };
}

/** Certifications and domains the learner has mistakes in, for the filter controls. */
export async function mistakeFilterOptions(user: CurrentUser, locale: string, certificationCode?: string) {
  const certIds = await prisma.questionAttempt.findMany({ where: { userId: user.id, isCorrect: false }, distinct: ["certificationId"], select: { certificationId: true } });
  const certs = await prisma.certification.findMany({
    where: { id: { in: certIds.map((c) => c.certificationId) } },
    select: { id: true, code: true, name: true, translations: true },
    orderBy: { sortOrder: "asc" },
  });
  const selected = certs.find((c) => c.code === certificationCode);
  const domains = await prisma.examDomain.findMany({
    where: { certificationId: selected ? selected.id : { in: certs.map((c) => c.id) } },
    orderBy: [{ certificationId: "asc" }, { sortOrder: "asc" }],
    select: { id: true, title: true, translations: true, certification: { select: { code: true } } },
  });
  return {
    certs: certs.map((c) => ({ code: c.code, name: localizedField(c.name, c.translations, locale, "name") })),
    domains: domains.map((d) => ({ id: d.id, title: localizedField(d.title, d.translations, locale, "title"), certificationCode: d.certification.code })),
  };
}
