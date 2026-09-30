"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useI18n } from "@/i18n/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Spinner } from "@/components/ui/misc";
import { safeCallbackUrl } from "@/lib/urls";

type DemoAccount = { role: "demoLearner" | "demoInstructor" | "demoAdmin"; email: string; password: string };

export function SignInForm({ callbackUrl, demoAccounts }: { callbackUrl: string; demoAccounts: DemoAccount[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false, callbackUrl });
    if (!res || res.error) {
      setPending(false);
      const code = res?.error ?? "";
      setError(code.includes("RateLimited") ? t("errors.rate_limited") : code.includes("AccountSuspended") ? t("errors.account_suspended") : t("errors.invalid_credentials"));
      return;
    }
    router.push(safeCallbackUrl(callbackUrl));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? (
          <Alert variant="destructive" role="alert">
            {error}
          </Alert>
        ) : null}
        <Field id="email" label={t("auth.email")} required>
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="password" label={t("auth.password")} required>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Spinner /> : null}
          {pending ? t("auth.signingIn") : t("common.signIn")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("auth.forgotPassword")}</p>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t("auth.noAccount")}{" "}
        <Link href="/sign-up" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("common.signUp")}
        </Link>
      </p>
      {demoAccounts.length ? (
        <div className="rounded-lg border border-dashed p-4 text-sm">
          <p className="font-semibold">{t("auth.demoAccountsTitle")}</p>
          <p className="mb-3 text-xs text-muted-foreground">{t("auth.demoAccountsBody")}</p>
          <ul className="space-y-2">
            {demoAccounts.map((a) => (
              <li key={a.email} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{t(`auth.${a.role}`)}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{a.email}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(a.password);
                  }}
                >
                  {t("auth.useAccount")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
