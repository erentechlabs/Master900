/**
 * Unit tests for the portal simulation engine (UI_SIMULATION labs): templates, navigation, tables, commands,
 * forms/wizards, settings, terminal, SQL editor, chat, simulated browser and configuration validation.
 */
import { describe, expect, it } from "vitest";
import {
  applyUiSimEvent,
  buildContext,
  initialUiSimState,
  replayUiSim,
  terminalPrompt,
  uiSimConfigSchema,
  type UiSimConfig,
  type UiSimEvent,
  type UiSimState,
} from "@/modules/labs/engine/ui-simulation";
import { renderTemplate, renderText, stableGuid, stableHash, stableIp, textTable } from "@/modules/labs/engine/templates";
import { evaluateRules } from "@/modules/labs/engine/rules";

const rawConfig = {
  portal: { name: "Microsoft Azure", theme: "azure", user: "alex@contoso.example", url: "https://portal.azure.com" },
  vm: { name: "LAB-VM-01", os: "windows", apps: ["browser", "terminal"] },
  clock: { start: "2026-09-30T09:00:00Z" },
  terminal: {
    title: "Cloud Shell",
    prompt: "{{shell.prompt}}",
    surface: "both",
    commands: [
      {
        id: "ssh",
        pattern: "^ssh (?<user>\\w+)@(?<host>\\S+)$",
        when: { type: "equals", path: "$args.host", value: "{{web.ip}}" },
        output: "Connected to {{$args.host}} as {{$args.user}}",
        actions: [
          { type: "set", path: "shell.connected", value: true },
          { type: "set", path: "shell.prompt", value: "{{$args.user}}@vm-web-01:~$" },
        ],
        help: "ssh <user>@<public-ip>",
      },
      { id: "ssh-unreachable", pattern: "^ssh \\S+$", error: "ssh: connect to host port 22: Connection timed out" },
      {
        id: "install",
        pattern: "^sudo apt install -y nginx$",
        when: { type: "truthy", path: "shell.connected" },
        output: "Setting up nginx ...",
        actions: [{ type: "set", path: "web.installed", value: true }],
        help: "sudo apt install -y nginx",
      },
      { id: "vm-list", pattern: "^az vm list -o table$", output: "{{vms|table:Name=name,Status=state}}" },
      { id: "forbidden", pattern: "^rm -rf /$", actions: [{ type: "set", path: "shell.broken", value: true }, { type: "fail", message: "rm: permission denied" }] },
    ],
    fallback: "{{$cmd}}: command not found",
  },
  startPage: "home",
  navigation: [
    { page: "home", label: "Home", icon: "Home" },
    { page: "vms", label: "Virtual machines", icon: "Monitor" },
  ],
  pages: [
    {
      id: "home",
      title: "Home",
      url: "/#home",
      components: [{ kind: "tiles", id: "services", items: [{ id: "vms", label: "Virtual machines", action: { type: "navigate", page: "vms" } }] }],
    },
    {
      id: "vms",
      title: "Virtual machines",
      url: "/#browse/vms",
      commands: [
        { id: "create", label: "Create", icon: "Plus", action: { type: "navigate", page: "create" } },
        { id: "refresh", label: "Refresh", disabledWhen: { type: "arrayLength", path: "vms", max: 0 }, action: { type: "message", text: "Refreshed {{vms|count}} items" } },
      ],
      components: [
        {
          kind: "table",
          id: "vm-table",
          source: "vms",
          rowKey: "name",
          columns: [
            { key: "name", label: "Name" },
            { key: "state", label: "Status", format: "status" },
          ],
          rowAction: { type: "navigate", page: "vm", select: { as: "vm", path: "vms", key: "name", value: "{{$row.name}}" } },
          rowActions: [
            {
              id: "stop",
              label: "Stop",
              visibleWhen: { type: "equals", path: "$row.state", value: "Running" },
              action: { type: "update", path: "vms", where: { name: "{{$row.name}}" }, set: { state: "Stopped" } },
            },
            { id: "delete", label: "Delete", variant: "danger", action: { type: "remove", path: "vms", where: { name: "{{$row.name}}" } } },
          ],
        },
        {
          kind: "button",
          id: "start-all",
          label: "Start all",
          disabledWhen: { type: "arrayNotContains", path: "vms", match: { state: "Stopped" } },
          action: { type: "update", path: "vms", set: { state: "Running" } },
        },
      ],
    },
    {
      id: "vm",
      title: "{{$sel.vm.name}}",
      requires: "vm",
      url: "/#resource/vms/{{$sel.vm.name}}",
      components: [{ kind: "properties", items: [{ label: "Public IP address", value: "{{$sel.vm.ip}}" }] }],
    },
    {
      id: "create",
      title: "Create a virtual machine",
      url: "/#create/vm",
      components: [
        {
          kind: "form",
          id: "create-form",
          fields: [
            {
              id: "name",
              label: "Virtual machine name",
              control: "text",
              required: true,
              pattern: "^[a-z][a-z0-9-]{2,14}$",
              patternMessage: "Use 3-15 lowercase letters, digits or hyphens.",
              unique: { path: "vms", key: "name", message: "A virtual machine with this name already exists." },
            },
            {
              id: "size",
              label: "Size",
              control: "select",
              required: true,
              options: [
                { value: "B2s", label: "Standard_B2s" },
                { value: "D4s", label: "Standard_D4s_v5" },
              ],
            },
            {
              id: "ports",
              label: "Public inbound ports",
              control: "radio",
              defaultValue: "none",
              options: [
                { value: "none", label: "None" },
                { value: "selected", label: "Allow selected ports" },
              ],
            },
            {
              id: "portList",
              label: "Select inbound ports",
              control: "checkboxes",
              visibleWhen: { type: "equals", path: "$form.ports", value: "selected" },
              options: [
                { value: "22", label: "SSH (22)" },
                { value: "80", label: "HTTP (80)" },
              ],
            },
          ],
          submit: {
            label: "Create",
            checks: [{ rule: { type: "notEquals", path: "$form.size", value: "D4s" }, message: "The scenario requires a burstable B-series size, not {{$form.size}}." }],
            actions: [
              {
                type: "append",
                path: "vms",
                unique: "name",
                value: { name: "{{$form.name}}", size: "{{$form.size}}", state: "Running", ip: "{{$form.name|ip}}", id: "{{$form.name|guid}}", created: "{{$now}}", ports: "{{$form.portList|default:none}}" },
              },
              { type: "notify", title: "Deployment succeeded", message: "{{$form.name}} was created." },
              { type: "navigate", page: "vms" },
            ],
            successMessage: "Created {{$form.name}}",
          },
        },
      ],
    },
    {
      id: "shutdown",
      title: "Auto-shutdown",
      components: [
        {
          kind: "settings",
          id: "shutdown-settings",
          fields: [
            { id: "enabled", label: "Enabled", control: "toggle", bindTo: "shutdown.enabled" },
            { id: "hour", label: "Hour", control: "number", min: 0, max: 23, bindTo: "shutdown.hour" },
          ],
        },
      ],
    },
    { id: "db", title: "Query editor", components: [{ kind: "sqlEditor", id: "sql", database: "sales" }] },
    {
      id: "explorer",
      title: "Data Explorer",
      components: [
        {
          kind: "form",
          id: "new-container",
          fields: [
            { id: "db", label: "Database id", control: "text", required: true },
            { id: "container", label: "Container id", control: "text", required: true },
          ],
          submit: {
            label: "OK",
            actions: [{ type: "append", path: "cosmos.{{$form.db}}.containers", value: "{{$form.container}}", unique: "$value" }],
            successMessage: "Created container {{$form.container}}",
          },
        },
      ],
    },
    {
      id: "playground",
      title: "Chat playground",
      components: [
        {
          kind: "chat",
          id: "chat",
          responses: [
            { id: "refuse", match: "weather", when: { type: "truthy", path: "assistant.scoped" }, reply: "I can only help with Contoso orders.", blocked: true },
            { id: "order", match: "order\\s+\\d+", reply: "Here is the status for: {{$input}}", citations: ["orders-faq.pdf"], actions: [{ type: "set", path: "assistant.tested", value: true }] },
          ],
          fallback: "Sorry, I can't help with that.",
        },
      ],
    },
    { id: "site", title: "Welcome", layout: "blank", url: "http://{{web.publishedIp}}", components: [{ kind: "text", text: "It works on {{web.publishedIp}}" }] },
  ],
  initialState: {
    vms: [
      { name: "vm-web-01", state: "Running", ip: "203.0.113.10", size: "B2s" },
      { name: "vm-test-02", state: "Stopped", ip: "203.0.113.11", size: "B2s" },
    ],
    shutdown: { enabled: false, hour: 19 },
    shell: { prompt: "alex@cloudshell:~$", connected: false },
    web: { ip: "203.0.113.10", installed: false, publishedIp: "203.0.113.10" },
    assistant: { scoped: true },
    cosmos: {},
    sales: {
      tables: {
        Orders: {
          columns: [
            { name: "id", type: "int", primaryKey: true },
            { name: "region", type: "nvarchar" },
            { name: "amount", type: "decimal" },
          ],
          rows: [
            { id: 1, region: "West", amount: 120 },
            { id: 2, region: "East", amount: 80 },
            { id: 3, region: "West", amount: 40 },
          ],
        },
      },
    },
  },
};

