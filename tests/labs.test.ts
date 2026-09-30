import { describe, expect, it } from "vitest";
import { evaluateRule, evaluateRules, getPath, labRuleSchema, matchesSubset, setPath } from "@/modules/labs/engine/rules";
import { applyUiSimEvent, initialUiSimState, replayUiSim, uiSimConfigSchema, type UiSimConfig } from "@/modules/labs/engine/ui-simulation";
import { executeCommand, initialSandboxState, replaySandbox, sandboxConfigSchema, tokenize, type SandboxConfig } from "@/modules/labs/engine/command-sandbox";
import { applyArchitectureEvent, architectureConfigSchema, initialArchitectureState, replayArchitecture } from "@/modules/labs/engine/architecture";
import { decisionConfigSchema, initialDecisionState, publicDecisionConfig, submitDecisionStage } from "@/modules/labs/engine/decision";
import { validateLabConfig } from "@/modules/labs/engine/schemas";

describe("rule engine", () => {
  const state = {
    items: [{ name: "rg-a", location: "westeurope", tags: { env: "dev" } }],
    flag: true,
    count: 3,
    __meta: { visited: ["home", "iam"], history: ["az group create --name rg-a --location westeurope"] },
    placements: { web: "frontend", db: "data" },
    connections: [["web", "db"]],
    stages: { issue: { correct: true } },
    reasoning: "Because the policy blocks it",
  };

  it("reads nested paths", () => {
    expect(getPath(state, "items[0].tags.env")).toBe("dev");
    expect(getPath(state, "items.0.name")).toBe("rg-a");
    expect(getPath(state, "missing.path")).toBeUndefined();
    expect(setPath({ a: {} }, "a.b.c", 1)).toEqual({ a: { b: { c: 1 } } });
  });

  it("matches subsets case-insensitively, including nested keys", () => {
    expect(matchesSubset(state.items[0], { name: "RG-A", "tags.env": "DEV" })).toBe(true);
    expect(matchesSubset(state.items[0], { name: "rg-b" })).toBe(false);
  });

  it("evaluates every rule type", () => {
    expect(evaluateRule({ type: "equals", path: "count", value: 3 }, state)).toBe(true);
    expect(evaluateRule({ type: "notEquals", path: "count", value: 4 }, state)).toBe(true);
    expect(evaluateRule({ type: "oneOf", path: "items[0].location", values: ["eastus", "westeurope"] }, state)).toBe(true);
    expect(evaluateRule({ type: "truthy", path: "flag" }, state)).toBe(true);
    expect(evaluateRule({ type: "falsy", path: "nope" }, state)).toBe(true);
    expect(evaluateRule({ type: "exists", path: "items" }, state)).toBe(true);
    expect(evaluateRule({ type: "notExists", path: "nope" }, state)).toBe(true);
    expect(evaluateRule({ type: "arrayContains", path: "items", match: { location: "westeurope" } }, state)).toBe(true);
    expect(evaluateRule({ type: "arrayNotContains", path: "items", match: { location: "eastus" } }, state)).toBe(true);
    expect(evaluateRule({ type: "arrayLength", path: "items", min: 1, max: 1 }, state)).toBe(true);
    expect(evaluateRule({ type: "visited", page: "iam" }, state)).toBe(true);
    expect(evaluateRule({ type: "commandUsed", pattern: "^az group create" }, state)).toBe(true);
    expect(evaluateRule({ type: "commandUsed", pattern: "([invalid" }, state)).toBe(false);
    expect(evaluateRule({ type: "placedIn", item: "web", zone: "frontend" }, state)).toBe(true);
    expect(evaluateRule({ type: "notPlaced", item: "cache" }, state)).toBe(true);
    expect(evaluateRule({ type: "zoneHasAny", zone: "data", items: ["db", "cosmos"] }, state)).toBe(true);
    expect(evaluateRule({ type: "zoneLacks", zone: "frontend", items: ["db"] }, state)).toBe(true);
    expect(evaluateRule({ type: "connected", from: "db", to: "web" }, state)).toBe(true);
    expect(evaluateRule({ type: "connected", from: "db", to: "web", directed: true }, state)).toBe(false);
    expect(evaluateRule({ type: "stageCorrect", stage: "issue" }, state)).toBe(true);
    expect(evaluateRule({ type: "textMinLength", path: "reasoning", min: 10 }, state)).toBe(true);
    expect(evaluateRule({ type: "matches", path: "reasoning", pattern: "POLICY" }, state)).toBe(true);
    expect(evaluateRule({ type: "matches", path: "reasoning", pattern: "(unclosed" }, state)).toBe(false);
    expect(
      evaluateRule(
        { type: "allOf", rules: [{ type: "truthy", path: "flag" }, { type: "not", rule: { type: "falsy", path: "flag" } }] },
        state,
      ),
    ).toBe(true);
    expect(evaluateRule({ type: "anyOf", rules: [{ type: "falsy", path: "flag" }, { type: "equals", path: "count", value: 3 }] }, state)).toBe(true);
  });

  it("validates rule definitions with Zod", () => {
    expect(labRuleSchema.safeParse({ type: "allOf", rules: [{ type: "visited", page: "x" }] }).success).toBe(true);
    expect(labRuleSchema.safeParse({ type: "unknown" }).success).toBe(false);
    expect(labRuleSchema.safeParse({ type: "equals" }).success).toBe(false);
  });

  it("reports outcomes with feedback", () => {
    const out = evaluateRules(
      [{ key: "k", rule: { type: "truthy", path: "flag" }, successFeedback: "ok", failureFeedback: "no" }],
      state,
    );
    expect(out).toEqual([{ key: "k", passed: true, description: undefined, feedback: "ok" }]);
  });
});

