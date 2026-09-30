/**
 * Database seed: roles, settings, the verified certification catalog, demo
 * local learner/admin profile, demonstration course content (AZ-900, AI-901), labs, badges,
 * and cross-certification concepts.
 *
 * Run with `npm run db:seed` (or automatically via `prisma migrate reset`).
 * Demo content is labelled as demonstration content and is NOT a complete
 * official curriculum.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, type RoleKey } from "@prisma/client";
import { z } from "zod";
import { certificationConfigSchema, validateCoursePackage } from "../src/modules/content/package-schema";
import { listCourseDirectories, loadCourseDirectory } from "../src/modules/content/package-loader";
import { importCoursePackage } from "../src/modules/content/importer";
import { syncCertificationConfig, syncCertificationRelations } from "../src/modules/catalog/sync";
import { SETTING_DEFAULTS } from "../src/modules/admin/settings-defaults";
import { BADGES } from "./seed-data/badges";
import { CONCEPTS } from "./seed-data/concepts";
import { ensureLocalUser } from "../src/modules/auth/local-user";

const prisma = new PrismaClient();
const NOW = new Date();
const root = path.resolve(__dirname, "seed-data");

async function seedRoles() {
  const roles: { key: RoleKey; name: string; description: string }[] = [
    { key: "LEARNER", name: "Learner", description: "Studies certifications, takes quizzes, labs and practice exams." },
    { key: "INSTRUCTOR", name: "Instructor / content editor", description: "Creates and reviews lessons, questions and labs; views anonymous analytics." },
    { key: "ADMIN", name: "Administrator", description: "Manages certifications, content, settings and audit logs." },
  ];
  for (const r of roles) await prisma.role.upsert({ where: { key: r.key }, create: r, update: { name: r.name, description: r.description } });
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


async function main() {
  const started = Date.now();
  if (process.env.SEED_MODE === "if-empty" && (await prisma.certification.count()) > 0) {
    console.log("Database already contains a catalog - skipping seed (SEED_MODE=if-empty).");
    return;
  }
  console.log("Seeding roles and settings…");
  await seedRoles();
  await seedSettings();
  console.log("Seeding certification catalog…");
  await seedCatalog();
  console.log("Ensuring local learner/admin profile…");
  await prisma.user.deleteMany({ where: { email: { endsWith: "@example.com" }, isDemo: true } });
  const localUser = await ensureLocalUser(prisma);
  const actorId: string | null = localUser.id;
  console.log("Importing demonstration courses…");
  await seedCourses(actorId);
  console.log("Seeding badges and concepts…");
  await seedBadges();
  await seedConcepts();
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
