import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { learnerVisibleWhere } from "@/modules/content/workflow";

type Db = PrismaClient | Prisma.TransactionClient;

export type CertificateCriteriaInput = {
  visibleLessons: number;
  completedLessons: number;
  fullPracticeSubmitted: number;
};

export type CertificateCriteriaResult = CertificateCriteriaInput & {
  earned: boolean;
  lessonPercent: number;
  requiresPracticeExam: boolean;
};

export function evaluateCertificateCriteria(input: CertificateCriteriaInput): CertificateCriteriaResult {
  const lessonPercent = input.visibleLessons > 0 ? Math.round((Math.min(input.completedLessons, input.visibleLessons) / input.visibleLessons) * 100) : 0;
  return {
    ...input,
    earned: input.visibleLessons > 0 && input.completedLessons >= input.visibleLessons && input.fullPracticeSubmitted >= 1,
    lessonPercent,
    requiresPracticeExam: true,
  };
}

export function certificateVerificationId(userId: string, certificationId: string): string {
  return createHash("sha256").update(`${userId}:${certificationId}:fundamentals-academy-completion`).digest("hex").slice(0, 16).toUpperCase();
}

export async function loadCertificateRecord(db: Db, userId: string, code: string, now = new Date()) {
  const cert = await db.certification.findUnique({
    where: { code: code.toUpperCase() },
    select: { id: true, code: true, name: true, translations: true },
  });
  if (!cert) return null;
  const visible = learnerVisibleWhere(now);
  const [visibleLessons, completedLessons, fullPracticeSubmitted, latestLesson, latestPractice] = await Promise.all([
    db.lesson.count({ where: { certificationId: cert.id, ...visible } }),
    db.lessonProgress.count({ where: { userId, status: "COMPLETED", lesson: { certificationId: cert.id, ...visible } } }),
    db.practiceExamAttempt.count({ where: { userId, certificationId: cert.id, mode: "FULL", status: { in: ["SUBMITTED", "EXPIRED"] } } }),
    db.lessonProgress.findFirst({
      where: { userId, status: "COMPLETED", lesson: { certificationId: cert.id, ...visible }, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    db.practiceExamAttempt.findFirst({
      where: { userId, certificationId: cert.id, mode: "FULL", status: { in: ["SUBMITTED", "EXPIRED"] }, submittedAt: { not: null } },
      orderBy: { submittedAt: "desc" },
      select: { submittedAt: true },
    }),
  ]);
  const criteria = evaluateCertificateCriteria({ visibleLessons, completedLessons, fullPracticeSubmitted });
  const completionDate = criteria.earned
    ? new Date(Math.max(latestLesson?.completedAt?.getTime() ?? 0, latestPractice?.submittedAt?.getTime() ?? 0))
    : null;
  return {
    cert,
    criteria,
    completionDate,
    verificationId: certificateVerificationId(userId, cert.id),
  };
}

