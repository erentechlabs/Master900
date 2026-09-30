import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { StatusBadge } from "./status-badge";
import { getI18n } from "@/i18n/server";

export { Field, Input, Select, Textarea, Checkbox, SubmitButton, Card, CardContent, CardDescription, CardHeader, CardTitle, StatusBadge };

export async function SaveBar({ backHref = "/admin", label }: { backHref?: string; label?: string }) {
  const { t } = await getI18n();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SubmitButton>{label ?? t("admin.common.save")}</SubmitButton>
      <Button asChild variant="outline">
        <Link href={backHref}>{t("common.back")}</Link>
      </Button>
    </div>
  );
}

export function JsonField({ id, name, label, value, rows = 14, hint }: { id: string; name: string; label: string; value: string; rows?: number; hint?: string }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <Textarea name={name} rows={rows} defaultValue={value} className="font-mono text-xs" />
    </Field>
  );
}

export function Hidden({ name, value }: { name: string; value: string | number | boolean | null | undefined }) {
  return <input type="hidden" name={name} value={value === null || value === undefined ? "" : String(value)} />;
}
