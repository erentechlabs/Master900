/**
 * Database seed: roles, settings, the verified certification catalog, demo
 * accounts, demonstration course content (AZ-900, AI-901), labs, badges,
 * cross-certification concepts and demo learner activity.
 *
 * Run with `npm run db:seed` (or automatically via `prisma migrate reset`).
 * Demo content is labelled as demonstration content and is NOT a complete
 * official curriculum.
 */
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, type RoleKey } from "@prisma/client";
import { z } from "zod";
import { certificationConfigSchema, validateCoursePackage } from "../src/modules/content/package-schema";
import { listCourseDirectories, loadCourseDirectory } from "../src/modules/content/package-loader";
import { importCoursePackage } from "../src/modules/content/importer";
import { syncCertificationConfig, syncCertificationRelations } from "../src/modules/catalog/sync";
import { SETTING_DEFAULTS } from "../src/modules/admin/settings-defaults";
import { BADGES } from "./seed-data/badges";
import { CONCEPTS } from "./seed-data/concepts";
import { seedDemoActivity, type SeedUsers } from "./seed-demo";

const prisma = new PrismaClient();
const NOW = new Date();
const root = path.resolve(__dirname, "seed-data");

export const DEMO_PASSWORDS = {
  admin: "Admin12345!",
  instructor: "Instructor123!",
  learner: "Learner12345!",
};

async function seedRoles() {
  const roles: { key: RoleKey; name: string; description: string }[] = [
    { key: "LEARNER", name: "Learner", description: "Studies certifications, takes quizzes, labs and practice exams." },
    { key: "INSTRUCTOR", name: "Instructor / content editor", description: "Creates and reviews lessons, questions and labs; views anonymous analytics." },
    { key: "ADMIN", name: "Administrator", description: "Manages users, roles, certifications, settings and audit logs." },
  ];
  for (const r of roles) await prisma.role.upsert({ where: { key: r.key }, create: r, update: { name: r.name, description: r.description } });
  return new Map((await prisma.role.findMany()).map((r) => [r.key, r.id]));
}

async function seedSettings() {
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
}

async function seedCatalog() {
  const file = z
    .object({ certifications: z.array(certificationConfigSchema) })
    .parse(JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8")));
  for (const c of file.certifications) {
    await syncCertificationConfig(prisma, c, { now: NOW, changeSummary: "Seeded from the verified catalog (2026-09-30)" });
  }
  await syncCertificationRelations(prisma, file.certifications);
  console.log(`  ${file.certifications.length} certifications`);
}

async function upsertUser(roleIds: Map<RoleKey, string>, email: string, name: string, password: string, roles: RoleKey[], extra: { locale?: string } = {}) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, isDemo: true, locale: extra.locale ?? "en", onboardingCompletedAt: NOW },
    update: { name, passwordHash, isDemo: true, status: "ACTIVE" },
  });
  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.userRole.createMany({ data: roles.map((r) => ({ userId: user.id, roleId: roleIds.get(r)! })) });
  await prisma.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, studyDays: [1, 3, 5], sessionMinutes: 30, timezone: "Europe/Istanbul" },
    update: {},
  });
  return user;
}

async function seedUsers(roleIds: Map<RoleKey, string>): Promise<SeedUsers> {
  const admin = await upsertUser(roleIds, "admin@example.com", "Ada Admin", DEMO_PASSWORDS.admin, ["ADMIN", "LEARNER"]);
  const instructor = await upsertUser(roleIds, "instructor@example.com", "Ian Instructor", DEMO_PASSWORDS.instructor, ["INSTRUCTOR", "LEARNER"]);
  const learner = await upsertUser(roleIds, "learner@example.com", "Lale Learner", DEMO_PASSWORDS.learner, ["LEARNER"]);
  const cohort = [];
  for (let i = 1; i <= 5; i++) {
    cohort.push(await upsertUser(roleIds, `learner${i}@example.com`, `Demo Learner ${i}`, DEMO_PASSWORDS.learner, ["LEARNER"]));
  }
  console.log("  8 demo users (admin, instructor, learner, 5 cohort learners)");
  return { admin, instructor, learner, cohort };
}

async function seedCourses(actorId: string | null) {
  for (const dir of listCourseDirectories(path.join(root, "courses"))) {
    const result = validateCoursePackage(loadCourseDirectory(dir), { strictReferences: true });
    if (!result.ok) {
      throw new Error(`Invalid course package ${dir}:\n${result.issues.map((i) => `${i.path}: ${i.message}`).join("\n")}`);
    }
    const report = await importCoursePackage(prisma, result.pkg, { status: "PUBLISHED", authorType: "SEED_DEMO", actorId, now: NOW });
    if (report.errors.length) throw new Error(report.errors.join("\n"));
    console.log(`  ${result.pkg.certificationCode}: ${JSON.stringify(report.created)}`);
  }
}

