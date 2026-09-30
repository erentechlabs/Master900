import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, enforceRateLimit } from "@/lib/actions";
import { parseCsv } from "@/lib/utils";
import { audit } from "@/modules/admin/audit";
import { authorize } from "@/modules/auth/session";
import { validateCoursePackage } from "@/modules/content/package-schema";
import { importCoursePackage } from "@/modules/content/importer";

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

function csvToPackage(text: string) {
  const rows = parseCsv(text);
  const header = rows.shift() ?? [];
  const idx = (name: string) => header.indexOf(name);
  const first = rows[0] ?? [];
  const code = first[idx("certification")] || "IMPORT";
  const domain = first[idx("domain")] || "imported";
  return {
    schemaVersion: 1,
    certificationCode: code,
    contentVersionLabel: `csv-${new Date().toISOString().slice(0, 10)}`,
    sourceLocale: "en",
    isDemo: false,
    certification: {
      code,
      name: code,
      description: "Imported question package",
      status: "ACTIVE",
      estimatedStudyHours: { min: 0, max: 0 },
      recommendedPrerequisites: [],
      icon: "GraduationCap",
      themeColor: "#2563eb",
      unverifiedFields: ["import"],
      relatedCodes: [],
      domains: [{ key: domain, title: domain, weightMin: 0, weightMax: 100, objectives: [{ code: first[idx("objective")] || "1.1", title: first[idx("objective")] || "Imported" }] }],
    },
    domains: [{ key: domain, title: domain, weightMin: 0, weightMax: 100, objectives: [{ code: first[idx("objective")] || "1.1", title: first[idx("objective")] || "Imported" }], modules: [] }],
    practiceQuestions: rows.map((r, i) => ({
      ref: `${code.toLowerCase()}-csv-${i + 1}`,
      type: (r[idx("type")] || "SINGLE_CHOICE") as "SINGLE_CHOICE",
      domainKey: r[idx("domain")] || domain,
      objectiveCode: r[idx("objective")] || "1.1",
      difficulty: (r[idx("difficulty")] || "MEDIUM") as "MEDIUM",
      stem: r[idx("stem")] || "",
      explanation: r[idx("explanation")] || "",
      options: ["a", "b", "c", "d", "e"].map((letter) => ({ key: letter.toUpperCase(), text: r[idx(`option_${letter}`)] || "", correct: (r[idx("correct")] || "").toUpperCase().split("|").includes(letter.toUpperCase()), explanation: r[idx(`explanation_${letter}`)] || r[idx("explanation")] || "" })).filter((o) => o.text),
      sources: [{ title: r[idx("source_title")] || "Microsoft Learn", url: r[idx("source_url")] || "https://learn.microsoft.com/" }],
    })),
    labs: [],
    glossary: [],
  };
}

export async function POST(req: NextRequest) {
  const actor = await authorize("content:import");
  enforceRateLimit("import", `${actor.id}:${await clientIp()}`);
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  const contentType = req.headers.get("content-type") ?? "";
  let raw: string;
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    raw = await file.text();
  } else {
    raw = await req.text();
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";
  const input = raw.trimStart().startsWith("{") ? JSON.parse(raw) : csvToPackage(raw);
  const validation = validateCoursePackage(input);
  if (!validation.ok) return NextResponse.json({ ok: false, errors: validation.issues }, { status: 400 });
  const report = await importCoursePackage(prisma, validation.pkg, { status: "DRAFT", authorType: "IMPORTED", actorId: actor.id, dryRun, now: new Date() });
  await audit({ id: actor.id, email: actor.email }, "content.import", { entityType: "IMPORT", summary: dryRun ? "Dry-run import" : "Imported content", metadata: report });
  return NextResponse.json({ ok: true, report });
}
