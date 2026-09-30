/**
 * Guided UI simulation engine. A lab describes a simplified, fictional product
 * interface as data (pages, components, fields) and an initial JSON state.
 * The reducer is pure and deterministic so the server can replay the learner's
 * event log to validate completion.
 */
import { z } from "zod";
import { getPath, setPath } from "./rules";

const id = z.string().min(1).max(80);
const label = z.string().min(1).max(200);
const option = z.object({ value: z.string().min(1).max(120), label });

export const uiSimFieldSchema = z.object({
  id,
  label,
  control: z.enum(["text", "select", "radio", "toggle", "checkboxes"]),
  options: z.array(option).max(20).optional(),
  bindTo: z.string().max(200).optional(),
  placeholder: z.string().max(200).optional(),
  required: z.boolean().optional(),
  help: z.string().max(400).optional(),
});
export type UiSimField = z.infer<typeof uiSimFieldSchema>;

export const uiSimActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), page: id }),
  z.object({ type: z.literal("set"), path: z.string().max(200), value: z.unknown() }),
  z.object({ type: z.literal("toggle"), path: z.string().max(200) }),
]);

export const uiSimFormActionSchema = z.object({
  type: z.enum(["append", "merge"]),
  path: z.string().max(200),
  /** fieldId -> property name in the stored record */
  map: z.record(z.string(), z.string()).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
  navigate: id.optional(),
  successMessage: z.string().max(300).optional(),
});

export const uiSimComponentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), id: id.optional(), text: z.string().min(1).max(4000) }),
  z.object({ kind: z.literal("callout"), id: id.optional(), variant: z.enum(["info", "warning", "success"]), text: z.string().min(1).max(2000) }),
  z.object({
    kind: z.literal("table"),
    id,
    title: z.string().max(200).optional(),
    source: z.string().max(200),
    columns: z.array(z.object({ key: z.string().max(80), label })).min(1).max(8),
    emptyText: z.string().max(200).optional(),
    /** Row links: value of `rowKey` column -> page id */
    rowKey: z.string().max(80).optional(),
    rowLinks: z.record(z.string(), id).optional(),
  }),
  z.object({
    kind: z.literal("links"),
    id,
    title: z.string().max(200).optional(),
    items: z.array(z.object({ id, label, page: id, description: z.string().max(300).optional() })).min(1).max(12),
  }),
  z.object({ kind: z.literal("button"), id, label, variant: z.enum(["primary", "secondary", "danger"]).optional(), action: uiSimActionSchema }),
  z.object({
    kind: z.literal("form"),
    id,
    title: z.string().max(200).optional(),
    description: z.string().max(600).optional(),
    fields: z.array(uiSimFieldSchema).min(1).max(10),
    submit: z.object({ label, action: uiSimFormActionSchema }),
  }),
  z.object({
    kind: z.literal("settings"),
    id,
    title: z.string().max(200).optional(),
    description: z.string().max(600).optional(),
    fields: z.array(uiSimFieldSchema.extend({ bindTo: z.string().max(200) })).min(1).max(12),
  }),
]);
export type UiSimComponent = z.infer<typeof uiSimComponentSchema>;

export const uiSimPageSchema = z.object({
  id,
  title: label,
  breadcrumb: z.array(z.string().max(120)).max(6).optional(),
  components: z.array(uiSimComponentSchema).max(20),
});
export type UiSimPage = z.infer<typeof uiSimPageSchema>;

export const uiSimConfigSchema = z
  .object({
    portal: z.object({
      name: z.string().min(1).max(120),
      theme: z.enum(["azure", "m365", "power", "github", "generic"]).default("generic"),
      user: z.string().max(120).optional(),
    }),
    startPage: id,
    navigation: z.array(z.object({ page: id, label, icon: z.string().max(40).optional() })).max(12),
    pages: z.array(uiSimPageSchema).min(1).max(30),
    initialState: z.record(z.string(), z.unknown()),
  })
  .refine((c) => c.pages.some((p) => p.id === c.startPage), "startPage must reference a page");
export type UiSimConfig = z.infer<typeof uiSimConfigSchema>;

const fieldValue = z.union([z.string().max(300), z.boolean(), z.array(z.string().max(120)).max(20)]);

export const uiSimEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), page: id }),
  z.object({ type: z.literal("click"), componentId: id }),
  z.object({ type: z.literal("setField"), componentId: id, fieldId: id, value: fieldValue }),
  z.object({ type: z.literal("submitForm"), componentId: id, values: z.record(z.string().max(80), fieldValue) }),
]);
export type UiSimEvent = z.infer<typeof uiSimEventSchema>;

