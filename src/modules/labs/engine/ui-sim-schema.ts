/**
 * Schemas and types for "UI simulation" labs: data-driven, fictional look-alikes of cloud portals
 * (Azure portal, Microsoft Entra, Purview, Defender, Microsoft 365 admin center, Power Platform,
 * Microsoft Foundry, GitHub, ...) that run inside a simulated lab VM. Configurations are authored as
 * JSON and validated here; the reducer lives in ./ui-simulation.ts.
 */
import { z } from "zod";
import { labRuleSchema, type LabRule } from "./rules";
import { PORTAL_ICON_NAMES } from "./portal-icons";

// ------------------------------------------------------------------ primitives

export const uiSimId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/, "Use letters, digits, '-' or '_' (max 80)");
const id = uiSimId;
const label = z.string().min(1).max(200);
const icon = z.enum(PORTAL_ICON_NAMES);
/** Path read from the evaluation context (state root plus $sel, $form, $row, $args, ...). */
const readPath = z.string().min(1).max(200);
/** Path written in the lab state. Engine metadata and $-context values are not writable. */
const statePath = z
  .string()
  .min(1)
  .max(200)
  .refine((p) => !p.startsWith("__meta") && !p.startsWith("$"), "State paths cannot target __meta or $-prefixed context values");
const option = z.object({ value: z.string().min(1).max(160), label });
const variant = z.enum(["primary", "secondary", "danger", "link"]);
const visibleWhen = labRuleSchema.optional();

export const PORTAL_THEMES = [
  "generic",
  "azure",
  "entra",
  "purview",
  "defender",
  "m365",
  "sharepoint",
  "power-platform",
  "power-apps",
  "power-automate",
  "power-bi",
  "copilot-studio",
  "foundry",
  "fabric",
  "github",
  "power",
] as const;
export type PortalTheme = (typeof PORTAL_THEMES)[number];

export const COLUMN_FORMATS = ["text", "status", "badge", "code", "link", "date", "datetime", "bool", "tags", "json", "count"] as const;
export type ColumnFormat = (typeof COLUMN_FORMATS)[number];

export type Tone = "info" | "success" | "warning" | "error";
const tone = z.enum(["info", "success", "warning", "error"]);

// ------------------------------------------------------------------ actions

export type SelectSpec = { as: string; path: string; key: string; value: string };

export type UiSimAction =
  | { type: "navigate"; page: string; select?: SelectSpec }
  | { type: "select"; as: string; path: string; key: string; value: string }
  | { type: "set"; path: string; value?: unknown }
  | { type: "toggle"; path: string }
  | { type: "append"; path: string; value?: unknown; unique?: string; uniqueMessage?: string }
  | { type: "update"; path: string; where?: Record<string, unknown>; set: Record<string, unknown> }
  | { type: "remove"; path: string; where?: Record<string, unknown>; value?: unknown }
  | { type: "notify"; title: string; message?: string; tone?: Tone }
  | { type: "message"; text: string; tone?: Tone }
  | { type: "if"; when: LabRule; then: UiSimAction[]; else?: UiSimAction[] }
  | { type: "fail"; message: string }
  | { type: "sequence"; actions: UiSimAction[] };

const selectSpec = z.object({ as: id, path: readPath, key: z.string().min(1).max(120), value: z.string().max(400) });

export const uiSimActionSchema: z.ZodType<UiSimAction> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal("navigate"), page: id, select: selectSpec.optional() }),
    z.object({ type: z.literal("select"), as: id, path: readPath, key: z.string().min(1).max(120), value: z.string().max(400) }),
    z.object({ type: z.literal("set"), path: statePath, value: z.unknown().optional() }),
    z.object({ type: z.literal("toggle"), path: statePath }),
    z.object({ type: z.literal("append"), path: statePath, value: z.unknown().optional(), unique: z.string().max(120).optional(), uniqueMessage: z.string().max(300).optional() }),
    z.object({ type: z.literal("update"), path: statePath, where: z.record(z.string(), z.unknown()).optional(), set: z.record(z.string(), z.unknown()) }),
    z.object({ type: z.literal("remove"), path: statePath, where: z.record(z.string(), z.unknown()).optional(), value: z.unknown().optional() }),
    z.object({ type: z.literal("notify"), title: z.string().min(1).max(200), message: z.string().max(600).optional(), tone: tone.optional() }),
    z.object({ type: z.literal("message"), text: z.string().min(1).max(600), tone: tone.optional() }),
    z.object({ type: z.literal("if"), when: labRuleSchema, then: z.array(uiSimActionSchema).max(30), else: z.array(uiSimActionSchema).max(30).optional() }),
    z.object({ type: z.literal("fail"), message: z.string().min(1).max(600) }),
    z.object({ type: z.literal("sequence"), actions: z.array(uiSimActionSchema).min(1).max(40) }),
  ]),
);

