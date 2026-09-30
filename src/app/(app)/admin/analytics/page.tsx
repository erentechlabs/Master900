import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { getSettings } from "@/modules/admin/settings";
import { percent } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/page";
import { BarList } from "@/components/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { flagQuestionForReview } from "../actions";
import { getI18n } from "@/i18n/server";

export default async function AnalyticsPage() {
  await requirePermission("analytics:view_anonymous");
  const { t } = await getI18n();
  const settings = await getSettings();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const eligibleUsers = await prisma.userPreference.findMany({ where: { shareAnonymousAnalytics: true }, select: { userId: true } });
  const userIds = eligibleUsers.map((u) => u.userId);
  if (userIds.length < settings["analytics.minCohort"]) return <div className="space-y-4"><PageHeader title={t("admin.analytics.title")} /><p className="rounded-lg border p-4 text-sm text-muted-foreground">{t("admin.analytics.cohortTooSmall", { count: settings["analytics.minCohort"] })}</p></div>;
  const [attempts, correct, activeLearners, byDomain, hardest, popular] = await Promise.all([
    prisma.questionAttempt.count({ where: { userId: { in: userIds }, answeredAt: { gte: since } } }),
    prisma.questionAttempt.count({ where: { userId: { in: userIds }, answeredAt: { gte: since }, isCorrect: true } }),
    prisma.learningEvent.groupBy({ by: ["userId"], where: { userId: { in: userIds }, occurredAt: { gte: since } } }),
    prisma.questionAttempt.groupBy({ by: ["domainId", "isCorrect"], where: { userId: { in: userIds }, answeredAt: { gte: since } }, _count: { _all: true } }),
    prisma.question.findMany({ where: { timesAnswered: { gte: 5 } }, orderBy: [{ timesCorrect: "asc" }], take: 10 }),
    prisma.lessonProgress.groupBy({ by: ["lessonId"], where: { userId: { in: userIds }, status: "COMPLETED" }, _count: { _all: true }, orderBy: { _count: { lessonId: "desc" } }, take: 10 }),
  ]);
  const domains = await prisma.examDomain.findMany({ where: { id: { in: byDomain.map((d) => d.domainId) } } });
  const domainData = domains.map((d) => { const rows = byDomain.filter((r) => r.domainId === d.id); const total = rows.reduce((a, r) => a + r._count._all, 0); const ok = rows.filter((r) => r.isCorrect).reduce((a, r) => a + r._count._all, 0); return { label: d.title, value: percent(ok, total), secondary: t("admin.common.answerCount", { count: total }) }; });
  const lessonTitles = await prisma.lesson.findMany({ where: { id: { in: popular.map((p) => p.lessonId) } }, select: { id: true, title: true } });
  const titles = new Map(lessonTitles.map((l) => [l.id, l.title]));
  return <div className="space-y-6"><PageHeader title={t("admin.analytics.title")} description={t("admin.analytics.shortSubtitle")} />
    <div className="grid gap-4 md:grid-cols-3"><StatCard label={t("admin.analytics.learners")} value={activeLearners.length} /><StatCard label={t("admin.analytics.attemptsShort")} value={attempts} /><StatCard label={t("admin.analytics.avgAccuracy")} value={`${percent(correct, attempts)}%`} /></div>
    <Card><CardHeader><CardTitle>{t("admin.analytics.domainAccuracy")}</CardTitle></CardHeader><CardContent><BarList data={domainData} caption={t("admin.analytics.domainAccuracy")} valueLabel={t("admin.analytics.accuracy")} toggleLabel={t("admin.analytics.showTable")} /></CardContent></Card>
    <Card><CardHeader><CardTitle>{t("admin.analytics.hardestQuestions")}</CardTitle></CardHeader><CardContent className="space-y-2">{hardest.map((q) => <div key={q.id} className="flex justify-between gap-2 rounded-md border p-2"><div><p className="font-medium">{q.stem}</p><p className="text-sm text-muted-foreground">{t("admin.common.correctPercent", { percent: percent(q.timesCorrect, q.timesAnswered) })} · {t("admin.common.answerCount", { count: q.timesAnswered })}</p></div><form action={flagQuestionForReview as never}><input type="hidden" name="questionId" value={q.id} /><Button type="submit" size="sm" variant="outline">{t("admin.analytics.flagForReview")}</Button></form></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>{t("admin.analytics.popularLessons")}</CardTitle></CardHeader><CardContent>{popular.map((p) => <p key={p.lessonId}>{titles.get(p.lessonId) ?? p.lessonId}: {p._count._all}</p>)}</CardContent></Card>
  </div>;
}
