/**
 * Command sandbox - a SAFE, fake terminal for beginner-level commands.
 *
 * - Nothing is ever executed on a real system: input is tokenized and matched
 *   against an allowlist of educational commands.
 * - Results are deterministic and derived only from the simulated state.
 * - Shell operators (; && | > < ` $()) are rejected.
 */
import { z } from "zod";

const locationSchema = z.object({ name: z.string().min(1).max(40), displayName: z.string().min(1).max(80) });
const resourceGroupSchema = z.object({
  name: z.string().min(1).max(90),
  location: z.string().min(1).max(40),
  tags: z.record(z.string(), z.string()).default({}),
});
const storageAccountSchema = z.object({
  name: z.string().min(3).max(24),
  resourceGroup: z.string().min(1).max(90),
  location: z.string().min(1).max(40),
  sku: z.string().min(1).max(40),
  kind: z.string().min(1).max(40),
  accessTier: z.string().max(20).optional(),
});

export const sandboxStateSchema = z.object({
  account: z.object({
    subscriptionName: z.string().min(1).max(120),
    subscriptionId: z.string().min(1).max(60),
    tenantDomain: z.string().min(1).max(120),
    user: z.string().min(1).max(120),
  }),
  locations: z.array(locationSchema).min(1).max(30),
  resourceGroups: z.array(resourceGroupSchema).default([]),
  storageAccounts: z.array(storageAccountSchema).default([]),
});

export const sandboxConfigSchema = z.object({
  shell: z.literal("azure-cli"),
  prompt: z.string().max(60).optional(),
  welcome: z.string().max(2000).optional(),
  /** Restrict to these command paths, e.g. ["group create", "group list"]. Defaults to all. */
  allowedCommands: z.array(z.string().max(60)).max(40).optional(),
  initialState: sandboxStateSchema,
});
export type SandboxConfig = z.infer<typeof sandboxConfigSchema>;
export type SandboxState = z.infer<typeof sandboxStateSchema> & { __meta?: { history: string[] } };

export type SandboxResult = {
  state: SandboxState;
  output: string;
  isError: boolean;
  explanation?: string;
  hint?: string;
  clear?: boolean;
};

export const MAX_COMMAND_LENGTH = 400;

// ------------------------------------------------------------------ tokenizer

export type TokenizeResult = { ok: true; tokens: string[] } | { ok: false; error: "too_long" | "operators" | "unterminated_quote" };

