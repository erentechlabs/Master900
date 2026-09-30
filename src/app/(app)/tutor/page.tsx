import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { requirePermission } from "@/modules/auth/session";
import { MAX_TUTOR_INPUT, TUTOR_DEPTHS, TUTOR_MODES } from "@/modules/tutor/guard";
import { getTutorRuntimeSettings, listTutorConversations } from "@/modules/tutor/service";
import { PageHeader } from "@/components/page";
import { Alert } from "@/components/ui/alert";
import { TutorChat } from "@/components/tutor/tutor-chat";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("tutor.title") };
}

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ lessonId?: string; questionId?: string; certificationCode?: string }>;
}) {
  const user = await requirePermission("learn:use", "/tutor");
  const { t } = await getI18n();
  const sp = await searchParams;
  const settings = await getTutorRuntimeSettings();
  const [conversations, enrollments] = await Promise.all([
    listTutorConversations(user.id),
    prisma.enrollment.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: { certification: { select: { code: true, name: true } } },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("tutor.title")} description={t("tutor.subtitle")} />
      <Alert variant="info">{t("tutor.notice")}</Alert>
      {!settings.enabled ? (
        <Alert variant="warning" title={t("tutor.disabledTitle")}>
          {t("tutor.disabledBody")}
        </Alert>
      ) : null}
      <TutorChat
        conversations={conversations}
        certifications={enrollments.map((e) => ({ code: e.certification.code, name: e.certification.name }))}
        initialContext={{ lessonId: sp.lessonId, questionId: sp.questionId, certificationCode: sp.certificationCode }}
        maxInput={MAX_TUTOR_INPUT}
        modes={[...TUTOR_MODES]}
        depths={[...TUTOR_DEPTHS]}
        disabled={!settings.enabled}
      />
    </div>
  );
}
