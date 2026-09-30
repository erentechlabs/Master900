/**
 * Pure helpers shared by the UI simulation reducer (server) and the portal renderer (browser):
 * evaluation context, selections, visibility, table rows, form options/defaults/validation, URLs.
 */
import { evaluateRule, getPath, looseEqual, matchesSubset, type LabRule } from "./rules";
import { renderDeep, renderText, toText, type TemplateContext } from "./templates";
import type { UiSimComponentOf, UiSimConfig, UiSimField, UiSimFieldValue, UiSimPage, UiSimSelection, UiSimState } from "./ui-sim-schema";

export const DEFAULT_CLOCK_START = "2026-09-30T09:00:00.000Z";

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Deterministic lab clock: one simulated minute per learner action. */
export function clockAt(config: Pick<UiSimConfig, "clock">, events: number): string {
  const start = Date.parse(config.clock?.start ?? DEFAULT_CLOCK_START);
  return new Date((Number.isFinite(start) ? start : Date.parse(DEFAULT_CLOCK_START)) + events * 60_000).toISOString();
}

const regexCache = new Map<string, RegExp | null>();

/** Case-insensitive regular expression compiled once (null when invalid). */
export function compileRegex(pattern: string): RegExp | null {
  if (!regexCache.has(pattern)) {
    let compiled: RegExp | null = null;
    try {
      compiled = new RegExp(pattern, "i");
    } catch {
      compiled = null;
    }
    if (regexCache.size > 500) regexCache.clear();
    regexCache.set(pattern, compiled);
  }
  return regexCache.get(pattern) ?? null;
}

/**
 * The selected item of a selection. The list path is read from the state, or from another selection
 * (e.g. "$sel.incident.assets" selects an asset of the selected incident).
 */
export function resolveSelection(state: UiSimState, ref: UiSimSelection | undefined, depth = 0): unknown {
  if (!ref || depth > 4) return undefined;
  const nested = /^\$sel\.([^.]+)(?:\.(.+))?$/.exec(ref.path);
  let source: unknown;
  if (nested) {
    const parent = resolveSelection(state, state.__meta.selected?.[nested[1]!], depth + 1);
    source = nested[2] ? getPath(parent, nested[2]) : parent;
  } else source = getPath(state, ref.path);
  return asArray(source).find((item) => looseEqual(getPath(item, ref.key), ref.value));
}

/**
 * Evaluation context for templates and conditions: the state at the root (same paths as lab rules) plus
 * $sel (selected items by alias), $seq (action counter), $now (lab clock), $page, $user and any extras
 * ($form, $row, $args, $cmd, $input, $item).
 */
export function buildContext(config: UiSimConfig, state: UiSimState, extra: TemplateContext = {}): TemplateContext {
  const sel: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(state.__meta.selected ?? {})) sel[alias] = resolveSelection(state, ref);
  return {
    ...state,
    $sel: sel,
    $seq: state.__meta.events,
    $now: clockAt(config, state.__meta.events),
    $page: state.__meta.page,
    $user: config.portal.user ?? "",
    ...extra,
  };
}

/** Evaluate an optional condition; templates inside the rule ({{$form.x}}) are rendered first. */
export function passes(rule: LabRule | undefined, ctx: TemplateContext): boolean {
  if (!rule) return true;
  return evaluateRule(renderDeep(rule, ctx) as LabRule, ctx);
}

export function getPage(config: UiSimConfig, pageId: string): UiSimPage | undefined {
  return config.pages.find((p) => p.id === pageId);
}

export function currentPage(config: UiSimConfig, state: UiSimState): UiSimPage {
  return getPage(config, state.__meta.page) ?? getPage(config, config.startPage) ?? config.pages[0]!;
}

