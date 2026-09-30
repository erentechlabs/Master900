"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError, runAction } from "@/lib/actions";
import { slugify } from "@/lib/utils";
import { audit } from "@/modules/admin/audit";
import { authorize } from "@/modules/auth/session";
import { ROLE_KEYS, canAssignRoles } from "@/modules/auth/permissions";
import { passwordSchema } from "@/modules/auth/schemas";
import { syncCertificationConfig, syncCertificationRelations } from "@/modules/catalog/sync";
import { mapQuestionPayload } from "@/modules/content/importer";
import { certificationConfigSchema, questionSchema, checkQuestionSemantics } from "@/modules/content/package-schema";
import { validateLabConfig } from "@/modules/labs/engine/schemas";
import { labRuleSchema } from "@/modules/labs/engine/rules";
import { generateDraftQuestions } from "@/modules/admin/ai-drafts";
import { getSettings } from "@/modules/admin/settings";
import { SETTING_DEFAULTS } from "@/modules/admin/settings-defaults";
import { enqueueJob, processDueJobs } from "@/lib/jobs/queue";
import {
  bool,
  contentSnapshot,
  inputJson,
  initialLessonBlocks,
  intOrNull,
  labComplexities,
  labTypes,
  lines,
  optionalText,
  parseJson,
  simpleQuestionSchema,
  sourceSchema,
  text,
} from "@/modules/admin/cms";

const https = z.string().url().refine((v) => v.startsWith("https://"), "https_only").nullable();

export async function resolveCurriculumAlert(formData: FormData) {
  return runAction("admin.alert.resolve", async () => {
    const actor = await authorize("catalog:manage");
    const id = text(formData, "id");
    await prisma.curriculumAlert.update({ where: { id }, data: { resolvedAt: new Date(), resolvedById: actor.id } });
    await audit({ id: actor.id, email: actor.email }, "curriculumAlert.resolve", { entityType: "CURRICULUM_ALERT", entityId: id, summary: "Resolved curriculum alert" });
    revalidatePath("/admin");
  });
}

function certificationConfigFromForm(formData: FormData) {
  const code = text(formData, "code").toUpperCase();
  const domains = parseJson(text(formData, "domains"), []);
  return certificationConfigSchema.parse({
    code,
    name: text(formData, "name"),
    description: text(formData, "description"),
    audience: optionalText(formData, "audience") ?? undefined,
    status: z.enum(["ACTIVE", "ANNOUNCED", "RETIRING", "RETIRED"]).parse(text(formData, "status")),
    examVersion: optionalText(formData, "examVersion"),
    officialUrl: https.parse(optionalText(formData, "officialUrl")),
    studyGuideUrl: https.parse(optionalText(formData, "studyGuideUrl")),
    lastCurriculumReviewAt: text(formData, "lastCurriculumReviewAt") || null,
    retirementDate: text(formData, "retirementDate") || null,
    estimatedStudyHours:
      intOrNull(formData, "estimatedStudyHoursMin") && intOrNull(formData, "estimatedStudyHoursMax")
        ? { min: intOrNull(formData, "estimatedStudyHoursMin") ?? 1, max: intOrNull(formData, "estimatedStudyHoursMax") ?? 1 }
        : null,
    recommendedPrerequisites: lines(text(formData, "recommendedPrerequisites")),
    relatedCodes: lines(text(formData, "relatedCodes")).map((v) => v.toUpperCase()),
    replacementCode: optionalText(formData, "replacementCode")?.toUpperCase(),
    icon: text(formData, "icon") || "GraduationCap",
    themeColor: text(formData, "themeColor") || "#2563eb",
    sortOrder: intOrNull(formData, "sortOrder") ?? 0,
    unverifiedFields: lines(text(formData, "unverifiedFields")),
    verificationNotes: optionalText(formData, "verificationNotes") ?? undefined,
    translations: text(formData, "trName") || text(formData, "trDescription") ? { tr: { name: text(formData, "trName"), description: text(formData, "trDescription"), status: "DRAFT" } } : undefined,
    domains,
  });
}