export type UiSimMessage = { tone: "success" | "error"; text: string } | null;
export type UiSimMeta = { page: string; visited: string[]; message: UiSimMessage; events: number };
export type UiSimState = Record<string, unknown> & { __meta: UiSimMeta };

export function initialUiSimState(config: UiSimConfig): UiSimState {
  return {
    ...(structuredClone(config.initialState) as Record<string, unknown>),
    __meta: { page: config.startPage, visited: [config.startPage], message: null, events: 0 },
  };
}

function findComponent(config: UiSimConfig, componentId: string): UiSimComponent | undefined {
  for (const page of config.pages) {
    const c = page.components.find((x) => "id" in x && x.id === componentId);
    if (c) return c;
  }
  return undefined;
}

/** Validate and normalize a field value. Returns undefined when invalid. */
export function normalizeFieldValue(field: UiSimField, value: unknown): string | boolean | string[] | undefined {
  const allowed = new Set((field.options ?? []).map((o) => o.value));
  switch (field.control) {
    case "toggle":
      return typeof value === "boolean" ? value : undefined;
    case "select":
    case "radio":
      return typeof value === "string" && allowed.has(value) ? value : undefined;
    case "checkboxes":
      return Array.isArray(value) && value.every((v) => typeof v === "string" && allowed.has(v)) ? [...new Set(value as string[])] : undefined;
    case "text":
      return typeof value === "string" ? value.trim().slice(0, 200) : undefined;
  }
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function withMeta(state: UiSimState, patch: Partial<UiSimMeta>): UiSimState {
  return { ...state, __meta: { ...state.__meta, ...patch, events: state.__meta.events + 1 } };
}

function navigate(config: UiSimConfig, state: UiSimState, page: string): UiSimState {
  if (!config.pages.some((p) => p.id === page)) return state;
  const visited = state.__meta.visited.includes(page) ? state.__meta.visited : [...state.__meta.visited, page];
  return withMeta(state, { page, visited, message: null });
}

export function applyUiSimEvent(config: UiSimConfig, state: UiSimState, event: UiSimEvent): UiSimState {
  switch (event.type) {
    case "navigate":
      return navigate(config, state, event.page);
    case "click": {
      const c = findComponent(config, event.componentId);
      if (!c || c.kind !== "button") return state;
      if (c.action.type === "navigate") return navigate(config, state, c.action.page);
      if (c.action.type === "set") return withMeta(setPath(state, c.action.path, c.action.value), { message: null });
      return withMeta(setPath(state, c.action.path, !getPath(state, c.action.path)), { message: null });
    }
    case "setField": {
      const c = findComponent(config, event.componentId);
      if (!c || c.kind !== "settings") return state;
      const field = c.fields.find((f) => f.id === event.fieldId);
      if (!field) return state;
      const value = normalizeFieldValue(field, event.value);
      if (value === undefined) return state;
      return withMeta(setPath(state, field.bindTo, value), { message: null });
    }
    case "submitForm": {
      const c = findComponent(config, event.componentId);
      if (!c || c.kind !== "form") return state;
      const record: Record<string, unknown> = {};
      for (const field of c.fields) {
        const value = normalizeFieldValue(field, event.values[field.id]);
        if (field.required && isEmpty(value)) {
          return withMeta(state, { message: { tone: "error", text: `${field.label}: required` } });
        }
        if (value !== undefined) record[c.submit.action.map?.[field.id] ?? field.id] = value;
      }
      Object.assign(record, c.submit.action.extra ?? {});
      let next: UiSimState;
      if (c.submit.action.type === "append") {
        const list = getPath(state, c.submit.action.path);
        const items = Array.isArray(list) ? list : [];
        const duplicate = items.some((i) => JSON.stringify(i) === JSON.stringify(record));
        next = duplicate ? state : setPath(state, c.submit.action.path, [...items, record]);
      } else {
        const current = getPath(state, c.submit.action.path);
        next = setPath(state, c.submit.action.path, { ...(current && typeof current === "object" ? current : {}), ...record });
      }
      const message: UiSimMessage = { tone: "success", text: c.submit.action.successMessage ?? "Saved" };
      next = withMeta(next, { message });
      if (c.submit.action.navigate) {
        const moved = navigate(config, next, c.submit.action.navigate);
        return { ...moved, __meta: { ...moved.__meta, message } };
      }
      return next;
    }
  }
}

export function replayUiSim(config: UiSimConfig, events: UiSimEvent[]): UiSimState {
  return events.reduce((s, e) => applyUiSimEvent(config, s, e), initialUiSimState(config));
}
