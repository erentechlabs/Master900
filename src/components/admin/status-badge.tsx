import { Badge } from "@/components/ui/badge";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

const contentStatuses = new Set(["DRAFT", "TECHNICAL_REVIEW", "EDITORIAL_REVIEW", "APPROVED", "PUBLISHED", "OUTDATED", "ARCHIVED"]);
const certificationStatuses = new Set(["ACTIVE", "ANNOUNCED", "RETIRING", "RETIRED"]);

function statusKey(status: string) {
  if (contentStatuses.has(status)) return `enums.contentStatus.${status}`;
  if (certificationStatuses.has(status)) return `enums.certificationStatus.${status}`;
  return `admin.common.statusLabels.${status}`;
}

export async function StatusBadge({ status }: { status: string }) {
  const { t } = await getI18n();
  const variant =
    status === "PUBLISHED" || status === "ACTIVE" || status === "SUCCEEDED"
      ? "success"
      : status === "APPROVED" || status === "RUNNING"
        ? "info"
        : status === "OUTDATED" || status === "RETIRING" || status === "PENDING"
          ? "warning"
          : status === "ARCHIVED" || status === "RETIRED" || status === "FAILED" || status === "SUSPENDED"
            ? "destructive"
            : "secondary";
  const key = statusKey(status);
  const label = t(key as MessageKey);
  return <Badge variant={variant}>{label === key ? status : label}</Badge>;
}
