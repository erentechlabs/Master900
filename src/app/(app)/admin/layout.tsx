import Link from "next/link";
import { requirePermission } from "@/modules/auth/session";
import { visibleAdminSections } from "@/modules/auth/permissions";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("content:read_drafts");
  const { t } = await getI18n();
  const sections = visibleAdminSections(user.roles);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("admin.title")}</h1>
        <p className="text-muted-foreground">{t("admin.subtitle")}</p>
      </div>
      <nav aria-label={t("admin.common.adminSections")} className="flex gap-2 overflow-x-auto border-b pb-2">
        {sections.map((section) => (
          <Link key={section.key} href={section.href} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            {t(`admin.sections.${section.key}` as MessageKey)}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
