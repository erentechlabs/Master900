/**
 * Generic lab validation rules evaluated against a lab state object.
 * Shared by every lab engine (UI simulation, command sandbox, architecture, decision).
 */
import { z } from "zod";

export type LabRule =
  | { type: "equals"; path: string; value: unknown }
  | { type: "notEquals"; path: string; value: unknown }
  | { type: "oneOf"; path: string; values: unknown[] }
  | { type: "truthy"; path: string }
  | { type: "falsy"; path: string }
  | { type: "exists"; path: string }
  | { type: "notExists"; path: string }
  | { type: "arrayContains"; path: string; match: Record<string, unknown> }
  | { type: "arrayNotContains"; path: string; match: Record<string, unknown> }
  | { type: "arrayLength"; path: string; min?: number; max?: number }
  | { type: "visited"; page: string }
  | { type: "commandUsed"; pattern: string }
  | { type: "placedIn"; item: string; zone: string }
  | { type: "notPlaced"; item: string }
  | { type: "zoneHasAny"; zone: string; items: string[] }
  | { type: "zoneLacks"; zone: string; items: string[] }
  | { type: "connected"; from: string; to: string; directed?: boolean }
  | { type: "stageCorrect"; stage: string }
  | { type: "textMinLength"; path: string; min: number }
  | { type: "matches"; path: string; pattern: string }
  | { type: "allOf"; rules: LabRule[] }
  | { type: "anyOf"; rules: LabRule[] }
  | { type: "not"; rule: LabRule };

const path = z.string().min(1).max(200);
const id = z.string().min(1).max(80);

export const labRuleSchema: z.ZodType<LabRule> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal("equals"), path, value: z.unknown() }),
    z.object({ type: z.literal("notEquals"), path, value: z.unknown() }),
    z.object({ type: z.literal("oneOf"), path, values: z.array(z.unknown()).min(1) }),
    z.object({ type: z.literal("truthy"), path }),
    z.object({ type: z.literal("falsy"), path }),
    z.object({ type: z.literal("exists"), path }),
    z.object({ type: z.literal("notExists"), path }),
    z.object({ type: z.literal("arrayContains"), path, match: z.record(z.string(), z.unknown()) }),
    z.object({ type: z.literal("arrayNotContains"), path, match: z.record(z.string(), z.unknown()) }),
    z.object({ type: z.literal("arrayLength"), path, min: z.number().int().min(0).optional(), max: z.number().int().min(0).optional() }),
    z.object({ type: z.literal("visited"), page: id }),
    z.object({ type: z.literal("commandUsed"), pattern: z.string().min(1).max(200) }),
    z.object({ type: z.literal("placedIn"), item: id, zone: id }),
    z.object({ type: z.literal("notPlaced"), item: id }),
    z.object({ type: z.literal("zoneHasAny"), zone: id, items: z.array(id).min(1) }),
    z.object({ type: z.literal("zoneLacks"), zone: id, items: z.array(id).min(1) }),
    z.object({ type: z.literal("connected"), from: id, to: id, directed: z.boolean().optional() }),
    z.object({ type: z.literal("stageCorrect"), stage: id }),
    z.object({ type: z.literal("textMinLength"), path, min: z.number().int().min(1) }),
    z.object({ type: z.literal("matches"), path, pattern: z.string().min(1).max(200) }),
    z.object({ type: z.literal("allOf"), rules: z.array(labRuleSchema).min(1) }),
    z.object({ type: z.literal("anyOf"), rules: z.array(labRuleSchema).min(1) }),
    z.object({ type: z.literal("not"), rule: labRuleSchema }),
  ]),
);

export function getPath(obj: unknown, p: string): unknown {
  if (!p) return obj;
  const parts = p.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const index = Number(part);
      cur = Number.isInteger(index) ? cur[index] : undefined;
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
    } else return undefined;
  }
  return cur;
}