export async function saveCertification(formData: FormData) {
  return runAction("admin.certification.save", async () => {
    const actor = await authorize("catalog:manage");
    const id = optionalText(formData, "id");
    const config = certificationConfigFromForm(formData);
    const before = id ? await prisma.certification.findUnique({ where: { id } }) : null;
    const result = await prisma.$transaction(async (tx) => {
      const saved = await syncCertificationConfig(tx, config, { actorId: actor.id, changeSummary: optionalText(formData, "changeSummary") ?? undefined });
      await tx.certification.update({
        where: { id: saved.id },
        data: {
          isVisible: bool(formData, "isVisible"),
          hasLearningPath: bool(formData, "hasLearningPath"),
          replacementId: config.replacementCode ? (await tx.certification.findUnique({ where: { code: config.replacementCode }, select: { id: true } }))?.id ?? null : null,
        },
      });
      await syncCertificationRelations(tx, [config]);
      await audit({ id: actor.id, email: actor.email }, id ? "certification.update" : "certification.create", { entityType: "CERTIFICATION", entityId: saved.id, summary: `Saved ${config.code}`, before, after: config }, tx);
      return saved;
    });
    revalidatePath("/admin/certifications");
    return result;
  });
}

export async function moveCertification(formData: FormData) {
  return runAction("admin.certification.move", async () => {
    const actor = await authorize("catalog:manage");
    const id = text(formData, "id");
    const direction = text(formData, "direction") === "up" ? -1 : 1;
    const current = await prisma.certification.findUniqueOrThrow({ where: { id } });
    const other = await prisma.certification.findFirst({
      where: direction < 0 ? { sortOrder: { lt: current.sortOrder } } : { sortOrder: { gt: current.sortOrder } },
      orderBy: { sortOrder: direction < 0 ? "desc" : "asc" },
    });
    if (!other) return;
    await prisma.$transaction([
      prisma.certification.update({ where: { id: current.id }, data: { sortOrder: other.sortOrder } }),
      prisma.certification.update({ where: { id: other.id }, data: { sortOrder: current.sortOrder } }),
      prisma.auditLog.create({ data: { actorId: actor.id, actorEmail: actor.email, action: "certification.reorder", entityType: "CERTIFICATION", entityId: id, summary: `Moved ${current.code}` } }),
    ]);
    revalidatePath("/admin/certifications");
  });
}

export async function retireCertification(formData: FormData) {
  return runAction("admin.certification.retire", async () => {
    const actor = await authorize("catalog:manage");
    const id = text(formData, "id");
    const replacementId = optionalText(formData, "replacementId");
    const before = await prisma.certification.findUnique({ where: { id } });
    await prisma.certification.update({ where: { id }, data: { status: "RETIRED", replacementId } });
    await audit({ id: actor.id, email: actor.email }, "certification.retire", { entityType: "CERTIFICATION", entityId: id, summary: "Retired certification", before, after: { status: "RETIRED", replacementId } });
    revalidatePath("/admin/certifications");
  });
}

export async function createModule(formData: FormData) {
  return runAction("admin.module.create", async () => {
    const actor = await authorize("content:edit");
    const certificationId = text(formData, "certificationId");
    const domainId = text(formData, "domainId");
    const title = text(formData, "title");
    const cert = await prisma.certification.findUniqueOrThrow({ where: { id: certificationId } });
    const count = await prisma.module.count({ where: { certificationId } });
    const createdModule = await prisma.module.create({ data: { certificationId, domainId, title, slug: slugify(title), summary: optionalText(formData, "summary"), sortOrder: count, curriculumVersion: cert.currentVersion } });
    await audit({ id: actor.id, email: actor.email }, "module.create", { entityType: "MODULE", entityId: createdModule.id, summary: title });
    revalidatePath("/admin/content");
  });
}

