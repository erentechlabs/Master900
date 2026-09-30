import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { requirePermission } from "@/modules/auth/session";
import { listMyLearning } from "@/modules/learning/path";
import { PageHeader, EmptyState } from "@/components/page";
import { CertIcon, CertStatusBadge } from "@/components/learning/certification-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";

export const metadata: Metadata = { title: "My learning" };

export default async function LearnPage() {
  const [{ t }, user] = await Promise.all([getI18n(), requirePermission("learn:use", "/learn")]);
  const paths = await listMyLearning(user.id, user.locale);
  return (
    <div className="space-y-6">
      <PageHeader title={t("learner.path.myPaths")} description={t("learner.path.myPathsSubtitle")} />
      {paths.length === 0 ? (
        <EmptyState title={t("learner.path.noPaths")} description={t("learner.path.enrollFirst")} action={{ label: t("learner.path.browse"), href: "/certifications" }} icon={BookOpen} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {paths.map((path) => (
            <Card key={path.enrollment.id}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <CertIcon icon={path.certification.icon} color={path.certification.themeColor} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">{path.certification.code}</span>
                      <CertStatusBadge status={path.certification.status} t={t} />
                    </div>
                    <CardTitle className="mt-1">{path.certification.name}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t("learner.path.completedCount", { done: path.completedLessons, total: path.totalLessons })}</span>
                    <span className="font-medium">{t("common.percentValue", { value: path.progress })}</span>
                  </div>
                  <Progress value={path.progress} label={t("learner.dashboard.progressLabel", { percent: path.progress })} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{t("common.continue")}</p>
                    <p className="font-medium">{path.nextLesson?.title ?? t("learner.dashboard.noContinue")}</p>
                  </div>
                  <Button asChild>
                    <Link href={path.nextLesson ? `/learn/${path.certification.code}/${path.nextLesson.slug}` : `/learn/${path.certification.code}`}>{t("common.continue")}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
