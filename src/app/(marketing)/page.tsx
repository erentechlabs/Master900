import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, Bot, CalendarDays, ClipboardCheck, FlaskConical, ShieldCheck } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { listCatalog } from "@/modules/catalog/queries";
import { CertificationCard } from "@/components/learning/certification-card";
import { Alert, StatusGlyph } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default async function LandingPage() {
  const { t, fmt, locale } = await getI18n();
  const catalog = (await listCatalog(locale)).filter((c) => c.status !== "RETIRED");
  const features = [
    { icon: CalendarDays, title: t("landing.featurePlanTitle"), body: t("landing.featurePlanBody"), tile: "bg-tint-brand text-primary" },
    { icon: BookOpen, title: t("landing.featureLessonsTitle"), body: t("landing.featureLessonsBody"), tile: "bg-accent text-accent-foreground" },
    { icon: ClipboardCheck, title: t("landing.featurePracticeTitle"), body: t("landing.featurePracticeBody"), tile: "bg-tint-success text-success" },
    { icon: FlaskConical, title: t("landing.featureLabsTitle"), body: t("landing.featureLabsBody"), tile: "bg-tint-brand text-primary" },
    { icon: Bot, title: t("landing.featureTutorTitle"), body: t("landing.featureTutorBody"), tile: "bg-accent text-accent-foreground" },
    { icon: BarChart3, title: t("landing.featureProgressTitle"), body: t("landing.featureProgressBody"), tile: "bg-tint-warning text-warning" },
  ];
  const sectionTitle = "font-display text-[24px] font-semibold leading-8 sm:text-title";
  return (
    <div>
      <section className="relative overflow-hidden border-b border-stroke-divider">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_90%_at_85%_0%,hsl(var(--primary)/0.14),transparent_70%),radial-gradient(45%_70%_at_0%_100%,hsl(var(--brand-purple)/0.10),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-9">
          <p className="mb-4 inline-flex h-6 items-center gap-1.5 rounded border border-control-stroke bg-control px-2 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {t("landing.heroEyebrow")}
          </p>
          <h1 className="max-w-3xl font-display text-[32px] font-semibold leading-10 sm:text-title-lg">{t("landing.heroTitle")}</h1>
          <p className="mt-4 max-w-2xl text-body-lg text-muted-foreground">{t("landing.heroSubtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link href="/dashboard">
                {t("landing.ctaStart")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/certifications">{t("landing.ctaCatalog")}</Link>
            </Button>
          </div>
          <Alert variant="info" className="mt-8 max-w-3xl">
            {t("legal.disclaimer")}
          </Alert>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-9" aria-labelledby="features-title">
        <h2 id="features-title" className={sectionTitle}>
          {t("landing.featuresTitle")}
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-5">
              <span className={`flex h-10 w-10 items-center justify-center rounded-md ${f.tile}`}>
                <f.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-stroke-divider bg-background/60" aria-labelledby="how-title">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-9">
          <h2 id="how-title" className={sectionTitle}>
            {t("landing.howTitle")}
          </h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-4">
            {[t("landing.howStep1"), t("landing.howStep2"), t("landing.howStep3"), t("landing.howStep4")].map((step, i) => (
              <li key={step} className="rounded-lg border bg-card p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                <p className="mt-3 text-sm">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-9" aria-labelledby="catalog-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="catalog-title" className={sectionTitle}>
              {t("landing.catalogTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("landing.catalogSubtitle")}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/certifications">{t("common.viewAll")}</Link>
          </Button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.map((c) => (
            <CertificationCard key={c.id} cert={c} t={t} fmt={fmt} />
          ))}
        </div>
      </section>

      <section className="border-t border-stroke-divider bg-background/60" aria-labelledby="trust-title">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-9">
          <h2 id="trust-title" className={sectionTitle}>
            {t("landing.trustTitle")}
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[t("landing.trustOriginal"), t("landing.trustSources"), t("landing.trustReview"), t("landing.trustPrivacy")].map((item) => (
              <li key={item} className="flex gap-3 rounded-lg border bg-card p-4 text-sm">
                <span className="text-success">
                  <StatusGlyph variant="success" className="mt-0.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