export async function createLesson(formData: FormData) {
  return runAction("admin.lesson.create", async () => {
    const actor = await authorize("content:edit");
    const moduleId = text(formData, "moduleId");
    const parentModule = await prisma.module.findUniqueOrThrow({ where: { id: moduleId }, include: { certification: true } });
    const title = text(formData, "title");
    const count = await prisma.lesson.count({ where: { moduleId } });
    const lesson = await prisma.lesson.create({
      data: {
        certificationId: parentModule.certificationId,
        domainId: parentModule.domainId,
        moduleId,
        title,
        slug: slugify(title),
        summary: optionalText(formData, "summary"),
        sortOrder: count,
        authorId: actor.id,
        curriculumVersion: parentModule.certification.currentVersion,
        blocks: { create: initialLessonBlocks() },
      },
    });
    await audit({ id: actor.id, email: actor.email }, "lesson.create", { entityType: "LESSON", entityId: lesson.id, summary: title });
    revalidatePath("/admin/content");
  });
}

export async function saveLesson(formData: FormData) {
  return runAction("admin.lesson.save", async () => {
    const actor = await authorize("content:edit");
    const id = text(formData, "id");
    const before = await prisma.lesson.findUniqueOrThrow({ where: { id }, include: { blocks: true } });
    if (!["DRAFT"].includes(before.status) && !actor.permissions.has("content:publish") && !text(formData, "changeNote")) throw new ActionError("change_note_required");
    const blocks = z.array(z.object({ key: z.string(), type: z.string(), sortOrder: z.number(), data: z.unknown() })).parse(parseJson(text(formData, "blocks"), []));
    const nextVersion = before.version + 1;
    const sourceRows = z.array(sourceSchema).parse(parseJson(text(formData, "sources"), []));
    await prisma.$transaction(async (tx) => {
      await tx.contentRevision.create({ data: { entityType: "LESSON", entityId: id, version: nextVersion, snapshot: contentSnapshot(before), changeNote: optionalText(formData, "changeNote"), createdById: actor.id } });
      await tx.lesson.update({
        where: { id },
        data: {
          title: text(formData, "title"),
          slug: text(formData, "slug") || before.slug,
          summary: optionalText(formData, "summary"),
          estimatedMinutes: intOrNull(formData, "estimatedMinutes") ?? before.estimatedMinutes,
          objectiveId: optionalText(formData, "objectiveId"),
          needsVerification: bool(formData, "needsVerification"),
          verificationNote: optionalText(formData, "verificationNote"),
          version: nextVersion,
        },
      });
      await tx.contentBlock.deleteMany({ where: { lessonId: id } });
      await tx.contentBlock.createMany({ data: blocks.map((b) => ({ lessonId: id, key: b.key, type: b.type as never, sortOrder: b.sortOrder, data: inputJson(b.data) })) });
      await tx.lessonSource.deleteMany({ where: { lessonId: id } });
      for (const s of sourceRows) {
        const source = await tx.officialSource.upsert({ where: { url: s.url }, create: { url: s.url, title: s.title }, update: { title: s.title } });
        await tx.lessonSource.create({ data: { lessonId: id, sourceId: source.id } });
      }
      await tx.lessonTranslation.upsert({
        where: { lessonId_locale: { lessonId: id, locale: "tr" } },
        create: { lessonId: id, locale: "tr", title: text(formData, "trTitle"), summary: optionalText(formData, "trSummary"), blocks: inputJson(parseJson(text(formData, "trBlocks"), {})), sourceVersion: nextVersion, status: "DRAFT" },
        update: { title: text(formData, "trTitle"), summary: optionalText(formData, "trSummary"), blocks: inputJson(parseJson(text(formData, "trBlocks"), {})), sourceVersion: nextVersion },
      });
      await audit({ id: actor.id, email: actor.email }, "lesson.update", { entityType: "LESSON", entityId: id, summary: text(formData, "changeNote") || "Updated lesson", before, after: { version: nextVersion } }, tx);
    });
    revalidatePath(`/admin/content/lessons/${id}`);
  });
}

