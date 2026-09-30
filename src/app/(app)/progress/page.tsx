import type { Metadata } from "next";
import Link from "next/link";
import { Award, Clock, Target } from "lucide-react";
import { prisma } from "@/lib/db";
import { addDays, toISODate } from "@/lib/dates";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";
import { requirePermission } from "@/modules/auth/session";
import { domainMastery, streakInfo, totalXp } from "@/modules/analytics/data";
import { levelForXp } from "@/modules/analytics/gamification";
import { evaluateCertificateCriteria } from "@/modules/learning/certificates";
import { BarList, LineChart } from "@/components/charts";
import { PageHeader, SectionTitle, StatCard } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("progress.title") };
}

function weekKey(date: Date, timeZone: string): string {
  const iso = toISODate(date, timeZone);
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

export default async function ProgressPage() {
  const [{ t, fmt }, user] = await Promise.all([getI18n(), requirePermission("learn:use", "/progress")]);
  const timeZone = user.preference?.timezone ?? "UTC";
  const gamification = user.preference?.gamificationEnabled !== false;
  const now = new Date();
  const [enrollments, xp, streak, events, badges, allBadges, practiceAttempts] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      include: { certification: { select: { id: true, code: true, name: true, translations: true } } },
    }),
    totalXp(prisma, user.id),
    streakInfo(prisma, user.id, timeZone, now),
    prisma.learningEvent.findMany({ where: { userId: user.id, occurredAt: { gte: addDays(now, -90) } }, select: { occurredAt: true, durationSeconds: true, type: true } }),
    prisma.userBadge.findMany({ where: { userId: user.id }, include: { badge: true }, orderBy: { earnedAt: "desc" } }),
    prisma.badge.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.practiceExamAttempt.findMany({
      where: { userId: user.id, status: { in: ["SUBMITTED", "EXPIRED"] }, submittedAt: { not: null } },
      orderBy: { submittedAt: "asc" },
      include: { certification: { select: { code: true } } },
    }),
  ]);
  const level = levelForXp(xp);
  const earnedBadgeIds = new Set(badges.map((b) => b.badgeId));
  const weekly = new Map<string, number>();
  for (const event of events) {
    const key = weekKey(event.occurredAt, timeZone);
    weekly.set(key, (weekly.get(key) ?? 0) + Math.round((event.durationSeconds ?? 0) / 60));
  }
  const weekRows = [...weekly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, minutes]) => ({ label: date, value: minutes }));
  const bestExam = practiceAttempts.reduce<typeof practiceAttempts[number] | null>((best, attempt) => ((attempt.score ?? 0) > (best?.score ?? -1) ? attempt : best), null);
  const lessonEventsByDay = new Map<string, number>();
  events
    .filter((e) => e.type === "LESSON_COMPLETED")
    .forEach((e) => lessonEventsByDay.set(toISODate(e.occurredAt, timeZone), (lessonEventsByDay.get(toISODate(e.occurredAt, timeZone)) ?? 0) + 1));
  const mostLessons = Math.max(0, ...lessonEventsByDay.values());

  const certSections = await Promise.all(
    enrollments.map(async (enrollment) => {
      const [snapshots, mastery, domains, visibleLessons, completedLessons, fullPracticeSubmitted] = await Promise.all([
        prisma.readinessSnapshot.findMany({
          where: { userId: user.id, certificationId: enrollment.certificationId },
          orderBy: { createdAt: "asc" },
          take: 30,
        }),
        domainMastery(prisma, user.id, enrollment.certificationId, addDays(now, -90)),
        prisma.examDomain.findMany({ where: { certificationId: enrollment.certificationId }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true, translations: true } }),
        prisma.lesson.count({ where: { certificationId: enrollment.certificationId, status: { in: ["PUBLISHED", "OUTDATED"] } } }),
        prisma.lessonProgress.count({ where: { userId: user.id, status: "COMPLETED", lesson: { certificationId: enrollment.certificationId, status: { in: ["PUBLISHED", "OUTDATED"] } } } }),
        prisma.practiceExamAttempt.count({ where: { userId: user.id, certificationId: enrollment.certificationId, mode: "FULL", status: { in: ["SUBMITTED", "EXPIRED"] } } }),
      ]);
      return {
        enrollment,
        snapshots,
        mastery: domains.map((d) => ({ label: d.title, value: mastery.get(d.id)?.accuracy ?? 0, secondary: String(mastery.get(d.id)?.answers ?? 0) })),
        certificate: evaluateCertificateCriteria({ visibleLessons, completedLessons, fullPracticeSubmitted }),
      };
    }),
  );

  return (
    <div className="space-y-8">
      <PageHeader title={t("progress.title")} description={t("progress.subtitle")} />
      <Alert>{t("progress.readinessDisclaimer")}</Alert>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label={t("progress.streak")} value={t("learner.dashboard.streakDays", { count: streak.current })} hint={t("progress.longestStreak", { count: streak.longest })} icon={Target} />
        <StatCard label={t("progress.timeSpent")} value={fmt.duration(events.reduce((sum, event) => sum + (event.durationSeconds ?? 0), 0))} icon={Clock} />
        {gamification ? <StatCard label={t("progress.xpTotal")} value={xp} hint={t("learner.dashboard.level", { level: level.level })} icon={Award} /> : <StatCard label={t("progress.badges")} value={t("progress.gamificationOff")} icon={Award} />}
      </div>

      {certSections.map((section) => (
        <section key={section.enrollment.certificationId} className="space-y-4">
          <SectionTitle>{section.enrollment.certification.code} · {section.enrollment.certification.name}</SectionTitle>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("progress.readinessHistory")}</CardTitle>
              </CardHeader>
              <CardContent>
                {section.snapshots.length ? (
                  <LineChart
                    data={section.snapshots.map((s) => ({ label: fmt.calendarDate(s.createdAt), value: s.score, secondary: t(`enums.readinessLevel.${s.level}` as MessageKey) }))}
                    caption={t("progress.readinessHistory")}
                    valueLabel={t("progress.readinessLevel")}
                    toggleLabel={t("progress.chartTable")}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("progress.noData")}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("progress.domainMastery")}</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList data={section.mastery} caption={t("progress.domainMastery")} valueLabel={t("progress.accuracy")} toggleLabel={t("progress.chartTable")} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t("progress.certificates")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {section.certificate.completedLessons}/{section.certificate.visibleLessons} {t("progress.lessonCompletion")} · {section.certificate.fullPracticeSubmitted} {t("progress.practiceHistory")}
              </div>
              <Button asChild variant={section.certificate.earned ? "default" : "outline"}>
                <Link href={`/certificates/${section.enrollment.certification.code}`}>{t("progress.viewCertificate")}</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      ))}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("progress.practiceHistory")}</CardTitle>
          </CardHeader>
          <CardContent>
            {practiceAttempts.length ? (
              <LineChart data={practiceAttempts.map((a) => ({ label: `${a.certification?.code ?? ""} ${fmt.calendarDate(a.submittedAt!)}`, value: Math.round(a.score ?? 0) }))} caption={t("progress.practiceHistory")} valueLabel={t("progress.accuracy")} toggleLabel={t("progress.chartTable")} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("progress.noData")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("progress.timeSpent")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList data={weekRows} max={Math.max(60, ...weekRows.map((w) => w.value))} caption={t("progress.timeSpent")} valueSuffix="" valueLabel={t("progress.minutes")} toggleLabel={t("progress.chartTable")} />
          </CardContent>
        </Card>
      </div>

      {gamification ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("progress.allBadges")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {allBadges.map((badge) => (
                <div key={badge.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{badge.name}</p>
                    <Badge variant={earnedBadgeIds.has(badge.id) ? "success" : "secondary"}>{earnedBadgeIds.has(badge.id) ? t("progress.badges") : t("progress.locked")}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{badge.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("progress.personalBests")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table caption={t("progress.personalBests")}>
            <THead>
              <TR><TH>{t("common.details")}</TH><TH>{t("common.status")}</TH></TR>
            </THead>
            <TBody>
              <TR><TD>{t("progress.bestExam", { percent: Math.round(bestExam?.score ?? 0), code: bestExam?.certification?.code ?? "-" })}</TD><TD>{Math.round(bestExam?.score ?? 0)}%</TD></TR>
              <TR><TD>{t("progress.bestStreak", { count: streak.longest })}</TD><TD>{streak.longest}</TD></TR>
              <TR><TD>{t("progress.mostLessonsDay", { count: mostLessons })}</TD><TD>{mostLessons}</TD></TR>
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
