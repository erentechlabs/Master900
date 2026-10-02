import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ClipboardCheck, Flame, FlaskConical, PlayCircle, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { todayISO, toISODate } from "@/lib/dates";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";
import { localizedField } from "@/i18n/translator";
import { DynamicIcon } from "@/components/icon";
import { requirePermission } from "@/modules/auth/session";
import { loadDashboard } from "@/modules/analytics/dashboard";
import { loadDailyQuests } from "@/modules/analytics/quest-service";
import { labProductLabel } from "@/modules/labs/products";
import { buildStudyPlan, markMissedSessions, planSettingsFromPlan } from "@/modules/planner/service";
import { ActivityStrip, BarList, RingProgress } from "@/components/charts";
import { EmptyState } from "@/components/page";
import { DailyQuestsCard } from "@/components/dashboard/daily-quests-card";
import { LevelUpMoment } from "@/components/rewards/level-up-moment";
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

function dayPart(now: Date, timeZone: string): "morning" | "afternoon" | "evening" {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export default async function DashboardPage() {
  const [{ t, fmt, locale }, user] = await Promise.all([getI18n(), requirePermission("learn:use", "/dashboard")]);
  const timeZone = user.preference?.timezone ?? "UTC";
  const now = new Date();
  const missedByPlan = await markMissedSessions(prisma, user.id, timeZone);
  if (missedByPlan.size) {
    const plans = await prisma.studyPlan.findMany({ where: { id: { in: [...missedByPlan.keys()] }, userId: user.id, status: "ACTIVE" } });
    for (const plan of plans) await buildStudyPlan(prisma, user.id, planSettingsFromPlan(plan), { t, locale, timeZone, reason: "missed" });
  }
  const data = await loadDashboard(user.id, locale, timeZone, now);
  const quests = await loadDailyQuests(user.id, timeZone, now);
  const today = todayISO(timeZone, now);
  const todaySessions = data.sessions.filter((s) => toISODate(s.scheduledAt, timeZone) === today);
  const upcoming = data.sessions.filter((s) => toISODate(s.scheduledAt, timeZone) !== today).slice(0, 5);
  const gamification = data.user?.preference?.gamificationEnabled !== false;
  const action = data.nextAction;
  const actionLabel = t(`learner.dashboard.action_${action.type}` as MessageKey);
  const actionReason = t(`learner.dashboard.reason_${action.reason}` as MessageKey, action.params);
  const goalPercent = Math.min(100, Math.round((data.dailyGoal.doneMinutes / Math.max(1, data.dailyGoal.goalMinutes)) * 100));
  const nextLevelXp = data.level.nextLevelXp - data.xp;

  if (!data.user?.onboardingCompletedAt) {
    return (
      <div>
        <div className="mb-6 rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-title-lg font-semibold">{t("nav.dashboard")}</h1>
          <p className="mt-2 text-muted-foreground">{t("learner.dashboard.subtitle")}</p>
        </div>
        <EmptyState title={t("learner.onboarding.title")} description={t("learner.onboarding.subtitle")} action={{ label: t("learner.onboarding.finish"), href: "/onboarding" }} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-xl border border-stroke-card bg-gradient-to-br from-card via-layer to-card p-5 shadow-sm md:p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-center">
          <div className="space-y-4">
            <Badge variant="info">{data.primary?.certification.code ?? t("learner.dashboard.yourCertifications")}</Badge>
            <div>
              <h1 className="text-title-lg font-semibold tracking-tight md:text-3xl">
                {t(`learner.dashboard.good_${dayPart(now, timeZone)}` as MessageKey, { name: data.user.name ?? t("learner.dashboard.learnerName") })}
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">{t("learner.dashboard.subtitle")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-card/70 p-3">
                <div className="mb-2 flex items-center justify-between text-sm"><span>{t("learner.dashboard.level", { level: data.level.level })}</span><Trophy className="h-4 w-4 text-primary" /></div>
                <Progress value={data.level.progress} label={t("learner.dashboard.progressLabel", { percent: data.level.progress })} />
                <p className="mt-2 text-xs text-muted-foreground">{t("learner.dashboard.xpToNext", { xp: nextLevelXp, level: data.level.level + 1 })}</p>
              </div>
              <div className="rounded-lg border bg-card/70 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm"><Flame className="h-4 w-4 text-warning motion-safe:animate-flicker" />{t("learner.dashboard.streakDays", { count: data.streak.current })}</div>
                <div className="flex gap-1" aria-label={t("learner.dashboard.lastSevenDays")}>{data.activeStrip.slice(-7).map((d) => <span key={d.date} title={d.label} className={`h-3 w-3 rounded-full border ${d.active ? "border-warning bg-warning" : "bg-muted"}`} />)}</div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-card/70 p-3">
                <RingProgress value={goalPercent} label={t("learner.dashboard.dailyGoal")} size={72} display={`${goalPercent}%`} />
                <div><p className="text-sm font-medium">{t("learner.dashboard.dailyGoal")}</p><p className="text-xs text-muted-foreground">{t("learner.dashboard.dailyGoalProgress", { done: data.dailyGoal.doneMinutes, goal: data.dailyGoal.goalMinutes })}</p></div>
              </div>
            </div>
          </div>
          <Card className="bg-card/80">
            <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />{t("learner.dashboard.nextAction")}</CardTitle></CardHeader>
            <CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{actionReason}</p><Button asChild><Link href={action.href}>{actionLabel}</Link></Button></CardContent>
          </Card>
        </div>
      </section>

      <LevelUpMoment level={data.level.level} />
      {data.curriculumAlerts.map((alert) => <Alert key={alert.id} variant="warning" title={t("learner.dashboard.curriculumAlert", { code: alert.certification.code })}>{alert.message}</Alert>)}

      <section className="space-y-3">
        <h2 className="text-title font-semibold">{t("learner.dashboard.jumpBackIn")}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <JumpCard icon={BookOpen} title={t("learner.dashboard.continueLearning")} body={data.jumpBackIn.continueLesson?.title ?? t("learner.dashboard.noContinue")} href={data.jumpBackIn.continueLesson?.href} badge={data.jumpBackIn.continueLesson?.code} />
          <JumpCard icon={FlaskConical} title={t("learner.dashboard.resumeLab")} body={data.jumpBackIn.inProgressLab ? t("learner.dashboard.labProgress", { percent: data.jumpBackIn.inProgressLab.stepProgress }) : t("learner.dashboard.noLabProgress")} href={data.jumpBackIn.inProgressLab?.href} badge={data.jumpBackIn.inProgressLab?.code} />
          <JumpCard icon={PlayCircle} title={t("learner.dashboard.resumePractice")} body={data.jumpBackIn.resumePractice ? t("learner.dashboard.practiceProgress", { done: data.jumpBackIn.resumePractice.answered, total: data.jumpBackIn.resumePractice.total }) : t("learner.dashboard.noPracticeProgress")} href={data.jumpBackIn.resumePractice?.href} badge={data.jumpBackIn.resumePractice?.code ?? undefined} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2">
          <DailyQuestsCard state={quests} />
          <Card><CardHeader><CardTitle>{data.primary ? t("learner.dashboard.readinessFor", { code: data.primary.certification.code }) : t("learner.dashboard.readinessTitle")}</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-[auto_1fr]">{data.readiness ? <><RingProgress value={data.readiness.score} label={t("learner.dashboard.readinessTitle")} /><div className="space-y-3"><Badge variant="info">{t(`enums.readinessLevel.${data.readiness.level}` as MessageKey)}</Badge><p className="text-sm text-muted-foreground">{t("progress.readinessDisclaimer")}</p><ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">{(Array.isArray(data.readiness.signals) ? data.readiness.signals : []).slice(0, 4).map((signal) => { const row = signal as { key: string; points: number }; return <li key={row.key}>{t(`progress.signal_${row.key}` as MessageKey)} · {t("progress.points", { points: row.points, max: 100 })}</li>; })}</ul></div></> : <p className="text-sm text-muted-foreground">{t("progress.noData")}</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t("learner.dashboard.todayPlan")}</CardTitle></CardHeader><CardContent>{todaySessions.length ? <ul className="space-y-3">{todaySessions.map((session) => <li key={session.id} className="rounded-lg border p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{session.title}</p><p className="text-sm text-muted-foreground">{t(`enums.studySessionType.${session.type}` as MessageKey)} · {t("common.minutes", { count: session.durationMinutes })}</p></div><div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link href={session.href}>{t("planner.startSession")}</Link></Button><SessionActions sessionId={session.id} compact /></div></div></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("learner.dashboard.noSessionsToday")}</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t("learner.dashboard.weakConcepts")}</CardTitle></CardHeader><CardContent>{data.mastery.some((m) => m.answers > 0) ? <BarList data={data.mastery.map((m) => ({ label: m.title, value: m.accuracy, secondary: t("progress.answers", { count: m.answers }) }))} caption={t("progress.domainMastery")} valueLabel={t("progress.accuracy")} toggleLabel={t("progress.chartTable")} /> : <p className="text-sm text-muted-foreground">{t("learner.dashboard.noWeakConcepts")}</p>}</CardContent></Card>
        </section>
        <aside className="space-y-6">
          <Card><CardHeader><CardTitle>{t("learner.dashboard.recommendedLabs")}</CardTitle></CardHeader><CardContent>{data.recommendedLabs.length ? <ul className="space-y-3">{data.recommendedLabs.map((lab) => <li key={lab.id} className="rounded-lg border p-3"><Link href={lab.href} className="font-medium text-primary hover:underline">{lab.title}</Link><p className="mt-1 text-xs text-muted-foreground">{lab.code} · {labProductLabel(lab.product, t)} · {t("common.minutes", { count: lab.estimatedMinutes })}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{lab.summary}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("learner.dashboard.noRecommendedLabs")}</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t("learner.dashboard.reviewQueue")}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-2xl font-semibold">{data.dueReviews ? t("learner.dashboard.dueNow", { count: data.dueReviews }) : t("learner.dashboard.reviewEmpty")}</p><Button asChild variant="secondary" size="sm"><Link href="/practice/mistakes?due=1">{t("learner.dashboard.action_review")}</Link></Button></CardContent></Card>
          <Card><CardHeader><CardTitle>{t("learner.dashboard.dailyChallenge")}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{data.dailyChallengeDone ? t("learner.dashboard.dailyChallengeDone") : t("learner.dashboard.dailyChallengeBody")}</p><Button asChild variant={data.dailyChallengeDone ? "outline" : "default"} size="sm"><Link href="/practice?mode=DAILY">{t("learner.dashboard.startChallenge")}</Link></Button></CardContent></Card>
          <Card><CardHeader><CardTitle>{t("learner.dashboard.upcomingSessions")}</CardTitle></CardHeader><CardContent>{upcoming.length ? <ol className="space-y-2">{upcoming.map((session) => <li key={session.id} className="text-sm"><Link href={session.href} className="font-medium text-primary hover:underline">{fmt.calendarDate(session.scheduledAt)} · {session.title}</Link></li>)}</ol> : <p className="text-sm text-muted-foreground">{t("learner.dashboard.noUpcoming")}</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>{t("learner.dashboard.dailyGoal")}</CardTitle></CardHeader><CardContent className="space-y-3"><Progress value={data.dailyGoal.doneMinutes} max={data.dailyGoal.goalMinutes} label={t("learner.dashboard.dailyGoalProgress", { done: data.dailyGoal.doneMinutes, goal: data.dailyGoal.goalMinutes })} /><ActivityStrip days={data.activeStrip} caption={t("learner.dashboard.streak")} /></CardContent></Card>
          {gamification ? <Card><CardHeader><CardTitle>{t("learner.dashboard.recentBadges")}</CardTitle></CardHeader><CardContent>{data.recentBadges.length ? <ul className="space-y-2">{data.recentBadges.map((badge) => <li key={badge.id} className="flex items-center gap-2 text-sm"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-tint-brand text-primary"><DynamicIcon name={badge.badge.icon} className="h-4 w-4" /></span><span className="font-medium">{localizedField(badge.badge.name, badge.badge.translations, locale, "name")}</span><span className="text-muted-foreground">· {fmt.calendarDate(badge.earnedAt)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("learner.dashboard.noBadges")}</p>}</CardContent></Card> : null}
        </aside>
      </div>
    </div>
  );
}

function JumpCard({ icon: Icon, title, body, href, badge }: { icon: LucideIcon; title: string; body: string; href?: string; badge?: string }) {
  const content = <div className="group flex h-full min-h-28 flex-col justify-between rounded-lg border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"><div><div className="mb-3 flex items-center justify-between"><Icon className="h-5 w-5 text-primary" aria-hidden="true" />{badge ? <Badge variant="outline">{badge}</Badge> : null}</div><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{body}</p></div></div>;
  return href ? <Link href={href}>{content}</Link> : content;
}