const rbacLab: UiSimConfig = uiSimConfigSchema.parse({
  portal: { name: "Contoso Cloud Portal (simulated)", theme: "azure" },
  startPage: "home",
  navigation: [{ page: "home", label: "Home" }],
  pages: [
    {
      id: "home",
      title: "Home",
      components: [{ kind: "links", id: "rgs", items: [{ id: "rg-fin", label: "rg-finance", page: "iam" }] }],
    },
    {
      id: "iam",
      title: "Access control (IAM)",
      components: [
        { kind: "table", id: "assignments", source: "roleAssignments", columns: [{ key: "user", label: "User" }, { key: "role", label: "Role" }] },
        {
          kind: "form",
          id: "add",
          fields: [
            { id: "user", label: "User", control: "select", required: true, options: [{ value: "Alex", label: "Alex" }, { value: "Priya", label: "Priya" }] },
            { id: "role", label: "Role", control: "select", required: true, options: [{ value: "Reader", label: "Reader" }, { value: "Owner", label: "Owner" }] },
          ],
          submit: { label: "Assign", action: { type: "append", path: "roleAssignments", extra: { scope: "rg-finance" } } },
        },
        { kind: "settings", id: "opts", fields: [{ id: "mfa", label: "Require MFA", control: "toggle", bindTo: "settings.mfa" }] },
        { kind: "button", id: "go-home", label: "Home", action: { type: "navigate", page: "home" } },
      ],
    },
  ],
  initialState: { roleAssignments: [], settings: { mfa: false } },
});

