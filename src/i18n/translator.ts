/** Pure translation helpers shared by server and client. */
import type { Messages } from "./messages/en";

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
export type TranslateVars = Record<string, string | number | null | undefined>;
export type TFunction = (key: MessageKey, vars?: TranslateVars) => string;

export function resolveMessage(messages: unknown, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Replace {name} placeholders. `{name|singular|plural}` picks a word form by the numeric value of `name`
 * (e.g. "{count} {count|day|days}"); languages without plural nouns after numbers simply omit it.
 */
export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template
    .replace(/\{(\w+)\|([^|{}]*)\|([^|{}]*)\}/g, (match, name: string, one: string, other: string) => {
      const value = vars[name];
      if (value === undefined || value === null) return match;
      return Number(value) === 1 ? one : other;
    })
    .replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = vars[name];
      return value === undefined || value === null ? match : String(value);
    });
}

export function createTranslator(messages: Messages): TFunction {
  return (key, vars) => interpolate(resolveMessage(messages, key) ?? key, vars);
}

/** Deep-merge a partial dictionary over a complete fallback dictionary. */
export function mergeMessages<T>(fallback: T, partial: DeepPartial<T> | undefined): T {
  if (!partial) return fallback;
  const out: Record<string, unknown> = { ...(fallback as Record<string, unknown>) };
  for (const [k, v] of Object.entries(partial as Record<string, unknown>)) {
    const base = (fallback as Record<string, unknown>)[k];
    if (typeof v === "string") out[k] = v;
    else if (v && typeof v === "object" && base && typeof base === "object") out[k] = mergeMessages(base, v as DeepPartial<typeof base>);
  }
  return out as T;
}

/** List dotted keys of a dictionary (used by parity tests). */
export function listKeys(messages: unknown, prefix = ""): string[] {
  if (messages === null || typeof messages !== "object") return [];
  return Object.entries(messages as Record<string, unknown>).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : listKeys(v, `${prefix}${k}.`),
  );
}

/** Pick a translated JSON field: translations = { tr: { title: "..." } } */
export function pickTranslated<T extends Record<string, unknown>>(
  translations: unknown,
  locale: string,
): Partial<T> | undefined {
  if (!translations || typeof translations !== "object") return undefined;
  const entry = (translations as Record<string, unknown>)[locale];
  return entry && typeof entry === "object" ? (entry as Partial<T>) : undefined;
}

export function localizedField(base: string, translations: unknown, locale: string, field: string): string {
  const t = pickTranslated<Record<string, unknown>>(translations, locale);
  const value = t?.[field];
  return typeof value === "string" && value.trim() ? value : base;
}
