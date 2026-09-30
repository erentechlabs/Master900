import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { StatusGlyph } from "@/components/ui/alert";

/** Legal notices at the end of the content layer (caption text). */
export async function SiteFooter() {
  const { t } = await getI18n();
  return (
    <footer className="no-print border-t border-stroke-divider px-4 py-5 sm:px-6 lg:px-9">
      <div data-content-width className="mx-auto w-full max-w-6xl space-y-2 text-xs text-muted-foreground">
        <p className="flex items-start gap-2 text-foreground">
          <span className="text-primary">
            <StatusGlyph variant="info" className="mt-px h-3.5 w-3.5" />
          </span>
          <span>{t("legal.disclaimer")}</span>
        </p>
        <p>{t("legal.trademarks")}</p>
        <p>{t("legal.sourcesNotice")}</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          <Link className="text-primary hover:underline" href="/certifications">
            {t("nav.certifications")}
          </Link>
          <Link className="text-primary hover:underline" href="/glossary">
            {t("nav.glossary")}
          </Link>
          <Link className="text-primary hover:underline" href="/settings#privacy">
            {t("legal.privacyTitle")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