/** Legacy (v1) form submit action: store the submitted record. */
export const uiSimFormActionSchema = z.object({
  type: z.enum(["append", "merge"]),
  path: statePath,
  /** fieldId -> property name in the stored record */
  map: z.record(z.string(), z.string()).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
  navigate: id.optional(),
  successMessage: z.string().max(300).optional(),
});
export type UiSimFormAction = z.infer<typeof uiSimFormActionSchema>;

// ------------------------------------------------------------------ fields

export const FIELD_CONTROLS = ["text", "textarea", "code", "number", "select", "radio", "toggle", "checkboxes"] as const;

export const uiSimFieldSchema = z.object({
  id,
  label,
  control: z.enum(FIELD_CONTROLS),
  options: z.array(option).max(40).optional(),
  /** Options computed from a list in the state, e.g. existing resource groups. */
  optionsFrom: z
    .object({ path: readPath, value: z.string().min(1).max(120), label: z.string().max(120).optional(), where: z.record(z.string(), z.unknown()).optional() })
    .optional(),
  bindTo: statePath.optional(),
  placeholder: z.string().max(200).optional(),
  required: z.boolean().optional(),
  help: z.string().max(600).optional(),
  defaultValue: z.union([z.string().max(6000), z.boolean(), z.number(), z.array(z.string().max(160)).max(40)]).optional(),
  pattern: z.string().max(300).optional(),
  patternMessage: z.string().max(300).optional(),
  minLength: z.number().int().min(0).max(6000).optional(),
  maxLength: z.number().int().min(1).max(6000).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  unique: z.object({ path: readPath, key: z.string().min(1).max(120), message: z.string().max(300).optional() }).optional(),
  readOnly: z.boolean().optional(),
  visibleWhen,
  language: z.string().max(20).optional(),
});
export type UiSimField = z.infer<typeof uiSimFieldSchema>;

const submitSchema = z.object({
  label,
  /** v1: store the submitted record. */
  action: uiSimFormActionSchema.optional(),
  /** v2: actions run with the submitted values available as {{$form.fieldId}}. */
  actions: z.array(uiSimActionSchema).max(40).optional(),
  successMessage: z.string().max(300).optional(),
  /** Form-level validation: every rule must pass (evaluated with $form). */
  checks: z.array(z.object({ rule: labRuleSchema, message: z.string().min(1).max(300) })).max(12).optional(),
});

const chartPreviewSchema = z.object({
  type: z.literal("chart"),
  dataset: readPath,
  visualField: id,
  categoryField: id,
  valueField: id,
  aggregationField: id.optional(),
});

// ------------------------------------------------------------------ components

const columnSchema = z.object({ key: z.string().min(1).max(120), label, format: z.enum(COLUMN_FORMATS).optional(), template: z.string().max(600).optional() });
const rowActionSchema = z.object({ id, label, icon: icon.optional(), variant: variant.optional(), action: uiSimActionSchema, visibleWhen });
const tileSchema = z.object({ id, label, description: z.string().max(300).optional(), icon: icon.optional(), badge: z.string().max(40).optional(), action: uiSimActionSchema, visibleWhen });

