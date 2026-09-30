import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { requirePermission } from "@/modules/auth/session";
import { getLessonPageData } from "@/modules/learning/lesson";
import { startQuizAction } from "@/app/(app)/practice/actions";
import { BookmarkButton } from "@/components/learning/bookmark-button";
import { LessonRevealBlocks } from "@/components/learning/lesson-reveal-blocks";
import { PageHeader } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { completeLessonFormAction, saveNoteFormAction } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ code: string; lessonSlug: string }> }): Promise<Metadata> {
  const { lessonSlug } = await params;
  return { title: lessonSlug };
}

export default async function LessonPage({ params }: { params: Promise<{ code: string; lessonSlug: string }> }) {
  const { code, lessonSlug } = await params;
  const [{ t, fmt, locale }, user] = await Promise.all([getI18n(), requirePermission("learn:use", `/learn/${code}/${lessonSlug}`)]);
  const data = await getLessonPageData(code, lessonSlug, user, locale);
  if (!data) notFound();
  const { lesson, certification } = data;
  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/learn" className="hover:text-foreground">{t("learner.path.myPaths")}</Link> <span aria-hidden="true">/</span> <Link href={`/learn/${certification.code}`} className="hover:text-foreground">{certification.code}</Link> <span aria-hidden="true">/</span> <span>{lesson.title}</span>
      </nav>
      <PageHeader
        eyebrow={`${certification.code} · ${lesson.domainTitle} · ${lesson.moduleTitle}`}
        title={lesson.title}
        description={lesson.summary}
        actions={
          <div className="flex flex-wrap gap-2">
            <BookmarkButton targetType="LESSON" targetId={lesson.id} initialBookmarked={data.bookmarked} />
            <Button asChild variant="outline"><Link href={`/tutor?lessonId=${lesson.id}`}>{t("learner.lesson.askTutor")}</Link></Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{t("learner.lesson.readingTime", { count: lesson.estimatedMinutes })}</Badge>
        <Badge variant="outline">{t("learner.lesson.version", { version: lesson.version })}</Badge>
        {lesson.isDemo ? <Badge variant="purple">{t("learner.lesson.demoBadge")}</Badge> : null}
        {lesson.objective ? <Badge variant="info">{t("learner.lesson.objectiveRef", { code: lesson.objective.code, title: lesson.objective.title })}</Badge> : null}
      </div>
      {lesson.status === "OUTDATED" ? <Alert variant="warning" title={t("learner.lesson.outdatedBanner")} /> : null}
      {lesson.needsVerification ? <Alert variant="warning" title={t("learner.lesson.needsVerification")}><p>{lesson.verificationNote ?? t("learner.lesson.needsVerificationBody")}</p></Alert> : null}
      <p className="text-sm text-muted-foreground">{lesson.lastReviewedAt ? t("learner.lesson.reviewed", { date: fmt.calendarDate(lesson.lastReviewedAt) }) : t("common.neverReviewed")}</p>
      {lesson.translationState === "pending" ? <Alert variant="info">{t("common.translationPending")}</Alert> : null}
      {lesson.translationState === "missing" ? <Alert variant="info">{t("common.translationFallback")}</Alert> : null}

      <LessonRevealBlocks blocks={lesson.blocks} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t("learner.lesson.knowledgeCheck")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {lesson.quiz ? (
              <form action={startQuizAction.bind(null, lesson.quiz.id)} className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("learner.lesson.knowledgeCheckBody", { count: lesson.quiz.questionCount })}</p>
                {lesson.progress?.knowledgeCheckScore !== null && lesson.progress?.knowledgeCheckScore !== undefined ? <p className="text-sm font-medium">{t("learner.lesson.lastScore", { score: Math.round(lesson.progress.knowledgeCheckScore) })}</p> : null}
                <p className="text-xs text-muted-foreground">{t("learner.path.mastery", { percent: lesson.quiz.passPercent })}</p>
                <SubmitButton>{lesson.progress?.knowledgeCheckScore ? t("learner.lesson.retakeCheck") : t("learner.lesson.startCheck")}</SubmitButton>
              </form>
            ) : <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("learner.lesson.completed")}</CardTitle></CardHeader>
          <CardContent>
            <form action={completeLessonFormAction.bind(null, lesson.id)}>
              <SubmitButton variant={lesson.progress?.status === "COMPLETED" ? "success" : "default"}>{lesson.progress?.status === "COMPLETED" ? t("learner.lesson.completed") : t("learner.lesson.markComplete")}</SubmitButton>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("learner.lesson.notes")}</CardTitle></CardHeader>
          <CardContent>
            <form action={saveNoteFormAction.bind(null, lesson.id)} className="space-y-3">
              <Textarea name="body" maxLength={5000} defaultValue={data.note?.body ?? ""} placeholder={t("learner.lesson.notesPlaceholder")} />
              <SubmitButton pendingLabel={t("common.saving")}>{t("learner.lesson.saveNote")}</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="sources-title" className="space-y-3">
        <h2 id="sources-title" className="text-lg font-semibold">{t("learner.lesson.sources")}</h2>
        <p className="text-sm text-muted-foreground">{t("learner.lesson.sourcesNote")}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {lesson.sources.map((source) => (
            <li key={source.id} className="rounded-lg border p-3">
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                <ExternalLink className="mr-1 inline h-4 w-4" aria-hidden="true" />{source.title}<span className="sr-only"> {t("common.opensInNewTab")}</span>
              </a>
              <p className="text-xs text-muted-foreground">{source.publisher}</p>
            </li>
          ))}
        </ul>
      </section>

      <nav className="flex flex-wrap justify-between gap-3" aria-label="Lesson navigation">
        {data.prev ? <Button asChild variant="outline"><Link href={`/learn/${certification.code}/${data.prev.slug}`}>{t("learner.lesson.previous")}</Link></Button> : <span />}
        {data.next ? <Button asChild><Link href={`/learn/${certification.code}/${data.next.slug}`}>{t("learner.lesson.next")}</Link></Button> : null}
      </nav>
    </div>
  );
}

