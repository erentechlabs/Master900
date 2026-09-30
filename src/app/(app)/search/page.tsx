import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { globalSearch, highlightSegments, clampSearchQuery } from "@/modules/learning/search";
import { PageHeader, EmptyState } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MessageKey } from "@/i18n/translator";

export const metadata: Metadata = { title: "Search" };

function Highlight({ text, query }: { text: string; query: string }) {
  return <>{highlightSegments(text, query).map((segment, index) => segment.match ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>)}</>;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { t, locale } = await getI18n();
  const query = clampSearchQuery(typeof params.q === "string" ? params.q : undefined);
  const results = await globalSearch(locale, query);
  return (
    <div className="space-y-6">
      <PageHeader title={t("learner.search.title")} description={query ? t("learner.search.resultsFor", { query }) : t("learner.search.placeholder")} />
      <form className="flex gap-2 rounded-xl border bg-card p-4">
        <Input name="q" defaultValue={query} minLength={2} maxLength={100} placeholder={t("learner.search.placeholder")} aria-label={t("common.search")} />
        <Button type="submit"><Search aria-hidden="true" />{t("common.search")}</Button>
      </form>
      {results.tooShort ? <EmptyState title={t("learner.search.tooShort")} /> : null}
      {!results.tooShort && results.groups.length === 0 ? <EmptyState title={t("learner.search.empty")} /> : null}
      <div className="space-y-4">
        {results.groups.map((group) => (
          <Card key={group.key}>
            <CardHeader><CardTitle>{t(`learner.search.group_${group.key}` as MessageKey)}</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {group.items.map((item) => (
                  <li key={item.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t(`learner.search.group_${group.key}` as MessageKey)}</Badge><Link href={item.href} className="font-medium text-primary hover:underline"><Highlight text={item.title} query={query} /></Link></div>
                    <p className="mt-1 text-sm text-muted-foreground"><Highlight text={item.snippet} query={query} /></p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
