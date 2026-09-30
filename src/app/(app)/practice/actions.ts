"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError, enforceRateLimit, runAction, type ActionResult } from "@/lib/actions";
import { getI18n } from "@/i18n/server";
import { authorize } from "@/modules/auth/session";
import {
  answerQuestion,
  answerSchema,
  practiceStartSchema,
  similarQuestionIds,
  startPractice,
  startQuiz,
  submitAttempt,
  toggleMark,
  type AnswerOutcome,
  type PracticeStartInput,
} from "@/modules/assessment/service";

export async function answerAction(input: unknown): Promise<ActionResult<AnswerOutcome>> {
  return runAction("assessment.answer", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("answer", user.id);
    const parsed = answerSchema.parse(input);
    const { t, locale } = await getI18n();
    return answerQuestion(user, parsed, locale, t);
  });
}

const markSchema = z.object({ kind: z.enum(["quiz", "practice"]), attemptId: z.string().max(40), questionId: z.string().max(40), marked: z.boolean() });

export async function markAction(input: unknown): Promise<ActionResult> {
  return runAction("assessment.mark", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("answer", user.id);
    const p = markSchema.parse(input);
    await toggleMark(user, p.kind, p.attemptId, p.questionId, p.marked);
    return undefined;
  });
}

const submitSchema = z.object({ kind: z.enum(["quiz", "practice"]), attemptId: z.string().max(40), expired: z.boolean().optional() });

export async function submitAction(input: unknown): Promise<ActionResult<{ href: string }>> {
  return runAction("assessment.submit", async () => {
    const user = await authorize("learn:use");
    const p = submitSchema.parse(input);
    const { t, locale } = await getI18n();
    const href = await submitAttempt(user, p.kind, p.attemptId, { expired: p.expired, t, locale });
    revalidatePath("/dashboard");
    revalidatePath("/progress");
    return { href };
  });
}

export async function startPracticeAction(input: PracticeStartInput): Promise<ActionResult<{ href: string }>> {
  return runAction("assessment.startPractice", async () => {
    const user = await authorize("learn:use");
    enforceRateLimit("mutation", user.id);
    const id = await startPractice(user, practiceStartSchema.parse(input));
    return { href: `/practice/${id}` };
  });
}

/** Form-friendly variant used by the practice hub (works without JavaScript). */
export async function startPracticeFormAction(formData: FormData): Promise<void> {
  const user = await authorize("learn:use").catch(() => null);
  if (!user) redirect("/sign-in?callbackUrl=/practice");
  const mode = String(formData.get("mode") ?? "QUICK");
  const input: PracticeStartInput = {
    mode: mode as PracticeStartInput["mode"],
    certificationCode: (formData.get("certificationCode") as string) || undefined,
    questionCount: formData.get("questionCount") ? Number(formData.get("questionCount")) : undefined,
    domainIds: formData.getAll("domainIds").map(String).filter(Boolean),
    domainId: (formData.get("domainId") as string) || undefined,
    immediateFeedback: formData.get("immediateFeedback") === "on",
    restrictions: formData.get("restrictions") === "on",
    mistakes:
      mode === "MISTAKE_REVIEW"
        ? {
            certificationCode: (formData.get("mCert") as string) || undefined,
            domainId: (formData.get("mDomain") as string) || undefined,
            difficulty: ((formData.get("mDifficulty") as string) || undefined) as "EASY" | "MEDIUM" | "HARD" | undefined,
            from: (formData.get("mFrom") as string) || undefined,
            to: (formData.get("mTo") as string) || undefined,
            dueOnly: formData.get("mDue") === "on",
            explainFirst: formData.get("mExplain") === "on",
          }
        : undefined,
  };
  let href: string;
  try {
    enforceRateLimit("mutation", user.id);
    href = `/practice/${await startPractice(user, practiceStartSchema.parse(input))}`;
  } catch (error) {
    const code = error instanceof ActionError ? error.code : "unknown";
    redirect(`/practice?error=${encodeURIComponent(code)}`);
  }
  redirect(href);
}

export async function startQuizAction(quizId: string): Promise<void> {
  const user = await authorize("learn:use").catch(() => null);
  if (!user) redirect("/sign-in");
  let id: string;
  try {
    id = await startQuiz(user, quizId);
  } catch (error) {
    redirect(`/practice?error=${encodeURIComponent(error instanceof ActionError ? error.code : "unknown")}`);
  }
  redirect(`/quiz/${id}`);
}

export async function startDiagnosticAction(code: string): Promise<void> {
  const user = await authorize("learn:use").catch(() => null);
  if (!user) redirect(`/sign-in?callbackUrl=/diagnostic/${code}`);
  const quiz = await prisma.quiz.findFirst({ where: { kind: "DIAGNOSTIC", certification: { code } } });
  if (!quiz) redirect(`/diagnostic/${code}`);
  let id: string;
  try {
    id = await startQuiz(user, quiz.id);
  } catch {
    redirect(`/diagnostic/${code}?error=no_questions`);
  }
  redirect(`/quiz/${id}`);
}

export async function startSimilarAction(questionId: string): Promise<void> {
  const user = await authorize("learn:use").catch(() => null);
  if (!user) redirect("/sign-in");
  let href = "/practice?error=no_questions";
  try {
    const similar = await similarQuestionIds(user, questionId, 3);
    if (similar.ids.length) {
      const id = await startPractice(user, { mode: "QUICK", certificationCode: similar.certificationCode, questionIds: similar.ids });
      href = `/practice/${id}`;
    }
  } catch {
    // fall through to the practice hub with an error message
  }
  redirect(href);
}
