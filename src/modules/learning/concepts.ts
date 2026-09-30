import "server-only";
import { prisma } from "@/lib/db";
import { localizedField } from "@/i18n/translator";

export async function getConceptMap(locale: string, focusedSlug?: string) {
  const concepts = await prisma.concept.findMany({
    where: focusedSlug ? { OR: [{ slug: focusedSlug }, { links: { some: { concept: { slug: focusedSlug } } } }] } : {},
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: { links: { include: { certification: true, lesson: { include: { certification: true } } } } },
  });
  return concepts.map((concept) => ({
    id: concept.id,
    slug: concept.slug,
    title: localizedField(concept.title, concept.translations, locale, "title"),
    description: localizedField(concept.description, concept.translations, locale, "description"),
    links: concept.links.map((link) => ({
      note: link.note,
      certification: { code: link.certification.code, name: localizedField(link.certification.name, link.certification.translations, locale, "name") },
      lesson: link.lesson ? { title: link.lesson.title, href: `/learn/${link.lesson.certification.code}/${link.lesson.slug}` } : null,
    })),
  }));
}
