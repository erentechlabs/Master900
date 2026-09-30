import Link from "next/link";
import { ArrowRight, BookOpen, Clock, FlaskConical } from "lucide-react";
import type { TFunction } from "@/i18n/translator";
import type { Formatters } from "@/i18n/format";
import type { CatalogCert } from "@/modules/catalog/queries";
import { readableTextColor } from "@/lib/utils";
import { DynamicIcon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";

export function CertStatusBadge({ status, t }: { status: CatalogCert["status"]; t: TFunction }) {
  const variant = status === "ACTIVE" ? "success" : status === "RETIRED" ? "secondary" : status === "RETIRING" ? "warning" : "info";
  return <Badge variant={variant}>{t(`enums.certificationStatus.${status}`)}</Badge>;
}

export function CertIcon({ icon, color, size = "md" }: { icon: string; color: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-8 w-8" : "h-11 w-11";
  const iconDims = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-6 w-6";
  return (
    <span className={`flex ${dims} shrink-0 items-center justify-center rounded-lg`} style={{ background: color, color: readableTextColor(color) }}>
      <DynamicIcon name={icon} className={iconDims} />
    </span>
  );
}

export function CertificationCard({ cert, t, fmt }: { cert: CatalogCert; t: TFunction; fmt: Formatters }) {
  return (
    <article className="group relative flex h-full flex-col rounded-lg border bg-card p-5 transition-colors duration-100 hover:bg-muted/60">
      <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-lg" style={{ background: cert.themeColor }} aria-hidden="true" />
      <div className="mb-3 flex items-start gap-3">
        <CertIcon icon={cert.icon} color={cert.themeColor} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">{cert.code}</p>
          <h3 className="font-display text-base font-semibold leading-snug">
            <Link href={`/certifications/${cert.code}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {cert.name}
            </Link>
          </h3>
        </div>
        <CertStatusBadge status={cert.status} t={t} />
      </div>
      <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{cert.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {cert.status === "RETIRED" && cert.retirementDate ? <span>{t("catalog.retiredOn", { date: fmt.calendarDate(cert.retirementDate) })}</span> : null}
        {cert.replacementCode ? <span className="font-medium text-foreground">{t("catalog.replacedBy", { code: cert.replacementCode })}</span> : null}
        {cert.hasLearningPath ? (
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {t("common.lessonsCount", { count: cert.counts.lessons })}
          </span>
        ) : cert.status !== "RETIRED" ? (
          <span>{t("catalog.noLearningPath")}</span>
        ) : null}
        {cert.counts.labs ? (
          <span className="inline-flex items-center gap-1">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
            {t("catalog.labsCount", { count: cert.counts.labs })}
          </span>
        ) : null}
        {cert.effort ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {t("catalog.studyEffort", { min: cert.effort.min, max: cert.effort.max })}
          </span>
        ) : null}
      </div>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary" aria-hidden="true">
        {t("common.learnMore")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </article>
  );
}
