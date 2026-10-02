"use client";

import * as React from "react";
import { Award, Sparkles } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { celebrate } from "@/components/ui/celebration";
import { RingProgress } from "@/components/charts";
import { Badge } from "@/components/ui/badge";

export function ResultsCelebration({
  value,
  label,
  celebrateOnMount,
  personalBest,
  pointsMode,
}: {
  value: number;
  label: string;
  celebrateOnMount: boolean;
  personalBest?: boolean;
  pointsMode?: boolean;
}) {
  const { t } = useI18n();
  const [shown, setShown] = React.useState(0);
  const announced = React.useRef(false);

  React.useEffect(() => {
    if (pointsMode) return;
    const duration = 700;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setShown(Math.round(value * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pointsMode, value]);

  React.useEffect(() => {
    if (!celebrateOnMount || announced.current) return;
    announced.current = true;
    celebrate({ particleCount: personalBest ? 90 : 55, spread: 70, origin: { x: 0.5, y: 0.25 } });
  }, [celebrateOnMount, personalBest]);

  return (
    <div className="flex flex-col items-center gap-2" aria-live="polite">
      {pointsMode ? (
        <div className="relative inline-flex h-32 w-32 items-center justify-center rounded-full border-8 border-primary/25" role="img" aria-label={`${label}: ${t("assessment.results.points", { score: value })}`}>
          <span className="text-center text-2xl font-semibold tabular-nums" aria-hidden="true">
            {t("assessment.results.pointsShort", { score: value })}
          </span>
        </div>
      ) : (
        <RingProgress value={shown} label={label} />
      )}
      {pointsMode ? <p className="text-sm text-muted-foreground">{label}</p> : <p className="text-2xl font-semibold tabular-nums">{`${shown}%`}</p>}
      {personalBest ? (
        <Badge variant="purple" className="motion-safe:animate-pop">
          <Award aria-hidden="true" />
          {t("assessment.results.personalBest")}
        </Badge>
      ) : celebrateOnMount ? (
        <Badge variant="success">
          <Sparkles aria-hidden="true" />
          {t("assessment.results.celebration")}
        </Badge>
      ) : null}
      {personalBest ? <p className="sr-only">{t("assessment.results.newPersonalBest")}</p> : null}
    </div>
  );
}
