import "server-only";
import type { Prisma, PrismaClient, RoleKey } from "@prisma/client";

export const LOCAL_USER_EMAIL = "local-learner@fundamentals-academy.local";

type Db = PrismaClient | Prisma.TransactionClient;

const REQUIRED_ROLES: { key: RoleKey; name: string; description: string }[] = [
  { key: "LEARNER", name: "Learner", description: "Studies certifications, takes quizzes, labs and practice exams." },
  { key: "ADMIN", name: "Administrator", description: "Manages certifications, content, settings and audit logs." },
];

const defaultPreference = {
  timezone: "UTC",
  studyDays: [] as number[],
  sessionMinutes: 30,
  dailyGoalMinutes: 20,
  learningStyle: null,
  experienceLevel: null,
  showTimerByDefault: true,
  gamificationEnabled: true,
  reducedMotion: false,
  accentColor: "default",
  transparencyEffects: true,
  shareAnonymousAnalytics: true,
};

export async function ensureLocalUser(db: Db) {
  const existing = await db.user.findUnique({
    where: { email: LOCAL_USER_EMAIL },
    include: { roles: { include: { role: true } }, preference: true },
  });
  const existingRoles = new Set(existing?.roles.map((r) => r.role.key) ?? []);
  const ready =
    existing &&
    existing.status === "ACTIVE" &&
    !existing.isDemo &&
    existing.preference &&
    REQUIRED_ROLES.every((r) => existingRoles.has(r.key));
  if (ready) return existing;

  const roleIds = new Map<RoleKey, string>();
  for (const role of REQUIRED_ROLES) {
    const row = await db.role.upsert({
      where: { key: role.key },
      create: role,
      update: { name: role.name, description: role.description, isSystem: true },
    });
    roleIds.set(role.key, row.id);
  }

  const user = await db.user.upsert({
    where: { email: LOCAL_USER_EMAIL },
    create: { email: LOCAL_USER_EMAIL, name: null, locale: "en", status: "ACTIVE", isDemo: false },
    update: { status: "ACTIVE", isDemo: false },
  });

  for (const role of REQUIRED_ROLES) {
    await db.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleIds.get(role.key)! } },
      create: { userId: user.id, roleId: roleIds.get(role.key)! },
      update: {},
    });
  }

  await db.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...defaultPreference },
    update: {},
  });

  return db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { roles: { include: { role: true } }, preference: true },
  });
}
