/**
 * Creates or updates certification records from configuration (seed, admin
 * import, admin editor). When the skills outline changes, a new
 * CertificationVersion is recorded, content aligned with changed domains is
 * flagged as outdated and a curriculum-change alert is raised.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CertificationConfigInput } from "@/modules/content/package-schema";

type Db = PrismaClient | Prisma.TransactionClient;
const j = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
const date = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);

export type OutlineDomain = { key: string; title: string; weightMin: number | null; weightMax: number | null; objectives: { code: string; title: string }[] };

export function outlineFromConfig(config: Pick<CertificationConfigInput, "domains">): OutlineDomain[] {
  return config.domains.map((d) => ({
    key: d.key,
    title: d.title,
    weightMin: d.weightMin,
    weightMax: d.weightMax,
    objectives: d.objectives.map((o) => ({ code: o.code, title: o.title })),
  }));
}

/** Domain keys whose outline differs (added, removed or changed). */
export function changedDomainKeys(previous: OutlineDomain[], next: OutlineDomain[]): string[] {
  const prev = new Map(previous.map((d) => [d.key, JSON.stringify(d)]));
  const nxt = new Map(next.map((d) => [d.key, JSON.stringify(d)]));
  const keys = new Set([...prev.keys(), ...nxt.keys()]);
  return [...keys].filter((k) => prev.get(k) !== nxt.get(k));
}

export type SyncResult = { id: string; created: boolean; outlineChanged: boolean; newVersion: number; flagged: number };

export async function syncCertificationConfig(
  db: Db,
  config: CertificationConfigInput,
  options: { actorId?: string | null; now?: Date; changeSummary?: string } = {},
): Promise<SyncResult> {
  const existing = await db.certification.findUnique({ where: { code: config.code } });
  const base = {
    name: config.name,
    description: config.description,
    audience: config.audience ?? null,
    status: config.status,
    examVersion: config.examVersion,
    officialUrl: config.officialUrl,
    studyGuideUrl: config.studyGuideUrl,
    lastCurriculumReviewAt: date(config.lastCurriculumReviewAt),
    retirementDate: date(config.retirementDate),
    estimatedStudyHoursMin: config.estimatedStudyHours?.min ?? null,
    estimatedStudyHoursMax: config.estimatedStudyHours?.max ?? null,
    recommendedPrerequisites: config.recommendedPrerequisites,
    icon: config.icon,
    themeColor: config.themeColor,
    unverifiedFields: config.unverifiedFields,
    verificationNotes: config.verificationNotes ?? null,
    translations: config.translations ? j(config.translations) : undefined,
    ...(config.sortOrder !== undefined ? { sortOrder: config.sortOrder } : {}),
  };
  const cert = existing
    ? await db.certification.update({ where: { id: existing.id }, data: base })
    : await db.certification.create({ data: { ...base, code: config.code, slug: config.code.toLowerCase() } });

  // Domains & objectives (never delete domains that still have content; mark removed ones by keeping them).
  for (const [i, d] of config.domains.entries()) {
    const domain = await db.examDomain.upsert({
      where: { certificationId_key: { certificationId: cert.id, key: d.key } },
      create: { certificationId: cert.id, key: d.key, title: d.title, description: d.description ?? null, weightMin: d.weightMin, weightMax: d.weightMax, sortOrder: i, translations: d.translations ? j(d.translations) : undefined },
      update: { title: d.title, weightMin: d.weightMin, weightMax: d.weightMax, sortOrder: i, ...(d.description !== undefined ? { description: d.description } : {}), ...(d.translations ? { translations: j(d.translations) } : {}) },
    });
    for (const [oi, o] of d.objectives.entries()) {
      await db.examObjective.upsert({
        where: { domainId_code: { domainId: domain.id, code: o.code } },
        create: { domainId: domain.id, code: o.code, title: o.title, sortOrder: oi, translations: o.translations ? j(o.translations) : undefined },
        update: { title: o.title, sortOrder: oi, ...(o.translations ? { translations: j(o.translations) } : {}) },
      });
    }
  }

  // Outline versioning.
  const outline = outlineFromConfig(config);
  const latest = await db.certificationVersion.findFirst({ where: { certificationId: cert.id }, orderBy: { version: "desc" } });
  let outlineChanged = false;
  let flagged = 0;
  let version = latest?.version ?? 0;
  const previous = (latest?.skillsOutline as OutlineDomain[] | null) ?? null;
  if (!latest || JSON.stringify(previous) !== JSON.stringify(outline)) {
    version = (latest?.version ?? 0) + 1;
    await db.certificationVersion.create({
      data: {
        certificationId: cert.id,
        version,
        label: config.examVersion ?? `Outline v${version}`,
        skillsOutline: j(outline),
        sourceUrl: config.studyGuideUrl,
        changeSummary: options.changeSummary ?? (latest ? "Skills outline updated" : "Initial outline"),
        createdById: options.actorId ?? null,
      },
    });
    await db.certification.update({ where: { id: cert.id }, data: { currentVersion: version } });
    if (latest) {
      outlineChanged = true;
      const changed = changedDomainKeys(previous ?? [], outline);
      const domains = await db.examDomain.findMany({ where: { certificationId: cert.id, key: { in: changed } }, select: { id: true } });
      const domainIds = domains.map((d) => d.id);
      if (domainIds.length) {
        const lessons = await db.lesson.updateMany({
          where: { certificationId: cert.id, domainId: { in: domainIds }, status: "PUBLISHED" },
          data: { status: "OUTDATED", needsVerification: true, verificationNote: "The official skills outline changed. Review this lesson against the new outline." },
        });
        const questions = await db.question.updateMany({
          where: { certificationId: cert.id, domainId: { in: domainIds }, status: "PUBLISHED" },
          data: { status: "OUTDATED", needsVerification: true },
        });
        await db.module.updateMany({ where: { certificationId: cert.id, domainId: { in: domainIds }, status: "PUBLISHED" }, data: { status: "OUTDATED" } });
        flagged = lessons.count + questions.count;
      }
      await db.curriculumAlert.create({
        data: {
          certificationId: cert.id,
          fromVersion: latest.version,
          toVersion: version,
          message: changed.length ? `Changed domains: ${changed.join(", ")}` : "Outline metadata changed",
          affectedCount: flagged,
        },
      });
    }
  }
  return { id: cert.id, created: !existing, outlineChanged, newVersion: version, flagged };
}

/** Link related certifications and replacements after all records exist. */
export async function syncCertificationRelations(db: Db, configs: Pick<CertificationConfigInput, "code" | "relatedCodes" | "replacementCode">[]) {
  const all = await db.certification.findMany({ select: { id: true, code: true } });
  const ids = new Map(all.map((c) => [c.code, c.id]));
  for (const c of configs) {
    const fromId = ids.get(c.code);
    if (!fromId) continue;
    await db.certificationRelation.deleteMany({ where: { fromId, kind: "related" } });
    for (const code of c.relatedCodes) {
      const toId = ids.get(code);
      if (toId && toId !== fromId) {
        await db.certificationRelation.create({ data: { fromId, toId, kind: "related" } });
      }
    }
    await db.certification.update({ where: { id: fromId }, data: { replacementId: c.replacementCode ? ids.get(c.replacementCode) ?? null : null } });
  }
}
