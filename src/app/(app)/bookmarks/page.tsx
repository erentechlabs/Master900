import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { requirePermission } from "@/modules/auth/session";
import { listBookmarks } from "@/modules/learning/bookmarks";
import { BookmarkButton } from "@/components/learning/bookmark-button";
import { PageHeader, EmptyState } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MessageKey } from "@/i18n/translator";

export const metadata: Metadata = { title: "Bookmarks" };

export default async function BookmarksPage() {
  const [{ t, fmt }, user] = await Promise.all([getI18n(), requirePermission("learn:use", "/bookmarks")]);
  const bookmarks = await listBookmarks(user.id);
  const groups = Object.groupBy(bookmarks, (bookmark) => bookmark.targetType);
  return (
    <div className="space-y-6">
      <PageHeader title={t("learner.bookmarks.title")} description={t("learner.bookmarks.subtitle")} />
      {bookmarks.length === 0 ? <EmptyState icon={Bookmark} title={t("learner.bookmarks.empty")} /> : null}
      {Object.entries(groups).map(([type, items]) => items ? (
        <Card key={type}>
          <CardHeader><CardTitle>{t(`learner.bookmarks.type_${type}` as MessageKey)}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <Link href={item.href} className="font-medium text-primary hover:underline">{item.label}</Link>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">{t(`learner.bookmarks.type_${item.targetType}` as MessageKey)}</Badge>{fmt.date(item.createdAt)}</div>
                  </div>
                  <BookmarkButton targetType={item.targetType} targetId={item.targetId} initialBookmarked label={t("common.remove")} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null)}
    </div>
  );
}
