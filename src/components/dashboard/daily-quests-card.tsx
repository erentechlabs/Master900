"use client";

import * as React from "react";
import { CheckCircle2, Gift, ListChecks, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { claimQuestReward } from "@/app/(app)/dashboard/actions";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translator";
import type { DailyQuestState } from "@/modules/analytics/quest-service";
import { formatCountdown } from "@/modules/analytics/quests";
import { celebrate } from "@/components/ui/celebration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";

export function DailyQuestsCard({ state }: { state: DailyQuestState }) {
  const { t } = useI18n();
  const [pending, startTransition] = React.useTransition();
  const [claimed, setClaimed] = React.useState(() => new Set(state.quests.filter((q) => q.claimed).map((q) => q.key)));
  const [floatXp, setFloatXp] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const countdown = formatCountdown(state.millisecondsUntilReset);
  const visibleQuests = state.quests.map((q) => ({ ...q, claimed: q.claimed || claimed.has(q.key) }));
  const allDone = visibleQuests.every((q) => q.completed && q.claimed);

  function onClaim(key: string) {
    startTransition(async () => {
      const result = await claimQuestReward({ questKey: key });
      if (!result.ok) {
        toast.error(t("learner.quests.claimError"));
        return;
      }
      setClaimed((prev) => new Set(prev).add(key));
      setFloatXp(key);
      window.setTimeout(() => setFloatXp(null), 1100);
      const message = result.data?.bonusAwarded ? t("learner.quests.allComplete") : t("learner.quests.claimed");
      setAnnouncement(message);
      toast.success(message);
      if (result.data?.bonusAwarded || visibleQuests.filter((q) => q.key !== key).every((q) => q.completed && q.claimed)) celebrate({ particleCount: 140, spread: 75 });
    });
  }

  return (
    <Card className="overflow-hidden border-stroke-card bg-card/90 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("learner.quests.title")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("learner.quests.reset", { hours: countdown.hours, minutes: countdown.minutes })}</p>
          </div>
          {state.gamification ? <Badge variant={allDone ? "success" : "info"}>{allDone ? t("learner.quests.done") : t("learner.quests.xpBadge")}</Badge> : <Badge variant="secondary">{t("learner.quests.checklist")}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div aria-live="polite" className="sr-only">{announcement}</div>
        {visibleQuests.map((quest) => {
          const label = t("learner.quests.progress", { done: Math.min(quest.progress, quest.target), target: quest.target });
          return (
            <div key={quest.key} className="relative rounded-lg border border-stroke-card bg-layer/60 p-3">
              {floatXp === quest.key && state.gamification ? <span className="absolute right-4 top-2 animate-float-up text-sm font-semibold text-success">+{quest.xp} XP</span> : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="flex items-center gap-2 font-medium">
                    {quest.claimed ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> : <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />}
                    {t(quest.titleKey as MessageKey, { count: quest.target })}
                  </p>
                  <p className="text-sm text-muted-foreground">{t(quest.descriptionKey as MessageKey, { count: quest.target })}</p>
                </div>
                <Button size="sm" variant={quest.claimed ? "secondary" : quest.completed ? "success" : "outline"} disabled={pending || quest.claimed || !quest.completed} onClick={() => onClaim(quest.key)}>
                  <Gift className="h-4 w-4" aria-hidden="true" />
                  {quest.claimed ? t("learner.quests.claimedButton") : state.gamification ? t("learner.quests.claimXp", { xp: quest.xp }) : t("learner.quests.markDone")}
                </Button>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Progress value={Math.min(quest.progress, quest.target)} max={quest.target} label={label} className="flex-1" indicatorClassName={quest.completed ? "bg-success" : undefined} />
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">{label}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
