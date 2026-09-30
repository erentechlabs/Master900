/** Chooses the single most useful next action for the learner (pure). */
import type { ReadinessLevelValue } from "./readiness";

export type NextActionInput = {
  enrolledCodes: string[];
  primaryCode: string | null;
  diagnosticDone: boolean;
  primaryHasContent: boolean;
  dueReviews: number;
  todaySession: { id: string; title: string; href: string } | null;
  overdueSessions: number;
  nextLesson: { title: string; href: string; domainTitle: string; isWeakDomain: boolean } | null;
  readinessLevel: ReadinessLevelValue | null;
  daysSinceFullExam: number | null;
  pendingLab: { title: string; href: string } | null;
};

export type NextAction = {
  type: "choose_certification" | "diagnostic" | "study_session" | "review" | "lesson" | "full_exam" | "lab" | "practice";
  href: string;
  reason:
    | "no_enrollment"
    | "no_diagnostic"
    | "planned_today"
    | "reviews_due"
    | "weak_domain"
    | "next_in_path"
    | "ready_for_exam"
    | "lab_available"
    | "keep_practicing";
  params: Record<string, string | number>;
};

export function recommendNextAction(input: NextActionInput): NextAction {
  if (input.enrolledCodes.length === 0 || !input.primaryCode) {
    return { type: "choose_certification", href: "/certifications", reason: "no_enrollment", params: {} };
  }
  const code = input.primaryCode;
  if (!input.diagnosticDone && input.primaryHasContent) {
    return { type: "diagnostic", href: `/diagnostic/${code}`, reason: "no_diagnostic", params: { code } };
  }
  if (input.todaySession) {
    return { type: "study_session", href: input.todaySession.href, reason: "planned_today", params: { title: input.todaySession.title } };
  }
  if (input.dueReviews >= 5) {
    return { type: "review", href: `/practice/mistakes?due=1`, reason: "reviews_due", params: { count: input.dueReviews } };
  }
  if (
    (input.readinessLevel === "NEARLY_READY" || input.readinessLevel === "PRACTICE_EXAM_READY") &&
    (input.daysSinceFullExam === null || input.daysSinceFullExam >= 7)
  ) {
    return { type: "full_exam", href: `/practice?mode=FULL&cert=${code}`, reason: "ready_for_exam", params: { code } };
  }
  if (input.nextLesson) {
    return {
      type: "lesson",
      href: input.nextLesson.href,
      reason: input.nextLesson.isWeakDomain ? "weak_domain" : "next_in_path",
      params: { title: input.nextLesson.title, domain: input.nextLesson.domainTitle },
    };
  }
  if (input.pendingLab) {
    return { type: "lab", href: input.pendingLab.href, reason: "lab_available", params: { title: input.pendingLab.title } };
  }
  if (input.dueReviews > 0) {
    return { type: "review", href: `/practice/mistakes?due=1`, reason: "reviews_due", params: { count: input.dueReviews } };
  }
  return { type: "practice", href: `/practice?cert=${code}`, reason: "keep_practicing", params: { code } };
}