export const uiSimComponentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), id: id.optional(), text: z.string().min(1).max(8000), visibleWhen }),
  z.object({ kind: z.literal("callout"), id: id.optional(), variant: z.enum(["info", "warning", "success", "error"]), title: z.string().max(200).optional(), text: z.string().min(1).max(4000), visibleWhen }),
  z.object({
    kind: z.literal("table"),
    id,
    title: z.string().max(200).optional(),
    source: readPath,
    where: z.record(z.string(), z.unknown()).optional(),
    columns: z.array(columnSchema).min(1).max(10),
    emptyText: z.string().max(300).optional(),
    /** Field that identifies a row; required for row actions and row clicks. */
    rowKey: z.string().max(120).optional(),
    /** v1: row key value -> page id. */
    rowLinks: z.record(z.string(), id).optional(),
    /** Runs with {{$row...}} when a row is opened. */
    rowAction: uiSimActionSchema.optional(),
    rowActions: z.array(rowActionSchema).max(6).optional(),
    searchable: z.boolean().optional(),
    variant: z.enum(["table", "cards", "flow", "list", "files"]).optional(),
    visibleWhen,
  }),
  z.object({
    kind: z.literal("links"),
    id,
    title: z.string().max(200).optional(),
    items: z.array(z.object({ id, label, page: id, description: z.string().max(300).optional(), icon: icon.optional() })).min(1).max(16),
    visibleWhen,
  }),
  z.object({ kind: z.literal("button"), id, label, icon: icon.optional(), variant: variant.optional(), action: uiSimActionSchema, disabledWhen: labRuleSchema.optional(), visibleWhen }),
  z.object({ kind: z.literal("tiles"), id, title: z.string().max(200).optional(), size: z.enum(["sm", "md", "lg"]).optional(), items: z.array(tileSchema).min(1).max(30), visibleWhen }),
  z.object({
    kind: z.literal("form"),
    id,
    title: z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
    fields: z.array(uiSimFieldSchema).min(1).max(24),
    submit: submitSchema,
    preview: chartPreviewSchema.optional(),
    visibleWhen,
  }),
  z.object({
    kind: z.literal("wizard"),
    id,
    title: z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
    tabs: z.array(z.object({ id, label, description: z.string().max(1000).optional(), fields: z.array(uiSimFieldSchema).max(20) })).min(1).max(8),
    reviewLabel: z.string().max(60).optional(),
    submit: submitSchema,
    visibleWhen,
  }),
  z.object({
    kind: z.literal("settings"),
    id,
    title: z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
    fields: z.array(uiSimFieldSchema.extend({ bindTo: statePath })).min(1).max(16),
    visibleWhen,
  }),
  z.object({
    kind: z.literal("properties"),
    id: id.optional(),
    title: z.string().max(200).optional(),
    items: z.array(z.object({ label, value: z.string().max(1000), format: z.enum(COLUMN_FORMATS).optional() })).min(1).max(40),
    visibleWhen,
  }),
  z.object({ kind: z.literal("terminal"), id, title: z.string().max(120).optional(), visibleWhen }),
  z.object({
    kind: z.literal("sqlEditor"),
    id,
    title: z.string().max(200).optional(),
    database: statePath,
    defaultTable: z.string().max(120).optional(),
    placeholder: z.string().max(400).optional(),
    sampleQueries: z.array(z.object({ label: z.string().min(1).max(80), sql: z.string().min(1).max(2000) })).max(8).optional(),
    maxRows: z.number().int().min(1).max(200).optional(),
    visibleWhen,
  }),
  z.object({
    kind: z.literal("chat"),
    id,
    title: z.string().max(200).optional(),
    placeholder: z.string().max(200).optional(),
    systemPrompt: z.string().max(4000).optional(),
    transcriptPath: statePath.optional(),
    responses: z
      .array(
        z.object({
          id,
          /** Case-insensitive regular expression tested against the learner's message. */
          match: z.string().max(400).optional(),
          when: labRuleSchema.optional(),
          reply: z.string().min(1).max(4000),
          blocked: z.boolean().optional(),
          citations: z.array(z.string().max(200)).max(6).optional(),
          actions: z.array(uiSimActionSchema).max(20).optional(),
        }),
      )
      .max(40),
    fallback: z.string().min(1).max(4000),
    visibleWhen,
  }),
  z.object({ kind: z.literal("code"), id: id.optional(), title: z.string().max(200).optional(), language: z.string().max(20).optional(), content: z.string().min(1).max(20000), visibleWhen }),
  z.object({
    kind: z.literal("deployment"),
    id: id.optional(),
    title: z.string().min(1).max(300),
    status: z.string().max(300).optional(),
    resources: z.array(z.object({ name: z.string().min(1).max(300), type: z.string().min(1).max(200), status: z.string().max(200).optional() })).max(12).optional(),
    note: z.string().max(1000).optional(),
    visibleWhen,
  }),
  z.object({
    kind: z.literal("chart"),
    id: id.optional(),
    title: z.string().max(200).optional(),
    type: z.enum(["line", "bar"]),
    unit: z.string().max(40).optional(),
    points: z.array(z.object({ label: z.string().min(1).max(60), value: z.number() })).min(1).max(60),
    visibleWhen,
  }),
]);
export type UiSimComponent = z.infer<typeof uiSimComponentSchema>;
export type UiSimComponentOf<K extends UiSimComponent["kind"]> = Extract<UiSimComponent, { kind: K }>;

