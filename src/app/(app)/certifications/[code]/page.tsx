import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, BookOpen, CalendarCheck, ExternalLink, FlaskConical, Network, ClipboardCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/modules/auth/session";
import { getCatalogCert, getCertificationExtras } from "@/modules/catalog/queries";
import { CertIcon, CertStatusBadge } from "@/components/learning/certification-card";
import { SectionTitle } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { enrollAction } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const { locale } = await getI18n();
  const cert = await getCatalogCert(code, locale);
  return { title: cert ? `${cert.code}: ${cert.name}` : code };
}

export default async function CertificationDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [{ t, fmt, locale }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  const cert = await getCatalogCert(code, locale);
  if (!cert) notFound();
  if (cert.code !== code) redirect(`/certifications/${cert.code}`);
  const [extras, enrollment] = await Promise.all([
    getCertificationExtras(cert.id, locale),
    user ? prisma.enrollment.findUnique({ where: { userId_certificationId: { userId: user.id, certificationId: cert.id } } }) : null,
  ]);
  const enrolled = enrollment?.status === "ACTIVE";
  const retired = cert.status === "RETIRED";

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: cert.themeColor }} aria-hidden="true" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <CertIcon icon={cert.icon} color={cert.themeColor} size="lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">{cert.code}</span>
              <CertStatusBadge status={cert.status} t={t} />
              {cert.isDemoContent ? <Badge variant="purple">{t("common.demoContent")}</Badge> : null}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{cert.name}</h1>
            <p className="max-w-3xl text-muted-foreground">{cert.description}</p>
            <dl className="grid gap-x-6 gap-y-1 pt-2 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t("catalog.examVersion")}:</dt>
                <dd className="font-medium">{cert.examVersion ?? <Badge variant="warning">{t("common.verificationRequired")}</Badge>}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t("catalog.lastCurriculumReview")}:</dt>
                <dd className="font-medium">{cert.lastCurriculumReviewAt ? fmt.calendarDate(cert.lastCurriculumReviewAt) : t("common.verificationRequired")}</dd>
              </div>
              {cert.effort ? (
                <div className="flex gap-2 sm:col-span-2">
                  <dt className="text-muted-foreground">{t("catalog.studyEffort", { min: cert.effort.min, max: cert.effort.max })}</dt>
                  <dd className="text-xs text-muted-foreground">({t("catalog.studyEffortNote")})</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:w-56">
            {!retired ? (
              enrolled ? (
                <>
                  <Badge variant="success" className="justify-center py-1">
                    {t("catalog.enrolled")}
                  </Badge>
                  {cert.hasLearningPath ? (
                    <Button asChild>
                      <Link href={`/learn/${cert.code}`}>{t("catalog.continueLearning")}</Link>
                    </Button>
                  ) : null}
                </>
              ) : user ? (
                <form action={enrollAction.bind(null, cert.code)}>
                  <SubmitButton className="w-full">{t("catalog.enroll")}</SubmitButton>
                </form>
              ) : (
                <Button asChild>
                  <Link href={`/sign-in?callbackUrl=/certifications/${cert.code}`}>{t("catalog.signInToEnroll")}</Link>
                </Button>
              )
            ) : null}
            {cert.officialUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={cert.officialUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" />
                  {t("catalog.officialPage")}
                  <span className="sr-only"> {t("common.opensInNewTab")}</span>
                </a>
              </Button>
            ) : null}
            {cert.studyGuideUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={cert.studyGuideUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" />
                  {t("catalog.studyGuide")}
                  <span className="sr-only"> {t("common.opensInNewTab")}</span>
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {retired ? (
        <Alert variant="warning" title={t("catalog.retiredBanner")}>
          {cert.retirementDate ? <p>{t("catalog.retiredOn", { date: fmt.calendarDate(cert.retirementDate) })}</p> : null}
          {cert.replacementCode ? (
            <p>
              <Link href={`/certifications/${cert.replacementCode}`}>{t("catalog.replacedBy", { code: cert.replacementCode })}</Link>
            </p>
          ) : null}
        </Alert>
      ) : null}
      {cert.status === "RETIRING" && cert.retirementDate ? <Alert variant="warning" title={t("catalog.retiringOn", { date: fmt.calendarDate(cert.retirementDate) })} /> : null}
      {cert.isDemoContent ? <Alert variant="info">{t("catalog.demoNotice")}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="skills-title" className="space-y-4 lg:col-span-2">
          <SectionTitle id="skills-title">{t("catalog.skillsMeasured")}</SectionTitle>
          {cert.domains.length === 0 ? <p className="text-sm text-muted-foreground">{t("catalog.noDomains")}</p> : null}
          {cert.domains.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle>{d.title}</CardTitle>
                  {d.weightMin !== null && d.weightMax !== null ? (
                    <Badge variant="info">{t("catalog.weightRange", { min: d.weightMin, max: d.weightMax })}</Badge>
                  ) : (
                    <Badge variant="warning">{t("common.verificationRequired")}</Badge>
                  )}
                </div>
                {d.weightMax !== null ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${d.weightMax}%`, background: cert.themeColor }} />
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("catalog.skillAreas")}</p>
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {d.objectives.map((o) => (
                    <li key={o.code} className="flex gap-2">
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{o.code}</span>
                      <span>{o.title}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground">{t("legal.sourcesNotice")}</p>

          {extras.modules.length ? (
            <section aria-labelledby="path-title" className="pt-4">
              <SectionTitle id="path-title">{t("catalog.learningPath")}</SectionTitle>
              <ol className="space-y-2">
                {extras.modules.map((m, i) => (
                  <li key={m.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{m.title}</p>
                      {m.summary ? <p className="text-sm text-muted-foreground">{m.summary}</p> : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{t("common.lessonsCount", { count: m.lessonCount })}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </section>

        <aside className="space-y-4">
          {cert.hasLearningPath ? (
            <Card>
              <CardContent className="grid grid-cols-3 gap-2 p-4 text-center">
                <div>
                  <BookOpen className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
                  <p className="mt-1 text-lg font-semibold">{cert.counts.lessons}</p>
                  <p className="text-xs text-muted-foreground">{t("learner.path.lessons")}</p>
                </div>
                <div>
                  <ClipboardCheck className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
                  <p className="mt-1 text-lg font-semibold">{cert.counts.questions}</p>
                  <p className="text-xs text-muted-foreground">{t("nav.practice")}</p>
                </div>
                <div>
                  <FlaskConical className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
                  <p className="mt-1 text-lg font-semibold">{cert.counts.labs}</p>
                  <p className="text-xs text-muted-foreground">{t("nav.labs")}</p>
                </div>
              </CardContent>
            </Card>
          ) : !retired ? (
            <Alert variant="info" title={t("catalog.noLearningPath")} />
          ) : null}

          {cert.audience ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>{t("catalog.audience")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{cert.audience}</CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>{t("catalog.prerequisites")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {cert.prerequisites.length ? (
                <ul className="list-disc space-y-1 pl-4">
                  {cert.prerequisites.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : (
                t("catalog.noPrerequisites")
              )}
            </CardContent>
          </Card>

          {extras.related.length ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>{t("catalog.relatedCertifications")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {extras.related.map((r) => (
                    <li key={r.code}>
                      <Link href={`/certifications/${r.code}`} className="flex items-center gap-2 rounded-md p-1 text-sm hover:bg-muted">
                        <CertIcon icon={r.icon} color={r.themeColor} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{r.code}</span> <span className="text-muted-foreground">{r.name}</span>
                        </span>
                        {r.status === "RETIRED" ? <Badge variant="secondary">{t("enums.certificationStatus.RETIRED")}</Badge> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {extras.concepts.length ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t("catalog.conceptsTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">{t("catalog.conceptsBody")}</p>
                {extras.concepts.map((c) => (
                  <Link key={c.slug} href={`/concepts#${c.slug}`} className="block rounded-md border p-2 hover:bg-muted">
                    <span className="font-medium">{c.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{c.codes.join(" · ")}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {cert.verificationNotes || cert.unverifiedFields.length ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                  {t("catalog.verificationNotes")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {cert.verificationNotes ? <p>{cert.verificationNotes}</p> : null}
                {cert.unverifiedFields.length ? <p>{t("catalog.unverifiedFields", { fields: cert.unverifiedFields.join(", ") })}</p> : null}
              </CardContent>
            </Card>
          ) : null}
          {enrolled && enrollment?.targetExamDate ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              {fmt.calendarDate(enrollment.targetExamDate)}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
