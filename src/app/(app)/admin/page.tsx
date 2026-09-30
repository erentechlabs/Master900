import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission, can } from "@/modules/auth/session";
import { PageHeader, StatCard, SectionTitle } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { resolveCurriculumAlert } from "./actions";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

export default async function AdminOverviewPage() {
  const user = await requirePermission("content:read_drafts");
  const { t, fmt } = await getI18n();
  const [learners, certifications, lessons, questions, pendingLessons, pendingQuestions, pendingLabs, aiDrafts, needsVerification, alerts, audit] = await Promise.all([
    prisma.user.count(),
    prisma.certification.count(),
    prisma.lesson.count({ where: { status: "PUBLISHED" } }),
    prisma.question.count({ where: { status: "PUBLISHED" } }),
    prisma.lesson.count({ where: { status: { in: ["TECHNICAL_REVIEW", "EDITORIAL_REVIEW", "APPROVED"] } } }),
    prisma.question.count({ where: { status: { in: ["TECHNICAL_REVIEW", "EDITORIAL_REVIEW", "APPROVED"] } } }),
    prisma.lab.count({ where: { status: { in: ["TECHNICAL_REVIEW", "EDITORIAL_REVIEW", "APPROVED"] } } }),
    prisma.question.count({ where: { authorType: "AI_GENERATED", status: "DRAFT" } }),
    Promise.all([prisma.lesson.count({ where: { needsVerification: true } }), prisma.question.count({ where: { needsVerification: true } }), prisma.lab.count({ where: { needsVerification: true } })]).then((v) => v.reduce((a, b) => a + b, 0)),
    prisma.curriculumAlert.findMany({ where: { resolvedAt: null }, include: { certification: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    can(user, "audit:view") ? prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.overview.title")} description={t("admin.overview.description")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("admin.overview.learners")} value={learners} />
        <StatCard label={t("admin.overview.certifications")} value={certifications} />
        <StatCard label={t("admin.overview.publishedLessons")} value={lessons} />
        <StatCard label={t("admin.overview.publishedQuestions")} value={questions} />
        <StatCard label={t("admin.overview.pendingReviews")} value={pendingLessons + pendingQuestions + pendingLabs} />
        <StatCard label={t("admin.overview.aiDrafts")} value={aiDrafts} />
        <StatCard label={t("admin.overview.verificationRequired")} value={needsVerification} />
      </div>
      <Card>
        <CardHeader><CardTitle>{t("admin.overview.openCurriculumAlerts")}</CardTitle></CardHeader>
        <CardContent>
          {alerts.length ? (
            <Table>
              <THead><TR><TH>{t("admin.common.certification")}</TH><TH>{t("admin.common.version")}</TH><TH>{t("admin.overview.message")}</TH><TH /></TR></THead>
              <TBody>{alerts.map((a) => (
                <TR key={a.id}>
                  <TD>{a.certification.code}</TD><TD>{a.fromVersion} → {a.toVersion}</TD><TD>{a.message}</TD>
                  <TD><form action={resolveCurriculumAlert as never}><input type="hidden" name="id" value={a.id} /><Button size="sm" variant="outline" type="submit">{t("admin.overview.resolve")}</Button></form></TD>
                </TR>
              ))}</TBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">{t("admin.overview.noAlerts")}</p>}
        </CardContent>
      </Card>
      <section>
        <SectionTitle>{t("admin.overview.quickLinks")}</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {[
            ["certifications", "certifications"],
            ["content", "content"],
            ["questions", "questions"],
            ["labs", "labs"],
            ["reviews", "reviews"],
            ["import-export", "importExport"],
            ["users", "users"],
            ["jobs", "jobs"],
            ["settings", "settings"],
          ].map(([href, key]) => <Button key={href} asChild variant="outline"><Link href={`/admin/${href}`}>{t(`admin.sections.${key}` as MessageKey)}</Link></Button>)}
        </div>
      </section>
      {audit.length ? (
        <Card>
          <CardHeader><CardTitle>{t("admin.overview.recentAudit")}</CardTitle></CardHeader>
          <CardContent>
            <Table><THead><TR><TH>{t("admin.audit.when")}</TH><TH>{t("admin.audit.actor")}</TH><TH>{t("admin.audit.action")}</TH><TH>{t("admin.audit.summary")}</TH></TR></THead><TBody>{audit.map((a) => <TR key={a.id}><TD>{fmt.dateTime(a.createdAt)}</TD><TD>{a.actorEmail ?? t("admin.common.system")}</TD><TD>{a.action}</TD><TD>{a.summary}</TD></TR>)}</TBody></Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
