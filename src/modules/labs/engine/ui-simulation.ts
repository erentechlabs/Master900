/**
 * UI simulation (portal lab) reducer. A lab describes a fictional, simplified look-alike of a cloud portal as data;
 * the learner's events are applied by this pure, deterministic reducer. The server replays the stored event log
 * to validate completion, and the browser runs the same code for instant feedback.
 */
import { getPath, looseEqual, matchesSubset, setPath } from "./rules";
import { executeSql, type SqlDatabase, type SqlResult } from "./sql";
import { renderDeep, renderText, toText, type TemplateContext } from "./templates";
import {
  asArray,
  buildContext,
  compileRegex,
  currentPage,
  formFields,
  getPage,
  normalizeUrl,
  pageUrl,
  passes,
  rowKeyOf,
  tableRows,
  terminalPrompt,
  validateFormValues,
} from "./ui-sim-context";
import {
  UI_SIM_LIMITS,
  type SelectSpec,
  type UiSimAction,
  type UiSimComponent,
  type UiSimComponentOf,
  type UiSimConfig,
  type UiSimEvent,
  type UiSimField,
  type UiSimFormAction,
  type UiSimMeta,
  type UiSimNotification,
  type UiSimQueryResult,
  type UiSimState,
  type UiSimTerminal,
  type UiSimTerminalCommand,
} from "./ui-sim-schema";

export * from "./ui-sim-schema";
export * from "./ui-sim-context";
export * from "./portal-icons";

/** Thrown by actions to abort the current event with a message; the event's changes are discarded. */
export class SimAbort extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimAbort";
  }
}

export function initialUiSimState(config: UiSimConfig): UiSimState {
  return {
    ...(structuredClone(config.initialState) as Record<string, unknown>),
    __meta: {
      page: config.startPage,
      visited: [config.startPage],
      message: null,
      events: 0,
      trail: [config.startPage],
      selected: {},
      notifications: [],
      toast: null,
      history: [],
      terminal: [],
      results: {},
      browserError: null,
    },
  };
}

// ------------------------------------------------------------------ state helpers

function patchMeta(state: UiSimState, patch: Partial<UiSimMeta>): UiSimState {
  return { ...state, __meta: { ...state.__meta, ...patch } };
}

/** Start of a learner event: count it and clear transient messages. */
function startEvent(state: UiSimState): UiSimState {
  return patchMeta(state, { events: state.__meta.events + 1, message: null, toast: null });
}

function setStatePath(state: UiSimState, path: string, value: unknown): UiSimState {
  if (path.startsWith("__meta") || path.startsWith("$")) throw new SimAbort("This value cannot be changed.");
  return setPath(state, path, value);
}

function navigateTo(config: UiSimConfig, state: UiSimState, pageId: string): UiSimState {
  if (!getPage(config, pageId)) return state;
  const meta = state.__meta;
  return patchMeta(state, {
    page: pageId,
    visited: meta.visited.includes(pageId) ? meta.visited : [...meta.visited, pageId],
    trail: [...(meta.trail ?? []), pageId].slice(-UI_SIM_LIMITS.trail),
    browserError: null,
  });
}

