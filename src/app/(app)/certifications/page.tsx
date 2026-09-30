import type { Metadata } from "next";
import { Search } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { listCatalog } from "@/modules/catalog/queries";
import { CertificationCard } from "@/components/learning/certification-card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("catalog.title") };
}

const STATUSES = ["ACTIVE", "ANNOUNCED", "RETIRING", "RETIRED"] as const;

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "" } = await searchParams;
  const { t, fmt, locale } = await getI18n();
  const query = q.trim().toLowerCase();
  const all = await listCatalog(locale);
  const filtered = all.filter(
    (c) =>
      (!status || c.status === status) &&
      (!query || c.code.toLowerCase().includes(query) || c.name.toLowerCase().includes(query) || c.description.toLowerCase().includes(query)),
  );
  const current = filtered.filter((c) => c.status !== "RETIRED");
  const retired = filtered.filter((c) => c.status === "RETIRED");
  return (
    <div>
      <PageHeader title={t("catalog.title")} description={t("catalog.subtitle")} />
      <form role="search" className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end" aria-label={t("catalog.searchLabel")}>
        <div className="flex-1">
          <label htmlFor="catalog-q" className="sr-only">
            {t("catalog.searchLabel")}
          </label>
          <Input id="catalog-q" name="q" defaultValue={q} placeholder={t("catalog.searchLabel")} />
        </div>
        <div>
          <label htmlFor="catalog-status" className="sr-only">
            {t("catalog.filterStatus")}
          </label>
          <Select id="catalog-status" name="status" defaultValue={status} className="sm:w-48">
            <option value="">{t("catalog.filterAll")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`enums.certificationStatus.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          {t("common.filter")}
        </Button>
      </form>

      {filtered.length === 0 ? <EmptyState title={t("catalog.empty")} /> : null}

      {current.length ? (
        <section aria-labelledby="active-title" className="mb-12">
          <SectionTitle id="active-title">{t("catalog.activeSection")}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {current.map((c) => (
              <CertificationCard key={c.id} cert={c} t={t} fmt={fmt} />
            ))}
          </div>
        </section>
      ) : null}

      {retired.length ? (
        <section aria-labelledby="retired-title">
          <SectionTitle id="retired-title">{t("catalog.retiredSection")}</SectionTitle>
          <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t("catalog.retiredSectionBody")}</p>
          <div className="grid gap-4 opacity-90 sm:grid-cols-2 lg:grid-cols-3">
            {retired.map((c) => (
              <CertificationCard key={c.id} cert={c} t={t} fmt={fmt} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
