/**
 * Demo learner activity so the dashboard, progress analytics, review queue,
 * study plan and instructor analytics have realistic data. All demo users and
 * their activity are flagged as demo data (User.isDemo).
 */
import type { AttemptContext, PracticeMode, Prisma, PrismaClient, Question, QuestionOption, User } from "@prisma/client";
import { createRng, shuffle, type Rng } from "../src/lib/random";
import { addDays, addMinutes, addDaysISO, parseISODate, todayISO } from "../src/lib/dates";
import { scoreQuestion } from "../src/modules/assessment/engine/scoring";
import type { QuestionResponse } from "../src/modules/assessment/engine/types";
import { buildOptionOrder } from "../src/modules/assessment/engine/projection";
import { classifyDomains, summarizeAttempt } from "../src/modules/assessment/engine/results";
import { reviewSrs, INITIAL_SRS } from "../src/modules/learning/srs";
import { awardBadges, computeAndStoreReadiness } from "../src/modules/analytics/data";
import { XP_RULES } from "../src/modules/analytics/gamification";
import { buildStudyPlan } from "../src/modules/planner/service";
import { createTranslator } from "../src/i18n/translator";
import { en } from "../src/i18n/messages/en";

export type SeedUsers = { admin: User; instructor: User; learner: User; cohort: User[] };
type Q = Question & { options: QuestionOption[] };
type Obj = Record<string, unknown>;

const TZ = "Europe/Istanbul";
const j = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const t = createTranslator(en);

export function responseFor(q: Q, correct: boolean): QuestionResponse {
  const key = (q.answerKey ?? {}) as Obj;
  const inter = (q.interaction ?? {}) as Obj;
  switch (q.type) {
    case "MATCHING": {
      const pairs = { ...(key.pairs as Record<string, string>) };
      const ids = Object.keys(pairs);
      if (!correct && ids.length >= 2) [pairs[ids[0]!], pairs[ids[1]!]] = [pairs[ids[1]!]!, pairs[ids[0]!]!];
      return { kind: "matching", pairs };
    }
    case "ORDERING": {
      const order = [...(key.correctOrder as string[])];
      return { kind: "ordering", order: correct ? order : order.reverse() };
    }
    case "CATEGORIZATION": {
      const placements = { ...(key.placements as Record<string, string>) };
      if (!correct) {
        const cats = (inter.categories as { id: string }[]).map((c) => c.id);
        const first = Object.keys(placements)[0]!;
        placements[first] = cats.find((c) => c !== placements[first]) ?? placements[first]!;
      }
      return { kind: "categorization", placements };
    }
    case "FILL_IN_BLANK": {
      const blanks = Object.fromEntries(
        Object.entries(key.blanks as Record<string, { accepted: string[] }>).map(([id, b]) => [id, correct ? b.accepted[0]! : "not sure"]),
      );
      return { kind: "fill", blanks };
    }
    case "CASE_STUDY": {
      const answers = { ...(key.answers as Record<string, boolean>) };
      if (!correct) {
        const first = Object.keys(answers)[0]!;
        answers[first] = !answers[first];
      }
      return { kind: "caseStudy", answers };
    }
    case "UI_SIMULATION": {
      const values = { ...(key.values as Record<string, string | boolean>) };
      if (!correct) {
        const f = (inter.fields as { id: string; control: string; options?: { value: string }[] }[])[0]!;
        values[f.id] = f.control === "toggle" ? !values[f.id] : f.options?.find((o) => o.value !== values[f.id])?.value ?? "";
      }
      return { kind: "uiSimulation", values };
    }
    default: {
      if (correct) return { kind: "choice", selected: q.options.filter((o) => o.isCorrect).map((o) => o.key) };
      const wrong = q.options.find((o) => !o.isCorrect);
      return { kind: "choice", selected: wrong ? [wrong.key] : [] };
    }
  }
}

const P_CORRECT = { EASY: 0.88, MEDIUM: 0.72, HARD: 0.55 } as const;

type AnswerResult = { questionId: string; domainId: string; isCorrect: boolean; timeMs: number; at: Date };

