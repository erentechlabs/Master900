import { requirePermission } from "@/modules/auth/session";
import { visibleAdminSections } from "@/modules/auth/permissions";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";

/** Admin area: the section bar sits above each section's own page title (one Title per page). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("content:read_drafts");
  const { t } = await getI18n();
  const sections = visibleAdminSections(user.roles).map((section) => ({ key: section.key, href: section.href, label: t(`admin.sections.${section.key}` as MessageKey) }));
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm">
          <span className="font-semibold">{t("admin.title")}</span>
          <span className="text-muted-foreground"> · {t("admin.subtitle")}</span>
        </p>
        <AdminSectionNav label={t("admin.common.adminSections")} sections={sections} />
      </div>
      {children}
    </div>
  );
}