const config = uiSimConfigSchema.parse(rawConfig);

const apply = (state: UiSimState, event: UiSimEvent, cfg: UiSimConfig = config) => applyUiSimEvent(cfg, state, event);
const run = (events: UiSimEvent[], cfg: UiSimConfig = config) => replayUiSim(cfg, events);
const get = (state: UiSimState) => state as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("templates", () => {
  const ctx = {
    vms: [
      { name: "a", state: "Running" },
      { name: "b", state: "Stopped" },
    ],
    want: "Stopped",
    $want: "Stopped",
    tags: ["prod", "web"],
    empty: "",
    fallback: "from-context",
  };

  it("returns the raw value for a single expression and text for mixed templates", () => {
    expect(renderTemplate("{{vms}}", ctx)).toEqual(ctx.vms);
    expect(renderTemplate("VMs: {{vms|count}}", ctx)).toBe("VMs: 2");
    expect(renderText("{{'abc'|upper}}", ctx)).toBe("ABC");
    expect(renderText("plain text", ctx)).toBe("plain text");
  });

  it("supports list filters with literal and $path arguments", () => {
    expect(renderText("{{vms|map:name|join:+}}", ctx)).toBe("a+b");
    expect(renderText("{{vms|where:state=$want|map:name|join:+}}", ctx)).toBe("b");
    expect(renderText("{{vms|where:state=Running|first|json}}", ctx)).toContain('"name": "a"');
    expect(renderTemplate("{{tags|has:prod}}", ctx)).toBe(true);
    expect(renderTemplate("{{tags|has:$want}}", ctx)).toBe(false);
    expect(renderText("{{vms|last|json}}", ctx)).toContain('"b"');
    expect(renderText("{{vms|lines:name}}", ctx)).toBe("a\nb");
  });

  it("supports default, or and formatting filters", () => {
    expect(renderText("{{missing|default:none}}", ctx)).toBe("none");
    expect(renderText("{{empty|or:fallback}}", ctx)).toBe("from-context");
    expect(renderText("{{flag|yesno}} {{flag|onoff}}", { flag: true })).toBe("Yes On");
    expect(renderText("{{t|date}} {{t|time}} | {{t|datetime}}", { t: "2026-09-30T09:05:00Z" })).toBe("2026-09-30 09:05 | 2026-09-30 09:05 UTC");
    expect(renderText("{{s|slug}}", { s: "  My Web App (Prod) " })).toBe("my-web-app-prod");
  });

  it("generates deterministic hashes, documentation IPs and GUIDs", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).toHaveLength(7);
    expect(stableHash("abc", 12)).toMatch(/^[0-9a-f]{12}$/);
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
    const ip = stableIp("vm-web-01");
    expect(ip).toMatch(/^203\.0\.113\.\d+$/);
    expect(Number(ip.split(".")[3])).toBeGreaterThanOrEqual(4);
    expect(Number(ip.split(".")[3])).toBeLessThanOrEqual(253);
    expect(stableGuid("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("renders CLI-style text tables", () => {
    const table = textTable(ctx.vms, "Name=name,Status=state");
    expect(table.split("\n")).toEqual(["Name  Status", "----  -------", "a     Running", "b     Stopped"]);
  });
});

