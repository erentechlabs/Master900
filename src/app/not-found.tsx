import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-semibold text-primary">404</p>
      <h1 className="mt-3 text-2xl font-semibold">{t("common.notFoundTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("common.notFoundBody")}</p>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link href="/dashboard">{t("common.backToDashboard")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">{t("common.backToHome")}</Link>
        </Button>
      </div>
    </main>
  );
}
