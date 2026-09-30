import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Award } from "lucide-react";
import { prisma } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { requirePermission } from "@/modules/auth/session";
import { loadCertificateRecord } from "@/modules/learning/certificates";
import { PageHeader } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { PrintButton } from "@/components/certificates/print-button";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const { t } = await getI18n();
  return { title: `${t("learner.certificate.title")} · ${code.toUpperCase()}` };
}

export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, { t, fmt }, user] = await Promise.all([params, getI18n(), requirePermission("learn:use", "/certificates")]);
  const record = await loadCertificateRecord(prisma, user.id, code);
  if (!record) notFound();
  const name = user.name ?? user.email;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t("learner.certificate.title")} description={t("learner.certificate.criteria")} actions={<PrintButton />} />
      <Alert variant="warning" title={t("learner.certificate.officialTitle")}>{t("learner.certificate.disclaimer")}</Alert>
      {record.criteria.earned ? (
        <Card className="overflow-hidden print:border-0 print:shadow-none">
          <CardContent className="p-8 text-center sm:p-12">
            <Award className="mx-auto mb-6 h-16 w-16 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t("learner.certificate.recordTitle")}</p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">{name}</h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              {t("learner.certificate.body", { name, track: `${record.cert.code}: ${record.cert.name}` })}
            </p>
            <dl className="mx-auto mt-8 grid max-w-2xl gap-4 text-left sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <dt className="text-sm text-muted-foreground">{t("planner.certification")}</dt>
                <dd className="mt-1 font-semibold">{record.cert.code} · {record.cert.name}</dd>
              </div>
              <div className="rounded-lg border p-4">
                <dt className="text-sm text-muted-foreground">{t("learner.certificate.issuedLabel")}</dt>
                <dd className="mt-1 font-semibold">{record.completionDate ? fmt.calendarDate(record.completionDate) : "-"}</dd>
              </div>
              <div className="rounded-lg border p-4 sm:col-span-2">
                <dt className="text-sm text-muted-foreground">{t("learner.certificate.verificationLabel")}</dt>
                <dd className="mt-1 font-mono font-semibold">{record.verificationId}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-5 p-6">
            <p className="text-muted-foreground">{t("learner.certificate.notEarned")}</p>
            <div>
              <p className="mb-2 text-sm font-medium">{t("progress.lessonCompletion")}: {record.criteria.completedLessons}/{record.criteria.visibleLessons}</p>
              <Progress value={record.criteria.completedLessons} max={Math.max(1, record.criteria.visibleLessons)} label={t("learner.dashboard.progressLabel", { percent: record.criteria.lessonPercent })} />
            </div>
            <p className="text-sm text-muted-foreground">{t("learner.certificate.practiceRequirement", { count: record.criteria.fullPracticeSubmitted })}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