// ------------------------------------------------------------------ pages and config

const navItemSchema = z.object({ page: id, label, icon: icon.optional(), section: z.string().max(80).optional() });
export type UiSimNavItem = z.infer<typeof navItemSchema>;

const commandSchema = z.object({ id, label, icon: icon.optional(), variant: variant.optional(), action: uiSimActionSchema, visibleWhen, disabledWhen: labRuleSchema.optional() });
export type UiSimCommand = z.infer<typeof commandSchema>;

export const uiSimPageSchema = z.object({
  id,
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  icon: icon.optional(),
  /** Address-bar path appended to portal.url (or an absolute URL). Templates allowed. */
  url: z.string().max(400).optional(),
  /** "blank" renders the page without the portal chrome (e.g. a website served by a lab VM). */
  layout: z.enum(["portal", "blank"]).optional(),
  breadcrumb: z.array(z.string().max(160)).max(8).optional(),
  /** Navigation item (page id) highlighted while this page is open. */
  navItem: id.optional(),
  /** Resource menu (left menu inside a resource blade, or tabs). */
  menu: z.array(navItemSchema).max(24).optional(),
  menuStyle: z.enum(["side", "tabs"]).optional(),
  commands: z.array(commandSchema).max(12).optional(),
  /** Selection alias the page needs (renderer shows "not found" when missing). */
  requires: id.optional(),
  components: z.array(uiSimComponentSchema).max(40),
});
export type UiSimPage = z.infer<typeof uiSimPageSchema>;

const terminalCommandSchema = z.object({
  id,
  /** Case-insensitive regular expression; use ^...$ anchors and named groups, e.g. ^git switch -c (?<branch>\\S+)$ */
  pattern: z.string().min(1).max(400),
  when: labRuleSchema.optional(),
  output: z.string().max(12000).optional(),
  error: z.string().max(4000).optional(),
  actions: z.array(uiSimActionSchema).max(30).optional(),
  help: z.string().max(300).optional(),
});
export type UiSimTerminalCommand = z.infer<typeof terminalCommandSchema>;

export const uiSimTerminalSchema = z.object({
  title: z.string().min(1).max(120),
  prompt: z.string().min(1).max(200),
  welcome: z.string().max(2000).optional(),
  /** Where the terminal appears: a Cloud Shell style panel in the portal, a separate VM app, or both. */
  surface: z.enum(["cloudshell", "app", "both"]).optional(),
  commands: z.array(terminalCommandSchema).min(1).max(120),
  fallback: z.string().max(1000).optional(),
});
export type UiSimTerminal = z.infer<typeof uiSimTerminalSchema>;

const baseConfigSchema = z.object({
  portal: z.object({
    name: z.string().min(1).max(120),
    theme: z.enum(PORTAL_THEMES).default("generic"),
    user: z.string().max(120).optional(),
    tenant: z.string().max(160).optional(),
    url: z.string().max(200).optional(),
    searchPlaceholder: z.string().max(120).optional(),
  }),
  vm: z
    .object({
      name: z.string().max(60).optional(),
      os: z.enum(["windows", "linux"]).optional(),
      apps: z.array(z.enum(["browser", "terminal"])).min(1).max(2).optional(),
    })
    .optional(),
  clock: z.object({ start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/) }).optional(),
  terminal: uiSimTerminalSchema.optional(),
  startPage: id,
  navigation: z.array(navItemSchema).max(40),
  pages: z.array(uiSimPageSchema).min(1).max(60),
  initialState: z.record(z.string(), z.unknown()),
});

function walkActions(actions: readonly UiSimAction[], visit: (a: UiSimAction) => void) {
  for (const action of actions) {
    visit(action);
    if (action.type === "if") {
      walkActions(action.then, visit);
      walkActions(action.else ?? [], visit);
    }
    if (action.type === "sequence") walkActions(action.actions, visit);
  }
}

