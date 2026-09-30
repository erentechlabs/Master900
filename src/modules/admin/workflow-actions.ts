"use server";

import type { ContentEntityType, ContentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ActionError, runAction } from "@/lib/actions";
import { audit } from "@/modules/admin/audit";
import { authorize } from "@/modules/auth/session";
import { decisionForAction, evaluateTransition, type WorkflowAction } from "@/modules/content/workflow";
import { entityEditorPath, text } from "./cms";

const schema = z.object({
  entityType: z.enum(["MODULE", "LESSON", "QUESTION", "LAB"]),
  entityId: z.string().min(1),
  action: z.enum([
    "submit_for_review",
    "approve_technical",
    "approve_editorial",
    "request_changes",
    "publish",
    "schedule",
    "unpublish",
    "mark_outdated",
    "reverify",
    "revise",
    "archive",
    "restore",
  ]),
  comment: z.string().optional(),
  publishAt: z.string().optional(),
});

type EntityRecord = { id: string; status: ContentStatus; version: number; authorType?: string | null };

async function readEntity(entityType: ContentEntityType, id: string): Promise<EntityRecord | null> {
  if (entityType === "MODULE") return prisma.module.findUnique({ where: { id }, select: { id: true, status: true, version: true } });
  if (entityType === "LESSON") return prisma.lesson.findUnique({ where: { id }, select: { id: true, status: true, version: true, authorType: true } });
  if (entityType === "QUESTION") return prisma.question.findUnique({ where: { id }, select: { id: true, status: true, version: true, authorType: true } });
  if (entityType === "LAB") return prisma.lab.findUnique({ where: { id }, select: { id: true, status: true, version: true, authorType: true } });
  return null;
}

async function updateEntity(tx: Prisma.TransactionClient, entityType: ContentEntityType, id: string, data: Prisma.ModuleUpdateInput | Prisma.LessonUpdateInput | Prisma.QuestionUpdateInput | Prisma.LabUpdateInput) {
  if (entityType === "MODULE") await tx.module.update({ where: { id }, data: data as Prisma.ModuleUpdateInput });
  if (entityType === "LESSON") await tx.lesson.update({ where: { id }, data: data as Prisma.LessonUpdateInput });
  if (entityType === "QUESTION") await tx.question.update({ where: { id }, data: data as Prisma.QuestionUpdateInput });
  if (entityType === "LAB") await tx.lab.update({ where: { id }, data: data as Prisma.LabUpdateInput });
}

export async function runWorkflowAction(formData: FormData) {
  return runAction("admin.workflow", async () => {
    const actor = await authorize("content:read_drafts");
    const input = schema.parse({
      entityType: text(formData, "entityType"),
      entityId: text(formData, "entityId"),
      action: text(formData, "action"),
      comment: text(formData, "comment"),
      publishAt: text(formData, "publishAt"),
    });
    const entity = await readEntity(input.entityType, input.entityId);
    if (!entity) throw new ActionError("not_found");
    const publishAt = input.publishAt ? new Date(input.publishAt) : null;
    const result = evaluateTransition({
      action: input.action as WorkflowAction,
      from: entity.status,
      roles: actor.roles,
      comment: input.comment,
      publishAt,
    });
    if (!result.ok) throw new ActionError(result.reason);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = { status: result.to };
      if (input.action === "publish" || input.action === "reverify") {
        data.publishedAt = now;
        data.publishAt = null;
        data.lastReviewedAt = now;
      } else if (input.action === "schedule") {
        data.publishAt = publishAt;
      } else if (input.action === "approve_technical" || input.action === "approve_editorial") {
        data.lastReviewedAt = now;
      }
      await updateEntity(tx, input.entityType, input.entityId, data);
      await tx.contentReview.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          entityVersion: entity.version,
          fromStatus: entity.status,
          toStatus: result.to,
          decision: decisionForAction(input.action as WorkflowAction),
          comment: input.comment || null,
          reviewerId: actor.id,
          reviewerName: actor.name ?? actor.email,
        },
      });
      await audit(
        { id: actor.id, email: actor.email },
        `workflow.${input.action}`,
        {
          entityType: input.entityType,
          entityId: input.entityId,
          summary: `${input.entityType} ${entity.status} -> ${result.to}`,
          before: { status: entity.status },
          after: { status: result.to, publishAt },
        },
        tx,
      );
    });
    revalidatePath(entityEditorPath(input.entityType));
    return { status: result.to };
  });
}
