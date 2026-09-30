"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold">{t("common.errorTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("common.errorBody")}</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p> : null}
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>{t("common.retry")}</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">{t("common.backToDashboard")}</Link>
        </Button>
      </div>
    </div>
  );
}
