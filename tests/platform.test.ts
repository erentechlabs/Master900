import { describe, expect, it } from "vitest";
import path from "node:path";
import { en } from "@/i18n/messages/en";
import { tr } from "@/i18n/messages/tr";
import { getMessages } from "@/i18n/messages";
import { matchLocale } from "@/i18n/config";
import { createTranslator, interpolate, listKeys, localizedField, mergeMessages, resolveMessage } from "@/i18n/translator";
import { loadCourseDirectory, listCourseDirectories } from "@/modules/content/package-loader";
import { validateCoursePackage } from "@/modules/content/package-schema";
import { csvCell, parseCsv, readableTextColor, slugify, toCsv } from "@/lib/utils";
import { currentStreak, longestStreak, toISODate } from "@/lib/dates";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { diffLines } from "@/modules/content/diff";

describe("i18n", () => {
  const enKeys = listKeys(en);
  const trKeys = listKeys(tr);

  it("has no empty English strings", () => {
    for (const key of enKeys) expect(resolveMessage(en, key)?.trim(), key).toBeTruthy();
  });

  it("Turkish contains no unknown keys and keeps placeholders", () => {
    const enSet = new Set(enKeys);
    for (const key of trKeys) {
      expect(enSet.has(key), key).toBe(true);
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(vars(resolveMessage(tr, key)!), key).toEqual(vars(resolveMessage(en, key)!));
    }
  });

  it("Turkish translation is complete", () => {
    const trSet = new Set(trKeys);
    const missing = enKeys.filter((k) => !trSet.has(k));
    expect(missing).toEqual([]);
  });

  it("falls back to English and interpolates variables", () => {
    const merged = mergeMessages(en, { common: { save: "Kaydet" } });
    const t = createTranslator(merged);
    expect(t("common.save")).toBe("Kaydet");
    expect(t("common.cancel")).toBe(en.common.cancel);
    expect(t("common.minutes", { count: 5 })).toBe("5 min");
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
    expect(getMessages("tr").common.appName).toBeTruthy();
  });

  it("negotiates locales from Accept-Language", () => {
    expect(matchLocale("tr-TR,tr;q=0.9,en;q=0.8")).toBe("tr");
    expect(matchLocale("de-DE,de;q=0.9,en;q=0.5")).toBe("en");
    expect(matchLocale("de-DE")).toBe("en");
    expect(matchLocale(null)).toBe("en");
  });

  it("picks translated content fields with fallback", () => {
    expect(localizedField("Title", { tr: { title: "Başlık" } }, "tr", "title")).toBe("Başlık");
    expect(localizedField("Title", { tr: { title: "" } }, "tr", "title")).toBe("Title");
    expect(localizedField("Title", null, "tr", "title")).toBe("Title");
  });
});

describe("course packages", () => {
  const root = path.resolve(__dirname, "..");

  it("validates the documented example package", () => {
    const result = validateCoursePackage(loadCourseDirectory(path.join(root, "tests/fixtures/course-example")), { strictReferences: true });
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("validates every seeded course strictly", () => {
    const dirs = listCourseDirectories(path.join(root, "prisma/seed-data/courses"));
    expect(dirs.length).toBeGreaterThanOrEqual(2);
    for (const dir of dirs) {
      const result = validateCoursePackage(loadCourseDirectory(dir), { strictReferences: true });
      expect(result.issues.filter((i) => i.severity === "error"), dir).toEqual([]);
    }
  });

  it("detects semantic errors", () => {
    const pkg = loadCourseDirectory(path.join(root, "tests/fixtures/course-example")) as {
      domains: { modules: { lessons: { knowledgeCheck: Record<string, unknown>[] }[] }[] }[];
      practiceQuestions: Record<string, unknown>[];
    };
    const broken = structuredClone(pkg);
    const kc = broken.domains[0]!.modules[0]!.lessons[0]!.knowledgeCheck;
    (kc[0]!.options as { correct: boolean }[])[1]!.correct = true; // two correct answers in SINGLE_CHOICE
    kc[1]!.ref = kc[0]!.ref as string; // duplicate ref
    (kc[4]!.ordering as { correctOrder: string[] }).correctOrder = ["s1", "s1", "s3"];
    broken.practiceQuestions[0]!.domainKey = "no-such-domain";
    const result = validateCoursePackage(broken);
    expect(result.ok).toBe(false);
    const messages = result.issues.map((i) => i.message).join("\n");
    expect(messages).toMatch(/exactly one correct option/);
    expect(messages).toMatch(/Duplicate question ref/);
    expect(messages).toMatch(/permutation/);
    expect(messages).toMatch(/Unknown domain/);
  });
});

describe("utilities", () => {
  it("escapes CSV cells and prevents formula injection", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    const text = toCsv([["a", "b,c"], ["line\nbreak", "=x"]]);
    expect(parseCsv(text)).toEqual([["a", "b,c"], ["line\nbreak", "'=x"]]);
  });

  it("chooses readable text colors", () => {
    expect(readableTextColor("#ffffff")).toBe("#0f172a");
    expect(readableTextColor("#1e3a8a")).toBe("#ffffff");
  });

  it("slugifies Turkish text", () => {
    expect(slugify("Bulut Bilişim Temelleri")).toBe("bulut-bilisim-temelleri");
  });

  it("computes streaks and time-zone aware dates", () => {
    const days = new Set(["2026-09-28", "2026-09-29", "2026-09-30", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"]);
    expect(currentStreak(days, "2026-09-30")).toBe(3);
    expect(currentStreak(days, "2026-10-01")).toBe(3);
    expect(currentStreak(days, "2026-10-02")).toBe(0);
    expect(longestStreak(days)).toBe(4);
    expect(toISODate(new Date("2026-09-30T22:30:00Z"), "Europe/Istanbul")).toBe("2026-10-01");
    expect(toISODate(new Date("2026-09-30T22:30:00Z"), "Invalid/Zone")).toBe("2026-09-30");
  });

  it("rate limits within a sliding window", () => {
    resetRateLimits();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t0 + i).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, t0 + 10).ok).toBe(false);
    expect(rateLimit("k", 3, 1000, t0 + 1500).ok).toBe(true);
  });

  it("diffs revisions line by line", () => {
    expect(diffLines("a\nb\nc", "a\nc\nd")).toEqual([
      { type: "equal", text: "a" },
      { type: "remove", text: "b" },
      { type: "equal", text: "c" },
      { type: "add", text: "d" },
    ]);
  });
});
