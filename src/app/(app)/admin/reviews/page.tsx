import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/session";
import { PageHeader } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { entityHref } from "@/modules/admin/cms";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

export default async function ReviewsPage() {
  await requirePermission("content:review");
  const { t } = await getI18n();
  const [lessons, questions, labs] = await Promise.all([
    prisma.lesson.findMany({ where: { status: { in: ["TECHNICAL_REVIEW", "EDITORIAL_REVIEW", "APPROVED", "OUTDATED"] } }, take: 50 }),
    prisma.question.findMany({ where: { OR: [{ status: { in: ["TECHNICAL_REVIEW", "EDITORIAL_REVIEW", "APPROVED", "OUTDATED"] } }, { authorType: "AI_GENERATED", status: "DRAFT" }] }, take: 50 }),
    prisma.lab.findMany({ where: { status: { in: ["TECHNICAL_REVIEW", "EDITORIAL_REVIEW", "APPROVED", "OUTDATED"] } }, take: 50 }),
  ]);
  const items = [...lessons.map((i) => ({ type: "LESSON" as const, id: i.id, title: i.title, status: i.status })), ...questions.map((i) => ({ type: "QUESTION" as const, id: i.id, title: i.stem, status: i.status })), ...labs.map((i) => ({ type: "LAB" as const, id: i.id, title: i.title, status: i.status }))];
  return <div className="space-y-4"><PageHeader title={t("admin.reviews.title")} description={t("admin.reviews.shortSubtitle")} /><Card><CardHeader><CardTitle>{t("admin.common.queue")}</CardTitle></CardHeader><CardContent className="space-y-2">{items.length ? items.map((i) => <div key={`${i.type}-${i.id}`} className="flex items-center justify-between rounded-md border p-3"><div><p className="font-medium">{i.title}</p><p className="text-sm text-muted-foreground">{t(`admin.common.entityTypes.${i.type}` as MessageKey)} · {t(`enums.contentStatus.${i.status}` as MessageKey)}</p></div><Button asChild size="sm" variant="outline"><Link href={entityHref(i.type, i.id)}>{t("common.open")}</Link></Button></div>) : <p className="text-sm text-muted-foreground">{t("admin.reviews.empty")}</p>}</CardContent></Card></div>;
}
