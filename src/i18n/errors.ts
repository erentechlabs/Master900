import type { MessageKey, TFunction } from "./translator";

/** Translate an action error code (`errors.<code>`), falling back to a generic message for unknown codes. */
export function errorText(t: TFunction, code: string | null | undefined): string {
  const key = `errors.${code || "unknown"}`;
  const text = t(key as MessageKey);
  return text === key ? t("errors.unknown") : text;
}