async function answer(
  db: PrismaClient,
  userId: string,
  questions: Q[],
  opts: { context: AttemptContext; quizAttemptId?: string; practiceAttemptId?: string; start: Date; skill: number; rng: Rng; weakDomainId?: string },
): Promise<AnswerResult[]> {
  const results: AnswerResult[] = [];
  const data: Prisma.QuestionAttemptCreateManyInput[] = [];
  questions.forEach((q, i) => {
    const base = P_CORRECT[q.difficulty] * opts.skill + (q.domainId === opts.weakDomainId ? -0.2 : 0);
    const wantCorrect = opts.rng() < Math.max(0.15, Math.min(0.97, base));
    const response = responseFor(q, wantCorrect);
    const scored = scoreQuestion({ type: q.type, options: q.options, answerKey: q.answerKey }, response);
    const at = addMinutes(opts.start, i * 0.75 + 0.5);
    const timeMs = Math.round(20_000 + opts.rng() * 70_000);
    data.push({
      userId,
      questionId: q.id,
      questionVersion: q.version,
      certificationId: q.certificationId,
      domainId: q.domainId,
      difficulty: q.difficulty,
      context: opts.context,
      quizAttemptId: opts.quizAttemptId,
      practiceAttemptId: opts.practiceAttemptId,
      response: j(response),
      isCorrect: scored.isCorrect,
      score: scored.score,
      timeMs,
      confidence: scored.isCorrect ? (opts.rng() < 0.7 ? 3 : 2) : opts.rng() < 0.5 ? 1 : 2,
      answeredAt: at,
    });
    results.push({ questionId: q.id, domainId: q.domainId, isCorrect: scored.isCorrect, timeMs, at });
  });
  await db.questionAttempt.createMany({ data });
  return results;
}

async function event(db: PrismaClient, userId: string, type: Prisma.LearningEventCreateManyInput["type"], at: Date, extra: Partial<Prisma.LearningEventCreateManyInput> = {}) {
  await db.learningEvent.create({ data: { userId, type, occurredAt: at, ...extra } });
}

async function quizAttempt(
  db: PrismaClient,
  userId: string,
  quizId: string,
  questions: Q[],
  context: AttemptContext,
  start: Date,
  skill: number,
  rng: Rng,
  domainOrder: string[],
  weakDomainId?: string,
) {
  const attempt = await db.quizAttempt.create({ data: { userId, quizId, items: [], totalCount: questions.length, startedAt: start } });
  const items = questions.map((q) => ({ questionId: q.id, version: q.version, optionOrder: buildOptionOrder(q, `${attempt.id}:${q.id}`), marked: false }));
  const results = await answer(db, userId, questions, { context, quizAttemptId: attempt.id, start, skill, rng, weakDomainId });
  const summary = summarizeAttempt(results, domainOrder);
  await db.quizAttempt.update({
    where: { id: attempt.id },
    data: { items: j(items), status: "SUBMITTED", submittedAt: addMinutes(start, questions.length + 2), score: summary.scorePercent, correctCount: summary.correct, domainBreakdown: j(summary.domains) },
  });
  return { attempt, summary, results };
}

async function practiceAttempt(
  db: PrismaClient,
  userId: string,
  certificationId: string,
  mode: PracticeMode,
  questions: Q[],
  start: Date,
  skill: number,
  rng: Rng,
  domainOrder: string[],
  extra: { practiceExamId?: string; challengeDate?: string; weakDomainId?: string; timeLimitMinutes?: number } = {},
) {
  const settings = { immediateFeedback: mode !== "FULL", questionCount: questions.length, restrictions: false };
  const attempt = await db.practiceExamAttempt.create({
    data: {
      userId,
      certificationId,
      mode,
      settings: j(settings),
      items: [],
      totalCount: questions.length,
      startedAt: start,
      practiceExamId: extra.practiceExamId,
      challengeDate: extra.challengeDate,
      expiresAt: extra.timeLimitMinutes ? addMinutes(start, extra.timeLimitMinutes) : null,
    },
  });
  const items = questions.map((q) => ({ questionId: q.id, version: q.version, optionOrder: buildOptionOrder(q, `${attempt.id}:${q.id}`), marked: false }));
  const results = await answer(db, userId, questions, { context: "PRACTICE", practiceAttemptId: attempt.id, start, skill, rng, weakDomainId: extra.weakDomainId });
  const summary = summarizeAttempt(results, domainOrder);
  const duration = Math.round(results.reduce((s, r) => s + r.timeMs, 0));
  await db.practiceExamAttempt.update({
    where: { id: attempt.id },
    data: {
      items: j(items),
      status: "SUBMITTED",
      submittedAt: new Date(start.getTime() + duration + 60_000),
      score: summary.scorePercent,
      correctCount: summary.correct,
      domainBreakdown: j(summary.domains),
      timeSpentMs: duration,
    },
  });
  return { attempt, summary, results };
}