describe("portal engine: pages and navigation", () => {
  it("starts on the start page", () => {
    const state = initialUiSimState(config);
    expect(state.__meta.page).toBe("home");
    expect(state.__meta.visited).toEqual(["home"]);
    expect(state.__meta.events).toBe(0);
  });

  it("counts navigation events and ignores unknown pages", () => {
    const state = run([{ type: "navigate", page: "vms" }]);
    expect(state.__meta.page).toBe("vms");
    expect(state.__meta.events).toBe(1);
    expect(apply(state, { type: "navigate", page: "does-not-exist" })).toBe(state);
  });

  it("only lets the learner use components and commands of the open page", () => {
    const home = initialUiSimState(config);
    expect(apply(home, { type: "click", componentId: "create" })).toBe(home);
    expect(apply(home, { type: "rowClick", componentId: "vm-table", rowKey: "vm-web-01" })).toBe(home);
    const tiles = apply(home, { type: "click", componentId: "services", itemId: "vms" });
    expect(tiles.__meta.page).toBe("vms");
  });
});

describe("portal engine: tables, commands and buttons", () => {
  it("opens a row, selects it and renders page templates from the selection", () => {
    const state = run([
      { type: "navigate", page: "vms" },
      { type: "rowClick", componentId: "vm-table", rowKey: "vm-web-01" },
    ]);
    expect(state.__meta.page).toBe("vm");
    const ctx = buildContext(config, state) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(ctx.$sel.vm.ip).toBe("203.0.113.10");
    expect(renderText(config.pages.find((p) => p.id === "vm")!.title, ctx)).toBe("vm-web-01");
  });

  it("runs row actions only when they are visible for that row", () => {
    const vms = run([{ type: "navigate", page: "vms" }]);
    const stopped = apply(vms, { type: "rowAction", componentId: "vm-table", rowKey: "vm-web-01", actionId: "stop" });
    expect(get(stopped).vms[0].state).toBe("Stopped");
    // "Stop" is hidden for a VM that is already stopped: the event is ignored.
    expect(apply(stopped, { type: "rowAction", componentId: "vm-table", rowKey: "vm-test-02", actionId: "stop" })).toBe(stopped);
    const deleted = apply(stopped, { type: "rowAction", componentId: "vm-table", rowKey: "vm-test-02", actionId: "delete" });
    expect(get(deleted).vms.map((v: { name: string }) => v.name)).toEqual(["vm-web-01"]);
  });

  it("ignores disabled buttons and commands", () => {
    const vms = run([{ type: "navigate", page: "vms" }]);
    const started = apply(vms, { type: "click", componentId: "start-all" });
    expect(get(started).vms.every((v: { state: string }) => v.state === "Running")).toBe(true);
    // No stopped VM left: "Start all" is disabled.
    expect(apply(started, { type: "click", componentId: "start-all" })).toBe(started);
    const refreshed = apply(started, { type: "click", componentId: "refresh" });
    expect(refreshed.__meta.message).toEqual({ tone: "info", text: "Refreshed 2 items" });
  });
});

