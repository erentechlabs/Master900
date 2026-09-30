import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, FlaskConical } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { requirePermission } from "@/modules/auth/session";
import { getLearningPath } from "@/modules/learning/path";
import { startQuizAction } from "@/app/(app)/practice/actions";
import { PageHeader, EmptyState, SectionTitle } from "@/components/page";
import { CertIcon, CertStatusBadge } from "@/components/learning/certification-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `${code.toUpperCase()} learning path` };
}

function lessonStatus(status: "IN_PROGRESS" | "COMPLETED" | null, t: Awaited<ReturnType<typeof getI18n>>["t"]) {
  if (status === "COMPLETED") return { label: t("common.completed"), variant: "success" as const };
  if (status === "IN_PROGRESS") return { label: t("common.inProgress"), variant: "info" as const };
  return { label: t("common.notStarted"), variant: "outline" as const };
}

export default async function LearningPathPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [{ t }, user] = await Promise.all([getI18n(), requirePermission("learn:use", `/learn/${code}`)]);
  const path = await getLearningPath(code, user.id, user.locale);
  if (!path) notFound();
  const enrolled = path.enrollment?.status === "ACTIVE";

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={path.certification.code}
        title={path.certification.name}
        description={path.certification.description}
        actions={
          <Button asChild variant="outline">
            <Link href={path.enrollment?.diagnosticCompletedAt ? "/practice" : `/diagnostic/${path.certification.code}`}>{path.enrollment?.diagnosticCompletedAt ? t("nav.practice") : t("learner.diagnostic.title")}</Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <CertIcon icon={path.certification.icon} color={path.certification.themeColor} size="sm" />
        <CertStatusBadge status={path.certification.status} t={t} />
        {path.certification.isDemoContent ? <Badge variant="purple">{t("common.demoContent")}</Badge> : null}
      </div>
      {!enrolled ? (
        <EmptyState title={t("learner.path.enrollFirst")} action={{ label: t("learner.path.browse"), href: `/certifications/${path.certification.code}` }} />
      ) : null}
      {path.certification.isDemoContent ? <Alert variant="info">{t("common.demoContentNotice")}</Alert> : null}
      {path.alerts.map((alert) => (
        <Alert key={alert.id} variant="warning" title={t("learner.dashboard.curriculumAlert", { code: path.certification.code })}>
          <p>{alert.message}</p>
        </Alert>
      ))}
      {path.recommendedNext ? (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>{t("learner.path.recommended")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">{path.recommendedNext.title}</p>
            <Button asChild>
              <Link href={`/learn/${path.certification.code}/${path.recommendedNext.slug}`}>{t("common.continue")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {path.focusDomainIds.length ? (
        <Alert variant="info" title={t("learner.diagnostic.focusAreas")}>
          {path.domains.filter((domain) => domain.isWeak).map((domain) => domain.title).join(" · ")}
        </Alert>
      ) : null}

      <section aria-labelledby="domains-title" className="space-y-4">
        <SectionTitle id="domains-title">{t("catalog.skillsMeasured")}</SectionTitle>
        {path.domains.map((domain) => (
          <Card key={domain.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>{domain.title}</CardTitle>
                  {domain.description ? <p className="mt-1 text-sm text-muted-foreground">{domain.description}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {domain.isWeak ? <Badge variant="warning">{t("learner.path.focusArea")}</Badge> : null}
                  <Badge variant="info">{t("learner.path.mastery", { percent: domain.mastery })}</Badge>
                  {domain.weightMin !== null && domain.weightMax !== null ? <Badge variant="outline">{t("learner.path.weight", { min: domain.weightMin, max: domain.weightMax })}</Badge> : null}
                </div>
              </div>
              <Progress value={domain.progress} label={t("learner.dashboard.progressLabel", { percent: domain.progress })} />
            </CardHeader>
            <CardContent className="space-y-4">
              {domain.modules.map((module) => (
                <section key={module.id} aria-labelledby={`module-${module.id}`} className="rounded-xl border p-4">
                  <h3 id={`module-${module.id}`} className="font-semibold">{module.title}</h3>
                  {module.summary ? <p className="mt-1 text-sm text-muted-foreground">{module.summary}</p> : null}
                  <ol className="mt-3 space-y-2">
                    {module.lessons.map((lesson) => {
                      const status = lessonStatus(lesson.progressStatus, t);
                      return (
                        <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3">
                          <Link href={`/learn/${path.certification.code}/${lesson.slug}`} className="font-medium text-primary hover:underline">{lesson.title}</Link>
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge variant={status.variant}>{status.label}</Badge>
                            {lesson.status === "OUTDATED" ? <Badge variant="warning">{t("learner.path.outdated")}</Badge> : null}
                            {lesson.knowledgeCheckScore !== null ? <span>{t("learner.lesson.lastScore", { score: Math.round(lesson.knowledgeCheckScore) })}</span> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" aria-hidden="true" />{t("learner.path.domainAssessment")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {path.quizzes.length ? path.quizzes.map((quiz) => (
              <form key={quiz.id} action={startQuizAction.bind(null, quiz.id)} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="font-medium">{quiz.title}</p>
                  <p className="text-sm text-muted-foreground">{t("common.questionsCount", { count: quiz.questionCount })} · {t("learner.lesson.lastScore", { score: quiz.bestScore })}</p>
                </div>
                <SubmitButton size="sm">{t("learner.path.startAssessment")}</SubmitButton>
              </form>
            )) : <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" aria-hidden="true" />{t("nav.labs")}</CardTitle></CardHeader>
          <CardContent>
            {path.labs.length ? (
              <ul className="space-y-2">
                {path.labs.map((lab) => (
                  <li key={lab.id} className="rounded-lg border p-3">
                    <Link href={`/labs/${lab.id}`} className="font-medium text-primary hover:underline">{lab.title}</Link>
                    <p className="text-sm text-muted-foreground">{lab.summary}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