describe("UI simulation engine", () => {
  it("navigates and records visited pages", () => {
    const s = applyUiSimEvent(rbacLab, initialUiSimState(rbacLab), { type: "navigate", page: "iam" });
    expect(s.__meta.page).toBe("iam");
    expect(s.__meta.visited).toEqual(["home", "iam"]);
    expect(applyUiSimEvent(rbacLab, s, { type: "navigate", page: "does-not-exist" })).toBe(s);
  });

  it("appends form submissions and rejects invalid values", () => {
    let s = applyUiSimEvent(rbacLab, initialUiSimState(rbacLab), { type: "navigate", page: "iam" });
    s = applyUiSimEvent(rbacLab, s, { type: "submitForm", componentId: "add", values: { user: "Alex", role: "Reader" } });
    expect(s.roleAssignments).toEqual([{ user: "Alex", role: "Reader", scope: "rg-finance" }]);
    const bad = applyUiSimEvent(rbacLab, s, { type: "submitForm", componentId: "add", values: { user: "Mallory", role: "Owner" } });
    expect(bad.roleAssignments).toHaveLength(1);
    expect(bad.__meta.message?.tone).toBe("error");
    const dup = applyUiSimEvent(rbacLab, s, { type: "submitForm", componentId: "add", values: { user: "Alex", role: "Reader" } });
    expect(dup.roleAssignments).toHaveLength(1);
  });

  it("binds settings fields and validates types", () => {
    let s = applyUiSimEvent(rbacLab, initialUiSimState(rbacLab), { type: "navigate", page: "iam" });
    s = applyUiSimEvent(rbacLab, s, { type: "setField", componentId: "opts", fieldId: "mfa", value: true });
    expect(getPath(s, "settings.mfa")).toBe(true);
    const ignored = applyUiSimEvent(rbacLab, s, { type: "setField", componentId: "opts", fieldId: "mfa", value: "yes" });
    expect(getPath(ignored, "settings.mfa")).toBe(true);
    // Components are only reachable on the page that is currently open.
    const home = applyUiSimEvent(rbacLab, s, { type: "navigate", page: "home" });
    expect(applyUiSimEvent(rbacLab, home, { type: "setField", componentId: "opts", fieldId: "mfa", value: false })).toBe(home);
  });

  it("replays deterministically and validates completion rules", () => {
    const events = [
      { type: "navigate" as const, page: "iam" },
      { type: "submitForm" as const, componentId: "add", values: { user: "Alex", role: "Reader" } },
      { type: "click" as const, componentId: "go-home" },
    ];
    const a = replayUiSim(rbacLab, events);
    expect(a).toEqual(replayUiSim(rbacLab, events));
    const outcomes = evaluateRules(
      [
        { key: "visited", rule: { type: "visited", page: "iam" } },
        { key: "reader", rule: { type: "arrayContains", path: "roleAssignments", match: { user: "alex", role: "Reader" } } },
        { key: "least-privilege", rule: { type: "arrayNotContains", path: "roleAssignments", match: { role: "Owner" } } },
      ],
      a,
    );
    expect(outcomes.every((o) => o.passed)).toBe(true);
  });
});

const sandbox: SandboxConfig = sandboxConfigSchema.parse({
  shell: "azure-cli",
  initialState: {
    account: { subscriptionName: "Contoso Learning (simulated)", subscriptionId: "00000000-0000-0000-0000-000000000001", tenantDomain: "contoso.example", user: "learner@contoso.example" },
    locations: [
      { name: "westeurope", displayName: "West Europe" },
      { name: "eastus", displayName: "East US" },
    ],
    resourceGroups: [{ name: "rg-existing", location: "eastus", tags: {} }],
    storageAccounts: [],
  },
});

describe("command sandbox tokenizer", () => {
  it("handles quotes", () => {
    expect(tokenize(`az group create --name "rg demo" --tags 'owner=Priya K'`)).toEqual({
      ok: true,
      tokens: ["az", "group", "create", "--name", "rg demo", "--tags", "owner=Priya K"],
    });
  });

  it("rejects shell operators and command substitution", () => {
    for (const input of ["az group list; rm -rf /", "az group list && whoami", "az group list | more", "echo $(whoami)", "az group list > out.txt", "`id`"]) {
      expect(tokenize(input)).toEqual({ ok: false, error: "operators" });
    }
    expect(tokenize(`az group create --name "unterminated`)).toEqual({ ok: false, error: "unterminated_quote" });
    expect(tokenize("a".repeat(500))).toEqual({ ok: false, error: "too_long" });
  });
});

