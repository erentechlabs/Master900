import { describe, expect, it } from "vitest";
import { computeReadiness, levelForScore, type ReadinessInput } from "@/modules/analytics/readiness";
import { evaluateBadges, levelForXp, xpForLevel } from "@/modules/analytics/gamification";
import { recommendNextAction, type NextActionInput } from "@/modules/analytics/recommend";
import { availableDates, findMissedSessions, generateStudyPlan, type PlannerInput } from "@/modules/planner/generator";
import { buildIcs, escapeIcsText, foldIcsLine } from "@/modules/planner/ics";
import { weekdayISO } from "@/lib/dates";

const NOW = new Date("2026-09-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function baseInput(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  const domains = [
    { id: "a", weightMin: 25, weightMax: 30, lessonsTotal: 4, lessonsCompleted: 4 },
    { id: "b", weightMin: 35, weightMax: 40, lessonsTotal: 4, lessonsCompleted: 4 },
    { id: "c", weightMin: 30, weightMax: 35, lessonsTotal: 4, lessonsCompleted: 4 },
  ];
  const attempts = Array.from({ length: 60 }, (_, i) => ({
    domainId: ["a", "b", "c"][i % 3]!,
    difficulty: (["EASY", "MEDIUM", "HARD"] as const)[i % 3]!,
    isCorrect: i % 10 !== 0,
    answeredAt: daysAgo(i % 10),
  }));
  return {
    now: NOW,
    domains,
    attempts,
    fullExams: [],
    labs: { total: 2, completed: 2, completedWithoutSolution: 2 },
    activeDays: Array.from({ length: 10 }, (_, i) => new Date(NOW.getTime() - i * 86_400_000).toISOString().slice(0, 10)),
    lastActivityAt: daysAgo(0),
    ...overrides,
  };
}

describe("readiness model", () => {
  it("requires enough data before rating", () => {
    const r = computeReadiness(baseInput({ attempts: baseInput().attempts.slice(0, 5) }));
    expect(r.level).toBe("STARTING");
    expect(r.cappedReason).toBe("insufficient_data");
  });

  it("caps at Nearly Ready without a full practice exam at the internal target", () => {
    const r = computeReadiness(baseInput({ fullExams: [{ scorePercent: 60, submittedAt: daysAgo(2) }] }));
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.level).toBe("NEARLY_READY");
  });

  it("reaches Practice Exam Ready with strong, broad and recent evidence", () => {
    const r = computeReadiness(baseInput({ fullExams: [{ scorePercent: 88, submittedAt: daysAgo(2) }, { scorePercent: 82, submittedAt: daysAgo(9) }] }));
    expect(r.level).toBe("PRACTICE_EXAM_READY");
    expect(r.cappedReason).toBeNull();
  });

  it("explains the score through weighted signals", () => {
    const r = computeReadiness(baseInput({ fullExams: [{ scorePercent: 80, submittedAt: daysAgo(2) }] }));
    const total = r.signals.reduce((s, x) => s + x.points, 0);
    expect(Math.abs(total - r.score)).toBeLessThanOrEqual(1);
    expect(r.signals.map((s) => s.key)).toEqual(["performance", "coverage", "difficulty", "consistency", "practiceExams", "labs", "recency"]);
    const weightSum = r.signals.reduce((s, x) => s + x.weight, 0);
    expect(weightSum).toBeCloseTo(1, 2);
  });

  it("redistributes the lab weight when a track has no labs", () => {
    const r = computeReadiness(baseInput({ labs: { total: 0, completed: 0, completedWithoutSolution: 0 } }));
    expect(r.signals.find((s) => s.key === "labs")?.weight).toBe(0);
    expect(r.signals.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 2);
  });

  it("decays with inactivity", () => {
    const active = computeReadiness(baseInput());
    const idle = computeReadiness(baseInput({ lastActivityAt: daysAgo(30) }));
    expect(idle.signals.find((s) => s.key === "recency")!.value).toBeLessThan(active.signals.find((s) => s.key === "recency")!.value);
  });

  it("maps scores to levels", () => {
    expect(levelForScore(10)).toBe("STARTING");
    expect(levelForScore(45)).toBe("DEVELOPING");
    expect(levelForScore(70)).toBe("NEARLY_READY");
    expect(levelForScore(85)).toBe("PRACTICE_EXAM_READY");
  });
});

