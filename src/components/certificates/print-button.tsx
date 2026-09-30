"use client";

import { Printer } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  const { t } = useI18n();
  return (
    <Button type="button" className="print:hidden" onClick={() => window.print()}>
      <Printer aria-hidden="true" />
      {t("learner.certificate.print")}
    </Button>
  );
}

