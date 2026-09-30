/**
 * Tiny, safe template language used by lab simulations:
 *
 *   {{ path }}                      value at a dotted path of the context ("virtualMachines.0.name", "$form.vmName")
 *   {{ path | filter | filter:arg }} filters are applied left to right
 *   {{ 'literal' | upper }}          single-quoted literal
 *
 * A string that consists of exactly one expression renders to the raw value (keeps booleans, numbers, arrays);
 * otherwise every expression is converted to text. There is no code execution of any kind.
 */
import { getPath, looseEqual } from "./rules";

export type TemplateContext = Record<string, unknown>;

const EXPRESSION = /\{\{\s*([^{}]+?)\s*\}\}/g;
const SINGLE_EXPRESSION = /^\{\{\s*([^{}]+?)\s*\}\}$/;

export function hasTemplate(value: unknown): value is string {
  return typeof value === "string" && value.includes("{{");
}

/** 32-bit FNV-1a hash. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic hex string (e.g. a simulated commit SHA or resource suffix). */
export function stableHash(input: string, length = 7): string {
  let out = "";
  let seed = input;
  while (out.length < length) {
    out += fnv1a(seed).toString(16).padStart(8, "0");
    seed = `${out}:${input}`;
  }
  return out.slice(0, length);
}

/** Deterministic IPv4 address from the documentation range 203.0.113.0/24 (never a real host). */
export function stableIp(input: string): string {
  return `203.0.113.${(fnv1a(input) % 250) + 4}`;
}

/** Deterministic GUID-shaped identifier. */
export function stableGuid(input: string): string {
  const hex = stableHash(input, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function toText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

/** Azure CLI style text table. `spec` is "Label=path,Other=path" or "path,path"; defaults to the first row's keys. */
export function textTable(rows: unknown[], spec?: string): string {
  const first = rows.find((r) => r && typeof r === "object") as Record<string, unknown> | undefined;
  const parts = spec?.trim() ? spec.split(",") : Object.keys(first ?? {});
  const columns = parts
    .map((part) => {
      const [labelPart, keyPart] = part.includes("=") ? part.split("=") : [part, part];
      return { label: (labelPart ?? "").trim(), key: (keyPart ?? "").trim() };
    })
    .filter((c) => c.key);
  if (columns.length === 0) return "";
  const data = rows.map((row) => columns.map((c) => toText(getPath(row, c.key))));
  const widths = columns.map((c, i) => Math.max(c.label.length, ...data.map((d) => d[i]!.length)));
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]!))
      .join("  ")
      .trimEnd();
  return [line(columns.map((c) => c.label)), line(widths.map((w) => "-".repeat(w))), ...data.map(line)].join("\n");
}

function splitFilters(expression: string): string[] {
  // Split on "|" outside single quotes.
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of expression) {
    if (ch === "'") quoted = !quoted;
    if (ch === "|" && !quoted) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p, i) => i === 0 || p.length > 0);
}

function applyFilter(value: unknown, filter: string, ctx: TemplateContext): unknown {
  const colon = filter.indexOf(":");
  const name = (colon === -1 ? filter : filter.slice(0, colon)).trim().toLowerCase();
  const arg = colon === -1 ? undefined : filter.slice(colon + 1);
  switch (name) {
    case "or":
      return isEmptyValue(value) ? getPath(ctx, (arg ?? "").trim()) : value;
    case "json":
      return JSON.stringify(value ?? null, null, 2);
    case "upper":
      return toText(value).toUpperCase();
    case "lower":
      return toText(value).toLowerCase();
    case "trim":
      return toText(value).trim();
    case "count":
    case "length":
      if (Array.isArray(value)) return value.length;
      if (value && typeof value === "object") return Object.keys(value).length;
      return typeof value === "string" ? value.length : 0;
    case "table":
      return textTable(asList(value), arg);
    case "lines":
      return asList(value)
        .map((item) => toText(arg ? getPath(item, arg.trim()) : item))
        .join("\n");
    case "join":
      return asList(value)
        .map((item) => toText(item))
        .join(arg ?? ", ");
    case "map":
      return asList(value).map((item) => getPath(item, (arg ?? "").trim()));
    case "list":
      return asList(value);
    case "has": {
      const expected = (arg ?? "").trim();
      const target = expected.startsWith("$") ? getPath(ctx, expected) : expected;
      return asList(value).some((item) => looseEqual(item, target));
    }
    case "where": {
      const [key, rawExpected] = (arg ?? "").split("=");
      if (!key) return asList(value);
      const expected = (rawExpected ?? "").trim();
      const target = expected.startsWith("$") ? getPath(ctx, expected) : expected;
      return asList(value).filter((item) => looseEqual(getPath(item, key.trim()), target));
    }
    case "first":
      return asList(value)[0];
    case "last": {
      const list = asList(value);
      return list[list.length - 1];
    }
    case "default":
      return isEmptyValue(value) ? (arg ?? "") : value;
    case "hash":
      return stableHash(toText(value), arg ? Math.min(40, Math.max(4, Number(arg) || 7)) : 7);
    case "ip":
      return stableIp(toText(value));
    case "guid":
      return stableGuid(toText(value));
    case "yesno":
      return value === true || value === "true" ? "Yes" : "No";
    case "onoff":
      return value === true || value === "true" ? "On" : "Off";
    case "date":
      return toText(value).slice(0, 10);
    case "time":
      return toText(value).slice(11, 16);
    case "datetime": {
      const text = toText(value);
      return text.length >= 16 ? `${text.slice(0, 10)} ${text.slice(11, 16)} UTC` : text;
    }
    case "slug":
      return toText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    default:
      return value;
  }
}

function evaluateExpression(expression: string, ctx: TemplateContext): unknown {
  const [head = "", ...filters] = splitFilters(expression);
  let value: unknown = head.length >= 2 && head.startsWith("'") && head.endsWith("'") ? head.slice(1, -1) : getPath(ctx, head);
  for (const filter of filters) value = applyFilter(value, filter, ctx);
  return value;
}

/** Render a template. A single-expression template returns the raw value. */
export function renderTemplate(template: string, ctx: TemplateContext): unknown {
  if (!template.includes("{{")) return template;
  const single = SINGLE_EXPRESSION.exec(template);
  if (single) return evaluateExpression(single[1]!, ctx);
  return template.replace(EXPRESSION, (_match, expression: string) => toText(evaluateExpression(expression, ctx)));
}

/** Render a template and always return text. */
export function renderText(template: string | undefined | null, ctx: TemplateContext): string {
  if (!template) return "";
  return toText(renderTemplate(template, ctx));
}

/** Render templates inside strings of a JSON-like value (objects and arrays recursively). */
export function renderDeep(value: unknown, ctx: TemplateContext): unknown {
  if (typeof value === "string") return renderTemplate(value, ctx);
  if (Array.isArray(value)) return value.map((item) => renderDeep(item, ctx));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, renderDeep(v, ctx)]));
  }
  return value;
}