describe("portal engine: forms", () => {
  const openCreate: UiSimEvent[] = [
    { type: "navigate", page: "vms" },
    { type: "click", componentId: "create" },
  ];

  it("creates a record with templates, notifications, clock and navigation", () => {
    const state = run([...openCreate, { type: "submitForm", componentId: "create-form", values: { name: "vm-app-03", size: "B2s", ports: "none" } }]);
    const created = get(state).vms[2];
    expect(created).toMatchObject({ name: "vm-app-03", size: "B2s", state: "Running", ports: "none" });
    expect(created.ip).toBe(stableIp("vm-app-03"));
    expect(created.id).toBe(stableGuid("vm-app-03"));
    expect(String(created.created)).toMatch(/^2026-09-30T09:03/);
    expect(state.__meta.page).toBe("vms");
    expect(state.__meta.notifications?.at(-1)).toMatchObject({ title: "Deployment succeeded", message: "vm-app-03 was created." });
    expect(state.__meta.message).toEqual({ tone: "success", text: "Created vm-app-03" });
  });

  it("reports validation errors, discards changes and still counts the event", () => {
    const open = run(openCreate);
    const cases: [Record<string, string>, string][] = [
      [{ size: "B2s" }, "Virtual machine name is required."],
      [{ name: "VM_1", size: "B2s" }, "Use 3-15 lowercase letters, digits or hyphens."],
      [{ name: "vm-web-01", size: "B2s" }, "A virtual machine with this name already exists."],
      [{ name: "vm-app-03", size: "D4s" }, "The scenario requires a burstable B-series size, not D4s."],
    ];
    for (const [values, message] of cases) {
      const next = apply(open, { type: "submitForm", componentId: "create-form", values });
      expect(next.__meta.message).toEqual({ tone: "error", text: message });
      expect(next.__meta.events).toBe(open.__meta.events + 1);
      expect(get(next).vms).toHaveLength(2);
      expect(next.__meta.page).toBe("create");
    }
  });

  it("ignores values of hidden fields", () => {
    const open = run(openCreate);
    const hidden = apply(open, { type: "submitForm", componentId: "create-form", values: { name: "vm-a", size: "B2s", ports: "none", portList: ["22"] } });
    expect(get(hidden).vms[2].ports).toBe("none");
    const shown = apply(open, { type: "submitForm", componentId: "create-form", values: { name: "vm-b", size: "B2s", ports: "selected", portList: ["80"] } });
    expect(get(shown).vms[2].ports).toEqual(["80"]);
  });

  it("supports templated action paths and unique values", () => {
    const open = run([{ type: "navigate", page: "explorer" }]);
    const first = apply(open, { type: "submitForm", componentId: "new-container", values: { db: "RetailDB", container: "Orders" } });
    expect(get(first).cosmos.RetailDB.containers).toEqual(["Orders"]);
    const duplicate = apply(first, { type: "submitForm", componentId: "new-container", values: { db: "RetailDB", container: "Orders" } });
    expect(duplicate.__meta.message).toEqual({ tone: "error", text: "'Orders' already exists." });
    const escape = apply(first, { type: "submitForm", componentId: "new-container", values: { db: "a..b", container: "x" } });
    expect(escape.__meta.message?.tone).toBe("error");
    expect(get(escape).cosmos).toEqual({ RetailDB: { containers: ["Orders"] } });
  });
});

