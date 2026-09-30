/** Result aggregation for quizzes and practice exams. */
export type ResultItem = { questionId: string; domainId: string; isCorrect: boolean | null; timeMs?: number | null };

export type DomainResult = { domainId: string; total: number; answered: number; correct: number; percent: number };

export type AttemptSummary = {
  total: number;
  answered: number;
  correct: number;
  unanswered: number;
  scorePercent: number;
  averageTimeMs: number | null;
  domains: DomainResult[];
};

export function summarizeAttempt(items: ResultItem[], domainOrder: string[] = []): AttemptSummary {
  const byDomain = new Map<string, DomainResult>();
  for (const item of items) {
    const d = byDomain.get(item.domainId) ?? { domainId: item.domainId, total: 0, answered: 0, correct: 0, percent: 0 };
    d.total += 1;
    if (item.isCorrect !== null) d.answered += 1;
    if (item.isCorrect) d.correct += 1;
    byDomain.set(item.domainId, d);
  }
  const domains = [...byDomain.values()]
    .map((d) => ({ ...d, percent: d.total ? Math.round((d.correct / d.total) * 100) : 0 }))
    .sort((a, b) => {
      const ia = domainOrder.indexOf(a.domainId);
      const ib = domainOrder.indexOf(b.domainId);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  const answered = items.filter((i) => i.isCorrect !== null).length;
  const correct = items.filter((i) => i.isCorrect).length;
  const times = items.map((i) => i.timeMs).filter((t): t is number => typeof t === "number" && t > 0);
  return {
    total: items.length,
    answered,
    correct,
    unanswered: items.length - answered,
    scorePercent: items.length ? Math.round((correct / items.length) * 100) : 0,
    averageTimeMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    domains,
  };
}

/** Classify domains into strengths and weaknesses from a diagnostic / exam. */
export function classifyDomains(domains: DomainResult[], strongAt = 75, weakBelow = 60) {
  return {
    strong: domains.filter((d) => d.total > 0 && d.percent >= strongAt).map((d) => d.domainId),
    weak: domains.filter((d) => d.total > 0 && d.percent < weakBelow).map((d) => d.domainId),
  };
}
