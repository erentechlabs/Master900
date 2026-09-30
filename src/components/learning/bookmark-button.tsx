"use client";

import * as React from "react";
import { Bookmark } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toggleBookmarkAction } from "@/app/(app)/bookmarks/actions";

export function BookmarkButton({ targetType, targetId, initialBookmarked, label, className }: { targetType: "CERTIFICATION" | "LESSON" | "QUESTION" | "LAB" | "GLOSSARY"; targetId: string; initialBookmarked: boolean; label?: string; className?: string }) {
  const { t } = useI18n();
  const [bookmarked, setBookmarked] = React.useState(initialBookmarked);
  const [pending, startTransition] = React.useTransition();
  const text = label ?? (bookmarked ? t("learner.lesson.bookmarked") : t("learner.lesson.bookmark"));
  return (
    <Button
      type="button"
      variant={bookmarked ? "secondary" : "outline"}
      size="sm"
      disabled={pending}
      aria-pressed={bookmarked}
      className={cn("min-h-8", className)}
      onClick={() => {
        startTransition(async () => {
          const result = await toggleBookmarkAction({ targetType, targetId });
          if (result.ok && result.data) setBookmarked(result.data.bookmarked);
        });
      }}
    >
      <Bookmark className={bookmarked ? "fill-current" : undefined} aria-hidden="true" />
      {text}
    </Button>
  );
}