describe("gamification", () => {
  it("computes levels from XP", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(350)).toMatchObject({ level: 3, currentLevelXp: 300, nextLevelXp: 600 });
  });

  it("awards badges from stats", () => {
    const earned = evaluateBadges(
      [
        { key: "first", criteria: { type: "first_lesson" } },
        { key: "mastery", criteria: { type: "domain_mastery", minAccuracy: 80, minAnswers: 10 } },
        { key: "streak7", criteria: { type: "streak", days: 7 } },
        { key: "comeback", criteria: { type: "comeback", inactiveDays: 7 } },
        { key: "pb", criteria: { type: "personal_best" } },
        { key: "labs3", criteria: { type: "labs_completed", count: 3 } },
      ],
      {
        lessonsCompleted: 3,
        domainMastery: [
          { certCode: "AZ-900", domainKey: "cc", accuracy: 85, answers: 12 },
          { certCode: "AZ-900", domainKey: "aas", accuracy: 60, answers: 20 },
        ],
        completedTracks: [],
        labsCompleted: 1,
        perfectQuizzes: 0,
        currentStreak: 7,
        gapBeforeLatestActivity: 9,
        fullExamBests: [{ certCode: "AZ-900", best: 82, previousBest: 70 }],
        totalXp: 500,
      },
    );
    const keys = earned.map((e) => `${e.key}:${e.scopeKey}`);
    expect(keys).toContain("first:global");
    expect(keys).toContain("mastery:AZ-900:cc");
    expect(keys).not.toContain("mastery:AZ-900:aas");
    expect(keys).toContain("streak7:global");
    expect(keys).toContain("comeback:global");
    expect(keys).toContain("pb:AZ-900:82");
    expect(keys).not.toContain("labs3:global");
  });
});

describe("next action recommendation", () => {
  const base: NextActionInput = {
    enrolledCodes: ["AZ-900"],
    primaryCode: "AZ-900",
    diagnosticDone: true,
    primaryHasContent: true,
    dueReviews: 0,
    todaySession: null,
    overdueSessions: 0,
    nextLesson: { title: "Regions", href: "/learn/AZ-900/regions", domainTitle: "Architecture", isWeakDomain: true },
    readinessLevel: "DEVELOPING",
    daysSinceFullExam: null,
    pendingLab: null,
  };
  it("prioritizes enrollment, diagnostic, planned sessions, reviews and exams", () => {
    expect(recommendNextAction({ ...base, enrolledCodes: [], primaryCode: null }).type).toBe("choose_certification");
    expect(recommendNextAction({ ...base, diagnosticDone: false }).type).toBe("diagnostic");
    expect(recommendNextAction({ ...base, todaySession: { id: "s", title: "Lessons", href: "/plan" } }).type).toBe("study_session");
    expect(recommendNextAction({ ...base, dueReviews: 6 }).type).toBe("review");
    expect(recommendNextAction({ ...base, readinessLevel: "NEARLY_READY" }).type).toBe("full_exam");
    const lesson = recommendNextAction(base);
    expect(lesson).toMatchObject({ type: "lesson", reason: "weak_domain" });
    expect(recommendNextAction({ ...base, nextLesson: null, pendingLab: null }).type).toBe("practice");
  });
});

function plannerInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
  const lessons = Array.from({ length: 10 }, (_, i) => ({
    id: `l${i}`,
    title: `Lesson ${i}`,
    domainId: i < 5 ? "strong" : "weak",
    moduleId: `m${Math.floor(i / 2)}`,
    estimatedMinutes: 10,
    completed: false,
  }));
  return {
    startDate: "2026-10-01",
    targetDate: "2026-11-05",
    studyDays: [1, 3, 5],
    sessionMinutes: 30,
    lessons,
    labs: [{ id: "lab1", title: "Lab", moduleId: "m0", estimatedMinutes: 15, completed: false }],
    weakDomainIds: ["weak"],
    revisionWeeks: 1,
    includePracticeExams: true,
    ...overrides,
  };
}

