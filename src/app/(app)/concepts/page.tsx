import type { Metadata } from "next";
import Link from "next/link";
import { Network } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { getConceptMap } from "@/modules/learning/concepts";
import { PageHeader, EmptyState } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Concepts" };

export default async function ConceptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { t, locale } = await getI18n();
  const focused = typeof params.concept === "string" ? params.concept : undefined;
  const concepts = await getConceptMap(locale, focused);
  return (
    <div className="space-y-6">
      <PageHeader title={t("learner.concepts.title")} description={t("learner.concepts.subtitle")} />
      {concepts.length === 0 ? <EmptyState icon={Network} title={t("learner.concepts.empty")} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {concepts.map((concept) => (
          <Card key={concept.id} id={concept.slug} className={focused === concept.slug ? "border-primary" : undefined}>
            <CardHeader>
              <CardTitle>{concept.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{concept.description}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="mb-2 text-sm font-medium">{t("learner.concepts.appearsIn")}</p>
                <div className="flex flex-wrap gap-2">{[...new Set(concept.links.map((link) => link.certification.code))].map((code) => <Badge key={code} variant="secondary">{code}</Badge>)}</div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">{t("learner.concepts.relatedLessons")}</p>
                <ul className="space-y-1 text-sm">
                  {concept.links.flatMap((link, index) => link.lesson ? [<li key={`${link.lesson.href}-${index}`}><Link href={link.lesson.href} className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary">{link.lesson.title}</Link>{link.note ? <span className="text-muted-foreground"> — {link.note}</span> : null}</li>] : [])}
                </ul>
              </div>
              <Link href={`/concepts?concept=${concept.slug}`} className="text-sm font-medium text-primary hover:underline">{t("learner.concepts.permalink")}<span className="sr-only">: {concept.title}</span></Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
