"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useI18n } from "@/i18n/client";
import { errorText } from "@/i18n/errors";
import { LOCALE_LABELS, LOCALES } from "@/i18n/config";
import type { MessageKey } from "@/i18n/translator";
import type { ActionResult } from "@/lib/actions";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { registerAction } from "./actions";

export function SignUpForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [state, formAction] = React.useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    formData.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    const result = await registerAction(prev, formData);
    if (result.ok) {
      const res = await signIn("credentials", { email: formData.get("email"), password: formData.get("password"), redirect: false });
      if (res && !res.error) {
        router.push("/onboarding");
        router.refresh();
      } else router.push("/sign-in");
    }
    return result;
  }, null);

  const fieldError = (name: string) => {
    if (!state || state.ok || !state.fieldErrors?.[name]) return null;
    const code = state.fieldErrors[name]!;
    return t((`errors.${code}` as MessageKey)) === `errors.${code}` ? t("errors.invalid_input") : t(`errors.${code}` as MessageKey);
  };
  const formError = state && !state.ok && !state.fieldErrors ? errorText(t, state.error) : null;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {formError ? (
        <Alert variant="destructive" role="alert">
          {formError}
        </Alert>
      ) : null}
      <Field id="name" label={t("auth.name")} hint={t("auth.nameHint")} error={fieldError("name")}>
        <Input name="name" autoComplete="nickname" maxLength={80} />
      </Field>
      <Field id="email" label={t("auth.email")} required error={fieldError("email")}>
        <Input name="email" type="email" autoComplete="email" />
      </Field>
      <Field id="password" label={t("auth.password")} required hint={t("auth.passwordRules")} error={fieldError("password")}>
        <Input name="password" type="password" autoComplete="new-password" minLength={10} />
      </Field>
      <Field id="confirmPassword" label={t("auth.confirmPassword")} required error={fieldError("confirmPassword")}>
        <Input name="confirmPassword" type="password" autoComplete="new-password" />
      </Field>
      <Field id="locale" label={t("auth.preferredLanguage")}>
        <Select name="locale" defaultValue={locale}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox name="acceptTerms" className="mt-0.5" aria-describedby="terms-error" />
          <span>{t("auth.acceptTerms")}</span>
        </label>
        {fieldError("acceptTerms") ? (
          <p id="terms-error" className="text-xs font-medium text-destructive" role="alert">
            {fieldError("acceptTerms")}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("legal.privacyBody")}</p>
      </div>
      <SubmitButton className="w-full" pendingLabel={t("auth.creatingAccount")}>
        {t("common.signUp")}
      </SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        {t("auth.haveAccount")}{" "}
        <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("common.signIn")}
        </Link>
      </p>
    </form>
  );
}