/** Immutable-style set: returns a structurally cloned object with the value set. */
export function setPath<T>(obj: T, p: string, value: unknown): T {
  const root = structuredClone(obj) as unknown as Record<string, unknown>;
  const parts = p.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: Record<string, unknown> = root;
  parts.forEach((part, i) => {
    if (i === parts.length - 1) {
      cur[part] = value;
      return;
    }
    const next = cur[part];
    if (next === null || typeof next !== "object") cur[part] = /^\d+$/.test(parts[i + 1]!) ? [] : {};
    cur = cur[part] as Record<string, unknown>;
  });
  return root as unknown as T;
}

export function looseEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  if (typeof a === "boolean" || typeof b === "boolean") return a === b || String(a) === String(b);
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function matchesSubset(item: unknown, match: Record<string, unknown>): boolean {
  if (!item || typeof item !== "object") return false;
  return Object.entries(match).every(([k, v]) => looseEqual(getPath(item, k), v));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function evaluateRule(rule: LabRule, state: unknown): boolean {
  switch (rule.type) {
    case "equals":
      return looseEqual(getPath(state, rule.path), rule.value);
    case "notEquals":
      return !looseEqual(getPath(state, rule.path), rule.value);
    case "oneOf":
      return rule.values.some((v) => looseEqual(getPath(state, rule.path), v));
    case "truthy":
      return !!getPath(state, rule.path);
    case "falsy":
      return !getPath(state, rule.path);
    case "exists":
      return getPath(state, rule.path) !== undefined;
    case "notExists":
      return getPath(state, rule.path) === undefined;
    case "arrayContains":
      return asArray(getPath(state, rule.path)).some((item) => matchesSubset(item, rule.match));
    case "arrayNotContains":
      return !asArray(getPath(state, rule.path)).some((item) => matchesSubset(item, rule.match));
    case "arrayLength": {
      const len = asArray(getPath(state, rule.path)).length;
      return (rule.min === undefined || len >= rule.min) && (rule.max === undefined || len <= rule.max);
    }
    case "visited":
      return asArray(getPath(state, "__meta.visited")).includes(rule.page);
    case "commandUsed": {
      let re: RegExp;
      try {
        re = new RegExp(rule.pattern, "i");
      } catch {
        return false;
      }
      return asArray(getPath(state, "__meta.history")).some((c) => typeof c === "string" && re.test(c));
    }
    case "placedIn":
      return getPath(state, `placements.${rule.item}`) === rule.zone;
    case "notPlaced":
      return getPath(state, `placements.${rule.item}`) === undefined;
    case "zoneHasAny":
      return rule.items.some((i) => getPath(state, `placements.${i}`) === rule.zone);
    case "zoneLacks":
      return rule.items.every((i) => getPath(state, `placements.${i}`) !== rule.zone);
    case "connected":
      return asArray(getPath(state, "connections")).some((c) => {
        if (!Array.isArray(c)) return false;
        return (c[0] === rule.from && c[1] === rule.to) || (!rule.directed && c[0] === rule.to && c[1] === rule.from);
      });
    case "stageCorrect":
      return getPath(state, `stages.${rule.stage}.correct`) === true;
    case "textMinLength": {
      const v = getPath(state, rule.path);
      return typeof v === "string" && v.trim().length >= rule.min;
    }
    case "matches": {
      const v = getPath(state, rule.path);
      if (typeof v !== "string") return false;
      try {
        return new RegExp(rule.pattern, "i").test(v);
      } catch {
        return false;
      }
    }
    case "allOf":
      return rule.rules.every((r) => evaluateRule(r, state));
    case "anyOf":
      return rule.rules.some((r) => evaluateRule(r, state));
    case "not":
      return !evaluateRule(rule.rule, state);
  }
}

export type KeyedRule = { key: string; rule: LabRule; description?: string; successFeedback?: string | null; failureFeedback?: string | null };
export type RuleOutcome = { key: string; passed: boolean; description?: string; feedback?: string | null };

export function evaluateRules(rules: KeyedRule[], state: unknown): RuleOutcome[] {
  return rules.map((r) => {
    const passed = evaluateRule(r.rule, state);
    return { key: r.key, passed, description: r.description, feedback: passed ? r.successFeedback : r.failureFeedback };
  });
}
