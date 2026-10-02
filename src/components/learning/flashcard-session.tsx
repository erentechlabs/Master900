"use client";

import * as React from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { celebrate } from "@/components/ui/celebration";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd, Progress } from "@/components/ui/misc";
import { reviewFlashcardAction } from "@/app/(app)/flashcards/actions";

export type FlashcardReviewCard = { id: string; front: string; back: string; lessonTitle: string | null; due: boolean };

export function FlashcardSession({ cards }: { cards: FlashcardReviewCard[] }) {
  const { t, fmt } = useI18n();
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [reviewed, setReviewed] = React.useState(0);
  const [positive, setPositive] = React.useState(0);
  const [nextDueAt, setNextDueAt] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const card = cards[index];

  const rate = React.useCallback(
    (rating: "again" | "hard" | "good" | "easy") => {
      if (!card || !flipped || pending) return;
      startTransition(async () => {
        const result = await reviewFlashcardAction({ flashcardId: card.id, rating });
        if (rating === "good" || rating === "easy") setPositive((value) => value + 1);
        if (result.ok && result.data?.dueAt) setNextDueAt((current) => (!current || new Date(result.data!.dueAt!).getTime() < new Date(current).getTime() ? result.data!.dueAt : current));
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
      if (event.key === "Enter") setFlipped((value) => !value);
      if (event.key === "1") rate("again");
      if (event.key === "2") rate("hard");
      if (event.key === "3") rate("good");
      if (event.key === "4") rate("easy");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rate]);

  React.useEffect(() => {
    if (card) return;
    celebrate({ particleCount: 35, spread: 55, origin: { x: 0.5, y: 0.35 } });
  }, [card]);

  if (!card) {
    return (
      <Card>
        <CardContent className="p-8 text-center" aria-live="polite">
          <p className="text-lg font-semibold">{t("learner.flashcards.sessionDone", { count: reviewed })}</p>
          <dl className="mx-auto mt-4 grid max-w-xl gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <dt className="text-muted-foreground">{t("learner.flashcards.reviewed")}</dt>
              <dd className="text-xl font-semibold tabular-nums">{reviewed}</dd>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <dt className="text-muted-foreground">{t("learner.flashcards.goodEasy")}</dt>
              <dd className="text-xl font-semibold tabular-nums">{positive}</dd>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <dt className="text-muted-foreground">{t("learner.flashcards.nextDue")}</dt>
              <dd className="text-sm font-semibold">{nextDueAt ? fmt.dateTime(new Date(nextDueAt)) : t("learner.flashcards.noDue")}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("learner.flashcards.progress", { current: index + 1, total: cards.length })}</CardTitle>
        <Progress value={reviewed} max={cards.length} label={t("learner.flashcards.progress", { current: reviewed, total: cards.length })} />
        <p className="text-sm text-muted-foreground">{t("learner.flashcards.remaining", { count: cards.length - reviewed })}</p>
        <p className="text-sm text-muted-foreground">
          {t("learner.flashcards.keyboardHint")} <Kbd>Space</Kbd> <Kbd>Enter</Kbd> <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> <Kbd>4</Kbd>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {card.lessonTitle ? <p className="text-sm text-muted-foreground">{t("learner.flashcards.fromLesson", { lesson: card.lessonTitle })}</p> : null}
        <button
          type="button"
          className="[perspective:1000px] min-h-48 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setFlipped((value) => !value)}
          aria-pressed={flipped}
          aria-label={flipped ? t("learner.flashcards.backAnnounce", { text: card.back }) : t("learner.flashcards.front")}
        >
          <span
            className={cn(
              "relative block min-h-48 rounded-xl border bg-card p-6 shadow-sm transition-transform duration-300 ease-fluent motion-safe:[transform-style:preserve-3d]",
              flipped && "motion-safe:[transform:rotateY(180deg)]",
            )}
          >
            <span className={cn("block motion-safe:[backface-visibility:hidden]", flipped && "motion-reduce:hidden")}>
              <span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("learner.flashcards.front")}</span>
              <span className="text-lg font-medium">{card.front}</span>
            </span>
            <span className={cn("inset-0 block motion-safe:absolute motion-safe:[backface-visibility:hidden] motion-safe:[transform:rotateY(180deg)]", !flipped && "motion-reduce:hidden")}>
              <span className="mb-2 block text-xs font-semibold text-muted-foreground">{t("learner.flashcards.back")}</span>
              <span className="text-lg font-medium">{card.back}</span>
            </span>
          </span>
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