export function absoluteUrl(config: UiSimConfig, url: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  const base = (config.portal.url ?? "").replace(/\/+$/, "");
  if (!url) return base;
  return base + (/^[/#?]/.test(url) ? url : `/${url}`);
}

export function normalizeUrl(url: string): string {
  return url
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** Address shown in the simulated browser for a page. */
export function pageUrl(config: UiSimConfig, page: UiSimPage, ctx: TemplateContext): string {
  return absoluteUrl(config, page.url ? renderText(page.url, ctx) : "");
}

export function tableRows(component: UiSimComponentOf<"table">, ctx: TemplateContext): unknown[] {
  const rows = asArray(getPath(ctx, component.source));
  if (!component.where) return rows;
  const where = renderDeep(component.where, ctx) as Record<string, unknown>;
  return rows.filter((row) => matchesSubset(row, where));
}

export function rowKeyOf(component: UiSimComponentOf<"table">, row: unknown): string {
  return component.rowKey ? toText(cellValue(row, component.rowKey)) : "";
}

/** Value of a column/key in a row; "$value" addresses the row itself (lists of plain strings or numbers). */
export function cellValue(row: unknown, key: string): unknown {
  return key === "$value" ? row : getPath(row, key);
}

export function formFields(component: UiSimComponentOf<"form"> | UiSimComponentOf<"wizard"> | UiSimComponentOf<"settings">): UiSimField[] {
  return component.kind === "wizard" ? component.tabs.flatMap((t) => t.fields) : component.fields;
}

export type UiSimOption = { value: string; label: string };

/** Static options plus options computed from the state (optionsFrom). */
export function resolveOptions(field: UiSimField, ctx?: TemplateContext): UiSimOption[] {
  const out: UiSimOption[] = [...(field.options ?? [])];
  if (field.optionsFrom && ctx) {
    const where = field.optionsFrom.where ? (renderDeep(field.optionsFrom.where, ctx) as Record<string, unknown>) : undefined;
    const pick = (item: unknown, key: string) => (key === "$value" ? item : getPath(item, key));
    for (const item of asArray(getPath(ctx, field.optionsFrom.path))) {
      if (where && !matchesSubset(item, where)) continue;
      const value = toText(pick(item, field.optionsFrom.value));
      if (!value) continue;
      out.push({ value, label: toText(pick(item, field.optionsFrom.label ?? field.optionsFrom.value)) || value });
    }
  }
  const seen = new Set<string>();
  return out.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
}

const TEXT_CAP = 300;
const LONG_TEXT_CAP = 6000;

/** Validate and normalize a single field value. Returns undefined when the value is invalid. */
export function normalizeFieldValue(field: UiSimField, value: unknown, ctx?: TemplateContext): string | boolean | number | string[] | undefined {
  switch (field.control) {
    case "toggle":
      return typeof value === "boolean" ? value : undefined;
    case "select":
    case "radio": {
      if (typeof value !== "string") return undefined;
      return resolveOptions(field, ctx).some((o) => o.value === value) ? value : undefined;
    }
    case "checkboxes": {
      if (!Array.isArray(value)) return undefined;
      const allowed = new Set(resolveOptions(field, ctx).map((o) => o.value));
      return value.every((v) => typeof v === "string" && allowed.has(v)) ? [...new Set(value as string[])] : undefined;
    }
    case "number": {
      const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
      return Number.isFinite(n) ? n : undefined;
    }
    case "text":
      return typeof value === "string" ? value.trim().slice(0, TEXT_CAP) : undefined;
    case "textarea":
    case "code":
      return typeof value === "string" ? value.replace(/\r\n/g, "\n").slice(0, LONG_TEXT_CAP) : undefined;
  }
}

/** Initial value shown in the renderer for a field. */
export function fieldDefaultValue(field: UiSimField, ctx: TemplateContext): UiSimFieldValue {
  if (field.bindTo) {
    const bound = normalizeFieldValue(field, getPath(ctx, field.bindTo), ctx);
    if (bound !== undefined) return bound;
  }
  if (field.defaultValue !== undefined) {
    const raw = typeof field.defaultValue === "string" ? renderDeep(field.defaultValue, ctx) : field.defaultValue;
    const normalized = normalizeFieldValue(field, field.control === "number" && typeof raw === "string" ? raw : raw, ctx);
    if (normalized !== undefined) return normalized;
    if (typeof raw === "string") return raw;
  }
  switch (field.control) {
    case "toggle":
      return false;
    case "checkboxes":
      return [];
    default:
      return "";
  }
}

export type UiSimFieldErrorCode = "required" | "invalid" | "pattern" | "min_length" | "max_length" | "min" | "max" | "unique";
export type UiSimFieldError = { code: UiSimFieldErrorCode; message: string };

function isEmptyInput(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}

function constraintError(field: UiSimField, value: string | boolean | number | string[], ctx: TemplateContext): UiSimFieldError | null {
  if (typeof value === "string") {
    if (field.minLength !== undefined && value.length < field.minLength) {
      return { code: "min_length", message: `${field.label} must be at least ${field.minLength} characters.` };
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      return { code: "max_length", message: `${field.label} must be at most ${field.maxLength} characters.` };
    }
    if (field.pattern) {
      const re = compileRegex(field.pattern.startsWith("^") ? field.pattern : `^(?:${field.pattern})$`);
      if (re && !re.test(value)) return { code: "pattern", message: field.patternMessage ?? `${field.label} is not in the expected format.` };
    }
  }
  if (typeof value === "number") {
    if (field.min !== undefined && value < field.min) return { code: "min", message: `${field.label} must be at least ${field.min}.` };
    if (field.max !== undefined && value > field.max) return { code: "max", message: `${field.label} must be at most ${field.max}.` };
  }
  if (field.unique) {
    const taken = asArray(getPath(ctx, field.unique.path)).some((item) => looseEqual(getPath(item, field.unique!.key), value));
    if (taken) return { code: "unique", message: field.unique.message ?? `${field.label} '${toText(value)}' is already in use.` };
  }
  return null;
}

/**
 * Validate submitted form values. Hidden fields (visibleWhen evaluated with $form) are ignored.
 * Returns the normalized values of visible fields and per-field errors.
 */
export function validateFormValues(
  fields: UiSimField[],
  rawValues: Record<string, unknown>,
  ctx: TemplateContext,
): { values: Record<string, string | boolean | number | string[]>; errors: Record<string, UiSimFieldError> } {
  const draft: Record<string, unknown> = {};
  for (const f of fields) draft[f.id] = normalizeFieldValue(f, rawValues[f.id], ctx);
  const formCtx = { ...ctx, $form: draft };
  const values: Record<string, string | boolean | number | string[]> = {};
  const errors: Record<string, UiSimFieldError> = {};
  for (const f of fields) {
    if (!passes(f.visibleWhen, formCtx)) continue;
    const raw = rawValues[f.id];
    if (isEmptyInput(raw)) {
      if (f.required) errors[f.id] = { code: "required", message: `${f.label} is required.` };
      continue;
    }
    const value = normalizeFieldValue(f, raw, ctx);
    if (value === undefined) {
      errors[f.id] = { code: "invalid", message: `${f.label}: choose a valid value.` };
      continue;
    }
    if (f.required && f.control === "toggle" && value !== true) {
      errors[f.id] = { code: "required", message: `${f.label} is required.` };
      continue;
    }
    const err = constraintError(f, value, ctx);
    if (err) {
      errors[f.id] = err;
      continue;
    }
    values[f.id] = value;
  }
  return { values, errors };
}

/** Visible fields of a form given the current draft values (for the renderer). */
export function visibleFields(fields: UiSimField[], draft: Record<string, unknown>, ctx: TemplateContext): UiSimField[] {
  const normalized: Record<string, unknown> = {};
  for (const f of fields) normalized[f.id] = normalizeFieldValue(f, draft[f.id], ctx);
  const formCtx = { ...ctx, $form: normalized };
  return fields.filter((f) => passes(f.visibleWhen, formCtx));
}

export function terminalPrompt(config: UiSimConfig, state: UiSimState): string {
  return config.terminal ? renderText(config.terminal.prompt, buildContext(config, state)) : "$";
}