export async function saveQuestion(formData: FormData) {
  return runAction("admin.question.save", async () => {
    const actor = await authorize("questions:edit");
    const id = optionalText(formData, "id");
    const data = simpleQuestionSchema.parse({
      ref: text(formData, "code"),
      type: text(formData, "type"),
      domainKey: text(formData, "domainKey"),
      objectiveCode: optionalText(formData, "objectiveCode") ?? undefined,
      difficulty: text(formData, "difficulty"),
      stem: text(formData, "stem"),
      scenario: optionalText(formData, "scenario") ?? undefined,
      explanation: text(formData, "explanation"),
      options: parseJson(text(formData, "options"), []),
      interaction: parseJson(text(formData, "interaction"), {}),
      answerKey: parseJson(text(formData, "answerKey"), {}),
      shuffleOptions: bool(formData, "shuffleOptions"),
      lessonSlug: optionalText(formData, "lessonSlug") ?? undefined,
      sources: parseJson(text(formData, "sources"), []),
      needsVerification: bool(formData, "needsVerification"),
      translations: parseJson(text(formData, "translations"), undefined),
    });
    const cert = await prisma.certification.findUniqueOrThrow({ where: { id: text(formData, "certificationId") } });
    const domain = await prisma.examDomain.findUniqueOrThrow({ where: { certificationId_key: { certificationId: cert.id, key: data.domainKey } } });
    const objective = data.objectiveCode ? await prisma.examObjective.findUnique({ where: { domainId_code: { domainId: domain.id, code: data.objectiveCode } } }) : null;
    const lesson = data.lessonSlug ? await prisma.lesson.findUnique({ where: { certificationId_slug: { certificationId: cert.id, slug: data.lessonSlug } } }) : null;
    const pkg = {
      ref: data.ref.toLowerCase(),
      type: data.type,
      domainKey: data.domainKey,
      objectiveCode: data.objectiveCode,
      difficulty: data.difficulty,
      stem: data.stem,
      scenario: data.scenario,
      explanation: data.explanation,
      options: data.options,
      shuffleOptions: data.shuffleOptions,
      sources: data.sources.length ? data.sources : [{ title: "Microsoft Learn", url: "https://learn.microsoft.com/" }],
      needsVerification: data.needsVerification,
      translations: data.translations as never,
      ...(["matching", "ordering", "categorization", "fillInBlank", "caseStudy", "uiSimulation"].reduce<Record<string, unknown>>((acc, key) => {
        const value = (data.interaction as Record<string, unknown>)[key];
        if (value) acc[key] = value;
        return acc;
      }, {})),
    };
    const parsed = questionSchema.parse(pkg);
    const semanticIssues = checkQuestionSemantics(parsed);
    if (semanticIssues.length) throw new ActionError("invalid_question", { _form: semanticIssues.map((i) => i.message).join("; ") });
    const payload = mapQuestionPayload(parsed);
    await prisma.$transaction(async (tx) => {
      const before = id ? await tx.question.findUnique({ where: { id }, include: { options: true } }) : null;
      const nextVersion = (before?.version ?? 0) + 1;
      const question = id
        ? await tx.question.update({
            where: { id },
            data: { code: parsed.ref, certificationId: cert.id, domainId: domain.id, objectiveId: objective?.id ?? null, lessonId: lesson?.id ?? null, type: parsed.type, difficulty: parsed.difficulty, stem: parsed.stem, scenario: parsed.scenario ?? null, explanation: parsed.explanation, interaction: inputJson(payload.interaction), answerKey: inputJson(payload.answerKey), shuffleOptions: parsed.shuffleOptions ?? true, needsVerification: parsed.needsVerification ?? false, qualityFlags: lines(text(formData, "qualityFlags")), version: nextVersion },
          })
        : await tx.question.create({
            data: { code: parsed.ref, certificationId: cert.id, domainId: domain.id, objectiveId: objective?.id ?? null, lessonId: lesson?.id ?? null, type: parsed.type, difficulty: parsed.difficulty, stem: parsed.stem, scenario: parsed.scenario ?? null, explanation: parsed.explanation, interaction: inputJson(payload.interaction), answerKey: inputJson(payload.answerKey), shuffleOptions: parsed.shuffleOptions ?? true, authorId: actor.id, needsVerification: parsed.needsVerification ?? false, qualityFlags: lines(text(formData, "qualityFlags")) },
          });
      await tx.questionOption.deleteMany({ where: { questionId: question.id } });
      await tx.questionOption.createMany({ data: parsed.options?.map((o, index) => ({ questionId: question.id, key: o.key, text: o.text, isCorrect: o.correct, explanation: o.explanation, sortOrder: index })) ?? [] });
      await tx.questionVersion.create({ data: { questionId: question.id, version: question.version, snapshot: contentSnapshot({ ...question, options: parsed.options }), status: question.status, changeNote: optionalText(formData, "changeNote"), createdById: actor.id } });
      await audit({ id: actor.id, email: actor.email }, id ? "question.update" : "question.create", { entityType: "QUESTION", entityId: question.id, summary: parsed.stem, before, after: question }, tx);
    });
    revalidatePath("/admin/questions");
  });
}

