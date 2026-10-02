import type { Metadata } from "next";
import Link from "next/link";
import { Award, Clock, Target } from "lucide-react";
import { prisma } from "@/lib/db";
import { addDays, toISODate } from "@/lib/dates";
import { getI18n } from "@/i18n/server";
import { localizedField, type MessageKey, type TFunction } from "@/i18n/translator";
import { requirePermission } from "@/modules/auth/session";
import { badgeStats, domainMastery, streakInfo, totalXp } from "@/modules/analytics/data";
import { levelForXp, type BadgeCriteria, type BadgeStats } from "@/modules/analytics/gamification";
import { evaluateCertificateCriteria } from "@/modules/learning/certificates";
import { BarList, LineChart } from "@/components/charts";
import { DynamicIcon } from "@/components/icon";
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
  const [{ t, fmt, locale }, user] = await Promise.all([getI18n(), requirePermission("learn:use", "/progress")]);
  const timeZone = user.preference?.timezone ?? "UTC";
  const gamification = user.preference?.gamificationEnabled !== false;
  const now = new Date();
  const [enrollments, xp, streak, events, badges, allBadges, practiceAttempts, stats] = await Promise.all([
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
    badgeStats(prisma, user.id, timeZone, now),
  ]);
  const level = levelForXp(xp);
  const earnedByBadgeId = new Map(badges.map((b) => [b.badgeId, b]));
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
      const [latestSnapshots, mastery, domains, visibleLessons, completedLessons, fullPracticeSubmitted] = await Promise.all([
        // The 30 most recent snapshots (newest first), shown oldest to newest below.
        prisma.readinessSnapshot.findMany({
          where: { userId: user.id, certificationId: enrollment.certificationId },
          orderBy: { createdAt: "desc" },
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
        snapshots: latestSnapshots.reverse(),
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
        <StatCard label={t("progress.timeSpent")} value={fmt.studyTime(events.reduce((sum, event) => sum + (event.durationSeconds ?? 0), 0))} icon={Clock} />
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
              {allBadges.map((badge) => {
                const earned = earnedByBadgeId.get(badge.id);
                const title = localizedField(badge.name, badge.translations, locale, "name");
                const description = localizedField(badge.description, badge.translations, locale, "description");
                const progress = badgeProgress(badge.criteria as unknown as BadgeCriteria, stats, t);
                return (
                  <div key={badge.id} className={`rounded-lg border p-3 ${earned ? "bg-card" : "bg-muted/30"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${earned ? "bg-tint-brand text-primary" : "bg-muted text-muted-foreground"}`}>
                          <DynamicIcon name={badge.icon} className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">{title}</p>
                          {earned ? <p className="text-xs text-muted-foreground">{earned.scopeKey === "global" ? t("progress.earnedOnDate", { date: fmt.calendarDate(earned.earnedAt) }) : t("progress.earnedOn", { date: fmt.calendarDate(earned.earnedAt), scope: earned.scopeKey.split(":")[0] ?? earned.scopeKey })}</p> : null}
                        </div>
                      </div>
                      <Badge variant={earned ? "success" : "secondary"}>{earned ? t("progress.earned") : t("progress.locked")}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{earned ? description : t("progress.howToEarn", { description })}</p>
                    {!earned && progress ? <p className="mt-2 text-xs font-medium text-muted-foreground">{progress}</p> : null}
                  </div>
                );
              })}
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


function badgeProgress(criteria: BadgeCriteria, stats: BadgeStats, t: TFunction): string | null {
  switch (criteria.type) {
    case "labs_completed":
      return t("progress.badgeProgress", { done: Math.min(stats.labsCompleted, criteria.count), target: criteria.count });
    case "lessons_completed":
      return t("progress.badgeProgress", { done: Math.min(stats.lessonsCompleted, criteria.count), target: criteria.count });
    case "streak":
      return t("progress.badgeProgress", { done: Math.min(stats.currentStreak, criteria.days), target: criteria.days });
    case "xp":
      return t("progress.badgeProgress", { done: Math.min(stats.totalXp, criteria.amount), target: criteria.amount });
    case "quest_days":
      return t("progress.badgeProgress", { done: Math.min(stats.questDaysAllCompleted ?? 0, criteria.count), target: criteria.count });
    case "focus_sessions":
      return t("progress.badgeProgress", { done: Math.min(stats.focusSessions ?? 0, criteria.count), target: criteria.count });
    case "three_star_labs":
      return t("progress.badgeProgress", { done: Math.min(stats.threeStarLabs ?? 0, criteria.count), target: criteria.count });
    case "lightning_combo":
      return t("progress.badgeProgress", { done: Math.min(stats.bestLightningCombo ?? 0, criteria.combo), target: criteria.combo });
    case "lightning_correct":
      return t("progress.badgeProgress", { done: Math.min(stats.bestLightningCorrect ?? ((stats.lightningRoundsAtLeast8 ?? 0) > 0 ? criteria.minCorrect : 0), criteria.minCorrect), target: criteria.minCorrect });
    case "lab_cert_explorer":
      return t("progress.badgeProgress", { done: Math.min(stats.labCertificationsCompleted ?? 0, criteria.count), target: criteria.count });
    default:
      return null;
  }
}

