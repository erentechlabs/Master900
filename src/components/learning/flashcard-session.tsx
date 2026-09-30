"use client";

import * as React from "react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/misc";
import { reviewFlashcardAction } from "@/app/(app)/flashcards/actions";

export type FlashcardReviewCard = { id: string; front: string; back: string; lessonTitle: string | null; due: boolean };

export function FlashcardSession({ cards }: { cards: FlashcardReviewCard[] }) {
  const { t } = useI18n();
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [reviewed, setReviewed] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  const card = cards[index];

  const rate = React.useCallback(
    (rating: "again" | "hard" | "good" | "easy") => {
      if (!card || !flipped || pending) return;
      startTransition(async () => {
        await reviewFlashcardAction({ flashcardId: card.id, rating });
        setReviewed((value) => value + 1);
        setIndex((value) => value + 1);
        setFlipped(false);
      });
    },
    [card, flipped, pending],
  );

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        setFlipped((value) => !value);
      }
      if (event.key === "1") rate("again");
      if (event.key === "2") rate("hard");
      if (event.key === "3") rate("good");
      if (event.key === "4") rate("easy");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rate]);

  if (!card) {
    return (
      <Card>
        <CardContent className="p-8 text-center" aria-live="polite">
          <p className="text-lg font-semibold">{t("learner.flashcards.sessionDone", { count: reviewed })}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("learner.flashcards.progress", { current: index + 1, total: cards.length })}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("learner.flashcards.keyboardHint")} <Kbd>Space</Kbd> <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> <Kbd>4</Kbd>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {card.lessonTitle ? <p className="text-sm text-muted-foreground">{t("learner.flashcards.fromLesson", { lesson: card.lessonTitle })}</p> : null}
        <button type="button" className="min-h-48 w-full rounded-xl border bg-card p-6 text-left shadow-sm transition motion-safe:hover:scale-[1.01]" onClick={() => setFlipped((value) => !value)} aria-pressed={flipped}>
          <span className="mb-2 block text-xs font-semibold text-muted-foreground">{flipped ? t("learner.flashcards.back") : t("learner.flashcards.front")}</span>
          <span className="text-lg font-medium">{flipped ? card.back : card.front}</span>
        </button>
        {!flipped ? (
          <Button onClick={() => setFlipped(true)}>{t("learner.flashcards.showAnswer")}</Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("learner.flashcards.rateTitle")}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" disabled={pending} onClick={() => rate("again")}>{t("learner.flashcards.again")}</Button>
              <Button variant="outline" disabled={pending} onClick={() => rate("hard")}>{t("learner.flashcards.hard")}</Button>
              <Button variant="secondary" disabled={pending} onClick={() => rate("good")}>{t("learner.flashcards.good")}</Button>
              <Button variant="success" disabled={pending} onClick={() => rate("easy")}>{t("learner.flashcards.easy")}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