describe("portal engine: settings", () => {
  const open = () => run([{ type: "navigate", page: "shutdown" }]);

  it("writes valid values to the bound path", () => {
    const state = apply(apply(open(), { type: "setField", componentId: "shutdown-settings", fieldId: "enabled", value: true }), {
      type: "setField",
      componentId: "shutdown-settings",
      fieldId: "hour",
      value: "18",
    });
    expect(get(state).shutdown).toEqual({ enabled: true, hour: 18 });
  });

  it("reports constraint violations and ignores type mismatches", () => {
    const base = open();
    const outOfRange = apply(base, { type: "setField", componentId: "shutdown-settings", fieldId: "hour", value: 30 });
    expect(outOfRange.__meta.message).toEqual({ tone: "error", text: "Hour must be at most 23." });
    expect(get(outOfRange).shutdown.hour).toBe(19);
    expect(apply(base, { type: "setField", componentId: "shutdown-settings", fieldId: "hour", value: "abc" })).toBe(base);
  });
});

describe("portal engine: terminal", () => {
  const cmd = (command: string): UiSimEvent => ({ type: "command", command });
  const last = (state: UiSimState) => state.__meta.terminal!.at(-1)!;

  it("lists help, keeps history and clears the screen", () => {
    const state = run([cmd("help"), cmd("history")]);
    expect(state.__meta.terminal![0]!.output).toContain("ssh <user>@<public-ip>");
    expect(state.__meta.terminal![0]!.output).toContain("help, history, clear");
    expect(last(state).output).toContain("1  help");
    const cleared = apply(state, cmd("clear"));
    expect(cleared.__meta.terminal).toEqual([]);
    expect(cleared.__meta.history).toEqual(["help", "history", "clear"]);
  });

  it("uses named groups, state conditions and changes the prompt", () => {
    const blocked = run([cmd("sudo apt install -y nginx")]);
    expect(last(blocked)).toMatchObject({ error: true, output: "sudo apt install -y nginx: command not found" });
    const wrongHost = run([cmd("ssh azureuser@198.51.100.7")]);
    expect(last(wrongHost)).toMatchObject({ error: true, output: "ssh: connect to host port 22: Connection timed out" });

    const connected = run([cmd("ssh azureuser@203.0.113.10"), cmd("sudo apt install -y nginx")]);
    expect(connected.__meta.terminal![0]).toMatchObject({ error: false, prompt: "alex@cloudshell:~$", output: "Connected to 203.0.113.10 as azureuser" });
    expect(last(connected)).toMatchObject({ error: false, prompt: "azureuser@vm-web-01:~$" });
    expect(terminalPrompt(config, connected)).toBe("azureuser@vm-web-01:~$");
    expect(get(connected).web.installed).toBe(true);
    expect(evaluateRules([{ key: "ssh", rule: { type: "commandUsed", pattern: "^ssh " } }], connected)[0]!.passed).toBe(true);
  });

  it("renders template filters in output and rolls back failed commands", () => {
    expect(last(run([cmd("az vm list -o table")])).output).toMatch(/^Name\s+Status\n-+\s+-+\nvm-web-01\s+Running\nvm-test-02\s+Stopped$/);
    const failed = run([cmd("rm -rf /")]);
    expect(last(failed)).toMatchObject({ error: true, output: "rm: permission denied" });
    expect(get(failed).shell.broken).toBeUndefined();
  });

  it("works on any page (the terminal is a separate VM app)", () => {
    const state = run([{ type: "navigate", page: "vms" }, cmd("az vm list -o table")]);
    expect(last(state).error).toBe(false);
  });
});

