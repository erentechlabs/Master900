import "server-only";
import { prisma } from "@/lib/db";
import { localizedField } from "@/i18n/translator";
import { learnerVisibleWhere } from "@/modules/content/workflow";

export type CatalogDomain = { id: string; key: string; title: string; weightMin: number | null; weightMax: number | null; objectives: { code: string; title: string }[] };

export type CatalogCert = {
  id: string;
  code: string;
  name: string;
  description: string;
  audience: string | null;
  status: "ACTIVE" | "ANNOUNCED" | "RETIRING" | "RETIRED";
  examVersion: string | null;
  officialUrl: string | null;
  studyGuideUrl: string | null;
  lastCurriculumReviewAt: Date | null;
  retirementDate: Date | null;
  effort: { min: number; max: number } | null;
  prerequisites: string[];
  icon: string;
  themeColor: string;
  hasLearningPath: boolean;
  unverifiedFields: string[];
  verificationNotes: string | null;
  replacementCode: string | null;
  replacesCodes: string[];
  domains: CatalogDomain[];
  counts: { modules: number; lessons: number; questions: number; labs: number };
  isDemoContent: boolean;
};

type CertRow = Awaited<ReturnType<typeof loadCerts>>[number];

async function loadCerts(where: { code?: string } = {}) {
  return prisma.certification.findMany({
    where: { isVisible: true, ...where },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: {
      replacement: { select: { code: true } },
      replaces: { select: { code: true } },
      domains: { orderBy: { sortOrder: "asc" }, include: { objectives: { orderBy: { sortOrder: "asc" } } } },
    },
  });
}

async function contentCounts(ids: string[]) {
  const visible = learnerVisibleWhere();
  const [modules, lessons, questions, labs, demo] = await Promise.all([
    prisma.module.groupBy({ by: ["certificationId"], where: { certificationId: { in: ids }, ...visible }, _count: { _all: true } }),
    prisma.lesson.groupBy({ by: ["certificationId"], where: { certificationId: { in: ids }, ...visible }, _count: { _all: true } }),
    prisma.question.groupBy({ by: ["certificationId"], where: { certificationId: { in: ids }, ...visible }, _count: { _all: true } }),
    prisma.lab.groupBy({ by: ["certificationId"], where: { certificationId: { in: ids }, ...visible }, _count: { _all: true } }),
    prisma.lesson.groupBy({ by: ["certificationId"], where: { certificationId: { in: ids }, isDemo: true }, _count: { _all: true } }),
  ]);
  const map = (rows: { certificationId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.certificationId, r._count._all]));
  return { modules: map(modules), lessons: map(lessons), questions: map(questions), labs: map(labs), demo: map(demo) };
}

function localize(c: CertRow, locale: string, counts: Awaited<ReturnType<typeof contentCounts>>): CatalogCert {
  return {
    id: c.id,
    code: c.code,
    name: localizedField(c.name, c.translations, locale, "name"),
    description: localizedField(c.description, c.translations, locale, "description"),
    audience: c.audience ? localizedField(c.audience, c.translations, locale, "audience") : null,
    status: c.status,
    examVersion: c.examVersion,
    officialUrl: c.officialUrl,
    studyGuideUrl: c.studyGuideUrl,
    lastCurriculumReviewAt: c.lastCurriculumReviewAt,
    retirementDate: c.retirementDate,
    effort: c.estimatedStudyHoursMin && c.estimatedStudyHoursMax ? { min: c.estimatedStudyHoursMin, max: c.estimatedStudyHoursMax } : null,
    prerequisites: c.recommendedPrerequisites,
    icon: c.icon,
    themeColor: c.themeColor,
    hasLearningPath: c.hasLearningPath && (counts.lessons.get(c.id) ?? 0) > 0,
    unverifiedFields: c.unverifiedFields,
    verificationNotes: c.verificationNotes,
    replacementCode: c.replacement?.code ?? null,
    replacesCodes: c.replaces.map((r) => r.code),
    domains: c.domains.map((d) => ({
      id: d.id,
      key: d.key,
      title: localizedField(d.title, d.translations, locale, "title"),
      weightMin: d.weightMin,
      weightMax: d.weightMax,
      objectives: d.objectives.map((o) => ({ code: o.code, title: localizedField(o.title, o.translations, locale, "title") })),
    })),
    counts: {
      modules: counts.modules.get(c.id) ?? 0,
      lessons: counts.lessons.get(c.id) ?? 0,
      questions: counts.questions.get(c.id) ?? 0,
      labs: counts.labs.get(c.id) ?? 0,
    },
    isDemoContent: (counts.demo.get(c.id) ?? 0) > 0,
  };
}

export async function listCatalog(locale: string): Promise<CatalogCert[]> {
  const certs = await loadCerts();
  const counts = await contentCounts(certs.map((c) => c.id));
  return certs.map((c) => localize(c, locale, counts));
}

export async function getCatalogCert(code: string, locale: string): Promise<CatalogCert | null> {
  const certs = await loadCerts({ code: code.toUpperCase() });
  if (!certs[0]) return null;
  const counts = await contentCounts([certs[0].id]);
  return localize(certs[0], locale, counts);
}

export async function getCertificationExtras(certificationId: string, locale: string) {
  const visible = learnerVisibleWhere();
  const [modules, related, concepts, sources] = await Promise.all([
    prisma.module.findMany({
      where: { certificationId, ...visible },
      orderBy: [{ domain: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: { id: true, slug: true, title: true, summary: true, translations: true, domainId: true, estimatedMinutes: true, _count: { select: { lessons: { where: visible } } } },
    }),
    prisma.certificationRelation.findMany({ where: { fromId: certificationId }, include: { to: { select: { code: true, name: true, translations: true, status: true, icon: true, themeColor: true } } } }),
    prisma.conceptLink.findMany({ where: { certificationId }, include: { concept: { include: { links: { include: { certification: { select: { code: true } } } } } } } }),
    prisma.officialSource.findMany({ where: { certificationId, kind: { in: ["CERTIFICATION_PAGE", "STUDY_GUIDE", "EXAM_PAGE"] } }, take: 5 }),
  ]);
  return {
    modules: modules.map((m) => ({
      ...m,
      title: localizedField(m.title, m.translations, locale, "title"),
      summary: m.summary ? localizedField(m.summary, m.translations, locale, "summary") : null,
      lessonCount: m._count.lessons,
    })),
    related: related.map((r) => ({ code: r.to.code, name: localizedField(r.to.name, r.to.translations, locale, "name"), status: r.to.status, icon: r.to.icon, themeColor: r.to.themeColor })),
    concepts: concepts.map((c) => ({
      slug: c.concept.slug,
      title: localizedField(c.concept.title, c.concept.translations, locale, "title"),
      note: c.note,
      codes: c.concept.links.map((l) => l.certification.code).filter((code, i, arr) => arr.indexOf(code) === i),
    })),
    sources,
  };
}
