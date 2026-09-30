"use client";

import * as React from "react";
import { ON_DEMAND_BLOCK_KEYS } from "@/modules/content/blocks";
import { useI18n } from "@/i18n/client";
import { LessonBlocks, type LessonBlock } from "@/components/learning/lesson-blocks";
import { Button } from "@/components/ui/button";

export function LessonRevealBlocks({ blocks }: { blocks: LessonBlock[] }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = React.useState<string[]>([]);
  const hidden = ON_DEMAND_BLOCK_KEYS.filter((key) => !revealed.includes(key));
  const hasSimpler = blocks.some((block) => block.key === "simpler");
  const hasAnother = blocks.some((block) => block.key === "another");
  return (
    <div className="space-y-5">
      <LessonBlocks blocks={blocks} hide={hidden} />
      <div className="flex flex-wrap gap-2">
        {hasSimpler && !revealed.includes("simpler") ? (
          <Button type="button" variant="outline" onClick={() => setRevealed((current) => [...current, "simpler"])}>
            {t("learner.lesson.simpler")}
          </Button>
        ) : null}
        {hasAnother && !revealed.includes("another") ? (
          <Button type="button" variant="outline" onClick={() => setRevealed((current) => [...current, "another"])}>
            {t("learner.lesson.anotherExample")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