export async function generateQuestionDrafts(formData: FormData) {
  return runAction("admin.ai.generateDrafts", async () => {
    const actor = await authorize("ai:generate_drafts");
    const settings = await getSettings();
    if (!settings["ai.draftsEnabled"]) throw new ActionError("disabled");
    const result = await generateDraftQuestions(prisma, { lessonId: text(formData, "lessonId"), count: intOrNull(formData, "count") ?? 3, actor });
    await audit({ id: actor.id, email: actor.email }, "ai.generateDraftQuestions", { entityType: "LESSON", entityId: text(formData, "lessonId"), summary: `${result.count} drafts generated`, metadata: result });
    revalidatePath("/admin/questions");
    return result;
  });
}

export async function saveLab(formData: FormData) {
  return runAction("admin.lab.save", async () => {
    const actor = await authorize("labs:edit");
    const id = optionalText(formData, "id");
    const type = z.enum(labTypes).parse(text(formData, "type"));
    const config = parseJson(text(formData, "config"), {});
    const validation = validateLabConfig(type, config);
    if (!validation.ok) throw new ActionError("invalid_lab_config", { config: validation.errors.join("; ") });
    const steps = z.array(z.object({ key: z.string(), title: z.string(), instruction: z.string(), hint: z.string().optional(), explanation: z.string(), targetId: z.string().optional(), rules: z.array(z.object({ key: z.string(), description: z.string(), rule: z.unknown(), successFeedback: z.string().optional(), failureFeedback: z.string().optional() })).default([]) })).parse(parseJson(text(formData, "steps"), []));
    const finalRules = z.array(z.object({ key: z.string(), description: z.string(), rule: z.unknown(), successFeedback: z.string().optional(), failureFeedback: z.string().optional() })).parse(parseJson(text(formData, "finalRules"), []));
    for (const rule of [...steps.flatMap((s) => s.rules), ...finalRules]) labRuleSchema.parse(rule.rule);
    const certId = text(formData, "certificationId");
    await prisma.$transaction(async (tx) => {
      const before = id ? await tx.lab.findUnique({ where: { id }, include: { steps: true, rules: true } }) : null;
      const nextVersion = (before?.version ?? 0) + 1;
      const data = { certificationId: certId, domainId: optionalText(formData, "domainId"), moduleId: optionalText(formData, "moduleId"), objectiveId: optionalText(formData, "objectiveId"), slug: text(formData, "slug") || slugify(text(formData, "title")), type, title: text(formData, "title"), summary: text(formData, "summary"), scenario: text(formData, "scenario"), learningObjectives: lines(text(formData, "learningObjectives")), prerequisites: lines(text(formData, "prerequisites")), complexity: z.enum(labComplexities).parse(text(formData, "complexity")), estimatedMinutes: intOrNull(formData, "estimatedMinutes") ?? 15, config: inputJson(config), solution: text(formData, "solution"), needsVerification: bool(formData, "needsVerification"), version: nextVersion };
      const lab = id ? await tx.lab.update({ where: { id }, data }) : await tx.lab.create({ data: { ...data, authorId: actor.id } });
      await tx.labStep.deleteMany({ where: { labId: lab.id } });
      await tx.labValidationRule.deleteMany({ where: { labId: lab.id } });
      for (const [index, step] of steps.entries()) {
        const s = await tx.labStep.create({ data: { labId: lab.id, key: step.key, sortOrder: index, title: step.title, instruction: step.instruction, hint: step.hint ?? null, explanation: step.explanation, targetId: step.targetId ?? null } });
        for (const [ri, rule] of step.rules.entries()) await tx.labValidationRule.create({ data: { labId: lab.id, stepId: s.id, key: rule.key, description: rule.description, rule: inputJson(rule.rule), successFeedback: rule.successFeedback ?? null, failureFeedback: rule.failureFeedback ?? null, sortOrder: ri } });
      }
      for (const [ri, rule] of finalRules.entries()) await tx.labValidationRule.create({ data: { labId: lab.id, key: rule.key, description: rule.description, rule: inputJson(rule.rule), successFeedback: rule.successFeedback ?? null, failureFeedback: rule.failureFeedback ?? null, sortOrder: ri } });
      await tx.contentRevision.create({ data: { entityType: "LAB", entityId: lab.id, version: lab.version, snapshot: contentSnapshot({ lab, steps, finalRules }), changeNote: optionalText(formData, "changeNote"), createdById: actor.id } });
      await audit({ id: actor.id, email: actor.email }, id ? "lab.update" : "lab.create", { entityType: "LAB", entityId: lab.id, summary: lab.title, before, after: lab }, tx);
    });
    revalidatePath("/admin/labs");
  });
}

