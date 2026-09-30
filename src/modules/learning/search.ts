import "server-only";
import { prisma } from "@/lib/db";
import { localizedField } from "@/i18n/translator";
import { learnerVisibleWhere } from "@/modules/content/workflow";

import { buildSnippet, clampSearchQuery } from "@/modules/learning/search-utils";
export { buildSnippet, clampSearchQuery, highlightSegments } from "@/modules/learning/search-utils";

function blockText(data: unknown): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(blockText).join(" ");
  if (data && typeof data === "object") return Object.values(data).map(blockText).join(" ");
  return "";
}

export async function globalSearch(locale: string, query: string) {
  const q = clampSearchQuery(query);
  if (q.length < 2) return { query: q, tooShort: true, groups: [] as SearchGroup[] };
  const [certifications, lessons, glossary, labs, concepts] = await Promise.all([
    prisma.certification.findMany({ where: { isVisible: true, OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }, take: 8 }),
    prisma.lesson.findMany({ where: { AND: [learnerVisibleWhere()], OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { blocks: { some: {} } }] }, include: { certification: true, blocks: true }, take: 40 }),
    prisma.glossaryTerm.findMany({ where: { AND: [{ status: { in: ["PUBLISHED", "OUTDATED"] } }], OR: [{ term: { contains: q, mode: "insensitive" } }, { definition: { contains: q, mode: "insensitive" } }] }, take: 8 }),
    prisma.lab.findMany({ where: { AND: [learnerVisibleWhere()], OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { scenario: { contains: q, mode: "insensitive" } }] }, take: 8 }),
    prisma.concept.findMany({ where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }, take: 8 }),
  ]);
  const lessonResults = lessons
    .map((lesson) => {
      const text = [lesson.title, lesson.summary ?? "", ...lesson.blocks.map((block) => blockText(block.data))].join(" ");
      return { lesson, text };
    })
    .filter(({ text }) => text.toLocaleLowerCase().includes(q.toLocaleLowerCase()))
    .slice(0, 8);
  const groups: SearchGroup[] = [
    {
      key: "certifications",
      items: certifications.map((cert) => ({ id: cert.id, title: `${cert.code}: ${localizedField(cert.name, cert.translations, locale, "name")}`, href: `/certifications/${cert.code}`, snippet: buildSnippet(localizedField(cert.description, cert.translations, locale, "description"), q), type: "Certification" })),
    },
    {
      key: "lessons",
      items: lessonResults.map(({ lesson, text }) => ({ id: lesson.id, title: lesson.title, href: `/learn/${lesson.certification.code}/${lesson.slug}`, snippet: buildSnippet(text, q), type: "Lesson" })),
    },
    {
      key: "glossary",
      items: glossary.map((term) => ({ id: term.id, title: localizedField(term.term, term.translations, locale, "term"), href: `/glossary#${term.slug}`, snippet: buildSnippet(localizedField(term.definition, term.translations, locale, "definition"), q), type: term.kind })),
    },
    {
      key: "labs",
      items: labs.map((lab) => ({ id: lab.id, title: localizedField(lab.title, lab.translations, locale, "title"), href: `/labs/${lab.id}`, snippet: buildSnippet(localizedField(lab.summary, lab.translations, locale, "summary"), q), type: "Lab" })),
    },
    {
      key: "concepts",
      items: concepts.map((concept) => ({ id: concept.id, title: localizedField(concept.title, concept.translations, locale, "title"), href: `/concepts?concept=${concept.slug}`, snippet: buildSnippet(localizedField(concept.description, concept.translations, locale, "description"), q), type: "Concept" })),
    },
  ];
  return { query: q, tooShort: false, groups: groups.filter((group) => group.items.length > 0) };
}

export type SearchItem = { id: string; title: string; href: string; snippet: string; type: string };
export type SearchGroup = { key: "certifications" | "lessons" | "glossary" | "labs" | "concepts"; items: SearchItem[] };

