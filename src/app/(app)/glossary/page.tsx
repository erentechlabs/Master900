import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";
import { getCurrentUser } from "@/modules/auth/session";
import { getGlossary, glossaryFilters } from "@/modules/learning/glossary";
import { bookmarkedTargetIds } from "@/modules/learning/bookmarks";
import { BookmarkButton } from "@/components/learning/bookmark-button";
import { PageHeader, EmptyState } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";

export const metadata: Metadata = { title: "Glossary" };

export default async function GlossaryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const [{ t, locale }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  const q = typeof params.q === "string" ? params.q : undefined;
  const certificationId = typeof params.certificationId === "string" ? params.certificationId : undefined;
  const kindParam = typeof params.kind === "string" ? params.kind : undefined;
  const kind = kindParam === "TERM" || kindParam === "SERVICE" || kindParam === "CONCEPT" ? kindParam : undefined;
  const [terms, certs, bookmarkedTerms] = await Promise.all([getGlossary(locale, { q, certificationId, kind }), glossaryFilters(locale), user ? bookmarkedTargetIds(user.id, "GLOSSARY") : Promise.resolve(new Set<string>())]);
  const groups = Object.groupBy(terms, (term) => term.term[0]?.toLocaleUpperCase() ?? "#");
  return (
    <div className="space-y-6">
      <PageHeader title={t("learner.glossary.title")} description={t("learner.glossary.subtitle")} />
      <form className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4">
        <Field id="q" label={t("common.search")}><Input name="q" defaultValue={q} placeholder={t("learner.search.placeholder")} /></Field>
        <Field id="certificationId" label={t("learner.glossary.filterCert")}><Select name="certificationId" defaultValue={certificationId ?? ""}><option value="">{t("common.all")}</option>{certs.map((cert) => <option key={cert.id} value={cert.id}>{cert.code} · {cert.name}</option>)}</Select></Field>
        <Field id="kind" label={t("learner.glossary.filterKind")}><Select name="kind" defaultValue={kind ?? ""}><option value="">{t("common.all")}</option><option value="TERM">{t("enums.glossaryKind.TERM")}</option><option value="SERVICE">{t("enums.glossaryKind.SERVICE")}</option><option value="CONCEPT">{t("enums.glossaryKind.CONCEPT")}</option></Select></Field>
        <div className="flex items-end"><Button type="submit">{t("common.filter")}</Button></div>
      </form>
      {terms.length === 0 ? <EmptyState title={t("learner.glossary.empty")} /> : null}
      {Object.entries(groups).map(([letter, items]) => items ? (
        <section key={letter} aria-labelledby={`letter-${letter}`} className="space-y-3">
          <h2 id={`letter-${letter}`} className="text-xl font-semibold">{letter}</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {items.map((term) => (
              <Card key={term.id} id={term.slug}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{term.term}</CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{t(`enums.glossaryKind.${term.kind}` as MessageKey)}</Badge>
                      {user ? <BookmarkButton targetType="GLOSSARY" targetId={term.id} initialBookmarked={bookmarkedTerms.has(term.id)} /> : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{term.definition}</p>
                  <div><p className="font-medium">{t("learner.glossary.related")}</p><p className="text-muted-foreground">{term.certifications.map((cert) => cert.code).join(" · ") || t("common.none")}</p></div>
                  {term.lessons.length ? <div><p className="font-medium">{t("learner.concepts.relatedLessons")}</p><ul className="list-disc pl-5">{term.lessons.map((lesson) => <li key={lesson.id}><Link className="text-primary hover:underline" href={lesson.href}>{lesson.title}</Link></li>)}</ul></div> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null)}
    </div>
  );
}