export async function saveUserRoles(formData: FormData) {
  return runAction("admin.user.roles", async () => {
    const actor = await authorize("roles:assign");
    const targetId = text(formData, "userId");
    const roles = ROLE_KEYS.filter((role) => formData.get(`role_${role}`) === "on");
    const allowed = canAssignRoles(actor.roles, actor.id, targetId, roles);
    if (!allowed.ok) throw new ActionError(allowed.reason);
    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: targetId }, include: { roles: { include: { role: true } } } });
      await tx.userRole.deleteMany({ where: { userId: targetId } });
      for (const key of roles) {
        const role = await tx.role.upsert({ where: { key }, update: {}, create: { key, name: key, description: `${key} role` } });
        await tx.userRole.create({ data: { userId: targetId, roleId: role.id } });
      }
      await tx.user.update({ where: { id: targetId }, data: { sessionVersion: { increment: 1 } } });
      await audit({ id: actor.id, email: actor.email }, "user.roles.update", { entityType: "USER", entityId: targetId, before, after: { roles } }, tx);
    });
    revalidatePath("/admin/users");
  });
}

export async function setUserStatus(formData: FormData) {
  return runAction("admin.user.status", async () => {
    const actor = await authorize("users:manage");
    const targetId = text(formData, "userId");
    if (targetId === actor.id) throw new ActionError("cannot_self_suspend");
    const status = z.enum(["ACTIVE", "SUSPENDED"]).parse(text(formData, "status"));
    await prisma.user.update({ where: { id: targetId }, data: { status, sessionVersion: { increment: 1 } } });
    await audit({ id: actor.id, email: actor.email }, "user.status.update", { entityType: "USER", entityId: targetId, after: { status } });
    revalidatePath("/admin/users");
  });
}