/** Every action defined anywhere in a configuration (used for validation). */
export function configActions(config: z.infer<typeof baseConfigSchema>): UiSimAction[] {
  const all: UiSimAction[] = [];
  const add = (a: UiSimAction | undefined) => {
    if (a) walkActions([a], (x) => all.push(x));
  };
  for (const page of config.pages) {
    for (const c of page.commands ?? []) add(c.action);
    for (const c of page.components) {
      if (c.kind === "button") add(c.action);
      if (c.kind === "tiles") c.items.forEach((i) => add(i.action));
      if (c.kind === "table") {
        add(c.rowAction);
        (c.rowActions ?? []).forEach((r) => add(r.action));
      }
      if (c.kind === "form" || c.kind === "wizard") (c.submit.actions ?? []).forEach(add);
      if (c.kind === "chat") c.responses.forEach((r) => (r.actions ?? []).forEach(add));
    }
  }
  for (const cmd of config.terminal?.commands ?? []) (cmd.actions ?? []).forEach(add);
  return all;
}

function validRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

export const uiSimConfigSchema = baseConfigSchema.superRefine((config, ctx) => {
  const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: "custom", message, path });
  const pageIds = new Set<string>();
  config.pages.forEach((p, i) => {
    if (pageIds.has(p.id)) issue(`Duplicate page id '${p.id}'`, ["pages", i, "id"]);
    pageIds.add(p.id);
  });
  const hasPage = (pageId: string) => pageIds.has(pageId);
  if (!hasPage(config.startPage)) issue("startPage must reference a page", ["startPage"]);
  config.navigation.forEach((n, i) => {
    if (!hasPage(n.page)) issue(`Navigation references unknown page '${n.page}'`, ["navigation", i, "page"]);
  });
  for (const key of Object.keys(config.initialState)) {
    if (key === "__meta" || key.startsWith("$")) issue(`initialState key '${key}' is reserved`, ["initialState", key]);
  }

  const componentIds = new Set<string>();
  const claim = (value: string, path: (string | number)[]) => {
    if (componentIds.has(value)) issue(`Duplicate component or command id '${value}'`, path);
    componentIds.add(value);
  };
  let usesTerminal = false;
  config.pages.forEach((page, pi) => {
    if (page.navItem && !hasPage(page.navItem)) issue(`navItem references unknown page '${page.navItem}'`, ["pages", pi, "navItem"]);
    (page.menu ?? []).forEach((m, mi) => {
      if (!hasPage(m.page)) issue(`Menu references unknown page '${m.page}'`, ["pages", pi, "menu", mi, "page"]);
    });
    (page.commands ?? []).forEach((c, ci) => claim(c.id, ["pages", pi, "commands", ci, "id"]));
    page.components.forEach((c, ci) => {
      const path = ["pages", pi, "components", ci];
      if ("id" in c && c.id) claim(c.id, [...path, "id"]);
      if (c.kind === "terminal") usesTerminal = true;
      if (c.kind === "links") c.items.forEach((item, ii) => !hasPage(item.page) && issue(`Link references unknown page '${item.page}'`, [...path, "items", ii]));
      if (c.kind === "table") {
        Object.values(c.rowLinks ?? {}).forEach((target) => !hasPage(target) && issue(`rowLinks references unknown page '${target}'`, path));
        if ((c.rowAction || c.rowActions?.length || c.rowLinks) && !c.rowKey) issue("Tables with row actions need a rowKey", path);
        const ids = new Set<string>();
        (c.rowActions ?? []).forEach((r) => (ids.has(r.id) ? issue(`Duplicate row action id '${r.id}'`, path) : ids.add(r.id)));
      }
      if (c.kind === "tiles") {
        const ids = new Set<string>();
        c.items.forEach((t) => (ids.has(t.id) ? issue(`Duplicate tile id '${t.id}'`, path) : ids.add(t.id)));
      }
      if (c.kind === "form" || c.kind === "wizard" || c.kind === "settings") {
        const fields = c.kind === "wizard" ? c.tabs.flatMap((t) => t.fields) : c.fields;
        const ids = new Set<string>();
        fields.forEach((f) => {
          if (ids.has(f.id)) issue(`Duplicate field id '${f.id}'`, path);
          ids.add(f.id);
          if ((f.control === "select" || f.control === "radio" || f.control === "checkboxes") && !f.options?.length && !f.optionsFrom) {
            issue(`Field '${f.id}' needs options or optionsFrom`, path);
          }
          if (f.pattern && !validRegex(f.pattern)) issue(`Field '${f.id}' has an invalid pattern`, path);
        });
        if (c.kind !== "settings" && !c.submit.action && !c.submit.actions?.length) issue("Forms need submit.action or submit.actions", path);
        if (c.kind !== "settings" && c.submit.action?.navigate && !hasPage(c.submit.action.navigate)) issue(`Form navigates to unknown page '${c.submit.action.navigate}'`, path);
      }
      if (c.kind === "chat") c.responses.forEach((r) => r.match && !validRegex(r.match) && issue(`Chat response '${r.id}' has an invalid pattern`, path));
    });
  });
  if (usesTerminal && !config.terminal) issue("A terminal component requires a top-level terminal configuration", ["terminal"]);
  config.terminal?.commands.forEach((cmd, i) => {
    if (!validRegex(cmd.pattern)) issue(`Terminal command '${cmd.id}' has an invalid pattern`, ["terminal", "commands", i, "pattern"]);
  });
  for (const action of configActions(config)) {
    if (action.type === "navigate" && !hasPage(action.page)) issue(`Action navigates to unknown page '${action.page}'`, []);
  }
});
export type UiSimConfig = z.infer<typeof uiSimConfigSchema>;

