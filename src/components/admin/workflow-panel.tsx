import type { AuthorType, ContentEntityType, ContentStatus } from "@prisma/client";
import { runWorkflowAction } from "@/modules/admin/workflow-actions";
import { availableActions, TRANSITIONS } from "@/modules/content/workflow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Textarea, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { StatusBadge } from "./status-badge";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

export async function WorkflowPanel({
  entityType,
  entityId,
  status,
  authorType,
  roles,
  reviews,
}: {
  entityType: ContentEntityType;
  entityId: string;
  status: ContentStatus;
  authorType?: AuthorType | null;
  roles: readonly string[];
  reviews: { id: string; decision: string; fromStatus: string | null; toStatus: string | null; comment: string | null; reviewerName: string | null; createdAt: Date }[];
}) {
  const { t, fmt } = await getI18n();
  const actions = availableActions(status, roles);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.workflow.title")}</CardTitle>
        <CardDescription className="flex items-center gap-2">
          {t("admin.workflow.currentStatus")} <StatusBadge status={status} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {authorType === "AI_GENERATED" ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{t("admin.workflow.aiNotice")}</p> : null}
        {actions.length ? (
          <div className="space-y-3">
            {actions.map((action) => (
              <form key={action} action={runWorkflowAction as never} className="rounded-lg border p-3">
                <input type="hidden" name="entityType" value={entityType} />
                <input type="hidden" name="entityId" value={entityId} />
                <input type="hidden" name="action" value={action} />
                {action === "schedule" ? (
                  <Field id={`${entityId}-${action}-publishAt`} label={t("admin.common.publishAt")}>
                    <Input type="datetime-local" name="publishAt" />
                  </Field>
                ) : null}
                <Field id={`${entityId}-${action}-comment`} label={TRANSITIONS[action].requiresComment ? t("admin.workflow.commentWithRequired") : t("admin.workflow.comment")} className="mt-2">
                  <Textarea name="comment" rows={2} />
                </Field>
                <SubmitButton className="mt-2" size="sm">
                  {t(`admin.workflow.action_${action}` as MessageKey)}
                </SubmitButton>
              </form>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("admin.workflow.noActions")}</p>
        )}
        <div>
          <h4 className="mb-2 text-sm font-semibold">{t("admin.workflow.history")}</h4>
          {reviews.length ? (
            <ul className="space-y-2 text-sm">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-md border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t(`admin.workflow.decision_${r.decision}` as MessageKey)}</span>
                    <span className="flex items-center gap-1 text-muted-foreground">{r.fromStatus ? <StatusBadge status={r.fromStatus} /> : "-"} → {r.toStatus ? <StatusBadge status={r.toStatus} /> : "-"}</span>
                    <time className="text-muted-foreground">{fmt.dateTime(r.createdAt)}</time>
                  </div>
                  {r.comment ? <p className="mt-1 text-muted-foreground">{r.comment}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("admin.workflow.noHistory")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function InlineActionButton({ action, children }: { action: (formData: FormData) => Promise<unknown>; children: React.ReactNode }) {
  return (
    <form action={action as never}>
      <Button type="submit" size="sm" variant="outline">
        {children}
      </Button>
    </form>
  );
}
