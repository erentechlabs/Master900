import { en, type Messages } from "./en";
import { tr } from "./tr";
import { mergeMessages } from "../translator";
import type { Locale } from "../config";

const cache = new Map<Locale, Messages>();

/** Complete dictionary for a locale (missing translations fall back to English). */
export function getMessages(locale: Locale): Messages {
  const hit = cache.get(locale);
  if (hit) return hit;
  const messages = locale === "en" ? en : mergeMessages(en, tr);
  cache.set(locale, messages);
  return messages;
}

export { en, tr };
export type { Messages };