/** Run an event body; SimAbort discards the body's changes and reports the message. */
function guarded(state: UiSimState, body: (s: UiSimState) => UiSimState): UiSimState {
  const base = startEvent(state);
  try {
    return body(base);
  } catch (error) {
    if (error instanceof SimAbort) return patchMeta(base, { message: { tone: "error", text: error.message } });
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// ------------------------------------------------------------------ actions

function applySelect(state: UiSimState, spec: SelectSpec | Extract<UiSimAction, { type: "select" }>, ctx: TemplateContext): UiSimState {
  const value = renderText(spec.value, ctx);
  return patchMeta(state, { selected: { ...(state.__meta.selected ?? {}), [spec.as]: { path: spec.path, key: spec.key, value } } });
}

export function runActions(config: UiSimConfig, state: UiSimState, actions: readonly UiSimAction[], extra: TemplateContext = {}, depth = 0): UiSimState {
  let s = state;
  for (const action of actions) s = runAction(config, s, action, extra, depth);
  return s;
}

function runAction(config: UiSimConfig, state: UiSimState, action: UiSimAction, extra: TemplateContext, depth: number): UiSimState {
  if (depth > UI_SIM_LIMITS.actionDepth) throw new SimAbort("This action is too complex to run.");
  const ctx = () => buildContext(config, state, extra);
  /** Action paths may contain templates, e.g. "cosmos.databases.{{$form.db}}.containers". */
  const target = (path: string) => {
    const resolved = path.includes("{{") ? renderText(path, ctx()) : path;
    if (!resolved || /\.\.|^\.|\.$/.test(resolved)) throw new SimAbort("This value cannot be changed.");
    return resolved;
  };
  switch (action.type) {
    case "navigate": {
      const selected = action.select ? applySelect(state, action.select, ctx()) : state;
      return navigateTo(config, selected, action.page);
    }
    case "select":
      return applySelect(state, action, ctx());
    case "set":
      return setStatePath(state, target(action.path), renderDeep(action.value, ctx()));
    case "toggle": {
      const path = target(action.path);
      return setStatePath(state, path, !getPath(state, path));
    }
    case "append": {
      const c = ctx();
      const path = target(action.path);
      const value = renderDeep(action.value, c);
      const list = asArray(getPath(state, path));
      if (action.unique) {
        const key = action.unique;
        const keyValue = key === "$value" ? value : getPath(value, key);
        const exists = list.some((item) => looseEqual(key === "$value" ? item : getPath(item, key), keyValue));
        if (exists) throw new SimAbort(action.uniqueMessage ? renderText(action.uniqueMessage, c) : `'${toText(keyValue)}' already exists.`);
      }
      if (list.length >= UI_SIM_LIMITS.listItems) throw new SimAbort("The simulated list is full.");
      return setStatePath(state, path, [...list, value]);
    }
    case "update": {
      const c = ctx();
      const path = target(action.path);
      const where = action.where ? (renderDeep(action.where, c) as Record<string, unknown>) : undefined;
      const next = asArray(getPath(state, path)).map((item) => {
        if (!isRecord(item) || (where && !matchesSubset(item, where))) return item;
        const values = renderDeep(action.set, { ...c, $item: item }) as Record<string, unknown>;
        let updated: Record<string, unknown> = item;
        for (const [key, value] of Object.entries(values)) updated = setPath(updated, key, value);
        return updated;
      });
      return setStatePath(state, path, next);
    }
    case "remove": {
      const c = ctx();
      const path = target(action.path);
      const where = action.where ? (renderDeep(action.where, c) as Record<string, unknown>) : undefined;
      const value = action.value !== undefined ? renderDeep(action.value, c) : undefined;
      const next = asArray(getPath(state, path)).filter((item) => {
        if (where) return !matchesSubset(item, where);
        if (value !== undefined) return !looseEqual(item, value);
        return false;
      });
      return setStatePath(state, path, next);
    }
    case "notify": {
      const c = ctx();
      const existing = state.__meta.notifications ?? [];
      const notification: UiSimNotification = {
        id: `${state.__meta.events}-${existing.length}`,
        title: renderText(action.title, c),
        ...(action.message ? { message: renderText(action.message, c) } : {}),
        tone: action.tone ?? "success",
      };
      return patchMeta(state, { notifications: [notification, ...existing].slice(0, UI_SIM_LIMITS.notifications), toast: notification });
    }
    case "message":
      return patchMeta(state, { message: { tone: action.tone ?? "info", text: renderText(action.text, ctx()) } });
    case "if":
      return runActions(config, state, passes(action.when, ctx()) ? action.then : (action.else ?? []), extra, depth + 1);
    case "fail":
      throw new SimAbort(renderText(action.message, ctx()) || "The action could not be completed.");
    case "sequence":
      return runActions(config, state, action.actions, extra, depth + 1);
  }
}

// ------------------------------------------------------------------ component lookup

function pageComponent(config: UiSimConfig, state: UiSimState, componentId: string): UiSimComponent | undefined {
  const page = currentPage(config, state);
  // The renderer shows "resource not found" instead of the components when the page's selection is missing.
  if (page.requires && !(buildContext(config, state).$sel as Record<string, unknown>)[page.requires]) return undefined;
  return page.components.find((c) => "id" in c && c.id === componentId);
}

// ------------------------------------------------------------------ event handlers

function handleClick(config: UiSimConfig, state: UiSimState, componentId: string, itemId: string | undefined): UiSimState {
  const ctx = buildContext(config, state);
  const command = currentPage(config, state).commands?.find((c) => c.id === componentId);
  if (command) {
    if (!passes(command.visibleWhen, ctx) || (command.disabledWhen && passes(command.disabledWhen, ctx))) return state;
    return guarded(state, (s) => runActions(config, s, [command.action]));
  }
  const component = pageComponent(config, state, componentId);
  if (!component || !passes(component.visibleWhen, ctx)) return state;
  if (component.kind === "button") {
    if (component.disabledWhen && passes(component.disabledWhen, ctx)) return state;
    return guarded(state, (s) => runActions(config, s, [component.action]));
  }
  if (component.kind === "tiles") {
    const item = component.items.find((i) => i.id === itemId);
    if (!item || !passes(item.visibleWhen, ctx)) return state;
    return guarded(state, (s) => runActions(config, s, [item.action]));
  }
  if (component.kind === "links") {
    const item = component.items.find((i) => i.id === itemId);
    if (!item || !getPage(config, item.page)) return state;
    return guarded(state, (s) => navigateTo(config, s, item.page));
  }
  return state;
}

function handleRow(config: UiSimConfig, state: UiSimState, componentId: string, rowKey: string, actionId?: string): UiSimState {
  const component = pageComponent(config, state, componentId);
  if (!component || component.kind !== "table" || !component.rowKey) return state;
  const ctx = buildContext(config, state);
  if (!passes(component.visibleWhen, ctx)) return state;
  const row = tableRows(component, ctx).find((r) => rowKeyOf(component, r) === rowKey);
  if (row === undefined) return state;
  const rowExtra = { $row: row };
  if (actionId) {
    const rowAction = component.rowActions?.find((a) => a.id === actionId);
    if (!rowAction || !passes(rowAction.visibleWhen, { ...ctx, ...rowExtra })) return state;
    return guarded(state, (s) => runActions(config, s, [rowAction.action], rowExtra));
  }
  if (component.rowAction) {
    const action = component.rowAction;
    return guarded(state, (s) => runActions(config, s, [action], rowExtra));
  }
  const target = component.rowLinks?.[rowKey];
  if (target && getPage(config, target)) return guarded(state, (s) => navigateTo(config, s, target));
  return state;
}

function handleSetField(config: UiSimConfig, state: UiSimState, componentId: string, fieldId: string, value: unknown): UiSimState {
  const component = pageComponent(config, state, componentId);
  if (!component || component.kind !== "settings") return state;
  const ctx = buildContext(config, state);
  if (!passes(component.visibleWhen, ctx)) return state;
  const field = component.fields.find((f) => f.id === fieldId);
  if (!field || field.readOnly || !passes(field.visibleWhen, ctx)) return state;
  const { values, errors } = validateFormValues([field], { [field.id]: value }, ctx);
  const error = errors[field.id];
  if (error) {
    // Type mismatches are ignored (v1 behaviour); constraint violations are reported.
    if (error.code === "invalid" || error.code === "required") return state;
    return patchMeta(startEvent(state), { message: { tone: "error", text: error.message } });
  }
  if (!(field.id in values)) return state;
  return guarded(state, (s) => setStatePath(s, field.bindTo, values[field.id]));
}

function applyLegacyFormAction(config: UiSimConfig, state: UiSimState, fields: UiSimField[], values: Record<string, unknown>, action: UiSimFormAction): UiSimState {
  const record: Record<string, unknown> = {};
  for (const f of fields) if (values[f.id] !== undefined) record[action.map?.[f.id] ?? f.id] = values[f.id];
  Object.assign(record, renderDeep(action.extra ?? {}, buildContext(config, state, { $form: values })) as Record<string, unknown>);
  let next: UiSimState;
  if (action.type === "append") {
    const items = asArray(getPath(state, action.path));
    const duplicate = items.some((i) => JSON.stringify(i) === JSON.stringify(record));
    if (!duplicate && items.length >= UI_SIM_LIMITS.listItems) throw new SimAbort("The simulated list is full.");
    next = duplicate ? state : setStatePath(state, action.path, [...items, record]);
  } else {
    const current = getPath(state, action.path);
    next = setStatePath(state, action.path, { ...(isRecord(current) ? current : {}), ...record });
  }
  if (action.successMessage) next = patchMeta(next, { message: { tone: "success", text: action.successMessage } });
  if (action.navigate) next = navigateTo(config, next, action.navigate);
  return next;
}

function handleSubmit(config: UiSimConfig, state: UiSimState, componentId: string, rawValues: Record<string, unknown>): UiSimState {
  const component = pageComponent(config, state, componentId);
  if (!component || (component.kind !== "form" && component.kind !== "wizard")) return state;
  if (!passes(component.visibleWhen, buildContext(config, state))) return state;
  const fields = formFields(component);
  return guarded(state, (s) => {
    const ctx = buildContext(config, s);
    const { values, errors } = validateFormValues(fields, rawValues, ctx);
    const firstError = fields.map((f) => errors[f.id]).find(Boolean);
    if (firstError) throw new SimAbort(firstError.message);
    for (const check of component.submit.checks ?? []) {
      if (!passes(check.rule, { ...ctx, $form: values })) throw new SimAbort(renderText(check.message, { ...ctx, $form: values }));
    }
    let next = s;
    if (component.submit.action) next = applyLegacyFormAction(config, next, fields, values, component.submit.action);
    if (component.submit.actions?.length) next = runActions(config, next, component.submit.actions, { $form: values });
    if (!next.__meta.message) {
      const text = component.submit.successMessage ?? component.submit.action?.successMessage ?? "Saved";
      next = patchMeta(next, { message: { tone: "success", text: renderText(text, buildContext(config, next, { $form: values })) } });
    }
    return next;
  });
}

function handleOpenUrl(config: UiSimConfig, state: UiSimState, url: string): UiSimState {
  const target = normalizeUrl(url);
  if (!target) return state;
  const base = startEvent(state);
  const ctx = buildContext(config, base);
  const page = config.pages.find((p) => p.url && normalizeUrl(pageUrl(config, p, ctx)) === target);
  if (page) return navigateTo(config, base, page.id);
  return patchMeta(base, { browserError: { url: url.trim().slice(0, 300) } });
}

function handleBack(config: UiSimConfig, state: UiSimState): UiSimState {
  if (state.__meta.browserError) return patchMeta(startEvent(state), { browserError: null });
  const trail = state.__meta.trail ?? [];
  const previous = trail[trail.length - 2];
  if (!previous || !getPage(config, previous)) return state;
  return patchMeta(startEvent(state), { page: previous, trail: trail.slice(0, -1) });
}

// ------------------------------------------------------------------ terminal

export const TERMINAL_FALLBACK = "{{$cmd}}: command not available in this simulated environment. Type 'help' to list the commands you can use.";

function terminalHelp(terminal: UiSimTerminal): string {
  const lines = terminal.commands.filter((c) => c.help).map((c) => `  ${c.help}`);
  return ["Commands available in this simulated environment:", ...lines, "  help, history, clear"].join("\n");
}

function matchTerminalCommand(config: UiSimConfig, state: UiSimState, input: string): { command: UiSimTerminalCommand; args: Record<string, string> } | null {
  for (const command of config.terminal?.commands ?? []) {
    const match = compileRegex(command.pattern)?.exec(input);
    if (!match) continue;
    const args: Record<string, string> = {};
    match.forEach((value, index) => {
      args[String(index)] = value ?? "";
    });
    for (const [name, value] of Object.entries(match.groups ?? {})) args[name] = value ?? "";
    if (!passes(command.when, buildContext(config, state, { $args: args, $cmd: input }))) continue;
    return { command, args };
  }
  return null;
}

function handleCommand(config: UiSimConfig, state: UiSimState, rawInput: string): UiSimState {
  const terminal = config.terminal;
  const input = rawInput.trim().slice(0, 300);
  if (!terminal || !input) return state;
  const prompt = terminalPrompt(config, state);
  const started = startEvent(state);
  const withHistory = patchMeta(started, { history: [...(started.__meta.history ?? []), input].slice(-UI_SIM_LIMITS.history) });
  if (/^(clear|cls)$/i.test(input)) return patchMeta(withHistory, { terminal: [] });

  let next = withHistory;
  let output: string;
  let error = false;
  if (/^help$/i.test(input)) output = terminalHelp(terminal);
  else if (/^history$/i.test(input)) output = (withHistory.__meta.history ?? []).map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join("\n");
  else {
    const matched = matchTerminalCommand(config, withHistory, input);
    if (!matched) {
      output = renderText(terminal.fallback ?? TERMINAL_FALLBACK, buildContext(config, withHistory, { $cmd: input }));
      error = true;
    } else {
      const extra = { $args: matched.args, $cmd: input };
      if (matched.command.error) {
        output = renderText(matched.command.error, buildContext(config, withHistory, extra));
        error = true;
      } else {
        try {
          next = runActions(config, withHistory, matched.command.actions ?? [], extra);
          output = renderText(matched.command.output ?? "", buildContext(config, next, extra));
        } catch (e) {
          if (!(e instanceof SimAbort)) throw e;
          next = withHistory;
          output = e.message;
          error = true;
        }
      }
    }
  }
  const entry = { id: next.__meta.events, prompt, command: input, output, error };
  return patchMeta(next, { terminal: [...(next.__meta.terminal ?? []), entry].slice(-UI_SIM_LIMITS.terminalEntries) });
}

// ------------------------------------------------------------------ query editor and chat

function queryView(result: SqlResult, sql: string): UiSimQueryResult {
  if (!result.ok) return { sql, ok: false, error: result.error };
  if (result.kind === "rows") return { sql, ok: true, kind: "rows", columns: result.columns, rows: result.rows, rowCount: result.rowCount, message: result.message };
  if (result.kind === "documents") return { sql, ok: true, kind: "documents", documents: result.documents, rowCount: result.rowCount, message: result.message };
  return { sql, ok: true, kind: "affected", rowCount: result.rowCount, message: result.message };
}

function handleQuery(config: UiSimConfig, state: UiSimState, componentId: string, rawSql: string): UiSimState {
  const component = pageComponent(config, state, componentId);
  const sql = rawSql.trim();
  if (!component || component.kind !== "sqlEditor" || !sql) return state;
  if (!passes(component.visibleWhen, buildContext(config, state))) return state;
  return guarded(state, (s) => {
    let next = patchMeta(s, { history: [...(s.__meta.history ?? []), sql.replace(/\s+/g, " ").slice(0, 500)].slice(-UI_SIM_LIMITS.history) });
    const db = getPath(next, component.database);
    let view: UiSimQueryResult;
    if (!isRecord(db) || !isRecord(db.tables)) view = { sql, ok: false, error: "Cannot open the database. It may not have been created yet." };
    else {
      const result = executeSql(db as SqlDatabase, sql, { defaultTable: component.defaultTable, maxRows: component.maxRows ?? UI_SIM_LIMITS.queryRows });
      if (result.ok && result.database !== db) next = setStatePath(next, component.database, result.database);
      view = queryView(result, sql);
    }
    return patchMeta(next, { results: { ...(next.__meta.results ?? {}), [component.id]: view } });
  });
}

function handleChat(config: UiSimConfig, state: UiSimState, componentId: string, rawMessage: string): UiSimState {
  const component = pageComponent(config, state, componentId);
  const message = rawMessage.trim().slice(0, 600);
  if (!component || component.kind !== "chat" || !message) return state;
  if (!passes(component.visibleWhen, buildContext(config, state))) return state;
  const path = component.transcriptPath ?? `chats.${component.id}`;
  return guarded(state, (s) => {
    let next = setStatePath(s, path, [...asArray(getPath(s, path)), { role: "user", text: message }].slice(-UI_SIM_LIMITS.chatMessages));
    const extra = { $input: message };
    const current = next;
    const response = component.responses.find((r) => (!r.match || !!compileRegex(r.match)?.test(message)) && passes(r.when, buildContext(config, current, extra)));
    let reply: Record<string, unknown>;
    if (response) {
      next = runActions(config, next, response.actions ?? [], extra);
      reply = {
        role: "assistant",
        text: renderText(response.reply, buildContext(config, next, extra)),
        replyId: response.id,
        blocked: response.blocked ?? false,
        citations: response.citations ?? [],
      };
    } else {
      reply = { role: "assistant", text: renderText(component.fallback, buildContext(config, next, extra)), replyId: "fallback", blocked: false, citations: [] };
    }
    return setStatePath(next, path, [...asArray(getPath(next, path)), reply].slice(-UI_SIM_LIMITS.chatMessages));
  });
}

// ------------------------------------------------------------------ public API

export function applyUiSimEvent(config: UiSimConfig, state: UiSimState, event: UiSimEvent): UiSimState {
  switch (event.type) {
    case "navigate":
      return getPage(config, event.page) ? navigateTo(config, startEvent(state), event.page) : state;
    case "back":
      return handleBack(config, state);
    case "openUrl":
      return handleOpenUrl(config, state, event.url);
    case "click":
      return handleClick(config, state, event.componentId, event.itemId);
    case "rowClick":
      return handleRow(config, state, event.componentId, event.rowKey);
    case "rowAction":
      return handleRow(config, state, event.componentId, event.rowKey, event.actionId);
    case "setField":
      return handleSetField(config, state, event.componentId, event.fieldId, event.value);
    case "submitForm":
      return handleSubmit(config, state, event.componentId, event.values);
    case "command":
      return handleCommand(config, state, event.command);
    case "query":
      return handleQuery(config, state, event.componentId, event.sql);
    case "chat":
      return handleChat(config, state, event.componentId, event.message);
  }
}

export function replayUiSim(config: UiSimConfig, events: UiSimEvent[]): UiSimState {
  return events.reduce((s, e) => applyUiSimEvent(config, s, e), initialUiSimState(config));
}

/** The typed component with the given id on any page (renderer helper). */
export function findComponent<K extends UiSimComponent["kind"]>(config: UiSimConfig, componentId: string, kind: K): UiSimComponentOf<K> | undefined {
  for (const page of config.pages) {
    const c = page.components.find((x) => "id" in x && x.id === componentId && x.kind === kind);
    if (c) return c as UiSimComponentOf<K>;
  }
  return undefined;
}