async function clearDemoActivity(db: PrismaClient, userIds: string[]) {
  const where = { userId: { in: userIds } };
  await db.questionAttempt.deleteMany({ where });
  await db.quizAttempt.deleteMany({ where });
  await db.practiceExamAttempt.deleteMany({ where });
  await db.labAttempt.deleteMany({ where });
  await db.lessonProgress.deleteMany({ where });
  await db.learningEvent.deleteMany({ where });
  await db.reviewQueueItem.deleteMany({ where });
  await db.studyPlan.deleteMany({ where });
  await db.readinessSnapshot.deleteMany({ where });
  await db.userBadge.deleteMany({ where });
  await db.bookmark.deleteMany({ where });
  await db.note.deleteMany({ where });
  await db.tutorConversation.deleteMany({ where });
  await db.enrollment.deleteMany({ where });
}

export async function seedDemoActivity(db: PrismaClient, users: SeedUsers, now: Date) {
  const rng = createRng("fundamentals-academy-demo");
  await clearDemoActivity(db, [users.learner.id, ...users.cohort.map((u) => u.id), users.admin.id, users.instructor.id]);

  const az = await db.certification.findUniqueOrThrow({ where: { code: "AZ-900" } });
  const ai = await db.certification.findUniqueOrThrow({ where: { code: "AI-901" } });
  const azDomains = await db.examDomain.findMany({ where: { certificationId: az.id }, orderBy: { sortOrder: "asc" } });
  const azDomainOrder = azDomains.map((d) => d.id);
  const governance = azDomains.find((d) => d.key === "azure-management-governance")!;
  const azQuestions = (await db.question.findMany({ where: { certificationId: az.id }, include: { options: true } })) as Q[];
  const aiQuestions = (await db.question.findMany({ where: { certificationId: ai.id }, include: { options: true } })) as Q[];
  const azLessons = await db.lesson.findMany({
    where: { certificationId: az.id },
    include: { quizzes: { where: { kind: "KNOWLEDGE_CHECK" }, include: { questions: { orderBy: { sortOrder: "asc" } } } }, domain: true, module: true, flashcards: true },
  });
  azLessons.sort((a, b) => a.domain.sortOrder - b.domain.sortOrder || a.module.sortOrder - b.module.sortOrder || a.sortOrder - b.sortOrder);
  const byId = new Map(azQuestions.map((q) => [q.id, q]));
  const day = (n: number, hour = 18) => {
    const d = addDays(parseISODate(todayISO(TZ, now)), n);
    return new Date(d.getTime() + (hour - 3) * 3600_000);
  };

  // ------------------------------------------------------------ main learner
  const learner = users.learner;
  await db.userPreference.update({
    where: { userId: learner.id },
    data: { careerGoal: "it", experienceLevel: "SOME_EXPERIENCE", studyDays: [1, 2, 3, 4, 6], sessionMinutes: 30, learningStyle: "GUIDED_PRACTICE", timezone: TZ, dailyGoalMinutes: 20 },
  });
  await db.user.update({ where: { id: learner.id }, data: { onboardingCompletedAt: day(-13, 9), createdAt: day(-14, 9) } });
  await db.enrollment.create({ data: { userId: learner.id, certificationId: az.id, isPrimary: true, targetExamDate: parseISODate(addDaysISO(todayISO(TZ, now), 35)), createdAt: day(-13, 9) } });
  await db.enrollment.create({ data: { userId: learner.id, certificationId: ai.id, isPrimary: false, targetExamDate: parseISODate(addDaysISO(todayISO(TZ, now), 70)), createdAt: day(-6, 9) } });

  // Diagnostic (13 days ago)
  const diagnosticQuiz = await db.quiz.findFirstOrThrow({ where: { certificationId: az.id, kind: "DIAGNOSTIC" } });
  const diagnosticQs = azDomains.flatMap((d, i) => shuffle(azQuestions.filter((q) => q.domainId === d.id && q.difficulty !== "HARD"), rng).slice(0, i === 1 ? 4 : 3));
  const diag = await quizAttempt(db, learner.id, diagnosticQuiz.id, diagnosticQs, "DIAGNOSTIC", day(-13, 10), 0.8, rng, azDomainOrder, governance.id);
  const classified = classifyDomains(diag.summary.domains);
  const weakIds = classified.weak.length ? classified.weak : [governance.id];
  await db.enrollment.update({
    where: { userId_certificationId: { userId: learner.id, certificationId: az.id } },
    data: {
      diagnosticCompletedAt: day(-13, 10),
      diagnosticResult: j({ attemptId: diag.attempt.id, scorePercent: diag.summary.scorePercent, domains: diag.summary.domains, weakDomainIds: weakIds, strongDomainIds: classified.strong }),
    },
  });
  await event(db, learner.id, "DIAGNOSTIC_COMPLETED", day(-13, 10), { certificationId: az.id, xp: XP_RULES.diagnosticCompleted, durationSeconds: 600 });

  // Lessons + knowledge checks on active days.
  const activeDays = [-13, -12, -11, -9, -8, -6, -4, -3, -2, -1, 0];
  const completedCount = 8;
  for (let i = 0; i < completedCount; i++) {
    const lesson = azLessons[i]!;
    const d = activeDays[Math.min(activeDays.length - 1, Math.floor((i * activeDays.length) / completedCount))]!;
    const at = day(d, 19);
    await event(db, learner.id, "LESSON_VIEWED", at, { certificationId: az.id, lessonId: lesson.id });
    const quiz = lesson.quizzes[0];
    let score = 100;
    if (quiz) {
      const qs = quiz.questions.map((qq) => byId.get(qq.questionId)!).filter(Boolean);
      const res = await quizAttempt(db, learner.id, quiz.id, qs, "KNOWLEDGE_CHECK", addMinutes(at, 12), 1.05, rng, azDomainOrder, governance.id);
      score = res.summary.scorePercent;
      await event(db, learner.id, "QUIZ_COMPLETED", addMinutes(at, 18), { certificationId: az.id, lessonId: lesson.id, xp: XP_RULES.quizCompleted + res.summary.correct * XP_RULES.correctAnswer + (score === 100 ? XP_RULES.perfectQuiz : 0), durationSeconds: 300 });
    }
    await db.lessonProgress.create({
      data: { userId: learner.id, lessonId: lesson.id, status: "COMPLETED", startedAt: at, completedAt: addMinutes(at, 20), lastViewedAt: addMinutes(at, 20), knowledgeCheckScore: score, timeSpentSeconds: lesson.estimatedMinutes * 60 },
    });
    await event(db, learner.id, "LESSON_COMPLETED", addMinutes(at, 20), { certificationId: az.id, lessonId: lesson.id, xp: XP_RULES.lessonCompleted, durationSeconds: lesson.estimatedMinutes * 60 });
  }
  const inProgress = azLessons[completedCount]!;
  await db.lessonProgress.create({ data: { userId: learner.id, lessonId: inProgress.id, status: "IN_PROGRESS", startedAt: day(0, 8), lastViewedAt: day(0, 8), timeSpentSeconds: 240 } });
  await event(db, learner.id, "LESSON_VIEWED", day(0, 8), { certificationId: az.id, lessonId: inProgress.id, durationSeconds: 240 });

  // Practice history
  const quick = await practiceAttempt(db, learner.id, az.id, "QUICK", shuffle(azQuestions, rng).slice(0, 10), day(-9, 20), 0.95, rng, azDomainOrder, { weakDomainId: governance.id });
  await event(db, learner.id, "PRACTICE_COMPLETED", day(-9, 20), { certificationId: az.id, xp: XP_RULES.practiceCompleted, durationSeconds: 600, metadata: { mode: "QUICK", score: quick.summary.scorePercent } });
  const fullTemplate = await db.practiceExam.findFirstOrThrow({ where: { certificationId: az.id, mode: "FULL" } });
  const fullQs = azDomains.flatMap((d, i) => shuffle(azQuestions.filter((q) => q.domainId === d.id), rng).slice(0, [11, 16, 13][i] ?? 10));
  const full = await practiceAttempt(db, learner.id, az.id, "FULL", shuffle(fullQs, rng), day(-3, 20), 0.95, rng, azDomainOrder, {
    practiceExamId: fullTemplate.id,
    weakDomainId: governance.id,
    timeLimitMinutes: fullTemplate.timeLimitMinutes ?? 45,
  });
  await event(db, learner.id, "PRACTICE_COMPLETED", day(-3, 21), { certificationId: az.id, xp: XP_RULES.fullExamCompleted, durationSeconds: 2400, metadata: { mode: "FULL", score: full.summary.scorePercent } });
  const dailyQs = [...shuffle(azQuestions, rng).slice(0, 3), ...shuffle(aiQuestions, rng).slice(0, 2)];
  await practiceAttempt(db, learner.id, az.id, "DAILY", dailyQs, day(-1, 8), 1, rng, azDomainOrder, { challengeDate: addDaysISO(todayISO(TZ, now), -1) });
  await event(db, learner.id, "DAILY_CHALLENGE_COMPLETED", day(-1, 8), { certificationId: az.id, xp: XP_RULES.dailyChallenge, durationSeconds: 240 });

  // AI-901: first lesson and a few answers.
  const aiLesson = await db.lesson.findFirstOrThrow({ where: { certificationId: ai.id }, orderBy: [{ domain: { sortOrder: "asc" } }, { module: { sortOrder: "asc" } }, { sortOrder: "asc" }], include: { quizzes: { include: { questions: true } } } });
  const aiQuiz = aiLesson.quizzes[0];
  if (aiQuiz) {
    const aiById = new Map(aiQuestions.map((q) => [q.id, q]));
    const qs = aiQuiz.questions.map((x) => aiById.get(x.questionId)!).filter(Boolean);
    const aiDomains = await db.examDomain.findMany({ where: { certificationId: ai.id }, orderBy: { sortOrder: "asc" } });
    const res = await quizAttempt(db, learner.id, aiQuiz.id, qs, "KNOWLEDGE_CHECK", day(-2, 20), 1, rng, aiDomains.map((d) => d.id));
    await db.lessonProgress.create({
      data: { userId: learner.id, lessonId: aiLesson.id, status: "COMPLETED", startedAt: day(-2, 19), completedAt: day(-2, 20), lastViewedAt: day(-2, 20), knowledgeCheckScore: res.summary.scorePercent, timeSpentSeconds: 600 },
    });
    await event(db, learner.id, "LESSON_COMPLETED", day(-2, 20), { certificationId: ai.id, lessonId: aiLesson.id, xp: XP_RULES.lessonCompleted, durationSeconds: 600 });
  }

  // Review queue from mistakes (latest attempt per question incorrect).
  const wrong = await db.questionAttempt.findMany({ where: { userId: learner.id, isCorrect: false }, orderBy: { answeredAt: "desc" } });
  const seen = new Set<string>();
  for (const w of wrong) {
    if (seen.has(w.questionId)) continue;
    seen.add(w.questionId);
    await db.reviewQueueItem.create({
      data: { userId: learner.id, questionId: w.questionId, certificationId: w.certificationId, domainId: w.domainId, reason: "INCORRECT_ANSWER", dueAt: rng() < 0.6 ? addDays(now, -1) : addDays(now, 2), createdAt: w.answeredAt },
    });
  }
  // Flashcards with spaced-repetition history.
  const cards = azLessons.slice(0, 4).flatMap((l) => l.flashcards).slice(0, 10);
  for (const [i, card] of cards.entries()) {
    let state = INITIAL_SRS;
    let due = now;
    for (let r = 0; r < 1 + (i % 3); r++) {
      const res = reviewSrs(state, i % 4 === 0 ? 3 : 4, day(-6 + r * 2));
      state = res.state;
      due = res.dueAt;
    }
    await db.reviewQueueItem.create({
      data: { userId: learner.id, flashcardId: card.id, certificationId: az.id, lessonId: card.lessonId, reason: "FLASHCARD", ...state, dueAt: i < 4 ? addDays(now, -1) : due, lastReviewedAt: day(-2) },
    });
    await event(db, learner.id, "FLASHCARD_REVIEWED", day(-2, 21), { certificationId: az.id, xp: XP_RULES.flashcardReviewed });
  }

  // Labs
  const rbacLab = await db.lab.findUnique({ where: { certificationId_slug: { certificationId: az.id, slug: "rbac-least-privilege-portal" } } });
  if (rbacLab) {
    await db.labAttempt.create({
      data: {
        userId: learner.id,
        labId: rbacLab.id,
        labVersion: rbacLab.version,
        mode: "GUIDED",
        status: "COMPLETED",
        actions: j([
          { type: "navigate", page: "resource-groups" },
          { type: "navigate", page: "rg-finance" },
          { type: "click", componentId: "open-iam" },
          { type: "submitForm", componentId: "add-assignment", values: { role: "Reader", principal: "Alex (Finance analyst)" } },
        ]),
        hintsUsed: 1,
        score: 100,
        startedAt: day(-4, 19),
        completedAt: day(-4, 19.3),
      },
    });
    await event(db, learner.id, "LAB_COMPLETED", day(-4, 19.3), { certificationId: az.id, labId: rbacLab.id, xp: XP_RULES.labCompleted, durationSeconds: 720 });
  }
  const cliLab = await db.lab.findUnique({ where: { certificationId_slug: { certificationId: az.id, slug: "cli-resource-group-and-storage" } } });
  if (cliLab) {
    await db.labAttempt.create({
      data: {
        userId: learner.id,
        labId: cliLab.id,
        labVersion: cliLab.version,
        mode: "GUIDED",
        status: "IN_PROGRESS",
        actions: j(["az group list --output table", "az account list-locations --output table"]),
        startedAt: day(-1, 21),
      },
    });
    await event(db, learner.id, "LAB_STARTED", day(-1, 21), { certificationId: az.id, labId: cliLab.id });
  }

  // Study plan: created 13 days ago, then adjusted after a missed session.
  const settings = { certificationId: az.id, targetDate: addDaysISO(todayISO(TZ, now), 35), studyDays: [1, 2, 3, 4, 6], sessionMinutes: 30, revisionWeeks: 1, includePracticeExams: true, preferredTime: "19:00" };
  const past = day(-13, 9);
  await buildStudyPlan(db, learner.id, settings, { t, locale: "en", timeZone: TZ, reason: "regenerated", now: past });
  const pastSessions = await db.studySession.findMany({ where: { userId: learner.id, scheduledAt: { lt: parseISODate(todayISO(TZ, now)) } }, orderBy: { scheduledAt: "asc" } });
  for (const [i, s] of pastSessions.entries()) {
    const missed = i === Math.floor(pastSessions.length / 2);
    await db.studySession.update({ where: { id: s.id }, data: missed ? { status: "MISSED" } : { status: "COMPLETED", completedAt: new Date(s.scheduledAt.getTime() + 16 * 3600_000) } });
  }
  await buildStudyPlan(db, learner.id, settings, { t, locale: "en", timeZone: TZ, reason: "missed", now });

  // Readiness history and badges.
  for (const d of [-12, -9, -6, -3, 0]) await computeAndStoreReadiness(db, learner.id, az.id, TZ, d === 0 ? now : day(d, 22));
  await computeAndStoreReadiness(db, learner.id, ai.id, TZ, now);
  await awardBadges(db, learner.id, TZ, now);

  // Bookmarks, notes and a tutor conversation.
  const shared = azLessons.find((l) => l.slug === "shared-responsibility-model");
  const regions = azLessons.find((l) => l.slug === "regions-and-availability-zones");
  for (const l of [shared, regions].filter(Boolean)) {
    await db.bookmark.create({ data: { userId: learner.id, targetType: "LESSON", targetId: l!.id, label: l!.title } });
  }
  if (rbacLab) await db.bookmark.create({ data: { userId: learner.id, targetType: "LAB", targetId: rbacLab.id, label: rbacLab.title } });
  if (shared) {
    await db.note.create({
      data: { userId: learner.id, lessonId: shared.id, certificationId: az.id, body: "Customer is ALWAYS responsible for data, devices, accounts and identities - no matter IaaS, PaaS or SaaS." },
    });
    const convo = await db.tutorConversation.create({ data: { userId: learner.id, title: "Shared responsibility in SaaS", certificationId: az.id, lessonId: shared.id, createdAt: day(-8, 20) } });
    await db.tutorMessage.createMany({
      data: [
        { conversationId: convo.id, role: "USER", content: "In SaaS, who is responsible for user accounts?", mode: "explain", createdAt: day(-8, 20) },
        {
          conversationId: convo.id,
          role: "ASSISTANT",
          content: "Here is what the approved course content says:\n\nIn every cloud model, the customer remains responsible for information and data, devices, and accounts and identities. [1]",
          mode: "explain",
          provider: "local",
          citations: j([{ n: 1, title: shared.title, url: `/learn/AZ-900/${shared.slug}` }]),
          createdAt: day(-8, 20),
        },
      ],
    });
  }

  // ------------------------------------------------------------ cohort for anonymous analytics
  for (const [idx, u] of users.cohort.entries()) {
    const skill = 0.75 + rng() * 0.3;
    await db.userPreference.update({ where: { userId: u.id }, data: { shareAnonymousAnalytics: idx !== 4, timezone: TZ } });
    await db.enrollment.create({ data: { userId: u.id, certificationId: az.id, isPrimary: true, targetExamDate: parseISODate(addDaysISO(todayISO(TZ, now), 20 + idx * 7)) } });
    const lessonsDone = 3 + Math.floor(rng() * 12);
    for (let i = 0; i < lessonsDone && i < azLessons.length; i++) {
      const at = day(-20 + Math.floor((i * 18) / lessonsDone), 18);
      await db.lessonProgress.create({ data: { userId: u.id, lessonId: azLessons[i]!.id, status: "COMPLETED", startedAt: at, completedAt: addMinutes(at, 15), lastViewedAt: addMinutes(at, 15) } });
      await event(db, u.id, "LESSON_COMPLETED", addMinutes(at, 15), { certificationId: az.id, lessonId: azLessons[i]!.id, xp: XP_RULES.lessonCompleted });
    }
    const sessions = 3 + Math.floor(rng() * 3);
    for (let s = 0; s < sessions; s++) {
      const at = day(-18 + s * 4 + Math.floor(rng() * 3), 20);
      await practiceAttempt(db, u.id, az.id, "QUICK", shuffle(azQuestions, rng).slice(0, 10), at, skill, rng, azDomainOrder, { weakDomainId: rng() < 0.5 ? governance.id : undefined });
      await event(db, u.id, "PRACTICE_COMPLETED", at, { certificationId: az.id, xp: XP_RULES.practiceCompleted });
    }
    await computeAndStoreReadiness(db, u.id, az.id, TZ, now);
  }

  // Question usage statistics.
  const stats = await db.questionAttempt.groupBy({ by: ["questionId", "isCorrect"], _count: { _all: true }, _sum: { timeMs: true } });
  const agg = new Map<string, { answered: number; correct: number; time: number }>();
  for (const s of stats) {
    const a = agg.get(s.questionId) ?? { answered: 0, correct: 0, time: 0 };
    a.answered += s._count._all;
    if (s.isCorrect) a.correct += s._count._all;
    a.time += s._sum.timeMs ?? 0;
    agg.set(s.questionId, a);
  }
  for (const [id, a] of agg) {
    await db.question.update({ where: { id }, data: { timesAnswered: a.answered, timesCorrect: a.correct, timesServed: a.answered, totalTimeMs: a.time } });
  }
  console.log(`  demo learner: ${completedCount} lessons, ${wrong.length} mistakes queued, plan and readiness created; ${users.cohort.length} cohort learners`);
}
