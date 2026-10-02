import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { requirePermission } from "@/modules/auth/session";
import { PageHeader } from "@/components/page";
import { SettingsForms } from "@/components/settings/settings-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.title") };
}

export default async function SettingsPage() {
  const user = await requirePermission("learn:use", "/settings");
  const { t } = await getI18n();
  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />
      <SettingsForms
        user={{
          id: user.id,
          email: user.email,
          name: user.name,
          locale: user.locale,
          isDemo: user.isDemo,
          createdAt: user.createdAt.toISOString(),
          roles: user.roles,
        }}
        preference={
          user.preference
            ? {
                timezone: user.preference.timezone,
                studyDays: user.preference.studyDays,
                sessionMinutes: user.preference.sessionMinutes,
                dailyGoalMinutes: user.preference.dailyGoalMinutes,
                learningStyle: user.preference.learningStyle,
                experienceLevel: user.preference.experienceLevel,
                showTimerByDefault: user.preference.showTimerByDefault,
                gamificationEnabled: user.preference.gamificationEnabled,
                reducedMotion: user.preference.reducedMotion,
                accentColor: user.preference.accentColor,
                transparencyEffects: user.preference.transparencyEffects,
                shareAnonymousAnalytics: user.preference.shareAnonymousAnalytics,
              }
            : null
        }
      />
    </div>
  );
}