describe("study plan generator", () => {
  it("schedules every pending lesson exactly once on study days within the date range", () => {
    const input = plannerInput();
    const plan = generateStudyPlan(input);
    const scheduled = plan.sessions.flatMap((s) => s.lessonIds);
    expect(scheduled.sort()).toEqual(input.lessons.map((l) => l.id).sort());
    for (const s of plan.sessions) {
      expect(s.date >= input.startDate && s.date < input.targetDate).toBe(true);
      expect(input.studyDays).toContain(weekdayISO(s.date));
    }
    expect(new Set(plan.sessions.map((s) => s.date)).size).toBe(plan.sessions.length);
  });

  it("puts weak-domain lessons first", () => {
    const plan = generateStudyPlan(plannerInput());
    const order = plan.sessions.flatMap((s) => s.lessonIds);
    expect(order.slice(0, 5).every((id) => Number(id.slice(1)) >= 5)).toBe(true);
  });

  it("reserves revision and a full practice exam before the target date", () => {
    const plan = generateStudyPlan(plannerInput());
    const full = plan.sessions.filter((s) => s.type === "PRACTICE_EXAM" && s.practiceMode === "FULL");
    expect(full).toHaveLength(1);
    const last = plan.sessions[plan.sessions.length - 1]!;
    expect(["REVIEW", "REVISION", "PRACTICE_EXAM"]).toContain(last.type);
    expect(plan.sessions.some((s) => s.type === "REVISION")).toBe(true);
    expect(plan.sessions.some((s) => s.labId === "lab1")).toBe(true);
    expect(plan.warnings).toEqual([]);
  });

  it("skips completed lessons", () => {
    const input = plannerInput();
    input.lessons[0]!.completed = true;
    const plan = generateStudyPlan(input);
    expect(plan.sessions.flatMap((s) => s.lessonIds)).not.toContain("l0");
  });

  it("warns when the schedule is too tight", () => {
    const plan = generateStudyPlan(plannerInput({ targetDate: "2026-10-09", studyDays: [3] }));
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.warnings).toContain("insufficient_time");
    expect(plan.sessions.flatMap((s) => s.lessonIds)).toHaveLength(10);
  });

  it("handles missing study days and past target dates", () => {
    expect(generateStudyPlan(plannerInput({ studyDays: [] })).warnings).toEqual(["no_study_days"]);
    expect(generateStudyPlan(plannerInput({ targetDate: "2026-09-01" })).warnings).toEqual(["target_too_soon"]);
  });

  it("lists available dates by weekday", () => {
    expect(availableDates("2026-10-05", "2026-10-12", [1])).toEqual(["2026-10-05"]);
  });

  it("detects missed sessions", () => {
    const sessions = [
      { id: "1", date: "2026-09-28", status: "PLANNED" },
      { id: "2", date: "2026-09-29", status: "COMPLETED" },
      { id: "3", date: "2026-10-02", status: "PLANNED" },
    ];
    expect(findMissedSessions(sessions, "2026-09-30").map((s) => s.id)).toEqual(["1"]);
  });
});

describe("calendar export", () => {
  it("escapes text and folds long lines", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const folded = foldIcsLine(`SUMMARY:${"x".repeat(200)}`);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("builds a valid calendar", () => {
    const ics = buildIcs(
      [{ uid: "s1@fa", title: "Lessons: Regions, zones", date: "2026-10-05", startTime: "18:30", durationMinutes: 30, description: "Line1\nLine2" }],
      { calendarName: "Study plan", now: NOW },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261005T183000\r\n");
    expect(ics).toContain("DURATION:PT30M");
    expect(ics).toContain("SUMMARY:Lessons: Regions\\, zones");
    expect(ics).toContain("DESCRIPTION:Line1\\nLine2");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.split("\r\n").filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
  });
});
