/**
 * End-to-end service flows against the database (no HTTP): practice modes, quizzes, diagnostic and a lab.
 * Uses a throwaway learner account that is created (and deleted afterwards) so demo data stays intact.
 *
 *   npx tsx --conditions=react-server scripts/integration-flows.ts
 */
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { en } from "@/i18n/messages/en";
import { createTranslator } from "@/i18n/translator";
import { permissionsFor, type RoleKeyValue } from "@/modules/auth/permissions";
import type { CurrentUser } from "@/modules/auth/session";
import {
  answerQuestion,
  getResults,
  getRunnerData,
  similarQuestionIds,
  startPractice,
  startQuiz,
  submitAttempt,
  toggleMark,
  type AttemptKind,
  type PracticeStartInput,
} from "@/modules/assessment/service";
import type {
  CaseStudyPublic,
  CategorizationPublic,
  FillInBlankPublic,
  MatchingPublic,
  OrderingPublic,
  PublicQuestion,
  QuestionResponse,
  UiSimulationPublic,
} from "@/modules/assessment/engine/types";
import { applyLabEvent, startLab } from "@/modules/labs/service";

const t = createTranslator(en);
const EMAIL = "integration-test@example.invalid";

function answerFor(q: PublicQuestion): QuestionResponse {
  switch (q.type) {
    case "MATCHING": {
      const m = q.interaction as MatchingPublic;
      return { kind: "matching", pairs: Object.fromEntries(m.prompts.map((p, i) => [p.id, m.answers[i % m.answers.length]!.id])) };
    }
    case "ORDERING":
      return { kind: "ordering", order: (q.interaction as OrderingPublic).items.map((i) => i.id) };
    case "CATEGORIZATION": {
      const c = q.interaction as CategorizationPublic;
      return { kind: "categorization", placements: Object.fromEntries(c.items.map((i) => [i.id, c.categories[0]!.id])) };
    }
    case "FILL_IN_BLANK": {
      const f = q.interaction as FillInBlankPublic;
      return { kind: "fill", blanks: Object.fromEntries(f.blanks.map((b) => [b.id, f.wordBank?.[0] ?? "answer"])) };
    }
    case "CASE_STUDY":
      return { kind: "caseStudy", answers: Object.fromEntries((q.interaction as CaseStudyPublic).statements.map((s) => [s.id, true])) };
    case "UI_SIMULATION": {
      const u = q.interaction as UiSimulationPublic;
      return { kind: "uiSimulation", values: Object.fromEntries(u.fields.map((f) => [f.id, f.control === "toggle" ? true : (f.options?.[0]?.value ?? "")])) };
    }
    default:
      return { kind: "choice", selected: q.type === "MULTIPLE_RESPONSE" ? q.options!.slice(0, q.selectCount ?? 2).map((o) => o.key) : [q.options![0]!.key] };
  }
}

async function makeUser(): Promise<CurrentUser> {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "LEARNER" } });
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Integration",
      onboardingCompletedAt: new Date(),
      roles: { create: { roleId: role.id } },
      preference: { create: { timezone: "Europe/Istanbul", studyDays: [1, 3, 5], sessionMinutes: 30 } },
    },
    include: { preference: true },
  });
  const cert = await prisma.certification.findUniqueOrThrow({ where: { code: "AZ-900" } });
  await prisma.enrollment.create({ data: { userId: user.id, certificationId: cert.id, isPrimary: true } });
  const roles: RoleKeyValue[] = ["LEARNER"];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: "en",
    isDemo: false,
    createdAt: user.createdAt,
    onboardingCompletedAt: user.onboardingCompletedAt,
    roles,
    permissions: permissionsFor(roles),
    preference: user.preference,
  };
}

async function playAttempt(user: CurrentUser, kind: AttemptKind, attemptId: string, opts: { reasoning?: string; answerAll?: boolean } = {}) {
  const data = await getRunnerData(user, kind, attemptId, "en", t);
  assert.ok(!("redirect" in data), "runner should be available");
  const json = JSON.stringify(data);
  assert.ok(!json.includes("answerKey") && !json.includes("isCorrect"), "runner payload must not leak answer keys");
  const queue = [...data.questions];
  let answered = 0;
  while (queue.length) {
    const q = queue.shift()!;
    const outcome = await answerQuestion(
      user,
      { kind, attemptId, questionId: q.question.id, response: answerFor(q.question), timeMs: 12_000, confidence: 2, reasoning: opts.reasoning },
      "en",
      t,
    );
    answered += 1;
    assert.equal(!!outcome.review, data.immediateFeedback, "feedback only in immediate-feedback modes");
    if (outcome.next) queue.push(outcome.next);
    if (!opts.answerAll && answered === 1 && kind === "practice" && !data.adaptive) {
      await toggleMark(user, kind, attemptId, q.question.id, true);
    }
  }
  const href = await submitAttempt(user, kind, attemptId, { t, locale: "en" });
  return { data, answered, href };
}

