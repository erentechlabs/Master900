import type { Metadata } from "next";
import { CalendarPlus } from "lucide-react";
import { prisma } from "@/lib/db";
import { todayISO, toISODate } from "@/lib/dates";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";
import { requirePermission } from "@/modules/auth/session";
import { defaultTargetDate, planSettingsFromPlan } from "@/modules/planner/service";
import { groupByWeek } from "@/modules/planner/grouping";
import { generatePlanFormAction } from "@/modules/planner/actions";
import { EmptyState, PageHeader, SectionTitle } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { SessionActions } from "@/components/planner/session-actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("planner.title") };
}

export default async function PlanPage() {
  const [{ t, fmt }, user] = await Promise.all([getI18n(), requirePermission("learn:use", "/plan")]);
  const timeZone = user.preference?.timezone ?? "UTC";
  const today = todayISO(timeZone);
  const [enrollments, activePlan] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId: user.id, status: "ACTIVE", certification: { hasLearningPath: true } },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      include: { certification: { select: { id: true, code: true, name: true } } },
    }),
    prisma.studyPlan.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      include: { certification: { select: { code: true, name: true } }, sessions: { orderBy: { scheduledAt: "asc" } } },
    }),
  ]);
  const defaults = activePlan
    ? planSettingsFromPlan(activePlan)
    : {
        certificationId: enrollments[0]?.certificationId ?? "",
        targetDate: enrollments[0]?.targetExamDate ? toISODate(enrollments[0].targetExamDate) : defaultTargetDate(timeZone),
        studyDays: user.preference?.studyDays.length ? user.preference.studyDays : [1, 2, 3, 4, 5],
        sessionMinutes: user.preference?.sessionMinutes ?? 30,
        revisionWeeks: 1,
        includePracticeExams: true,
        preferredTime: "18:00",
      };
  const sessions = activePlan?.sessions.map((session) => ({ ...session, date: toISODate(session.scheduledAt) })) ?? [];
  const weeks = groupByWeek(sessions);
  const adjustmentLog = (Array.isArray(activePlan?.adjustmentLog) ? activePlan?.adjustmentLog : []) as { at?: string; reason?: string }[];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("planner.title")}
        description={t("planner.subtitle")}
        actions={
          activePlan ? (
            <Button asChild variant="outline">
              <a href="/api/plan/ics">
                <CalendarPlus aria-hidden="true" />
                {t("planner.exportCalendar")}
              </a>
            </Button>
          ) : null
        }
      />
      {!enrollments.length ? <EmptyState title={t("planner.noPlan")} action={{ label: t("learner.dashboard.addCertification"), href: "/certifications" }} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>{activePlan ? t("planner.editTitle") : t("planner.createTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={generatePlanFormAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="reason" value={activePlan ? "regenerated" : "target_changed"} />
            <Field id="certificationId" label={t("planner.certification")} required>
              <Select name="certificationId" defaultValue={defaults.certificationId}>
                {enrollments.map((enrollment) => (
                  <option key={enrollment.certificationId} value={enrollment.certificationId}>
                    {enrollment.certification.code} · {enrollment.certification.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="targetDate" label={t("planner.targetDate")} required>
              <Input name="targetDate" type="date" defaultValue={defaults.targetDate} min={today} />
            </Field>
            <Field id="sessionMinutes" label={t("planner.sessionMinutes")} required>
              <Input name="sessionMinutes" type="number" min={10} max={240} step={5} defaultValue={defaults.sessionMinutes} />
            </Field>
            <Field id="preferredTime" label={t("planner.preferredTime")} required>
              <Input name="preferredTime" type="time" defaultValue={defaults.preferredTime} />
            </Field>
            <Field id="revisionWeeks" label={t("planner.revisionWeeks")} required>
              <Input name="revisionWeeks" type="number" min={0} max={8} defaultValue={defaults.revisionWeeks} />
            </Field>
            <label className="flex items-center gap-2 pt-7">
              <Checkbox name="includePracticeExams" defaultChecked={defaults.includePracticeExams} />
              <span className="text-sm font-medium">{t("planner.includePracticeExams")}</span>
            </label>
            <fieldset className="space-y-2 md:col-span-2">
              <legend className="text-sm font-medium">{t("planner.studyDays")}</legend>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 7 }, (_, day) => (
                  <label key={day} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <Checkbox name="studyDays" value={day} defaultChecked={defaults.studyDays.includes(day)} />
                    <span>{t(`learner.weekdaysShort.d${day}` as MessageKey)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="md:col-span-2">
              <SubmitButton pendingLabel={t("planner.generating")}>{activePlan ? t("planner.regenerate") : t("planner.generate")}</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      {activePlan?.warnings.length ? (
        <div className="space-y-2">
          {activePlan.warnings.map((warning) => (
            <Alert key={warning} variant="warning">
              {t(`planner.warning_${warning}` as MessageKey)}
            </Alert>
          ))}
        </div>
      ) : null}

      {activePlan ? (
        <section>
          <SectionTitle>{t("planner.upcoming")}</SectionTitle>
          {weeks.length ? (
            <div className="space-y-5">
              {weeks.map((week) => (
                <Card key={week.weekStart}>
                  <CardHeader>
                    <CardTitle>{t("planner.week", { date: fmt.calendarDate(new Date(`${week.weekStart}T00:00:00.000Z`)) })}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {week.days.map((day) => (
                        <section key={day.date} className={day.date === today ? "rounded-lg border border-primary/40 p-3" : "rounded-lg border p-3"}>
                          <h3 className="mb-2 font-medium">{fmt.calendarDate(new Date(`${day.date}T00:00:00.000Z`))}</h3>
                          <ul className="space-y-3">
                            {day.items.map((session) => (
                              <li key={session.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="font-medium">{session.title}</p>
                                  <p className="text-sm text-muted-foreground">
                                    <Badge variant={session.status === "COMPLETED" ? "success" : session.status === "MISSED" ? "warning" : "secondary"}>{t(`planner.status_${session.status}` as MessageKey)}</Badge>{" "}
                                    {t(`enums.studySessionType.${session.type}` as MessageKey)} · {t("common.minutes", { count: session.durationMinutes })}
                                  </p>
                                </div>
                                {session.status === "PLANNED" ? <SessionActions sessionId={session.id} /> : null}
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState title={t("planner.empty")} />
          )}
        </section>
      ) : null}

      {adjustmentLog.length ? (
        <section>
          <SectionTitle>{t("planner.adjustmentsTitle")}</SectionTitle>
          <ol className="space-y-2 text-sm text-muted-foreground">
            {adjustmentLog
              .slice(-5)
              .reverse()
              .map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  {entry.at ? fmt.dateTime(new Date(entry.at)) : ""} · {t(`planner.adjustment_${entry.reason ?? "regenerated"}` as MessageKey, { count: 1 })}
                </li>
              ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
