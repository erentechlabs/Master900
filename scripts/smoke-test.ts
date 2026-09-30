/**
 * HTTP smoke test against a running instance (default http://localhost:3000).
 * Signs in as the demo learner and admin via the credentials provider and requests the main pages.
 *
 *   npx tsx scripts/smoke-test.ts [baseUrl]
 */
import { PrismaClient } from "@prisma/client";

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const prisma = new PrismaClient();

type Jar = Map<string, string>;

function storeCookies(jar: Jar, res: Response) {
  for (const header of res.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const idx = pair!.indexOf("=");
    jar.set(pair!.slice(0, idx).trim(), pair!.slice(idx + 1).trim());
  }
}

function cookieHeader(jar: Jar) {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function signIn(email: string, password: string): Promise<Jar> {
  const jar: Jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  storeCookies(jar, csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(jar) },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/dashboard`, json: "true" }),
  });
  storeCookies(jar, res);
  if (![...jar.keys()].some((k) => k.includes("session-token"))) throw new Error(`Sign-in failed for ${email} (status ${res.status})`);
  return jar;
}

const ERROR_MARKERS = [/Application error/i, /Unhandled Runtime Error/i, /Internal Server Error/i, /data-nextjs-error/i, /NEXT_NOT_FOUND/];

async function check(path: string, jar?: Jar, expect: number[] = [200], redirectTo?: string) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: jar ? { Cookie: cookieHeader(jar) } : {} });
  const body = res.headers.get("content-type")?.includes("text/html") ? await res.text() : "";
  const marker = ERROR_MARKERS.find((m) => m.test(body));
  const location = res.headers.get("location");
  // Redirects thrown while streaming arrive as 200 with a client-side redirect instruction.
  const redirected = redirectTo ? (location?.includes(redirectTo) ?? false) || (res.status === 200 && body.includes(redirectTo)) : true;
  const ok = expect.includes(res.status) && !marker && redirected;
  console.log(`${ok ? "OK  " : "FAIL"} ${res.status} ${path}${location ? ` -> ${location}` : ""} (${Date.now() - started} ms)${marker ? ` [${marker}]` : ""}`);
  return ok;
}

async function main() {
  const [lesson, lab, cert, attempt] = await Promise.all([
    prisma.lesson.findFirst({ where: { status: "PUBLISHED", certification: { code: "AZ-900" } }, orderBy: { sortOrder: "asc" }, select: { slug: true } }),
    prisma.lab.findFirst({ where: { status: "PUBLISHED" }, select: { id: true } }),
    prisma.certification.findUnique({ where: { code: "AZ-900" }, select: { id: true } }),
    prisma.practiceExamAttempt.findFirst({ where: { user: { email: "learner@example.com" }, status: "SUBMITTED" }, select: { id: true } }),
  ]);
  if (!lesson || !lab || !cert) throw new Error("Seed data missing - run npm run db:seed");

  let failures = 0;
  const run = async (path: string, jar?: Jar, expect?: number[], redirectTo?: string) => {
    if (!(await check(path, jar, expect, redirectTo))) failures += 1;
  };

  console.log(`Smoke testing ${BASE}\n-- public`);
  for (const p of ["/", "/certifications", "/certifications/AZ-900", "/certifications/AI-901", "/certifications/AI-900", "/sign-in", "/sign-up", "/api/health"]) await run(p);
  await run("/dashboard", undefined, [307, 302], "/sign-in");
  await run("/admin", undefined, [307, 302], "/sign-in");
  await run("/does-not-exist", undefined, [404]);

  console.log("-- learner");
  const learner = await signIn("learner@example.com", "Learner12345!");
  const learnerPages = [
    "/dashboard",
    "/onboarding",
    "/learn",
    "/learn/AZ-900",
    `/learn/AZ-900/${lesson.slug}`,
    "/learn/AI-901",
    "/practice",
    "/practice?mode=FULL&cert=AZ-900",
    "/practice/mistakes",
    "/practice/mistakes?due=1",
    "/diagnostic/AZ-900",
    "/diagnostic/AZ-900/results",
    "/labs",
    `/labs/${lab.id}`,
    "/plan",
    "/progress",
    "/tutor",
    "/settings",
    "/bookmarks",
    "/flashcards",
    "/glossary",
    "/compare?a=AZ-900&b=AI-901",
    "/concepts",
    "/search?q=azure",
    "/certificates/AZ-900",
    "/api/plan/ics",
    "/api/me/export",
  ];
  if (attempt) learnerPages.push(`/practice/${attempt.id}/results`);
  for (const p of learnerPages) await run(p, learner, [200]);
  await run("/admin", learner, [200, 307], "/forbidden");

  console.log("-- admin");
  const admin = await signIn("admin@example.com", "Admin12345!");
  const adminPages = ["/admin", "/admin/certifications", "/admin/content", "/admin/questions", "/admin/labs", "/admin/reviews", "/admin/users", "/admin/audit", "/admin/jobs", "/admin/settings", "/admin/import-export", "/admin/analytics"];
  for (const p of adminPages) await run(p, admin);

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
