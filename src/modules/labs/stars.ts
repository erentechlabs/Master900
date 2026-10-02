export type LabStarsInput = { completed: boolean; hintsUsed: number; solutionViewed: boolean };

export function labStars({ completed, hintsUsed, solutionViewed }: LabStarsInput): 0 | 1 | 2 | 3 {
  if (!completed) return 0;
  if (solutionViewed) return 1;
  if (hintsUsed > 0) return 2;
  return 3;
}

export type LabAttemptStarInput = Partial<LabStarsInput> & { status?: string | null; stars?: number | null };

export function attemptStars(attempt: LabAttemptStarInput): 0 | 1 | 2 | 3 {
  if (typeof attempt.stars === "number") return clampStars(attempt.stars);
  return labStars({
    completed: attempt.completed ?? attempt.status === "COMPLETED",
    hintsUsed: attempt.hintsUsed ?? 0,
    solutionViewed: attempt.solutionViewed ?? false,
  });
}

export function bestLabStars(attempts: readonly LabAttemptStarInput[]): 0 | 1 | 2 | 3 {
  return attempts.reduce<0 | 1 | 2 | 3>((best, attempt) => Math.max(best, attemptStars(attempt)) as 0 | 1 | 2 | 3, 0);
}

export type OrderedLabCandidate = { id: string; certificationId: string; sortOrder: number; title?: string };

export function nextLabInCertification<T extends OrderedLabCandidate>(labs: readonly T[], currentLabId: string, completedLabIds: ReadonlySet<string>): T | null {
  const ordered = [...labs].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const currentIndex = ordered.findIndex((lab) => lab.id === currentLabId);
  if (currentIndex < 0) return ordered.find((lab) => !completedLabIds.has(lab.id)) ?? null;
  const current = ordered[currentIndex];
  const sameCertification = ordered.filter((lab) => lab.certificationId === current.certificationId);
  const start = sameCertification.findIndex((lab) => lab.id === currentLabId);
  return [...sameCertification.slice(start + 1), ...sameCertification.slice(0, start)].find((lab) => !completedLabIds.has(lab.id)) ?? null;
}

function clampStars(value: number): 0 | 1 | 2 | 3 {
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  if (value >= 1) return 1;
  return 0;
}