export async function setTemporaryPassword(formData: FormData) {
  return runAction("admin.user.password", async () => {
    const actor = await authorize("users:manage");
    const targetId = text(formData, "userId");
    const password = passwordSchema.parse(text(formData, "password"));
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: targetId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    await audit({ id: actor.id, email: actor.email }, "user.password.setTemporary", { entityType: "USER", entityId: targetId, summary: "Temporary password set" });
    revalidatePath("/admin/users");
  });
}

export async function saveSettings(formData: FormData) {
  return runAction("admin.settings.save", async () => {
    const actor = await authorize("settings:manage");
    const bounded = (key: "practice.fullExamQuestions" | "practice.fullExamMinutes" | "practice.targetPercent" | "analytics.minCohort" | "ai.tutorDailyLimit", min: number, max: number) => {
      const value = intOrNull(formData, key);
      return value === null ? SETTING_DEFAULTS[key] : Math.min(max, Math.max(min, value));
    };
    const values: Record<keyof typeof SETTING_DEFAULTS, unknown> = {
      "ai.provider": z.enum(["env", "local", "openai"]).parse(text(formData, "ai.provider")),
      "ai.model": text(formData, "ai.model"),
      "ai.baseUrl": text(formData, "ai.baseUrl"),
      "ai.draftsEnabled": bool(formData, "ai.draftsEnabled"),
      "ai.enabled": bool(formData, "ai.enabled"),
      "ai.tutorDailyLimit": bounded("ai.tutorDailyLimit", 0, 1000),
      "platform.registrationEnabled": bool(formData, "platform.registrationEnabled"),
      "practice.fullExamQuestions": bounded("practice.fullExamQuestions", 5, 100),
      "practice.fullExamMinutes": bounded("practice.fullExamMinutes", 5, 300),
      "practice.targetPercent": bounded("practice.targetPercent", 50, 100),
      "analytics.minCohort": bounded("analytics.minCohort", 1, 100),
    };
    await prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        await tx.appSetting.upsert({ where: { key }, create: { key, value: inputJson(value), updatedById: actor.id }, update: { value: inputJson(value), updatedById: actor.id } });
      }
      await audit({ id: actor.id, email: actor.email }, "settings.update", { entityType: "APP_SETTING", summary: "Settings updated", after: values }, tx);
    });
    revalidatePath("/admin/settings");
  });
}

export async function runDueJobsAction() {
  return runAction("admin.jobs.runDue", async () => {
    await authorize("jobs:manage");
    const result = await processDueJobs(prisma, { limit: 20, workerId: "admin-inline" });
    revalidatePath("/admin/jobs");
    return result;
  });
}

export async function enqueueMaintenanceJob(formData: FormData) {
  return runAction("admin.jobs.enqueue", async () => {
    const actor = await authorize("jobs:manage");
    const type = z.enum(["content.publishScheduled", "analytics.readinessSnapshots", "planner.adjustPlans"]).parse(text(formData, "type"));
    await enqueueJob(prisma, type, {}, new Date(), actor.id);
    await audit({ id: actor.id, email: actor.email }, "job.enqueue", { entityType: "JOB", summary: type });
    revalidatePath("/admin/jobs");
  });
}

export async function flagQuestionForReview(formData: FormData) {
  return runAction("admin.analytics.flagQuestion", async () => {
    const actor = await authorize("analytics:view_anonymous");
    const id = text(formData, "questionId");
    const q = await prisma.question.findUniqueOrThrow({ where: { id } });
    await prisma.question.update({ where: { id }, data: { qualityFlags: [...new Set([...q.qualityFlags, "low_accuracy"])] } });
    await prisma.contentReview.create({ data: { entityType: "QUESTION", entityId: id, entityVersion: q.version, decision: "COMMENT", comment: "Flagged from anonymous analytics for low accuracy", reviewerId: actor.id, reviewerName: actor.name ?? actor.email } });
    await audit({ id: actor.id, email: actor.email }, "question.flagLowAccuracy", { entityType: "QUESTION", entityId: id, summary: "Flagged low accuracy" });
    revalidatePath("/admin/analytics");
  });
}
