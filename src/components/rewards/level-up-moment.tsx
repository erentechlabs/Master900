"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { celebrate } from "@/components/ui/celebration";
import { Alert } from "@/components/ui/alert";

export function LevelUpMoment({ level }: { level: number }) {
  const { t } = useI18n();
  const [show] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return level > Number(window.localStorage.getItem("mfa:last-seen-dashboard-level") ?? level);
  });
  React.useEffect(() => {
    const key = "mfa:last-seen-dashboard-level";
    if (show) {
      toast.success(t("learner.dashboard.levelUp", { level }));
      celebrate({ particleCount: 120 });
    }
    window.localStorage.setItem(key, String(level));
  }, [level, show, t]);
  if (!show) return null;
  return (
    <Alert variant="success" title={t("learner.dashboard.levelUp", { level })}>
      <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" aria-hidden="true" />{t("learner.dashboard.levelUpBody")}</span>
    </Alert>
  );
}
