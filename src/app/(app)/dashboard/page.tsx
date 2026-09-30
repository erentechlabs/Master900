import type { Metadata } from "next";
import Link from "next/link";
import { Award, BookOpen, CalendarDays, ClipboardCheck, Flame, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { todayISO, toISODate } from "@/lib/dates";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";
import { requirePermission } from "@/modules/auth/session";
import { loadDashboard } from "@/modules/analytics/dashboard";
import { buildStudyPlan, markMissedSessions, planSettingsFromPlan } from "@/modules/planner/service";
import { ActivityStrip, BarList, RingProgress } from "@/components/charts";
import { EmptyState, PageHeader, StatCard } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { SessionActions } from "@/components/planner/session-actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.dashboard") };
}

export default async function DashboardPage() {
  const [{ t, fmt, locale }, user] = await Promise.all([getI18n(), requirePermission("learn:use", "/dashboard")]);
  const timeZone = user.preference?.timezone ?? "UTC";
  // Missed sessions are marked and the affected plans are rebalanced before the dashboard is shown.
  const missedByPlan = await markMissedSessions(prisma, user.id, timeZone);
  if (missedByPlan.size) {
    const plans = await prisma.studyPlan.findMany({ where: { id: { in: [...missedByPlan.keys()] }, userId: user.id, status: "ACTIVE" } });
    for (const plan of plans) await buildStudyPlan(prisma, user.id, planSettingsFromPlan(plan), { t, locale, timeZone, reason: "missed" });
  }
  const data = await loadDashboard(user.id, locale, timeZone);
  const today = todayISO(timeZone);
  const todaySessions = data.sessions.filter((s) => toISODate(s.scheduledAt) === today);
  const upcoming = data.sessions.filter((s) => toISODate(s.scheduledAt) !== today).slice(0, 5);
  const gamification = data.user?.preference?.gamificationEnabled !== false;
  const action = data.nextAction;
  const actionLabel = t(`learner.dashboard.action_${action.type}` as MessageKey);
  const actionReason = t(`learner.dashboard.reason_${action.reason}` as MessageKey, action.params);

  if (!data.user?.onboardingCompletedAt) {
    return (
      <div>
        <PageHeader title={t("nav.dashboard")} description={t("learner.dashboard.subtitle")} />
        <EmptyState title={t("learner.onboarding.title")} description={t("learner.onboarding.subtitle")} action={{ label: t("learner.onboarding.finish"), href: "/onboarding" }} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title={data.user.name ? t("learner.dashboard.greeting", { name: data.user.name }) : t("learner.dashboard.greetingNoName")} description={t("learner.dashboard.subtitle")} />

      {data.curriculumAlerts.map((alert) => (
        <Alert key={alert.id} variant="warning" title={t("learner.dashboard.curriculumAlert", { code: alert.certification.code })}>
          {alert.message}
        </Alert>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("learner.dashboard.nextAction")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">{actionReason}</p>
          <Button asChild>
            <Link href={action.href}>{actionLabel}</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label={t("learner.dashboard.streak")} value={t("learner.dashboard.streakDays", { count: data.streak.current })} icon={Flame} />
        <StatCard label={t("learner.dashboard.dailyGoal")} value={t("learner.dashboard.dailyGoalProgress", { done: data.dailyGoal.doneMinutes, goal: data.dailyGoal.goalMinutes })} icon={CalendarDays} />
        {gamification ? (
          <StatCard label={t("progress.xpTotal")} value={data.xp} hint={t("learner.dashboard.level", { level: data.level.level })} icon={Trophy} />
        ) : (
          <StatCard label={t("progress.badges")} value={t("progress.gamificationOff")} icon={Award} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{data.primary ? t("learner.dashboard.readinessFor", { code: data.primary.certification.code }) : t("learner.dashboard.readinessTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[auto_1fr]">
              {data.readiness ? (
                <>
                  <RingProgress value={data.readiness.score} label={t("learner.dashboard.readinessTitle")} />
                  <div className="space-y-3">
                    <Badge variant="info">{t(`enums.readinessLevel.${data.readiness.level}` as MessageKey)}</Badge>
                    <p className="text-sm text-muted-foreground">{t("progress.readinessDisclaimer")}</p>
                    <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                      {(Array.isArray(data.readiness.signals) ? data.readiness.signals : []).slice(0, 4).map((signal) => {
                        const row = signal as { key: string; points: number };
                        return (
                          <li key={row.key}>
                            {t(`progress.signal_${row.key}` as MessageKey)} · {t("progress.points", { points: row.points, max: 100 })}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("progress.noData")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("learner.dashboard.todayPlan")}</CardTitle>
            </CardHeader>
            <CardContent>
              {todaySessions.length ? (
                <ul className="space-y-3">
                  {todaySessions.map((session) => (
                    <li key={session.id} className="rounded-lg border p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">{session.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {t(`enums.studySessionType.${session.type}` as MessageKey)} · {t("common.minutes", { count: session.durationMinutes })}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={session.href}>{t("planner.startSession")}</Link>
                          </Button>
                          <SessionActions sessionId={session.id} compact />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("learner.dashboard.noSessionsToday")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("learner.dashboard.weakConcepts")}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.mastery.some((m) => m.answers > 0) ? (
                <BarList data={data.mastery.map((m) => ({ label: m.title, value: m.accuracy, secondary: t("progress.answers", { count: m.answers }) }))} caption={t("progress.domainMastery")} valueLabel={t("progress.accuracy")} toggleLabel={t("progress.chartTable")} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("learner.dashboard.noWeakConcepts")}</p>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("learner.dashboard.continueLearning")}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.continueLesson ? (
                <Button asChild variant="outline">
                  <Link href={data.continueLesson.href}>
                    <BookOpen aria-hidden="true" />
                    {data.continueLesson.title}
                  </Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">{t("learner.dashboard.noContinue")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("learner.dashboard.reviewQueue")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl font-semibold">{data.dueReviews ? t("learner.dashboard.dueNow", { count: data.dueReviews }) : t("learner.dashboard.reviewEmpty")}</p>
              <Button asChild variant="secondary" size="sm">
                <Link href="/practice/mistakes?due=1">{t("learner.dashboard.action_review")}</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("learner.dashboard.dailyChallenge")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{data.dailyChallengeDone ? t("learner.dashboard.dailyChallengeDone") : t("learner.dashboard.dailyChallengeBody")}</p>
              <Button asChild variant={data.dailyChallengeDone ? "outline" : "default"} size="sm">
                <Link href="/practice?mode=DAILY">{t("learner.dashboard.startChallenge")}</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("learner.dashboard.upcomingSessions")}</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length ? (
                <ol className="space-y-2">
                  {upcoming.map((session) => (
                    <li key={session.id} className="text-sm">
                      <Link href={session.href} className="font-medium text-primary hover:underline">
                        {fmt.calendarDate(session.scheduledAt)} · {session.title}
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">{t("learner.dashboard.noUpcoming")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("learner.dashboard.dailyGoal")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={data.dailyGoal.doneMinutes} max={data.dailyGoal.goalMinutes} label={t("learner.dashboard.dailyGoalProgress", { done: data.dailyGoal.doneMinutes, goal: data.dailyGoal.goalMinutes })} />
              <ActivityStrip days={data.activeStrip} caption={t("learner.dashboard.streak")} />
            </CardContent>
          </Card>

          {gamification ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("learner.dashboard.recentBadges")}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentBadges.length ? (
                  <ul className="space-y-2">
                    {data.recentBadges.map((badge) => (
                      <li key={badge.id} className="text-sm">
                        <span className="font-medium">{badge.badge.name}</span> · {fmt.calendarDate(badge.earnedAt)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("learner.dashboard.noBadges")}</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
