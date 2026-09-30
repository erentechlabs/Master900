import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/modules/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

export default async function ForbiddenPage() {
  const [{ t }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-lg py-16 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-destructive" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">{t("common.forbiddenTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("common.forbidden")}</p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">{t("common.backToDashboard")}</Link>
        </Button>
      </div>
    </AppShell>
  );
}
