import "server-only";
import { prisma } from "@/lib/db";
import { localizedField, type MessageKey } from "@/i18n/translator";
import { learnerVisibleWhere } from "@/modules/content/workflow";
import { clampSearchQuery } from "@/modules/learning/search-utils";
import { rankSuggestions, type SuggestionInput } from "@/modules/learning/search-suggest-utils";

export type SearchSuggestionGroupKey = "goTo" | "lessons" | "labs" | "glossary" | "certifications";
export type SearchSuggestion = SuggestionInput & { group: SearchSuggestionGroupKey; description?: string };
export type SearchSuggestionGroup = { key: SearchSuggestionGroupKey; items: SearchSuggestion[] };

export function commandSuggestions(t: (key: MessageKey) => string): SearchSuggestion[] {
  return [
    { id: "dashboard", title: t("nav.dashboard"), href: "/dashboard", group: "goTo", keywords: ["home", "overview"] },
    { id: "learn", title: t("nav.learn"), href: "/learn", group: "goTo", keywords: ["lessons", "course"] },
    { id: "labs", title: t("nav.labs"), href: "/labs", group: "goTo", keywords: ["hands on", "practice"] },
    { id: "practice", title: t("nav.practice"), href: "/practice", group: "goTo", keywords: ["quiz", "exam"] },
    { id: "settings", title: t("nav.settings"), href: "/settings", group: "goTo", keywords: ["preferences", "personalization"] },
    { id: "lightning", title: t("shell.startLightningRound"), href: "/practice?mode=LIGHTNING", group: "goTo", keywords: ["quick", "lightning", "round"] },
  ];
}

export async function suggestSearch(locale: string, query: string, t: (key: MessageKey) => string): Promise<{ query: string; groups: SearchSuggestionGroup[] }> {
  const q = clampSearchQuery(query);
  const visible = learnerVisibleWhere();
  const commands = q ? rankSuggestions(q, commandSuggestions(t), 5) : commandSuggestions(t).slice(0, 5);
  const [lessons, labs, glossary, certs] = q.length < 2
    ? [[], [], [], []] as const
    : await Promise.all([
        prisma.lesson.findMany({ where: { AND: [visible], OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }] }, include: { certification: { select: { code: true } } }, take: 6 }),
        prisma.lab.findMany({ where: { AND: [visible], OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { scenario: { contains: q, mode: "insensitive" } }] }, take: 6 }),
        prisma.glossaryTerm.findMany({ where: { status: { in: ["PUBLISHED", "OUTDATED"] }, OR: [{ term: { contains: q, mode: "insensitive" } }, { definition: { contains: q, mode: "insensitive" } }] }, take: 6 }),
        prisma.certification.findMany({ where: { isVisible: true, OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }, take: 6 }),
      ]);
  const groups: SearchSuggestionGroup[] = [
    { key: "goTo", items: commands },
    { key: "lessons", items: lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, href: `/learn/${lesson.certification.code}/${lesson.slug}`, group: "lessons", description: lesson.summary ?? undefined })) },
    { key: "labs", items: labs.map((lab) => ({ id: lab.id, title: localizedField(lab.title, lab.translations, locale, "title"), href: `/labs/${lab.id}`, group: "labs", description: localizedField(lab.summary, lab.translations, locale, "summary") ?? undefined })) },
    { key: "glossary", items: glossary.map((term) => ({ id: term.id, title: localizedField(term.term, term.translations, locale, "term"), href: `/glossary#${term.slug}`, group: "glossary", description: localizedField(term.definition, term.translations, locale, "definition") })) },
    { key: "certifications", items: certs.map((cert) => ({ id: cert.id, title: `${cert.code}: ${localizedField(cert.name, cert.translations, locale, "name")}`, href: `/certifications/${cert.code}`, group: "certifications", description: localizedField(cert.description, cert.translations, locale, "description") })) },
  ];
  return { query: q, groups: groups.filter((group) => group.items.length > 0) };
}