export function tokenize(input: string): TokenizeResult {
  if (input.length > MAX_COMMAND_LENGTH) return { ok: false, error: "too_long" };
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < input.length) current += input[++i];
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) tokens.push(current);
      current = "";
      started = false;
      continue;
    }
    if (/[;&|<>`]/.test(ch) || (ch === "$" && input[i + 1] === "(")) return { ok: false, error: "operators" };
    current += ch;
    started = true;
  }
  if (quote) return { ok: false, error: "unterminated_quote" };
  if (started) tokens.push(current);
  return { ok: true, tokens };
}

// ------------------------------------------------------------------ arguments

type ParamSpec = { long: string; short?: string; kind: "string" | "flag" | "list"; required?: boolean; choices?: string[] };
type ArgValues = Record<string, string | boolean | string[]>;

const OUTPUT_FORMATS = ["json", "table", "tsv", "none"];
const GLOBAL_PARAMS: ParamSpec[] = [
  { long: "output", short: "o", kind: "string", choices: OUTPUT_FORMATS },
  { long: "help", short: "h", kind: "flag" },
  { long: "only-show-errors", kind: "flag" },
  { long: "query", kind: "string" },
];

function looksLikeOption(token: string | undefined): boolean {
  return !!token && token.startsWith("-") && token.length > 1 && Number.isNaN(Number(token));
}

export function parseArgs(tokens: string[], specs: ParamSpec[]): { values: ArgValues; errors: string[] } {
  const all = [...specs, ...GLOBAL_PARAMS];
  const byName = new Map<string, ParamSpec>();
  for (const s of all) {
    byName.set(`--${s.long}`, s);
    if (s.short) byName.set(`-${s.short}`, s);
  }
  const values: ArgValues = {};
  const errors: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i]!;
    let inline: string | undefined;
    if (token.startsWith("--") && token.includes("=")) {
      inline = token.slice(token.indexOf("=") + 1);
      token = token.slice(0, token.indexOf("="));
    }
    const spec = byName.get(token);
    if (!spec) {
      errors.push(`unrecognized arguments: ${tokens[i]}`);
      continue;
    }
    if (spec.kind === "flag") {
      values[spec.long] = true;
    } else if (spec.kind === "string") {
      const value = inline ?? (looksLikeOption(tokens[i + 1]) ? undefined : tokens[i + 1]);
      if (value === undefined) errors.push(`argument --${spec.long}${spec.short ? `/-${spec.short}` : ""}: expected one argument`);
      else {
        if (inline === undefined) i++;
        values[spec.long] = value;
      }
    } else {
      const list: string[] = inline !== undefined ? [inline] : [];
      while (i + 1 < tokens.length && !looksLikeOption(tokens[i + 1])) list.push(tokens[++i]!);
      values[spec.long] = list;
    }
  }
  if (values.help) return { values, errors };
  const missing = specs.filter((s) => s.required && values[s.long] === undefined);
  if (missing.length) {
    errors.push(`the following arguments are required: ${missing.map((s) => `--${s.long}${s.short ? `/-${s.short}` : ""}`).join(", ")}`);
  }
  for (const s of all) {
    const v = values[s.long];
    if (s.choices && typeof v === "string" && !s.choices.some((c) => c.toLowerCase() === v.toLowerCase())) {
      errors.push(`argument --${s.long}: invalid choice: '${v}' (choose from ${s.choices.join(", ")})`);
    }
  }
  return { values, errors };
}

// ------------------------------------------------------------------ helpers

type Rg = SandboxState["resourceGroups"][number];
type Sa = SandboxState["storageAccounts"][number];

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function rgJson(state: SandboxState, rg: Rg) {
  return {
    id: `/subscriptions/${state.account.subscriptionId}/resourceGroups/${rg.name}`,
    location: rg.location,
    managedBy: null,
    name: rg.name,
    properties: { provisioningState: "Succeeded" },
    tags: Object.keys(rg.tags).length ? rg.tags : null,
    type: "Microsoft.Resources/resourceGroups",
  };
}

function saJson(state: SandboxState, sa: Sa) {
  return {
    accessTier: sa.accessTier ?? "Hot",
    id: `/subscriptions/${state.account.subscriptionId}/resourceGroups/${sa.resourceGroup}/providers/Microsoft.Storage/storageAccounts/${sa.name}`,
    kind: sa.kind,
    location: sa.location,
    name: sa.name,
    provisioningState: "Succeeded",
    resourceGroup: sa.resourceGroup,
    sku: { name: sa.sku, tier: sa.sku.startsWith("Premium") ? "Premium" : "Standard" },
    type: "Microsoft.Storage/storageAccounts",
  };
}

export function isValidResourceGroupName(name: string): boolean {
  return /^[-\w.()]{1,90}$/.test(name) && !name.endsWith(".");
}

export function isValidStorageAccountName(name: string): boolean {
  return /^[a-z0-9]{3,24}$/.test(name);
}

function resolveLocation(state: SandboxState, value: string): string | null {
  const key = value.replace(/\s+/g, "").toLowerCase();
  const match = state.locations.find((l) => l.name.toLowerCase() === key || l.displayName.replace(/\s+/g, "").toLowerCase() === key);
  return match?.name ?? null;
}

function parseTags(list: string[]): { tags: Record<string, string> } | { error: string } {
  const tags: Record<string, string> = {};
  for (const item of list) {
    const idx = item.indexOf("=");
    const key = idx === -1 ? item : item.slice(0, idx);
    if (!key || key.length > 512 || /[<>%&\\?/]/.test(key)) return { error: `Invalid tag '${item}'. Use key=value.` };
    tags[key] = idx === -1 ? "" : item.slice(idx + 1);
  }
  return { tags };
}

function render(result: unknown, format: string, columns?: { header: string; get: (row: Record<string, unknown>) => unknown }[]): string {
  const f = format.toLowerCase();
  if (f === "none") return "";
  if (f === "json" || !columns) return JSON.stringify(result, null, 2);
  const rows = (Array.isArray(result) ? result : [result]) as Record<string, unknown>[];
  if (f === "tsv") return rows.map((r) => columns.map((c) => String(c.get(r) ?? "")).join("\t")).join("\n");
  const cells = rows.map((r) => columns.map((c) => String(c.get(r) ?? "")));
  const widths = columns.map((c, i) => Math.max(c.header.length, ...cells.map((row) => row[i]!.length)));
  const line = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i]!)).join("  ").trimEnd();
  return [line(columns.map((c) => c.header)), line(widths.map((w) => "-".repeat(w))), ...cells.map(line)].join("\n");
}

// ------------------------------------------------------------------ commands

type RunContext = { args: ArgValues; state: SandboxState; format: string };
type RunOutcome = { state?: SandboxState; output?: string; error?: string; hint?: string };

type CommandSpec = {
  path: string;
  summary: string;
  explanation: string;
  example: string;
  params: ParamSpec[];
  run: (ctx: RunContext) => RunOutcome;
};

const rgColumns = [
  { header: "Name", get: (r: Record<string, unknown>) => r.name },
  { header: "Location", get: (r: Record<string, unknown>) => r.location },
  { header: "Status", get: () => "Succeeded" },
];
const saColumns = [
  { header: "Name", get: (r: Record<string, unknown>) => r.name },
  { header: "ResourceGroup", get: (r: Record<string, unknown>) => r.resourceGroup },
  { header: "Location", get: (r: Record<string, unknown>) => r.location },
  { header: "Kind", get: (r: Record<string, unknown>) => r.kind },
  { header: "Sku", get: (r: Record<string, unknown>) => (r.sku as { name: string }).name },
];

export const STORAGE_SKUS = ["Standard_LRS", "Standard_GRS", "Standard_RAGRS", "Standard_ZRS", "Standard_GZRS", "Standard_RAGZRS", "Premium_LRS", "Premium_ZRS"];

export const COMMANDS: CommandSpec[] = [
  {
    path: "account show",
    summary: "Show the active (fictional) subscription",
    explanation: "az account show displays the subscription your commands currently target. A subscription is a billing and management boundary that contains resource groups.",
    example: "az account show",
    params: [],
    run: ({ state, format }) => ({
      output: render(
        {
          environmentName: "AzureCloud (simulated)",
          id: state.account.subscriptionId,
          isDefault: true,
          name: state.account.subscriptionName,
          state: "Enabled",
          tenantDefaultDomain: state.account.tenantDomain,
          user: { name: state.account.user, type: "user" },
        },
        format,
        [
          { header: "Name", get: (r) => r.name },
          { header: "SubscriptionId", get: (r) => r.id },
          { header: "State", get: (r) => r.state },
        ],
      ),
    }),
  },
  {
    path: "account list-locations",
    summary: "List the regions available in this sandbox",
    explanation: "az account list-locations lists Azure regions. You choose a region (location) when you create resource groups and resources, usually close to your users or to meet data residency needs.",
    example: "az account list-locations --output table",
    params: [],
    run: ({ state, format }) => ({
      output: render(
        state.locations.map((l) => ({ displayName: l.displayName, name: l.name })),
        format,
        [
          { header: "DisplayName", get: (r) => r.displayName },
          { header: "Name", get: (r) => r.name },
        ],
      ),
    }),
  },
  {
    path: "group list",
    summary: "List resource groups",
    explanation: "az group list returns the resource groups in the current subscription. Resource groups are logical containers that hold related resources sharing the same lifecycle.",
    example: "az group list --output table",
    params: [],
    run: ({ state, format }) => ({
      output: render(
        [...state.resourceGroups].sort((a, b) => a.name.localeCompare(b.name)).map((rg) => rgJson(state, rg)),
        format,
        rgColumns,
      ),
    }),
  },
  {
    path: "group show",
    summary: "Show one resource group",
    explanation: "az group show returns the details of a single resource group, including its location and tags.",
    example: "az group show --name rg-demo",
    params: [{ long: "name", short: "n", kind: "string", required: true }],
    run: ({ state, args, format }) => {
      const rg = state.resourceGroups.find((r) => eq(r.name, String(args.name)));
      if (!rg) return { error: `Resource group '${String(args.name)}' could not be found.`, hint: "Use az group list to see existing resource groups." };
      return { output: render(rgJson(state, rg), format, rgColumns) };
    },
  },
  {
    path: "group exists",
    summary: "Check whether a resource group exists",
    explanation: "az group exists returns true or false. Scripts often use it before creating a resource group.",
    example: "az group exists --name rg-demo",
    params: [{ long: "name", short: "n", kind: "string", required: true }],
    run: ({ state, args }) => ({ output: String(state.resourceGroups.some((r) => eq(r.name, String(args.name)))) }),
  },
  {
    path: "group create",
    summary: "Create a resource group",
    explanation:
      "az group create creates a resource group in a region. The location stores the group's metadata; resources inside the group can still be deployed to other regions. Tags (key=value) help with cost tracking and organization.",
    example: "az group create --name rg-demo --location westeurope --tags env=learning",
    params: [
      { long: "name", short: "n", kind: "string", required: true },
      { long: "location", short: "l", kind: "string", required: true },
      { long: "tags", kind: "list" },
    ],
    run: ({ state, args, format }) => {
      const name = String(args.name);
      if (!isValidResourceGroupName(name)) {
        return {
          error: `Invalid resource group name '${name}'. Use up to 90 letters, digits, underscores, hyphens, periods or parentheses, and do not end with a period.`,
        };
      }
      const location = resolveLocation(state, String(args.location));
      if (!location) {
        return {
          error: `The provided location '${String(args.location)}' is not available in this sandbox.`,
          hint: "Run az account list-locations --output table to see valid region names.",
        };
      }
      const parsed = parseTags((args.tags as string[] | undefined) ?? []);
      if ("error" in parsed) return { error: parsed.error };
      const existing = state.resourceGroups.find((r) => eq(r.name, name));
      if (existing && existing.location !== location) {
        return { error: `Invalid resource group location '${location}'. The resource group already exists in location '${existing.location}'.` };
      }
      const next = structuredClone(state);
      const rg: Rg = existing ? { ...existing, tags: { ...existing.tags, ...parsed.tags } } : { name, location, tags: parsed.tags };
      next.resourceGroups = [...next.resourceGroups.filter((r) => !eq(r.name, name)), rg];
      return { state: next, output: render(rgJson(next, rg), format, rgColumns) };
    },
  },
  {
    path: "group update",
    summary: "Update tags on a resource group",
    explanation: "az group update --tags replaces the tags on a resource group. Tags are name/value pairs used to organize resources and to group costs in reports.",
    example: "az group update --name rg-demo --tags env=learning owner=finance",
    params: [
      { long: "name", short: "n", kind: "string", required: true },
      { long: "tags", kind: "list", required: true },
    ],
    run: ({ state, args, format }) => {
      const rg = state.resourceGroups.find((r) => eq(r.name, String(args.name)));
      if (!rg) return { error: `Resource group '${String(args.name)}' could not be found.` };
      const parsed = parseTags((args.tags as string[]) ?? []);
      if ("error" in parsed) return { error: parsed.error };
      const next = structuredClone(state);
      const updated = { ...rg, tags: parsed.tags };
      next.resourceGroups = next.resourceGroups.map((r) => (eq(r.name, rg.name) ? updated : r));
      return { state: next, output: render(rgJson(next, updated), format, rgColumns) };
    },
  },
  {
    path: "group delete",
    summary: "Delete a resource group and everything in it",
    explanation: "az group delete removes a resource group and ALL resources inside it. This is why grouping resources that share a lifecycle is useful - and why resource locks exist.",
    example: "az group delete --name rg-demo --yes",
    params: [
      { long: "name", short: "n", kind: "string", required: true },
      { long: "yes", short: "y", kind: "flag" },
      { long: "no-wait", kind: "flag" },
    ],
    run: ({ state, args }) => {
      const rg = state.resourceGroups.find((r) => eq(r.name, String(args.name)));
      if (!rg) return { error: `Resource group '${String(args.name)}' could not be found.` };
      if (!args.yes) {
        return { error: "Deleting a resource group cannot be undone. Add --yes (-y) to confirm in this sandbox.", hint: "Double-check the name, then add --yes." };
      }
      const next = structuredClone(state);
      next.resourceGroups = next.resourceGroups.filter((r) => !eq(r.name, rg.name));
      next.storageAccounts = next.storageAccounts.filter((s) => !eq(s.resourceGroup, rg.name));
      return { state: next, output: "" };
    },
  },
  {
    path: "storage account create",
    summary: "Create a storage account",
    explanation:
      "az storage account create creates a storage account inside a resource group. The SKU sets the redundancy option, for example Standard_LRS (locally redundant) or Standard_ZRS (zone-redundant).",
    example: "az storage account create --name stdemo001 --resource-group rg-demo --location westeurope --sku Standard_ZRS",
    params: [
      { long: "name", short: "n", kind: "string", required: true },
      { long: "resource-group", short: "g", kind: "string", required: true },
      { long: "location", short: "l", kind: "string" },
      { long: "sku", kind: "string", choices: STORAGE_SKUS },
      { long: "kind", kind: "string", choices: ["StorageV2", "BlobStorage", "BlockBlobStorage", "FileStorage", "Storage"] },
      { long: "access-tier", kind: "string", choices: ["Hot", "Cool", "Cold"] },
    ],
    run: ({ state, args, format }) => {
      const name = String(args.name);
      if (!isValidStorageAccountName(name)) {
        return { error: `Storage account name '${name}' is invalid. Use 3-24 lowercase letters and numbers only.` };
      }
      if (state.storageAccounts.some((s) => s.name === name)) {
        return { error: `The storage account named ${name} is already taken.`, hint: "Storage account names must be globally unique. Try adding a few digits." };
      }
      const rg = state.resourceGroups.find((r) => eq(r.name, String(args["resource-group"])));
      if (!rg) return { error: `Resource group '${String(args["resource-group"])}' could not be found.`, hint: "Create the resource group first with az group create." };
      const location = args.location ? resolveLocation(state, String(args.location)) : rg.location;
      if (!location) return { error: `The provided location '${String(args.location)}' is not available in this sandbox.` };
      const sku = STORAGE_SKUS.find((s) => eq(s, String(args.sku ?? "Standard_RAGRS")))!;
      const kind = String(args.kind ?? "StorageV2");
      const sa: Sa = { name, resourceGroup: rg.name, location, sku, kind, accessTier: args["access-tier"] ? String(args["access-tier"]) : "Hot" };
      const next = structuredClone(state);
      next.storageAccounts = [...next.storageAccounts, sa];
      return { state: next, output: render(saJson(next, sa), format, saColumns) };
    },
  },
  {
    path: "storage account list",
    summary: "List storage accounts",
    explanation: "az storage account list shows storage accounts in the subscription, or only in one resource group with --resource-group.",
    example: "az storage account list --resource-group rg-demo --output table",
    params: [{ long: "resource-group", short: "g", kind: "string" }],
    run: ({ state, args, format }) => {
      const rgName = args["resource-group"] ? String(args["resource-group"]) : null;
      if (rgName && !state.resourceGroups.some((r) => eq(r.name, rgName))) return { error: `Resource group '${rgName}' could not be found.` };
      const list = state.storageAccounts.filter((s) => !rgName || eq(s.resourceGroup, rgName));
      return { output: render(list.map((s) => saJson(state, s)), format, saColumns) };
    },
  },
  {
    path: "storage account show",
    summary: "Show one storage account",
    explanation: "az storage account show returns the configuration of a storage account, including its SKU (redundancy) and access tier.",
    example: "az storage account show --name stdemo001 --resource-group rg-demo",
    params: [
      { long: "name", short: "n", kind: "string", required: true },
      { long: "resource-group", short: "g", kind: "string" },
    ],
    run: ({ state, args, format }) => {
      const sa = state.storageAccounts.find((s) => s.name === String(args.name) && (!args["resource-group"] || eq(s.resourceGroup, String(args["resource-group"]))));
      if (!sa) return { error: `The Resource 'Microsoft.Storage/storageAccounts/${String(args.name)}' was not found.` };
      return { output: render(saJson(state, sa), format, saColumns) };
    },
  },
  {
    path: "storage account delete",
    summary: "Delete a storage account",
    explanation: "az storage account delete permanently removes a storage account and its data.",
    example: "az storage account delete --name stdemo001 --resource-group rg-demo --yes",
    params: [
      { long: "name", short: "n", kind: "string", required: true },
      { long: "resource-group", short: "g", kind: "string", required: true },
      { long: "yes", short: "y", kind: "flag" },
    ],
    run: ({ state, args }) => {
      const sa = state.storageAccounts.find((s) => s.name === String(args.name) && eq(s.resourceGroup, String(args["resource-group"])));
      if (!sa) return { error: `The Resource 'Microsoft.Storage/storageAccounts/${String(args.name)}' was not found.` };
      if (!args.yes) return { error: "Deleting a storage account cannot be undone. Add --yes (-y) to confirm in this sandbox." };
      const next = structuredClone(state);
      next.storageAccounts = next.storageAccounts.filter((s) => s.name !== sa.name);
      return { state: next, output: "" };
    },
  },
  {
    path: "resource list",
    summary: "List resources",
    explanation: "az resource list shows resources of any type, optionally filtered by resource group. Resource groups themselves are containers, not resources in this list.",
    example: "az resource list --resource-group rg-demo --output table",
    params: [{ long: "resource-group", short: "g", kind: "string" }],
    run: ({ state, args, format }) => {
      const rgName = args["resource-group"] ? String(args["resource-group"]) : null;
      const list = state.storageAccounts
        .filter((s) => !rgName || eq(s.resourceGroup, rgName))
        .map((s) => ({ name: s.name, resourceGroup: s.resourceGroup, location: s.location, type: "Microsoft.Storage/storageAccounts" }));
      return {
        output: render(list, format, [
          { header: "Name", get: (r) => r.name },
          { header: "ResourceGroup", get: (r) => r.resourceGroup },
          { header: "Location", get: (r) => r.location },
          { header: "Type", get: (r) => r.type },
        ]),
      };
    },
  },
];

const SPECIAL_HELP = [
  ["help", "Show this list of commands"],
  ["history", "Show the commands you ran successfully"],
  ["clear", "Clear the screen"],
  ["az login", "Explains how sign-in works in this sandbox"],
  ["az version", "Show the simulated CLI version"],
] as const;

function allowedSpecs(config: SandboxConfig): CommandSpec[] {
  if (!config.allowedCommands?.length) return COMMANDS;
  const allowed = new Set(config.allowedCommands.map((c) => c.toLowerCase()));
  return COMMANDS.filter((c) => allowed.has(c.path));
}

export function helpText(config: SandboxConfig): string {
  const specs = allowedSpecs(config);
  const width = Math.max(...specs.map((s) => `az ${s.path}`.length), ...SPECIAL_HELP.map(([c]) => c.length)) + 2;
  return [
    "Commands available in this sandbox (simulated Azure CLI):",
    "",
    ...specs.map((s) => `  ${`az ${s.path}`.padEnd(width)}${s.summary}`),
    ...SPECIAL_HELP.map(([c, d]) => `  ${c.padEnd(width)}${d}`),
    "",
    "Add --help to any command for its options and an example. Output formats: --output json|table|tsv.",
    "Nothing you type here runs against real Azure resources.",
  ].join("\n");
}

function commandHelp(spec: CommandSpec): string {
  const params = spec.params.map((p) => `  --${p.long}${p.short ? ` -${p.short}` : ""}${p.required ? "  [Required]" : ""}${p.choices ? `  Allowed values: ${p.choices.join(", ")}` : ""}`);
  return [`az ${spec.path}: ${spec.summary}`, "", "Arguments:", ...(params.length ? params : ["  (none)"]), "", "Example:", `  ${spec.example}`].join("\n");
}

function withHistory(state: SandboxState, command: string): SandboxState {
  const history = [...(state.__meta?.history ?? []), command].slice(-200);
  return { ...state, __meta: { history } };
}

export function initialSandboxState(config: SandboxConfig): SandboxState {
  return { ...(structuredClone(config.initialState) as SandboxState), __meta: { history: [] } };
}

/** Execute one command line against the simulated state. Pure and deterministic. */
export function executeCommand(config: SandboxConfig, state: SandboxState, rawInput: string): SandboxResult {
  const input = rawInput.trim();
  const fail = (output: string, hint?: string): SandboxResult => ({ state, output: `ERROR: ${output}`, isError: true, hint });
  if (!input) return { state, output: "", isError: false };

  const tokenized = tokenize(input);
  if (!tokenized.ok) {
    if (tokenized.error === "operators") return fail("Shell operators such as ; && | > < ` and $( ) are not supported in this sandbox. Run one command at a time.");
    if (tokenized.error === "unterminated_quote") return fail("A quote is not closed.");
    return fail(`Commands are limited to ${MAX_COMMAND_LENGTH} characters.`);
  }
  const tokens = tokenized.tokens;
  const normalized = tokens.join(" ");
  const head = tokens[0]!.toLowerCase();

  if (head === "clear" || head === "cls") return { state, output: "", isError: false, clear: true };
  if (head === "help") return { state, output: helpText(config), isError: false };
  if (head === "history") {
    const h = state.__meta?.history ?? [];
    return { state, output: h.length ? h.map((c, i) => `${String(i + 1).padStart(3)}  ${c}`).join("\n") : "(no commands yet)", isError: false };
  }
  if (head !== "az") {
    return fail(`'${tokens[0]}' is not available in this sandbox. Type 'help' to see supported commands.`, "Commands in this lab start with az.");
  }

  const rest = tokens.slice(1);
  if (rest.length === 0 || ["--help", "-h"].includes(rest[0]!)) return { state, output: helpText(config), isError: false };
  const sub = rest[0]!.toLowerCase();
  if (sub === "login") {
    return {
      state,
      output: `This sandbox is already signed in as ${state.account.user} (a fictional account).\nNo real credentials are used or needed.`,
      isError: false,
      explanation: "In real environments, az login authenticates you with Microsoft Entra ID before you can manage resources.",
    };
  }
  if (sub === "version" || sub === "--version") {
    return { state, output: "azure-cli (simulated sandbox)\n\nThis is an educational simulation, not the real Azure CLI.", isError: false };
  }

  const specs = allowedSpecs(config);
  const lowered = rest.map((t) => t.toLowerCase());
  const spec = [...COMMANDS]
    .sort((a, b) => b.path.split(" ").length - a.path.split(" ").length)
    .find((c) => c.path.split(" ").every((part, i) => lowered[i] === part));

  if (!spec) {
    const group = specs.filter((s) => s.path.startsWith(`${sub} `) || s.path === sub);
    if (group.length && rest.length <= 2) {
      return { state, output: [`Subcommands for az ${sub}:`, ...group.map((s) => `  az ${s.path.padEnd(28)}${s.summary}`)].join("\n"), isError: false };
    }
    return fail(`'az ${rest.slice(0, 2).join(" ")}' is not part of this sandbox's allowlist. Type 'help' to see supported commands.`);
  }
  if (!specs.includes(spec)) return fail(`'az ${spec.path}' is not available in this lab. Type 'help' to see the commands you can use.`);

  const argTokens = rest.slice(spec.path.split(" ").length);
  const { values, errors } = parseArgs(argTokens, spec.params);
  if (values.help) return { state, output: commandHelp(spec), isError: false, explanation: spec.explanation };
  if (errors.length) return fail(`${errors.join("\n")}`, `Example: ${spec.example}`);
  if (values.query !== undefined) return fail("The --query option is not supported in this sandbox.");

  const format = typeof values.output === "string" ? values.output.toLowerCase() : "json";
  const outcome = spec.run({ args: values, state, format });
  if (outcome.error) return { ...fail(outcome.error, outcome.hint), explanation: spec.explanation };
  const nextState = withHistory(outcome.state ?? state, normalized);
  return { state: nextState, output: outcome.output ?? "", isError: false, explanation: spec.explanation };
}

export function replaySandbox(config: SandboxConfig, commands: string[]): SandboxState {
  let state = initialSandboxState(config);
  for (const c of commands.slice(0, 500)) state = executeCommand(config, state, c).state;
  return state;
}
