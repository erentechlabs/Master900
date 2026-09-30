import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toISODate } from "@/lib/dates";
import { getI18n } from "@/i18n/server";
import { authorize } from "@/modules/auth/session";
import { buildIcs } from "@/modules/planner/ics";

export async function GET() {
  const user = await authorize("learn:use");
  const { t } = await getI18n();
  const plans = await prisma.studyPlan.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { sessions: { where: { status: "PLANNED" }, orderBy: { scheduledAt: "asc" } }, certification: { select: { code: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const events = plans.flatMap((plan) =>
    plan.sessions.map((session) => ({
      uid: `${session.id}@fundamentals-academy.local`,
      title: session.title,
      description: `${plan.certification.code} · ${session.type}`,
      date: toISODate(session.scheduledAt),
      startTime: plan.preferredTime,
      durationMinutes: session.durationMinutes,
      url: `/plan`,
    })),
  );
  const body = buildIcs(events, { calendarName: t("planner.calendarName") });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fundamentals-academy-study-plan.ics"',
    },
  });
}

