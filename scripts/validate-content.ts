/**
 * Validate course packages.
 *
 * Usage:
 *   npm run content:validate                                   # all courses under prisma/seed-data/courses
 *   npm run content:validate -- prisma/seed-data/courses/az-900  # one course directory
 *   npm run content:validate -- prisma/seed-data/courses/az-900 --only modules-cloud-concepts.json
 *   npm run content:validate -- --strict                       # unresolved references become errors
 *   npm run content:validate -- path/to/package.json           # a single merged package file
 */
import fs from "node:fs";
import path from "node:path";
import { listCourseDirectories, loadCourseDirectory } from "../src/modules/content/package-loader";
import { iterateQuestions, validateCoursePackage } from "../src/modules/content/package-schema";
import { findNearDuplicateTexts, findRepeatedLessonContent, findRepeatedQuestionContent, nearDuplicateEntries } from "../src/modules/content/quality";
import { validateLabConfig, type LabTypeValue } from "../src/modules/labs/engine/schemas";
import { labRuleSchema } from "../src/modules/labs/engine/rules";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;
const targets = args.filter((a, i) => !a.startsWith("--") && !(onlyIndex >= 0 && i === onlyIndex + 1));

const root = path.resolve(process.cwd(), "prisma/seed-data/courses");
const inputs = targets.length > 0 ? targets.map((t) => path.resolve(process.cwd(), t)) : listCourseDirectories(root);

let failed = false;
for (const input of inputs) {
  let data: unknown;
  try {
    data = fs.statSync(input).isDirectory()
      ? loadCourseDirectory(input, { only })
      : JSON.parse(fs.readFileSync(input, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    console.error(`\u2716 ${input}: ${(error as Error).message}`);
    failed = true;
    continue;
  }

  const result = validateCoursePackage(data, { strictReferences: strict });
  const label = `${path.basename(input)}${only ? ` (only ${only})` : ""}`;
  for (const issue of result.issues) {
    const tag = issue.severity === "error" ? "ERROR" : "warn ";
    console.log(`  ${tag} ${issue.path}: ${issue.message}`);
  }
  if (!result.ok) {
    const count = result.issues.filter((i) => i.severity === "error").length;
    console.error(`\u2716 ${label}: ${count} error(s)`);
    failed = true;
    continue;
  }

  const pkg = result.pkg;
  let labErrors = 0;
  for (const lab of pkg.labs) {
    const v = validateLabConfig(lab.type as LabTypeValue, lab.config);
    if (!v.ok) {
      labErrors += v.errors.length;
      for (const e of v.errors) console.log(`  ERROR labs.${lab.slug}.config: ${e}`);
    }
    for (const rule of [...lab.steps.flatMap((s) => s.rules), ...lab.finalRules]) {
      if (!labRuleSchema.safeParse(rule.rule).success) {
        labErrors += 1;
        console.log(`  ERROR labs.${lab.slug}.rules.${rule.key}: invalid rule`);
      }
    }
  }
  if (labErrors) {
    console.error(`\u2716 ${label}: ${labErrors} lab error(s)`);
    failed = true;
    continue;
  }
  const lessons = pkg.domains.flatMap((d) => d.modules.flatMap((m) => m.lessons));
  const byType = new Map<string, number>();
  const byDomain = new Map<string, number>();
  let total = 0;
  for (const { q } of iterateQuestions(pkg)) {
    total += 1;
    byType.set(q.type, (byType.get(q.type) ?? 0) + 1);
    byDomain.set(q.domainKey, (byDomain.get(q.domainKey) ?? 0) + 1);
  }
  const translatedLessons = lessons.filter((l) => l.translations?.tr).length;
  const quality = [
    ...findRepeatedLessonContent(lessons),
    ...findRepeatedQuestionContent([...iterateQuestions(pkg)].map(({ q }) => q)),
    ...findNearDuplicateTexts(nearDuplicateEntries(lessons, [...iterateQuestions(pkg)].map(({ q }) => q))),
  ];
  console.log(`\u2714 ${label} (${pkg.certificationCode})`);
  for (const issue of quality) console.log(`  warn  quality.${issue.field}: repeated in ${issue.lessons.join(", ")} - "${issue.sample}"`);
  console.log(
    `  lessons=${lessons.length} (tr=${translatedLessons}) questions=${total} glossary=${pkg.glossary.length} labs=${pkg.labs.length}${quality.length ? ` quality-warnings=${quality.length}` : ""}`,
  );
  console.log(`  by domain: ${[...byDomain].map(([k, v]) => `${k}=${v}`).join(", ") || "-"}`);
  console.log(`  by type:   ${[...byType].map(([k, v]) => `${k}=${v}`).join(", ") || "-"}`);
}

process.exit(failed ? 1 : 0);