async function seedBadges() {
  for (const [i, b] of BADGES.entries()) {
    const data = {
      name: b.name,
      description: b.description,
      category: b.category,
      icon: b.icon,
      xpReward: b.xpReward,
      criteria: b.criteria as unknown as object,
      translations: { tr: { ...b.tr, status: "DRAFT" } },
      sortOrder: i,
    };
    await prisma.badge.upsert({ where: { key: b.key }, create: { key: b.key, ...data }, update: data });
  }
}

async function seedConcepts() {
  const certs = new Map((await prisma.certification.findMany({ select: { id: true, code: true } })).map((c) => [c.code, c.id]));
  for (const [i, c] of CONCEPTS.entries()) {
    const concept = await prisma.concept.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, title: c.title, description: c.description, translations: { tr: { ...c.tr, status: "DRAFT" } }, sortOrder: i },
      update: { title: c.title, description: c.description, translations: { tr: { ...c.tr, status: "DRAFT" } }, sortOrder: i },
    });
    await prisma.conceptLink.deleteMany({ where: { conceptId: concept.id } });
    for (const link of c.links) {
      const certificationId = certs.get(link.code);
      if (!certificationId) continue;
      const lesson = link.lessonSlug
        ? await prisma.lesson.findUnique({ where: { certificationId_slug: { certificationId, slug: link.lessonSlug } }, select: { id: true } })
        : null;
      await prisma.conceptLink.create({ data: { conceptId: concept.id, certificationId, lessonId: lesson?.id ?? null, note: link.note } });
    }
  }
}

/**
 * Production bootstrap: create (or promote) a single administrator from ADMIN_EMAIL / ADMIN_PASSWORD when demo
 * accounts are disabled. The password must satisfy a minimum length; it is never printed.
 */
async function seedBootstrapAdmin(roleIds: Map<RoleKey, string>): Promise<string | null> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email) {
    console.log("  ADMIN_EMAIL not set - skipping administrator bootstrap");
    return null;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing && (!password || password.length < 12)) throw new Error("ADMIN_PASSWORD (12+ characters) is required to create the bootstrap administrator");
  const user =
    existing ??
    (await prisma.user.create({
      data: { email, name: "Administrator", passwordHash: await bcrypt.hash(password!, 12), onboardingCompletedAt: NOW, preference: { create: {} } },
    }));
  for (const role of ["ADMIN", "LEARNER"] as RoleKey[]) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleIds.get(role)! } },
      create: { userId: user.id, roleId: roleIds.get(role)! },
      update: {},
    });
  }
  console.log(`  administrator ${email} ${existing ? "ensured" : "created"}`);
  return user.id;
}

async function main() {
  const started = Date.now();
  if (process.env.SEED_MODE === "if-empty" && (await prisma.certification.count()) > 0) {
    console.log("Database already contains a catalog - skipping seed (SEED_MODE=if-empty).");
    return;
  }
  const withDemoUsers = process.env.SEED_DEMO_USERS !== "false";
  console.log("Seeding roles and settings…");
  const roleIds = await seedRoles();
  await seedSettings();
  console.log("Seeding certification catalog…");
  await seedCatalog();
  let users: SeedUsers | null = null;
  let actorId: string | null;
  if (withDemoUsers) {
    console.log("Seeding demo users…");
    users = await seedUsers(roleIds);
    actorId = users.instructor.id;
  } else {
    console.log("Demo users disabled (SEED_DEMO_USERS=false)…");
    actorId = await seedBootstrapAdmin(roleIds);
  }
  console.log("Importing demonstration courses…");
  await seedCourses(actorId);
  console.log("Seeding badges and concepts…");
  await seedBadges();
  await seedConcepts();
  if (users) {
    console.log("Seeding demo learner activity…");
    await seedDemoActivity(prisma, users, NOW);
  }
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  if (users) {
    console.log("Demo accounts (local development only):");
    console.log(`  admin@example.com / ${DEMO_PASSWORDS.admin}`);
    console.log(`  instructor@example.com / ${DEMO_PASSWORDS.instructor}`);
    console.log(`  learner@example.com / ${DEMO_PASSWORDS.learner}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
