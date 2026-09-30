/** Optional gamification: XP, levels and badge rules (pure). */

export const XP_RULES = {
  lessonCompleted: 20,
  correctAnswer: 2,
  quizCompleted: 10,
  perfectQuiz: 15,
  labCompleted: 50,
  practiceCompleted: 25,
  fullExamCompleted: 60,
  dailyChallenge: 15,
  flashcardReviewed: 1,
  studySessionCompleted: 10,
  diagnosticCompleted: 30,
} as const;

/** Cumulative XP needed to reach a level: 0, 100, 300, 600, 1000, ... */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level)) - 1;
  return (100 * n * (n + 1)) / 2;
}

export function levelForXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, currentLevelXp: current, nextLevelXp: next, progress: Math.round(((xp - current) / (next - current)) * 100) };
}

export type BadgeCriteria =
  | { type: "first_lesson" }
  | { type: "lessons_completed"; count: number }
  | { type: "domain_mastery"; minAccuracy: number; minAnswers: number }
  | { type: "track_completion" }
  | { type: "labs_completed"; count: number }
  | { type: "perfect_quiz" }
  | { type: "streak"; days: number }
  | { type: "comeback"; inactiveDays: number }
  | { type: "personal_best" }
  | { type: "practice_exam_score"; minPercent: number }
  | { type: "xp"; amount: number };

export type BadgeStats = {
  lessonsCompleted: number;
  /** Per certification code and domain key */
  domainMastery: { certCode: string; domainKey: string; accuracy: number; answers: number }[];
  completedTracks: string[];
  labsCompleted: number;
  perfectQuizzes: number;
  currentStreak: number;
  /** Days without activity before the most recent active day (0 when active yesterday). */
  gapBeforeLatestActivity: number;
  /** Best full practice exam per certification, and the previous best before the latest exam. */
  fullExamBests: { certCode: string; best: number; previousBest: number | null }[];
  totalXp: number;
};

export type EarnedBadge = { key: string; scopeKey: string; certCode?: string; context?: Record<string, unknown> };

export function evaluateBadges(defs: { key: string; criteria: BadgeCriteria }[], stats: BadgeStats): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  for (const def of defs) {
    const c = def.criteria;
    switch (c.type) {
      case "first_lesson":
        if (stats.lessonsCompleted >= 1) earned.push({ key: def.key, scopeKey: "global" });
        break;
      case "lessons_completed":
        if (stats.lessonsCompleted >= c.count) earned.push({ key: def.key, scopeKey: "global" });
        break;
      case "domain_mastery":
        for (const d of stats.domainMastery) {
          if (d.answers >= c.minAnswers && d.accuracy >= c.minAccuracy) {
            earned.push({ key: def.key, scopeKey: `${d.certCode}:${d.domainKey}`, certCode: d.certCode, context: { domainKey: d.domainKey } });
          }
        }
        break;
      case "track_completion":
        for (const code of stats.completedTracks) earned.push({ key: def.key, scopeKey: code, certCode: code });
        break;
      case "labs_completed":
        if (stats.labsCompleted >= c.count) earned.push({ key: def.key, scopeKey: "global" });
        break;
      case "perfect_quiz":
        if (stats.perfectQuizzes >= 1) earned.push({ key: def.key, scopeKey: "global" });
        break;
      case "streak":
        if (stats.currentStreak >= c.days) earned.push({ key: def.key, scopeKey: "global" });
        break;
      case "comeback":
        if (stats.gapBeforeLatestActivity >= c.inactiveDays) earned.push({ key: def.key, scopeKey: "global" });
        break;
      case "personal_best":
        for (const b of stats.fullExamBests) {
          if (b.previousBest !== null && b.best > b.previousBest) {
            earned.push({ key: def.key, scopeKey: `${b.certCode}:${b.best}`, certCode: b.certCode, context: { best: b.best, previous: b.previousBest } });
          }
        }
        break;
      case "practice_exam_score":
        for (const b of stats.fullExamBests) {
          if (b.best >= c.minPercent) earned.push({ key: def.key, scopeKey: b.certCode, certCode: b.certCode });
        }
        break;
      case "xp":
        if (stats.totalXp >= c.amount) earned.push({ key: def.key, scopeKey: "global" });
        break;
    }
  }
  return earned;
}
