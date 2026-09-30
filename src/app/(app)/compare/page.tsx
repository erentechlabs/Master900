import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { listCatalog } from "@/modules/catalog/queries";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata: Metadata = { title: "Compare" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { t, locale } = await getI18n();
  const catalog = await listCatalog(locale);
  const selectedCodes = [params.a, params.b, params.c].flat().filter((value): value is string => typeof value === "string").map((code) => code.toUpperCase());
  const selected = (selectedCodes.length ? selectedCodes : catalog.slice(0, 2).map((cert) => cert.code)).map((code) => catalog.find((cert) => cert.code === code)).filter((cert): cert is NonNullable<typeof cert> => Boolean(cert));
  return (
    <div className="space-y-6">
      <PageHeader title={t("learner.compare.title")} description={t("learner.compare.subtitle")} />
      <form className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4">
        {["a", "b", "c"].map((name, index) => (
          <Field key={name} id={name} label={`${t("learner.compare.certifications")} ${index + 1}`}>
            <Select name={name} defaultValue={selected[index]?.code ?? ""}>
              <option value="">{t("common.none")}</option>
              {catalog.map((cert) => <option key={cert.code} value={cert.code}>{cert.code} · {cert.name}</option>)}
            </Select>
          </Field>
        ))}
        <div className="flex items-end"><Button type="submit">{t("learner.compare.compareButton")}</Button></div>
      </form>
      <Table caption={t("learner.compare.title")}>
        <THead><TR><TH>{t("common.details")}</TH>{selected.map((cert) => <TH key={cert.code}>{cert.code}</TH>)}</TR></THead>
        <TBody>
          <TR><TH scope="row">{t("learner.compare.field_status")}</TH>{selected.map((cert) => <TD key={cert.code}><Badge>{t(`enums.certificationStatus.${cert.status}` as never)}</Badge></TD>)}</TR>
          <TR><TH scope="row">{t("learner.compare.field_audience")}</TH>{selected.map((cert) => <TD key={cert.code}>{cert.audience ?? t("common.notAvailable")}</TD>)}</TR>
          <TR><TH scope="row">{t("learner.compare.field_effort")}</TH>{selected.map((cert) => <TD key={cert.code}>{cert.effort ? t("catalog.studyEffort", { min: cert.effort.min, max: cert.effort.max }) : t("common.notAvailable")}</TD>)}</TR>
          <TR><TH scope="row">{t("catalog.examVersion")}</TH>{selected.map((cert) => <TD key={cert.code}>{cert.examVersion ?? t("common.verificationRequired")}</TD>)}</TR>
          <TR><TH scope="row">{t("learner.compare.field_prerequisites")}</TH>{selected.map((cert) => <TD key={cert.code}>{cert.prerequisites.length ? cert.prerequisites.join("; ") : t("catalog.noPrerequisites")}</TD>)}</TR>
          <TR><TH scope="row">{t("learner.compare.field_domains")}</TH>{selected.map((cert) => <TD key={cert.code}><ul className="space-y-1">{cert.domains.map((domain) => <li key={domain.id}>{domain.title} {domain.weightMin !== null && domain.weightMax !== null ? `(${domain.weightMin}-${domain.weightMax}%)` : ""}</li>)}</ul></TD>)}</TR>
          <TR><TH scope="row">{t("learner.compare.field_learningPath")}</TH>{selected.map((cert) => <TD key={cert.code}>{cert.hasLearningPath ? t("common.yes") : t("common.no")}</TD>)}</TR>
          <TR><TH scope="row">{t("learner.compare.field_related")}</TH>{selected.map((cert) => <TD key={cert.code}>{[cert.replacementCode, ...cert.replacesCodes].filter(Boolean).join(" · ") || t("common.none")}</TD>)}</TR>
        </TBody>
      </Table>
    </div>
  );
}
