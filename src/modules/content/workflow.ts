/**
 * Content workflow state machine:
 * Draft -> Technical Review -> Editorial Review -> Approved -> Published -> Outdated -> Archived
 */
import { permissionsFor, type Permission } from "@/modules/auth/permissions";

export const CONTENT_STATUSES = [
  "DRAFT",
  "TECHNICAL_REVIEW",
  "EDITORIAL_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "OUTDATED",
  "ARCHIVED",
] as const;
export type ContentStatusValue = (typeof CONTENT_STATUSES)[number];

export type WorkflowAction =
  | "submit_for_review"
  | "approve_technical"
  | "approve_editorial"
  | "request_changes"
  | "publish"
  | "schedule"
  | "unpublish"
  | "mark_outdated"
  | "reverify"
  | "revise"
  | "archive"
  | "restore";

type TransitionRule = {
  from: readonly ContentStatusValue[];
  to: ContentStatusValue;
  permission: Permission;
  requiresComment?: boolean;
};

export const TRANSITIONS: Record<WorkflowAction, TransitionRule> = {
  submit_for_review: { from: ["DRAFT"], to: "TECHNICAL_REVIEW", permission: "content:edit" },
  approve_technical: { from: ["TECHNICAL_REVIEW"], to: "EDITORIAL_REVIEW", permission: "content:review" },
  approve_editorial: { from: ["EDITORIAL_REVIEW"], to: "APPROVED", permission: "content:review" },
  request_changes: {
    from: ["TECHNICAL_REVIEW", "EDITORIAL_REVIEW", "APPROVED"],
    to: "DRAFT",
    permission: "content:review",
    requiresComment: true,
  },
  publish: { from: ["APPROVED"], to: "PUBLISHED", permission: "content:publish" },
  schedule: { from: ["APPROVED"], to: "APPROVED", permission: "content:publish" },
  unpublish: { from: ["PUBLISHED", "OUTDATED"], to: "APPROVED", permission: "content:publish" },
  mark_outdated: { from: ["PUBLISHED"], to: "OUTDATED", permission: "content:review", requiresComment: true },
  reverify: { from: ["OUTDATED"], to: "PUBLISHED", permission: "content:publish", requiresComment: true },
  revise: { from: ["APPROVED", "PUBLISHED", "OUTDATED"], to: "DRAFT", permission: "content:edit" },
  archive: {
    from: ["DRAFT", "TECHNICAL_REVIEW", "EDITORIAL_REVIEW", "APPROVED", "PUBLISHED", "OUTDATED"],
    to: "ARCHIVED",
    permission: "content:publish",
  },
  restore: { from: ["ARCHIVED"], to: "DRAFT", permission: "content:edit" },
};

export const WORKFLOW_ACTIONS = Object.keys(TRANSITIONS) as WorkflowAction[];

export function availableActions(status: ContentStatusValue, roles: readonly string[]): WorkflowAction[] {
  const perms = permissionsFor(roles);
  return WORKFLOW_ACTIONS.filter((a) => {
    const rule = TRANSITIONS[a];
    return rule.from.includes(status) && perms.has(rule.permission);
  });
}

export type TransitionResult =
  | { ok: true; to: ContentStatusValue }
  | { ok: false; reason: "invalid_transition" | "forbidden" | "comment_required" | "publish_date_required" };

export function evaluateTransition(input: {
  action: WorkflowAction;
  from: ContentStatusValue;
  roles: readonly string[];
  comment?: string | null;
  publishAt?: Date | null;
  now?: Date;
}): TransitionResult {
  const rule = TRANSITIONS[input.action];
  if (!rule || !rule.from.includes(input.from)) return { ok: false, reason: "invalid_transition" };
  if (!permissionsFor(input.roles).has(rule.permission)) return { ok: false, reason: "forbidden" };
  if (rule.requiresComment && !(input.comment && input.comment.trim().length >= 3)) {
    return { ok: false, reason: "comment_required" };
  }
  if (input.action === "schedule") {
    const now = input.now ?? new Date();
    if (!input.publishAt || input.publishAt.getTime() <= now.getTime()) return { ok: false, reason: "publish_date_required" };
  }
  return { ok: true, to: rule.to };
}

/** Statuses visible to learners. Outdated content stays visible with a warning banner. */
export const LEARNER_VISIBLE_STATUSES: readonly ContentStatusValue[] = ["PUBLISHED", "OUTDATED"];

/** Is the item visible to learners at `now` (published, outdated, or approved with a due publish date)? */
export function isLearnerVisible(status: ContentStatusValue, publishAt: Date | null | undefined, now = new Date()): boolean {
  if (LEARNER_VISIBLE_STATUSES.includes(status)) return true;
  return status === "APPROVED" && !!publishAt && publishAt.getTime() <= now.getTime();
}

/** Prisma `where` fragment for learner-visible content. */
export function learnerVisibleWhere(now = new Date()) {
  return {
    OR: [
      { status: { in: ["PUBLISHED", "OUTDATED"] as ContentStatusValue[] } },
      { status: "APPROVED" as ContentStatusValue, publishAt: { lte: now } },
    ],
  };
}

export function decisionForAction(action: WorkflowAction):
  | "SUBMITTED"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "PUBLISHED"
  | "SCHEDULED"
  | "UNPUBLISHED"
  | "OUTDATED"
  | "ARCHIVED"
  | "COMMENT" {
  switch (action) {
    case "submit_for_review":
      return "SUBMITTED";
    case "approve_technical":
    case "approve_editorial":
      return "APPROVED";
    case "request_changes":
      return "CHANGES_REQUESTED";
    case "publish":
    case "reverify":
      return "PUBLISHED";
    case "schedule":
      return "SCHEDULED";
    case "unpublish":
      return "UNPUBLISHED";
    case "mark_outdated":
      return "OUTDATED";
    case "archive":
      return "ARCHIVED";
    default:
      return "COMMENT";
  }
}
