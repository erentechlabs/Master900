import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type SafeUser = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  locale: string;
  onboardingCompletedAt: Date | null;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountExportData = {
  exportedAt: string;
  profile: SafeUser;
  preferences: unknown;
  enrollments: unknown[];
  lessonProgress: unknown[];
  questionAttempts: unknown[];
  quizAttempts: unknown[];
  practiceAttempts: unknown[];
  notes: unknown[];
  bookmarks: unknown[];
  studyPlans: unknown[];
  badges: unknown[];
  tutorConversations: unknown[];
};

type UserExportRow = Prisma.UserGetPayload<{
  select: {
    id: true;
    email: true;
    name: true;
    status: true;
    locale: true;
    onboardingCompletedAt: true;
    isDemo: true;
    createdAt: true;
    updatedAt: true;
    preference: true;
    enrollments: { include: { certification: { select: { code: true; name: true } } } };
    lessonProgress: { include: { lesson: { select: { title: true; slug: true; certification: { select: { code: true } } } } } };
    questionAttempts: {
      select: {
        id: true;
        questionId: true;
        questionVersion: true;
        certificationId: true;
        domainId: true;
        difficulty: true;
        context: true;
        response: true;
        isCorrect: true;
        score: true;
        timeMs: true;
        confidence: true;
        reasoning: true;
        answeredAt: true;
        question: { select: { code: true; stem: true; explanation: true; type: true; certification: { select: { code: true } } } };
      };
    };
    quizAttempts: true;
    practiceAttempts: true;
    notes: true;
    bookmarks: true;
    studyPlans: { include: { certification: { select: { code: true; name: true } }, sessions: true } };
    badges: { include: { badge: { select: { key: true; name: true; description: true; category: true } } } };
    tutorConversations: { include: { messages: { orderBy: { createdAt: "asc" } } } };
  };
}>;

function stripPracticeAttempt(attempt: UserExportRow["practiceAttempts"][number]) {
  return {
    ...attempt,
    items: undefined,
    settings: attempt.settings,
  };
}

export function serializeAccountExport(user: UserExportRow, exportedAt = new Date()): AccountExportData {
  const profile: SafeUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    locale: user.locale,
    onboardingCompletedAt: user.onboardingCompletedAt,
    isDemo: user.isDemo,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return {
    exportedAt: exportedAt.toISOString(),
    profile,
    preferences: user.preference,
    enrollments: user.enrollments,
    lessonProgress: user.lessonProgress,
    questionAttempts: user.questionAttempts,
    quizAttempts: user.quizAttempts,
    practiceAttempts: user.practiceAttempts.map(stripPracticeAttempt),
    notes: user.notes,
    bookmarks: user.bookmarks,
    studyPlans: user.studyPlans,
    badges: user.badges,
    tutorConversations: user.tutorConversations,
  };
}

export async function getAccountExport(userId: string): Promise<AccountExportData> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      locale: true,
      onboardingCompletedAt: true,
      isDemo: true,
      createdAt: true,
      updatedAt: true,
      preference: true,
      enrollments: { include: { certification: { select: { code: true, name: true } } } },
      lessonProgress: { include: { lesson: { select: { title: true, slug: true, certification: { select: { code: true } } } } } },
      questionAttempts: {
        orderBy: { answeredAt: "desc" },
        select: {
          id: true,
          questionId: true,
          questionVersion: true,
          certificationId: true,
          domainId: true,
          difficulty: true,
          context: true,
          response: true,
          isCorrect: true,
          score: true,
          timeMs: true,
          confidence: true,
          reasoning: true,
          answeredAt: true,
          question: { select: { code: true, stem: true, explanation: true, type: true, certification: { select: { code: true } } } },
        },
      },
      quizAttempts: { orderBy: { startedAt: "desc" } },
      practiceAttempts: { orderBy: { startedAt: "desc" } },
      notes: { orderBy: { updatedAt: "desc" } },
      bookmarks: { orderBy: { createdAt: "desc" } },
      studyPlans: { include: { certification: { select: { code: true, name: true } }, sessions: true }, orderBy: { createdAt: "desc" } },
      badges: { include: { badge: { select: { key: true, name: true, description: true, category: true } } }, orderBy: { earnedAt: "desc" } },
      tutorConversations: { include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { updatedAt: "desc" } },
    },
  });
  return serializeAccountExport(user);
}
