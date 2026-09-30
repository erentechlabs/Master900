"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, MessageCircleQuestion, Repeat, XCircle } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { QuestionReview } from "@/modules/assessment/engine/types";
import { startSimilarAction } from "@/app/(app)/practice/actions";
import { QuestionView } from "@/components/assessment/question-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";

export type ReviewItem = QuestionReview & { lessonHref: string | null; questionId: string; domainTitle: string };

const noop = () => undefined;

export function ResultsReviewList({ items, tutorEnabled = true }: { items: ReviewItem[]; tutorEnabled?: boolean }) {
  const { t } = useI18n();
  const hasIncorrect = items.some((i) => !i.isCorrect);
  const [onlyIncorrect, setOnlyIncorrect] = React.useState(hasIncorrect);
  const numbered = items.map((item, i) => ({ item, n: i + 1 }));
  const shown = onlyIncorrect ? numbered.filter(({ item }) => !item.isCorrect) : numbered;

  return (
    <section aria-labelledby="review-answers-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="review-answers-heading" className="text-lg font-semibold tracking-tight">
          {t("assessment.results.reviewAnswers")}
        </h2>
        {hasIncorrect ? (
          <div role="group" aria-label={t("common.filter")} className="inline-flex rounded-md border p-0.5">
            <Button size="sm" variant={onlyIncorrect ? "ghost" : "secondary"} aria-pressed={!onlyIncorrect} onClick={() => setOnlyIncorrect(false)}>
              {t("assessment.results.showAll")}
            </Button>
            <Button size="sm" variant={onlyIncorrect ? "secondary" : "ghost"} aria-pressed={onlyIncorrect} onClick={() => setOnlyIncorrect(true)}>
              {t("assessment.results.showOnlyIncorrect")}
            </Button>
          </div>
        ) : null}
      </div>
      <ol className="space-y-4">
        {shown.map(({ item, n }) => (
          <li key={item.questionId}>
            <Card>
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{t("assessment.runner.question", { current: n, total: items.length })}</h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{item.domainTitle}</Badge>
                    {item.isCorrect ? (
                      <Badge variant="success">
                        <CheckCircle2 aria-hidden="true" />
                        {t("assessment.runner.correct")}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle aria-hidden="true" />
                        {item.response ? t("assessment.runner.incorrect") : t("assessment.runner.notAnswered")}
                      </Badge>
                    )}
                  </div>
                </div>
                <QuestionView question={item.question} value={item.response} onChange={noop} disabled review={item} idPrefix={`r${n}`} />
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {item.lessonHref ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={item.lessonHref}>
                        <BookOpen aria-hidden="true" />
                        {t("assessment.runner.relatedLesson")}
                      </Link>
                    </Button>
                  ) : null}
                  {tutorEnabled && item.response ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/tutor?questionId=${encodeURIComponent(item.questionId)}`}>
                        <MessageCircleQuestion aria-hidden="true" />
                        {t("assessment.results.askTutor")}
                      </Link>
                    </Button>
                  ) : null}
                  {!item.isCorrect ? (
                    <form action={startSimilarAction.bind(null, item.questionId)}>
                      <SubmitButton variant="outline" size="sm" pendingLabel={t("common.loading")}>
                        <Repeat aria-hidden="true" />
                        {t("assessment.runner.similarQuestion")}
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
