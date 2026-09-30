"use client";

import { useTransition } from "react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { completeStudySessionAction, rescheduleStudySessionAction, skipStudySessionAction } from "@/modules/planner/actions";

export function SessionActions({ sessionId, compact = false }: { sessionId: string; compact?: boolean }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => startTransition(async () => void (await completeStudySessionAction({ sessionId })))}
      >
        {t("planner.markComplete")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(async () => void (await skipStudySessionAction({ sessionId })))}
      >
        {t("planner.skip")}
      </Button>
      {!compact ? (
        <form
          className="flex items-center gap-2"
          action={(formData) => {
            const date = String(formData.get("date") ?? "");
            startTransition(async () => void (await rescheduleStudySessionAction({ sessionId, date })));
          }}
        >
          <Input name="date" type="date" className="h-8 w-36" aria-label={t("planner.reschedule")} />
          <Button size="sm" variant="secondary" disabled={pending} type="submit">
            {t("planner.reschedule")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