describe("portal engine: SQL editor, chat and browser", () => {
  it("runs queries against the database in the state and records results", () => {
    const state = run([
      { type: "navigate", page: "db" },
      { type: "query", componentId: "sql", sql: "SELECT region, SUM(amount) AS total FROM Orders GROUP BY region ORDER BY total DESC" },
    ]);
    const result = state.__meta.results?.sql;
    expect(result).toMatchObject({ ok: true, kind: "rows", rowCount: 2, columns: ["region", "total"] });
    expect(result && "rows" in result ? result.rows?.[0] : undefined).toEqual(["West", 160]);
    const insert = apply(state, { type: "query", componentId: "sql", sql: "INSERT INTO Orders (id, region, amount) VALUES (4, 'North', 10)" });
    expect(get(insert).sales.tables.Orders.rows).toHaveLength(4);
    const error = apply(insert, { type: "query", componentId: "sql", sql: "SELECT * FROM Missing" });
    expect(error.__meta.results?.sql?.ok).toBe(false);
  });

  it("answers chat messages with the first matching response", () => {
    const open = run([{ type: "navigate", page: "playground" }]);
    const refused = apply(open, { type: "chat", componentId: "chat", message: "What's the weather?" });
    expect(get(refused).chats.chat.at(-1)).toMatchObject({ role: "assistant", replyId: "refuse", blocked: true });
    const answered = apply(refused, { type: "chat", componentId: "chat", message: "Where is order 1042?" });
    expect(get(answered).chats.chat.at(-1)).toMatchObject({ text: "Here is the status for: Where is order 1042?", citations: ["orders-faq.pdf"] });
    expect(get(answered).assistant.tested).toBe(true);
    const fallback = apply(answered, { type: "chat", componentId: "chat", message: "Tell me a joke" });
    expect(get(fallback).chats.chat.at(-1)).toMatchObject({ replyId: "fallback", text: "Sorry, I can't help with that." });
    expect(get(fallback).chats.chat).toHaveLength(6);
  });

  it("opens pages by URL and shows a browser error for unknown addresses", () => {
    const home = initialUiSimState(config);
    const site = apply(home, { type: "openUrl", url: "http://203.0.113.10/" });
    expect(site.__meta.page).toBe("site");
    const portal = apply(site, { type: "openUrl", url: "portal.azure.com/#browse/vms" });
    expect(portal.__meta.page).toBe("vms");
    const unknown = apply(portal, { type: "openUrl", url: "http://198.51.100.9" });
    expect(unknown.__meta.page).toBe("vms");
    expect(unknown.__meta.browserError).toEqual({ url: "http://198.51.100.9" });
    expect(apply(unknown, { type: "navigate", page: "home" }).__meta.browserError).toBeNull();
  });

  it("goes back through the page history and closes error pages", () => {
    const deep = run([
      { type: "navigate", page: "vms" },
      { type: "rowClick", componentId: "vm-table", rowKey: "vm-web-01" },
      { type: "openUrl", url: "http://198.51.100.9" },
    ]);
    expect(deep.__meta.browserError).not.toBeNull();
    const closed = apply(deep, { type: "back" });
    expect(closed.__meta).toMatchObject({ page: "vm", browserError: null, events: deep.__meta.events + 1 });
    const vms = apply(closed, { type: "back" });
    expect(vms.__meta.page).toBe("vms");
    const home = apply(vms, { type: "back" });
    expect(home.__meta.page).toBe("home");
    expect(home.__meta.trail).toEqual(["home"]);
    expect(apply(home, { type: "back" })).toBe(home);
  });
});

