/**
 * Loads a course package from a directory of JSON files (Node.js only).
 *
 * Directory layout (prisma/seed-data/courses/<code>/):
 *   course.json                 -> package header and domains (modules may be empty)
 *   modules-<domainKey>.json    -> { "domainKey": "...", "modules": [ ... ] }
 *   practice-questions*.json    -> { "questions": [ ... ] }
 *   glossary*.json              -> { "terms": [ ... ] }
 *   labs*.json                  -> { "labs": [ ... ] }
 */
import fs from "node:fs";
import path from "node:path";

type Json = Record<string, unknown>;

export class CourseDirectoryError extends Error {}

function readJson(file: string): Json {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(raw) as Json;
  } catch (error) {
    throw new CourseDirectoryError(`Invalid JSON in ${path.basename(file)}: ${(error as Error).message}`);
  }
}

export function loadCourseDirectory(dir: string, options: { only?: string } = {}): unknown {
  const coursePath = path.join(dir, "course.json");
  if (!fs.existsSync(coursePath)) throw new CourseDirectoryError(`Missing course.json in ${dir}`);
  const course = readJson(coursePath);
  const domains = (course.domains as Json[] | undefined) ?? [];
  const practiceQuestions: unknown[] = [...((course.practiceQuestions as unknown[]) ?? [])];
  const glossary: unknown[] = [...((course.glossary as unknown[]) ?? [])];
  const labs: unknown[] = [...((course.labs as unknown[]) ?? [])];

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "course.json")
    .filter((f) => !options.only || path.basename(options.only) === f)
    .sort();

  for (const file of files) {
    const data = readJson(path.join(dir, file));
    if (file.startsWith("modules-")) {
      const domainKey = data.domainKey as string | undefined;
      const domain = domains.find((d) => d.key === domainKey);
      if (!domain) throw new CourseDirectoryError(`${file}: domainKey "${String(domainKey)}" is not declared in course.json`);
      domain.modules = [...((domain.modules as unknown[]) ?? []), ...((data.modules as unknown[]) ?? [])];
    } else if (file.startsWith("practice-questions")) {
      practiceQuestions.push(...((data.questions as unknown[]) ?? []));
    } else if (file.startsWith("glossary")) {
      glossary.push(...((data.terms as unknown[]) ?? []));
    } else if (file.startsWith("labs")) {
      labs.push(...((data.labs as unknown[]) ?? []));
    }
  }

  return { ...course, domains, practiceQuestions, glossary, labs };
}

export function listCourseDirectories(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, "course.json")))
    .map((d) => path.join(root, d.name))
    .sort();
}