describe("command sandbox execution", () => {
  const start = initialSandboxState(sandbox);

  it("never executes non-allowlisted commands", () => {
    for (const cmd of ["rm -rf /", "powershell -c whoami", "curl https://example.com", "az vm create --name x", "az group list; rm -rf /"]) {
      const r = executeCommand(sandbox, start, cmd);
      expect(r.isError).toBe(true);
      expect(r.state).toBe(start);
    }
  });

  it("creates a resource group with tags and records history", () => {
    const r = executeCommand(sandbox, start, "az group create --name rg-learn --location \"West Europe\" --tags env=learning owner=finance");
    expect(r.isError).toBe(false);
    expect(r.state.resourceGroups).toContainEqual({ name: "rg-learn", location: "westeurope", tags: { env: "learning", owner: "finance" } });
    expect(JSON.parse(r.output)).toMatchObject({ name: "rg-learn", properties: { provisioningState: "Succeeded" } });
    expect(r.state.__meta?.history).toHaveLength(1);
    expect(r.explanation).toMatch(/resource group/i);
  });

  it("validates names, locations and required arguments", () => {
    expect(executeCommand(sandbox, start, "az group create --name bad. --location westeurope").output).toMatch(/Invalid resource group name/);
    expect(executeCommand(sandbox, start, "az group create --name rg-x --location mars").output).toMatch(/not available/);
    const missing = executeCommand(sandbox, start, "az group create --name rg-x");
    expect(missing.output).toMatch(/required: --location/);
    expect(missing.hint).toMatch(/Example/);
    expect(executeCommand(sandbox, start, "az group create --name rg-existing --location westeurope").output).toMatch(/already exists/);
  });

  it("requires confirmation before deleting", () => {
    expect(executeCommand(sandbox, start, "az group delete --name rg-existing").isError).toBe(true);
    const deleted = executeCommand(sandbox, start, "az group delete -n rg-existing --yes");
    expect(deleted.state.resourceGroups).toHaveLength(0);
  });

  it("creates storage accounts with naming and SKU validation", () => {
    let s = executeCommand(sandbox, start, "az group create -n rg-data -l westeurope").state;
    expect(executeCommand(sandbox, s, "az storage account create --name BadName --resource-group rg-data").output).toMatch(/invalid/i);
    expect(executeCommand(sandbox, s, "az storage account create --name stdata001 --resource-group rg-missing").output).toMatch(/could not be found/);
    expect(executeCommand(sandbox, s, "az storage account create -n stdata001 -g rg-data --sku Ultra_LRS").output).toMatch(/invalid choice/);
    s = executeCommand(sandbox, s, "az storage account create -n stdata001 -g rg-data --sku Standard_ZRS").state;
    expect(s.storageAccounts).toContainEqual(expect.objectContaining({ name: "stdata001", sku: "Standard_ZRS", location: "westeurope" }));
    expect(executeCommand(sandbox, s, "az storage account create -n stdata001 -g rg-data").output).toMatch(/already taken/);
  });

  it("renders table and tsv output", () => {
    const table = executeCommand(sandbox, start, "az group list --output table").output;
    expect(table.split("\n")[0]).toMatch(/^Name\s+Location\s+Status$/);
    expect(executeCommand(sandbox, start, "az group list -o tsv").output).toBe("rg-existing\teastus\tSucceeded");
  });

  it("provides help, history and clear", () => {
    expect(executeCommand(sandbox, start, "help").output).toMatch(/az group create/);
    expect(executeCommand(sandbox, start, "az group create --help").output).toMatch(/Example/);
    expect(executeCommand(sandbox, start, "clear").clear).toBe(true);
    expect(executeCommand(sandbox, start, "az login").output).toMatch(/fictional/);
  });

  it("restricts commands to the lab allowlist", () => {
    const restricted = { ...sandbox, allowedCommands: ["group list"] };
    expect(executeCommand(restricted, start, "az group create -n x -l westeurope").output).toMatch(/not available in this lab/);
  });

  it("replays command logs to reconstruct state for validation", () => {
    const state = replaySandbox(sandbox, [
      "az account list-locations -o table",
      "az group create --name rg-learn-dev --location westeurope --tags env=dev",
      "az group list -o table",
    ]);
    const outcomes = evaluateRules(
      [
        { key: "rg", rule: { type: "arrayContains", path: "resourceGroups", match: { name: "rg-learn-dev", location: "westeurope", "tags.env": "dev" } } },
        { key: "listed", rule: { type: "commandUsed", pattern: "^az group list" } },
      ],
      state,
    );
    expect(outcomes.every((o) => o.passed)).toBe(true);
  });
});

