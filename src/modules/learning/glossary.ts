import "server-only";
import { prisma } from "@/lib/db";
import { localizedField } from "@/i18n/translator";

export async function getGlossary(locale: string, filters: { q?: string; certificationId?: string; kind?: "TERM" | "SERVICE" | "CONCEPT" }) {
  const q = filters.q?.trim();
  const terms = await prisma.glossaryTerm.findMany({
    where: {
      AND: [
        { status: { in: ["PUBLISHED", "OUTDATED"] } },
        q ? { OR: [{ term: { contains: q, mode: "insensitive" } }, { definition: { contains: q, mode: "insensitive" } }] } : {},
        filters.kind ? { kind: filters.kind } : {},
        filters.certificationId ? { certifications: { some: { certificationId: filters.certificationId } } } : {},
      ],
    },
    include: { certifications: { include: { certification: true } }, source: true },
    orderBy: { term: "asc" },
  });
  const concepts = await prisma.concept.findMany({ include: { links: { include: { lesson: { include: { certification: true } } } } } });
  const conceptBySlug = new Map(concepts.map((concept) => [concept.slug, concept]));
  return terms.map((term) => {
    const concept = conceptBySlug.get(term.slug);
    return {
      id: term.id,
      slug: term.slug,
      term: localizedField(term.term, term.translations, locale, "term"),
      definition: localizedField(term.definition, term.translations, locale, "definition"),
      kind: term.kind,
      source: term.source,
      certifications: term.certifications.map((item) => ({ id: item.certification.id, code: item.certification.code, name: localizedField(item.certification.name, item.certification.translations, locale, "name") })),
      lessons: concept?.links.flatMap((link) => (link.lesson ? [{ id: link.lesson.id, title: link.lesson.title, href: `/learn/${link.lesson.certification.code}/${link.lesson.slug}` }] : [])) ?? [],
    };
  });
}

export async function glossaryFilters(locale: string) {
  const certs = await prisma.certification.findMany({ where: { isVisible: true }, orderBy: { sortOrder: "asc" } });
  return certs.map((cert) => ({ id: cert.id, code: cert.code, name: localizedField(cert.name, cert.translations, locale, "name") }));
}
