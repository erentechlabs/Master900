import Link from "next/link";
import { BarChart3, BookOpen, Bot, CalendarDays, ClipboardCheck, FlaskConical, ShieldCheck } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/modules/auth/session";
import { listCatalog } from "@/modules/catalog/queries";
import { CertificationCard } from "@/components/learning/certification-card";
import { Button } from "@/components/ui/button";

export default async function LandingPage() {
  const [{ t, fmt, locale }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  const catalog = (await listCatalog(locale)).filter((c) => c.status !== "RETIRED");
  const features = [
    { icon: CalendarDays, title: t("landing.featurePlanTitle"), body: t("landing.featurePlanBody"), color: "text-brand-blue" },
    { icon: BookOpen, title: t("landing.featureLessonsTitle"), body: t("landing.featureLessonsBody"), color: "text-brand-purple" },
    { icon: ClipboardCheck, title: t("landing.featurePracticeTitle"), body: t("landing.featurePracticeBody"), color: "text-brand-teal" },
    { icon: FlaskConical, title: t("landing.featureLabsTitle"), body: t("landing.featureLabsBody"), color: "text-brand-green" },
    { icon: Bot, title: t("landing.featureTutorTitle"), body: t("landing.featureTutorBody"), color: "text-brand-purple" },
    { icon: BarChart3, title: t("landing.featureProgressTitle"), body: t("landing.featureProgressBody"), color: "text-brand-blue" },
  ];
  return (
    <div>
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-primary/10 via-background to-accent">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24 lg:px-8">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {t("landing.heroEyebrow")}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{t("landing.heroTitle")}</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{t("landing.heroSubtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <Button asChild size="lg">
                <Link href="/dashboard">{t("landing.ctaDashboard")}</Link>
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link href="/sign-up">{t("landing.ctaStart")}</Link>
              </Button>
            )}
            <Button asChild size="lg" variant="outline">
              <Link href="/certifications">{t("landing.ctaCatalog")}</Link>
            </Button>
          </div>
          <p className="mt-8 max-w-3xl rounded-lg border bg-card/80 p-4 text-sm">{t("legal.disclaimer")}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8" aria-labelledby="features-title">
        <h2 id="features-title" className="text-2xl font-semibold tracking-tight">
          {t("landing.featuresTitle")}
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5 shadow-sm">
              <f.icon className={`h-6 w-6 ${f.color}`} aria-hidden="true" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-card/50" aria-labelledby="how-title">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
          <h2 id="how-title" className="text-2xl font-semibold tracking-tight">
            {t("landing.howTitle")}
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {[t("landing.howStep1"), t("landing.howStep2"), t("landing.howStep3"), t("landing.howStep4")].map((step, i) => (
              <li key={step} className="rounded-xl border bg-card p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                <p className="mt-3 text-sm">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8" aria-labelledby="catalog-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="catalog-title" className="text-2xl font-semibold tracking-tight">
              {t("landing.catalogTitle")}
            </h2>
            <p className="mt-1 text-muted-foreground">{t("landing.catalogSubtitle")}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/certifications">{t("common.viewAll")}</Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.map((c) => (
            <CertificationCard key={c.id} cert={c} t={t} fmt={fmt} />
          ))}
        </div>
      </section>

      <section className="border-t bg-card/50" aria-labelledby="trust-title">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
          <h2 id="trust-title" className="text-2xl font-semibold tracking-tight">
            {t("landing.trustTitle")}
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[t("landing.trustOriginal"), t("landing.trustSources"), t("landing.trustReview"), t("landing.trustPrivacy")].map((item) => (
              <li key={item} className="flex gap-3 rounded-lg border bg-card p-4 text-sm">
                <ShieldCheck className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