describe("architecture engine", () => {
  const config = architectureConfigSchema.parse({
    zones: [
      { id: "frontend", label: "Web tier" },
      { id: "data", label: "Data tier" },
    ],
    palette: [
      { id: "app-service", label: "Azure App Service", category: "Compute", description: "Host web apps" },
      { id: "sql-db", label: "Azure SQL Database", category: "Data", description: "Relational database" },
      { id: "vm", label: "Virtual machine", category: "Compute", description: "IaaS compute" },
    ],
    allowConnections: true,
  });

  it("places, connects and removes cards", () => {
    let s = initialArchitectureState();
    s = applyArchitectureEvent(config, s, { type: "place", item: "app-service", zone: "frontend" });
    s = applyArchitectureEvent(config, s, { type: "place", item: "sql-db", zone: "data" });
    s = applyArchitectureEvent(config, s, { type: "connect", from: "app-service", to: "sql-db" });
    expect(evaluateRule({ type: "connected", from: "sql-db", to: "app-service" }, s)).toBe(true);
    expect(applyArchitectureEvent(config, s, { type: "place", item: "unknown", zone: "data" })).toBe(s);
    s = applyArchitectureEvent(config, s, { type: "remove", item: "sql-db" });
    expect(s.connections).toHaveLength(0);
    expect(evaluateRule({ type: "notPlaced", item: "sql-db" }, s)).toBe(true);
  });

  it("replays events", () => {
    const s = replayArchitecture(config, [
      { type: "place", item: "vm", zone: "frontend" },
      { type: "place", item: "app-service", zone: "frontend" },
      { type: "remove", item: "vm" },
    ]);
    expect(evaluateRule({ type: "zoneLacks", zone: "frontend", items: ["vm"] }, s)).toBe(true);
    expect(evaluateRule({ type: "placedIn", item: "app-service", zone: "frontend" }, s)).toBe(true);
  });
});

describe("decision engine", () => {
  const config = decisionConfigSchema.parse({
    context: { symptoms: ["Users cannot sign in"] },
    stages: [
      {
        id: "issue",
        prompt: "What is the likely issue?",
        kind: "single",
        options: [
          { id: "a", text: "Conditional Access blocks the location", correct: true, feedback: "Right - the policy blocks it." },
          { id: "b", text: "The storage account is full", correct: false, feedback: "Storage does not affect sign-in." },
        ],
      },
      { id: "why", prompt: "Explain your reasoning", kind: "text", minLength: 20, modelAnswer: "The sign-in logs show a policy failure." },
    ],
  });

  it("hides answers in the public projection", () => {
    const json = JSON.stringify(publicDecisionConfig(config));
    expect(json).not.toContain("correct");
    expect(json).not.toContain("feedback");
    expect(json).not.toContain("modelAnswer");
  });

  it("scores stages and keeps correctness once achieved", () => {
    let s = initialDecisionState();
    const wrong = submitDecisionStage(config, s, "issue", "b");
    if ("error" in wrong) throw new Error("unexpected");
    expect(wrong.feedback.correct).toBe(false);
    s = wrong.state;
    const right = submitDecisionStage(config, s, "issue", "a");
    if ("error" in right) throw new Error("unexpected");
    expect(right.feedback.correct).toBe(true);
    expect(right.state.stages.issue).toMatchObject({ correct: true, attempts: 2 });
    expect(evaluateRule({ type: "stageCorrect", stage: "issue" }, right.state)).toBe(true);
  });

  it("validates reasoning length and answer shape", () => {
    expect(submitDecisionStage(config, initialDecisionState(), "why", "too short")).toEqual({ error: "too_short" });
    expect(submitDecisionStage(config, initialDecisionState(), "issue", ["a", "b"])).toEqual({ error: "invalid_answer" });
    expect(submitDecisionStage(config, initialDecisionState(), "nope", "a")).toEqual({ error: "unknown_stage" });
    const ok = submitDecisionStage(config, initialDecisionState(), "why", "The Conditional Access policy blocks sign-ins from that country.");
    expect("feedback" in ok && ok.feedback.modelAnswer).toBeTruthy();
  });
});

describe("lab config validation", () => {
  it("accepts valid configs and rejects invalid ones", () => {
    expect(validateLabConfig("COMMAND_SANDBOX", sandbox).ok).toBe(true);
    expect(validateLabConfig("UI_SIMULATION", rbacLab).ok).toBe(true);
    expect(validateLabConfig("UI_SIMULATION", { ...rbacLab, startPage: "missing" }).ok).toBe(false);
    expect(validateLabConfig("ARCHITECTURE", { zones: [], palette: [] }).ok).toBe(false);
    expect(validateLabConfig("TROUBLESHOOTING", { context: {}, stages: [{ id: "x", prompt: "?", kind: "single", options: [] }] }).ok).toBe(false);
  });
});