async function main() {
  const user = await makeUser();
  const summary: string[] = [];
  try {
    const practiceModes: PracticeStartInput[] = [
      { mode: "QUICK", certificationCode: "AZ-900", questionCount: 5, immediateFeedback: true },
      { mode: "DOMAIN", certificationCode: "AZ-900", domainId: (await prisma.examDomain.findFirstOrThrow({ where: { certification: { code: "AZ-900" } } })).id, questionCount: 10 },
      { mode: "FULL", certificationCode: "AZ-900", restrictions: true },
      { mode: "ADAPTIVE", certificationCode: "AZ-900", questionCount: 10 },
      { mode: "DAILY" },
    ];
    for (const input of practiceModes) {
      const id = await startPractice(user, input);
      const { data, answered, href } = await playAttempt(user, "practice", id);
      const results = await getResults(user, "practice", id, "en", t);
      assert.ok(!("redirect" in results));
      assert.equal(results.total, answered, `${input.mode}: all answered questions are scored`);
      assert.ok(results.domains.length > 0);
      if (input.mode === "FULL") {
        assert.ok(data.expiresAt, "full exam is timed");
        assert.equal(data.immediateFeedback, false);
        assert.ok(results.targetPercent !== null);
      }
      if (input.mode === "ADAPTIVE") assert.equal(answered, 10, "adaptive exam serves the requested length");
      summary.push(`${input.mode}: ${answered} questions, score ${results.score}% -> ${href}`);
    }

    // Mistake review with explain-first (requires reasoning).
    const mistakes = await startPractice(user, { mode: "MISTAKE_REVIEW", questionCount: 5, mistakes: { certificationCode: "AZ-900", explainFirst: true } });
    const m = await playAttempt(user, "practice", mistakes, { reasoning: "Because the scenario needs the most restrictive option." });
    summary.push(`MISTAKE_REVIEW: ${m.answered} questions -> ${m.href}`);

    // Similar questions for "try a similar question".
    const anyWrong = await prisma.questionAttempt.findFirst({ where: { userId: user.id, isCorrect: false } });
    if (anyWrong) {
      const similar = await similarQuestionIds(user, anyWrong.questionId, 3);
      assert.ok(!similar.ids.includes(anyWrong.questionId));
      summary.push(`similar questions: ${similar.ids.length}`);
    }

    // Diagnostic -> enrollment result + study plan + readiness snapshot.
    const diag = await prisma.quiz.findFirstOrThrow({ where: { kind: "DIAGNOSTIC", certification: { code: "AZ-900" } } });
    const diagAttempt = await startQuiz(user, diag.id);
    const d = await playAttempt(user, "quiz", diagAttempt);
    assert.ok(d.href.startsWith("/diagnostic/AZ-900/results"), d.href);
    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { userId: user.id, certification: { code: "AZ-900" } } });
    assert.ok(enrollment.diagnosticCompletedAt && enrollment.diagnosticResult, "diagnostic result stored");
    const plan = await prisma.studyPlan.findFirst({ where: { userId: user.id, status: "ACTIVE" }, include: { _count: { select: { sessions: true } } } });
    assert.ok(plan && plan._count.sessions > 0, "study plan generated from diagnostic");
    assert.ok((await prisma.readinessSnapshot.count({ where: { userId: user.id } })) > 0, "readiness snapshot stored");
    summary.push(`DIAGNOSTIC: ${d.answered} questions, plan with ${plan._count.sessions} sessions`);

    // Knowledge check.
    const kc = await prisma.quiz.findFirstOrThrow({ where: { kind: "KNOWLEDGE_CHECK", certification: { code: "AZ-900" } } });
    const kcAttempt = await startQuiz(user, kc.id);
    const k = await playAttempt(user, "quiz", kcAttempt);
    const kcResults = await getResults(user, "quiz", kcAttempt, "en", t);
    assert.ok(!("redirect" in kcResults) && kcResults.passPercent !== null);
    summary.push(`KNOWLEDGE_CHECK: ${k.answered} questions -> ${k.href}`);

    // Ownership: another user's attempt must not be accessible.
    const other = await prisma.practiceExamAttempt.findFirst({ where: { userId: { not: user.id } } });
    if (other) await assert.rejects(() => getRunnerData(user, "practice", other.id, "en", t), "foreign attempts are rejected");

    // Command sandbox lab: solve it through the replayed event log.
    const lab = await prisma.lab.findFirstOrThrow({ where: { type: "COMMAND_SANDBOX", certification: { code: "AZ-900" } } });
    let player = await startLab(user, { labId: lab.id, mode: "GUIDED" }, "en");
    assert.ok(!JSON.stringify(player.lab).includes("az storage account create --name stlearndev001"), "solution hidden before reveal");
    for (const command of [
      "az group list --output table",
      "az account list-locations --output table",
      "az group create --name rg-learn-dev --location westeurope --tags env=dev owner=training",
      "az storage account create --name stlearndev001 --resource-group rg-learn-dev --sku Standard_ZRS",
      "az resource list --resource-group rg-learn-dev --output table",
    ]) {
      player = await applyLabEvent(user, player.run.attemptId, { type: "command", command }, "en");
    }
    assert.ok(player.run.completed, "command lab completes when all rules pass");
    summary.push(`LAB ${lab.slug}: completed with score ${player.run.score}, +${player.run.xpEarned} XP`);

    const badges = await prisma.userBadge.count({ where: { userId: user.id } });
    const events = await prisma.learningEvent.count({ where: { userId: user.id } });
    summary.push(`events: ${events}, badges: ${badges}`);
    console.log(summary.map((s) => `✔ ${s}`).join("\n"));
    console.log("\nAll integration flows passed");
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