describe("portal engine: configuration validation", () => {
  const withPages = (pages: unknown[], extra: Record<string, unknown> = {}) => ({ ...rawConfig, terminal: undefined, pages, ...extra });
  const issues = (value: unknown) => {
    const result = uiSimConfigSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };

  it("accepts the fixture configuration", () => {
    expect(issues(rawConfig)).toEqual([]);
  });

  it("rejects unknown page references, duplicate ids and forms without actions", () => {
    const home = { id: "home", title: "Home", components: [{ kind: "text", text: "x" }] };
    const vms = { id: "vms", title: "VMs", components: [{ kind: "button", id: "go", label: "Go", action: { type: "navigate", page: "nowhere" } }] };
    expect(issues(withPages([home, vms]))).toContain("Action navigates to unknown page 'nowhere'");
    expect(issues(withPages([home, { ...home }, vms]))).toEqual(expect.arrayContaining(["Duplicate page id 'home'"]));
    const form = { kind: "form", id: "f", fields: [{ id: "a", label: "A", control: "text" }], submit: { label: "Save" } };
    expect(issues(withPages([home, { id: "vms", title: "VMs", components: [form] }]))).toContain("Forms need submit.action or submit.actions");
  });

  it("rejects invalid patterns, reserved state keys and a terminal component without terminal config", () => {
    const home = { id: "home", title: "Home", components: [{ kind: "terminal", id: "shell" }] };
    const vms = { id: "vms", title: "VMs", components: [{ kind: "chat", id: "c", responses: [{ id: "r", match: "(", reply: "x" }], fallback: "y" }] };
    const result = issues(withPages([home, vms], { initialState: { $bad: 1 } }));
    expect(result).toEqual(
      expect.arrayContaining([
        "A terminal component requires a top-level terminal configuration",
        "Chat response 'r' has an invalid pattern",
        "initialState key '$bad' is reserved",
      ]),
    );
  });

  it("rejects writes to engine metadata", () => {
    const home = { id: "home", title: "Home", components: [{ kind: "button", id: "b", label: "B", action: { type: "set", path: "__meta.page", value: "x" } }] };
    expect(issues(withPages([home, { id: "vms", title: "VMs", components: [{ kind: "text", text: "x" }] }])).length).toBeGreaterThan(0);
  });
});
