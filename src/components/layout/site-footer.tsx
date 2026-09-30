import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getI18n } from "@/i18n/server";

export async function SiteFooter() {
  const { t } = await getI18n();
  return (
    <footer className="no-print border-t bg-card/60">
      <div className="mx-auto max-w-7xl space-y-3 px-4 py-6 text-xs text-muted-foreground lg:px-8">
        <p className="flex items-start gap-2 text-sm text-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{t("legal.disclaimer")}</span>
        </p>
        <p>{t("legal.trademarks")}</p>
        <p>{t("legal.sourcesNotice")}</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
          <Link className="hover:text-foreground hover:underline" href="/certifications">
            {t("nav.certifications")}
          </Link>
          <Link className="hover:text-foreground hover:underline" href="/glossary">
            {t("nav.glossary")}
          </Link>
          <Link className="hover:text-foreground hover:underline" href="/settings#privacy">
            {t("legal.privacyTitle")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
