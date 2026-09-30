import "server-only";
import { prisma } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { localizedField } from "@/i18n/translator";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { getSettings } from "@/modules/admin/settings";
import type { CurrentUser } from "@/modules/auth/session";

export type HubCert = { id: string; code: string; name: string; enrolled: boolean; questionCount: number };
export type HubDomain = { id: string; title: string; weightMin: number | null; weightMax: number | null; questionCount: number };
export type HubAttempt = {
  id: string;
  mode: string;
  certificationCode: string | null;
  startedAt: Date;
  submittedAt: Date | null;
  expiresAt: Date | null;
  score: number | null;
  status: string;
};

export type PracticeHub = {
  certs: HubCert[];
  selected: HubCert | null;
  domains: HubDomain[];
  full: { questionCount: number; minutes: number; targetPercent: number };
  inProgress: HubAttempt[];
  history: HubAttempt[];
  daily: { status: "none" | "in_progress" | "done"; attemptId: string | null; score: number | null };
  mistakes: { total: number; due: number };
};

function toHubAttempt(a: {
  id: string;
  mode: string;
  certification: { code: string } | null;
  startedAt: Date;
  submittedAt: Date | null;
  expiresAt: Date | null;
  score: number | null;
  status: string;
}): HubAttempt {
  return { id: a.id, mode: a.mode, certificationCode: a.certification?.code ?? null, startedAt: a.startedAt, submittedAt: a.submittedAt, expiresAt: a.expiresAt, score: a.score, status: a.status };
}

export async function getPracticeHub(user: CurrentUser, locale: string, requestedCode?: string): Promise<PracticeHub> {
  const now = new Date();
  const tz = user.preference?.timezone ?? "UTC";
  const visible = learnerVisibleWhere(now);
  const [enrollments, counts, settings] = await Promise.all([
    prisma.enrollment.findMany({ where: { userId: user.id, status: "ACTIVE" }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { certificationId: true } }),
    prisma.question.groupBy({ by: ["certificationId"], where: visible, _count: { _all: true } }),
    getSettings(),
  ]);
  const countByCert = new Map(counts.map((c) => [c.certificationId, c._count._all]));
  const enrolledIds = enrollments.map((e) => e.certificationId);
  const certRows = await prisma.certification.findMany({
    where: { OR: [{ id: { in: enrolledIds } }, { id: { in: [...countByCert.keys()] } }] },
    select: { id: true, code: true, name: true, translations: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });
  const certs: HubCert[] = certRows
    .map((c) => ({ id: c.id, code: c.code, name: localizedField(c.name, c.translations, locale, "name"), enrolled: enrolledIds.includes(c.id), questionCount: countByCert.get(c.id) ?? 0 }))
    .sort((a, b) => Number(b.enrolled) - Number(a.enrolled) || enrolledIds.indexOf(a.id) - enrolledIds.indexOf(b.id));

  const selected =
    certs.find((c) => c.code === requestedCode) ?? certs.find((c) => c.enrolled && c.questionCount > 0) ?? certs.find((c) => c.questionCount > 0) ?? certs[0] ?? null;

  const [domainRows, domainCounts, template, inProgressRows, historyRows, daily, wrong, due] = await Promise.all([
    selected ? prisma.examDomain.findMany({ where: { certificationId: selected.id }, orderBy: { sortOrder: "asc" } }) : [],
    selected ? prisma.question.groupBy({ by: ["domainId"], where: { AND: [{ certificationId: selected.id }, visible] }, _count: { _all: true } }) : [],
    selected ? prisma.practiceExam.findFirst({ where: { certificationId: selected.id, mode: "FULL", isActive: true } }) : null,
    prisma.practiceExamAttempt.findMany({
      where: { userId: user.id, status: "IN_PROGRESS", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { certification: { select: { code: true } } },
    }),
    prisma.practiceExamAttempt.findMany({
      where: { userId: user.id, status: { in: ["SUBMITTED", "EXPIRED"] } },
      orderBy: { submittedAt: "desc" },
      take: 10,
      include: { certification: { select: { code: true } } },
    }),
    prisma.practiceExamAttempt.findUnique({ where: { userId_challengeDate: { userId: user.id, challengeDate: todayISO(tz, now) } } }),
    prisma.questionAttempt.findMany({ where: { userId: user.id, isCorrect: false }, distinct: ["questionId"], select: { questionId: true } }),
    prisma.reviewQueueItem.count({ where: { userId: user.id, status: "ACTIVE", dueAt: { lte: now }, questionId: { not: null } } }),
  ]);
  const domainCountMap = new Map(domainCounts.map((d) => [d.domainId, d._count._all]));

  return {
    certs,
    selected,
    domains: domainRows.map((d) => ({
      id: d.id,
      title: localizedField(d.title, d.translations, locale, "title"),
      weightMin: d.weightMin,
      weightMax: d.weightMax,
      questionCount: domainCountMap.get(d.id) ?? 0,
    })),
    full: {
      questionCount: template?.questionCount ?? settings["practice.fullExamQuestions"],
      minutes: template?.timeLimitMinutes ?? settings["practice.fullExamMinutes"],
      targetPercent: template?.targetPercent ?? settings["practice.targetPercent"],
    },
    inProgress: inProgressRows.filter((a) => a.mode !== "DAILY" || a.challengeDate === todayISO(tz, now)).map(toHubAttempt),
    history: historyRows.map(toHubAttempt),
    daily: daily ? { status: daily.status === "IN_PROGRESS" ? "in_progress" : "done", attemptId: daily.id, score: daily.score } : { status: "none", attemptId: null, score: null },
    mistakes: { total: wrong.length, due },
  };
}
