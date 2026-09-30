/**
 * HTTP smoke test against a running local instance (default http://localhost:3000).
 * Single-user mode has no authentication cookies; app and admin pages should load directly.
 *
 *   npx tsx scripts/smoke-test.ts [baseUrl]
 */
import { PrismaClient } from "@prisma/client";

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const prisma = new PrismaClient();

const ERROR_MARKERS = [/Application error/i, /Unhandled Runtime Error/i, /Internal Server Error/i, /data-nextjs-error/i, /NEXT_NOT_FOUND/];

async function check(path: string, expect: number[] = [200]) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  const body = res.headers.get("content-type")?.includes("text/html") ? await res.text() : "";
  const marker = ERROR_MARKERS.find((m) => m.test(body));
  const location = res.headers.get("location");
  const ok = expect.includes(res.status) && !marker;
  console.log(`${ok ? "OK  " : "FAIL"} ${res.status} ${path}${location ? ` -> ${location}` : ""} (${Date.now() - started} ms)${marker ? ` [${marker}]` : ""}`);
  return ok;
}

async function main() {
  const [lesson, lab, cert] = await Promise.all([
    prisma.lesson.findFirst({ where: { status: "PUBLISHED", certification: { code: "AZ-900" } }, orderBy: { sortOrder: "asc" }, select: { slug: true } }),
    prisma.lab.findFirst({ where: { status: "PUBLISHED" }, select: { id: true } }),
    prisma.certification.findUnique({ where: { code: "AZ-900" }, select: { id: true } }),
  ]);
  if (!lesson || !lab || !cert) throw new Error("Seed data missing - run npm run db:seed");

  let failures = 0;
  const run = async (path: string, expect?: number[]) => {
    if (!(await check(path, expect))) failures += 1;
  };

  console.log(`Smoke testing ${BASE}\n-- pages`);
  const pages = [
    "/", "/certifications", "/certifications/AZ-900", "/certifications/AI-901", "/certifications/AI-900", "/api/health",
    "/dashboard", "/onboarding", "/learn", "/learn/AZ-900", `/learn/AZ-900/${lesson.slug}`, "/learn/AI-901",
    "/practice", "/practice?mode=FULL&cert=AZ-900", "/practice/mistakes", "/practice/mistakes?due=1",
    "/diagnostic/AZ-900", "/diagnostic/AZ-900/results", "/labs", `/labs/${lab.id}`, "/plan", "/progress",
    "/tutor", "/settings", "/bookmarks", "/flashcards", "/glossary", "/compare?a=AZ-900&b=AI-901",
    "/concepts", "/search?q=azure", "/certificates/AZ-900", "/api/plan/ics", "/api/me/export",
    "/admin", "/admin/certifications", "/admin/content", "/admin/questions", "/admin/labs", "/admin/reviews",
    "/admin/audit", "/admin/jobs", "/admin/settings", "/admin/import-export", "/admin/analytics",
  ];
  for (const page of pages) await run(page);
  await run("/sign-in", [404]);
  await run("/sign-up", [404]);
  await run("/admin/users", [404]);
  await run("/does-not-exist", [404]);

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