// ------------------------------------------------------------------ events

const fieldValue = z.union([z.string().max(6000), z.boolean(), z.number().finite(), z.array(z.string().max(160)).max(40)]);
export type UiSimFieldValue = z.infer<typeof fieldValue>;

export const uiSimEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), page: id }),
  /** Browser back button: closes an error page, otherwise returns to the previous page of the trail. */
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("openUrl"), url: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal("click"), componentId: id, itemId: id.optional() }),
  z.object({ type: z.literal("rowClick"), componentId: id, rowKey: z.string().min(1).max(200) }),
  z.object({ type: z.literal("rowAction"), componentId: id, rowKey: z.string().min(1).max(200), actionId: id }),
  z.object({ type: z.literal("setField"), componentId: id, fieldId: id, value: fieldValue }),
  z.object({
    type: z.literal("submitForm"),
    componentId: id,
    values: z.record(z.string().max(80), fieldValue).refine((v) => Object.keys(v).length <= 60, "Too many values"),
  }),
  z.object({ type: z.literal("command"), command: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal("query"), componentId: id, sql: z.string().trim().min(1).max(4000) }),
  z.object({ type: z.literal("chat"), componentId: id, message: z.string().trim().min(1).max(600) }),
]);
export type UiSimEvent = z.infer<typeof uiSimEventSchema>;
export const UI_SIM_EVENT_TYPES: readonly UiSimEvent["type"][] = ["navigate", "back", "openUrl", "click", "rowClick", "rowAction", "setField", "submitForm", "command", "query", "chat"];

// ------------------------------------------------------------------ state

export type UiSimMessage = { tone: Tone; text: string } | null;
export type UiSimNotification = { id: string; title: string; message?: string; tone: Tone };
export type UiSimTerminalEntry = { id: number; prompt: string; command: string; output: string; error: boolean };
export type UiSimQueryResult = {
  sql: string;
  ok: boolean;
  kind?: "rows" | "documents" | "affected";
  columns?: string[];
  rows?: (string | number | boolean | null)[][];
  documents?: unknown[];
  rowCount?: number;
  message?: string;
  error?: string;
};
export type UiSimSelection = { path: string; key: string; value: string };
export type UiSimChatMessage = { role: "user" | "assistant"; text: string; replyId?: string; blocked?: boolean; citations?: string[] };

export type UiSimMeta = {
  page: string;
  visited: string[];
  message: UiSimMessage;
  events: number;
  trail?: string[];
  selected?: Record<string, UiSimSelection>;
  notifications?: UiSimNotification[];
  toast?: UiSimNotification | null;
  history?: string[];
  terminal?: UiSimTerminalEntry[];
  results?: Record<string, UiSimQueryResult>;
  browserError?: { url: string } | null;
};
export type UiSimState = Record<string, unknown> & { __meta: UiSimMeta };

export const UI_SIM_LIMITS = {
  listItems: 200,
  terminalEntries: 150,
  history: 200,
  notifications: 20,
  trail: 50,
  chatMessages: 60,
  queryRows: 100,
  actionDepth: 12,
} as const;
