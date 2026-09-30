# Authoring portal labs (lab VM + simulated portals)

Portal labs (`"type": "UI_SIMULATION"`) run in a **simulated lab VM**: a desktop with a browser that shows a
fictional, simplified look-alike of the real platform (Azure portal, Microsoft Entra admin center, Microsoft Purview,
Microsoft Defender, Microsoft 365 admin center, SharePoint admin center, Power Apps / Power Automate / Copilot Studio /
Power Platform admin center, Microsoft Foundry, Microsoft Fabric / Power BI, GitHub), optionally with a terminal
(Cloud Shell, PowerShell, Git Bash). Everything is data: pages, components, actions, terminal commands and validation
rules live in the lab JSON. The engine (`src/modules/labs/engine/ui-simulation.ts`) is pure and deterministic; the
server replays the learner's events to check the rules, and the browser runs the same code for instant feedback.

Reference lab: `prisma/seed-data/courses/az-900/labs-portal.json` (create a Linux VM in the Azure portal) and its
walkthrough `tests/fixtures/lab-walkthroughs/az-900--create-linux-vm-portal.json`. Read both before writing a lab.

## 1. Principles (mandatory)
- **Simulated and fictional.** No real tenants, subscriptions, people or credentials. Use fictional organisations
  (Contoso, Fabrikam, Northwind Traders, Tailwind Traders, Adventure Works, Woodgrove Bank, Litware, Proseware,
  Wide World Importers, Relecloud), `example.com`/`contoso.example` domains, first names only, IPs from the `ip` filter
  (203.0.113.0/24 documentation range) and GUIDs from the `guid` filter. Put "(simulated)" in subscription/tenant names.
- **Imitate structure, not artwork.** Use the real product's navigation names, page titles, field labels, command names
  and workflow order (verify them on learn.microsoft.com / docs.github.com), but never logos or copied text. The renderer
  adds the "Simulated" badge and the VM chrome.
- **No sign-in or sign-out steps** anywhere: the simulated account is already signed in. Never ask for passwords.
- **No prices, SLA percentages, quotas, limits or dates** — they change. Say "compute charges stop", not "$0.04/hour".
- **Original wording**, current terminology (Microsoft Entra ID, Microsoft Defender XDR, Microsoft Purview, Microsoft
  Foundry, Copilot Studio, Microsoft 365 Copilot, GitHub Copilot, ...). Cite 2-4 official pages in `sources`.
- Every lab teaches 2-3 exam-relevant ideas, has 4-7 verifiable steps and a realistic scenario.

## 2. Files
- Labs go in `prisma/seed-data/courses/<cert>/labs-<topic>.json` as `{ "labs": [ ... ] }` (all `labs*.json` files of a
  package are merged). A certification without lessons still needs `course.json` (domains/objectives from the catalog).
- One walkthrough per portal lab: `tests/fixtures/lab-walkthroughs/<cert-lowercase>--<lab-slug>.json`.
- Validate: `npm run content:validate -- prisma/seed-data/courses/<cert>` and
  `npx vitest run tests/lab-walkthroughs.test.ts` (both must pass). Set `LAB_CERT=<cert>` (for example
  `$env:LAB_CERT="gh-900"` in PowerShell, comma-separated for several) to test only one certification's labs.
- UI check (recommended): with the app running and the database seeded, `npm run labs:ui-replay -- <slug>` clicks
  through your walkthrough in the real lab VM (like a learner) and reports controls that are missing, forms that cannot
  be submitted and pages that cannot be reached from the visible navigation, menus, tiles, links or Back button.

## 3. Lab record
`slug` (kebab-case, unique per certification), `type: "UI_SIMULATION"`, `title`, `summary` (≤ 400 chars), `scenario`
(Markdown), `domainKey` (from course.json), `moduleSlug` (only if that module exists in the package), `objectiveCode`,
`complexity` (`INTRO` | `BASIC` | `INTERMEDIATE`), `estimatedMinutes`, `learningObjectives` (1-8), `prerequisites`,
`sources` (1-8 `{ title, url }`), `config`, `steps`, `finalRules`, `solution` (Markdown, numbered, exact UI labels).

Step: `{ key, title, instruction, hint?, explanation, targetId?, rules: [ { key, description, rule, successFeedback?,
failureFeedback? } ] }`. `instruction` names the exact labels learners see (bold). `targetId` = id of the component or
command to highlight in guided mode (validated by the tests). `finalRules` check the overall outcome (for example "no
excessive permissions"). Rules are evaluated against the lab **state** (paths from the state root, see §10).

## 4. Config
```json
{
  "portal": { "name": "Microsoft Entra admin center", "theme": "entra", "user": "alex@contoso.example",
              "tenant": "Contoso (contoso.example)", "url": "https://entra.microsoft.com", "searchPlaceholder": "Search resources, services, and docs" },
  "vm": { "name": "LAB-VM01", "os": "windows", "apps": ["browser"] },
  "terminal": { ... },
  "clock": { "start": "2026-09-30T09:00:00Z" },
  "startPage": "home",
  "navigation": [ { "page": "home", "label": "Home", "icon": "Home" }, { "page": "users", "label": "All users", "icon": "Users", "section": "Users" } ],
  "pages": [ ... ],
  "initialState": { ... }
}
```
Themes: `azure`, `entra`, `purview`, `defender`, `m365` (Microsoft 365 admin center), `sharepoint`, `power-platform`
(Power Platform admin center), `power-apps`, `power-automate`, `power-bi`, `copilot-studio`, `foundry`, `fabric`,
`github`, `generic`. `vm.apps`: `["browser"]` or `["browser", "terminal"]` (a separate Terminal app on the VM taskbar).
Icons must be names from `src/modules/labs/engine/portal-icons.ts` (validated). Ids (pages, components, commands,
fields, tiles, row actions) use letters, digits, `-`, `_`; component and command ids are unique across the lab.
`initialState` keys must not be `__meta` or start with `$`. Keep the state small (lists ≤ 200 items).

## 5. Pages
`{ id, title, subtitle?, icon?, url?, layout?, breadcrumb?, navItem?, menu?, menuStyle?, commands?, requires?, components }`
- `title`, `subtitle`, `url`, `breadcrumb` entries accept templates (`"{{$sel.vm.name}}"`).
- `url`: address-bar path appended to `portal.url` (or an absolute URL). Learners can type URLs: an `openUrl` event opens
  the page whose rendered URL matches, otherwise the browser shows "can't reach this page". The browser Back button
  sends a `back` event: it closes an error page, otherwise it returns to the previous page of the trail.
- `layout: "blank"`: no portal chrome (e.g. the website served by a lab VM at `http://{{...publicIp}}`).
- `navItem`: which navigation item stays highlighted (e.g. detail pages highlight their list).
- `menu` (+ `menuStyle: "side" | "tabs"`): resource menu inside a blade, or repository tabs (GitHub uses tabs).
- `commands`: command bar buttons `{ id, label, icon?, variant?, action, visibleWhen?, disabledWhen? }`.
- `requires: "<alias>"`: the page needs a selection (`$sel.<alias>`); without it the renderer shows "not found".

## 6. Components
All components accept `visibleWhen` (a rule, §9). Events only reach components on the page that is currently open.

| kind | purpose and key properties |
| --- | --- |
| `text` | Markdown with templates. |
| `callout` | `variant: info|warning|success|error`, `title?`, `text`. |
| `table` | `source` (context path, e.g. `virtualMachines` or `$sel.vm.disks`), `where` (templated filter), `columns[] { key, label, format?, template? }`, `rowKey`, `rowAction` (runs with `$row`), `rowActions[] { id, label, icon?, variant?, action, visibleWhen? }`, `searchable`, `emptyText`, `variant: table|cards|flow|list|files`. Formats: `text status badge code link date datetime bool tags json count` (`status` colours common values such as Running/Succeeded green, Stopped/Failed red and Pending/Warning amber). `key: "$value"` addresses rows that are plain strings. |
| `tiles` | `items[] { id, label, description?, icon?, badge?, action, visibleWhen? }`, `size: sm|md|lg` (service tiles, template galleries, model catalogs). |
| `button` | `{ id, label, icon?, variant?, action, disabledWhen? }`. |
| `form` | `fields[]`, `submit { label, actions?, checks?, successMessage? }`, optional `preview` (live chart builder: `{ type: "chart", dataset, visualField, categoryField, valueField, aggregationField? }`). |
| `wizard` | Create experiences with tabs: `tabs[] { id, label, description?, fields[] }`, `reviewLabel` (default "Review + create"), `submit` like a form. All fields are submitted together. |
| `settings` | Fields bound to state (`bindTo` required); changes apply immediately (toggles, selects). |
| `properties` | Essentials grid: `items[] { label, value (template), format? }`. |
| `terminal` | Embeds the lab terminal on a page. |
| `sqlEditor` | `database` (state path), `defaultTable?` (Cosmos DB style `FROM c`), `sampleQueries[] { label, sql }`, `placeholder`, `maxRows`. |
| `chat` | Playground / test pane: `responses[] { id, match?, when?, reply, blocked?, citations?, actions? }`, `fallback`, `systemPrompt?`, `transcriptPath?` (default `chats.<id>`). |
| `code` | Read-only code/JSON/YAML with templates. |
| `deployment` | "Deployment in progress → complete" panel: `title`, `status`, `note`, `resources[] { name, type, status? }`. |
| `chart` | Static metrics: `type: line|bar`, `unit`, `points[] { label, value }`. |
| `links` | Legacy quick links `{ items[] { id, label, page } }` (prefer tiles). |

## 7. Fields
`{ id, label, control, options?, optionsFrom?, defaultValue?, required?, placeholder?, help?, pattern?, patternMessage?,
minLength?, maxLength?, min?, max?, unique?, visibleWhen?, readOnly?, bindTo? }`
- Controls: `text`, `textarea`, `code`, `number`, `select`, `radio`, `toggle`, `checkboxes` (value = string array).
- `optionsFrom: { path, value, label?, where? }` builds options from state (existing resource groups, users, ...);
  use `value: "$value"` when the list contains plain strings (e.g. branch names).
- `defaultValue` may be a template (`"{{repo.readme}}"`) — useful to edit existing content.
- `pattern` is anchored automatically; always give a helpful `patternMessage`.
- `unique: { path, key, message? }` rejects values that already exist.
- `visibleWhen` can use other fields through `$form` (`{ "type": "equals", "path": "$form.rg", "value": "create-new" }`).
  Hidden fields are ignored on submit.

## 8. Actions
Run in order; each sees the state produced by the previous one.
- `{ "type": "navigate", "page": "vm-overview", "select": { "as": "vm", "path": "virtualMachines", "key": "name", "value": "{{$row.name}}" } }`
- `{ "type": "select", "as", "path", "key", "value" }` — remember an item as `$sel.<as>`. The list `path` may point into
  another selection, e.g. `"path": "$sel.incident.assets"` selects an asset of the selected incident.
- `{ "type": "set", "path", "value" }`, `{ "type": "toggle", "path" }`
- `{ "type": "append", "path", "value", "unique": "name" | "$value", "uniqueMessage" }`
- `{ "type": "update", "path", "where": { "name": "{{$sel.vm.name}}" }, "set": { "status": "Running", "tags.env": "dev" } }` (`$item` = item being updated)
- `{ "type": "remove", "path", "where" }` or `{ "type": "remove", "path", "value": "feature/x" }` (plain lists)
- `{ "type": "notify", "title", "message?", "tone?" }` — portal notification (bell) + toast.
- `{ "type": "message", "text", "tone?" }` — inline banner on the page.
- `{ "type": "if", "when": <rule>, "then": [ ... ], "else": [ ... ] }`, `{ "type": "sequence", "actions": [ ... ] }`
- `{ "type": "fail", "message" }` — aborts the whole event (nothing is saved) and shows the message.
Form `checks` (`[{ "rule", "message" }]`) must all pass before any action runs. State paths cannot start with `__meta` or `$`.
Action paths may contain templates, e.g. `"path": "cosmos.databases.{{$form.db}}.containers"` (the rendered path must
not be empty or contain `..`).

## 9. Context, templates and conditions
Context = the state at the root plus: `$sel.<alias>` (selected items), `$form` (submitted/draft values), `$row` (table
row), `$item` (in `update.set`), `$args` (terminal regex groups: `$args.1`, named `$args.name`), `$cmd` (terminal input),
`$input` (chat message), `$seq` (action counter), `$now` (simulated clock, ISO), `$page`, `$user`.

Templates: `{{ path | filter | filter:arg }}`, `'literal'` allowed. A value that is exactly one expression keeps its
type (`"{{$form.autoShutdown}}"` → boolean, `"{{$form.ports | list}}"` → array).
Filters: `json`, `upper`, `lower`, `trim`, `count`, `table:Name=name,Location=location` (Azure CLI style table),
`lines:field`, `join:, `, `map:field`, `list`, `has:value|$path`, `where:key=value|$path`, `first`, `last`,
`default:text`, `or:$path` (fallback to another value), `hash[:n]` (deterministic hex, e.g. commit SHA), `ip`, `guid`,
`yesno`, `onoff`, `date`, `time`, `datetime`, `slug`.

Conditions (`visibleWhen`, `disabledWhen`, `if.when`, `checks`, terminal/chat `when`) use the lab rule types
(`equals notEquals oneOf truthy falsy exists notExists arrayContains arrayNotContains arrayLength includes matches
textMinLength visited commandUsed allOf anyOf not`). Paths are context paths (`$form.x`, `$sel.vm.status`,
`virtualMachines`). Templates inside rules are rendered first:
`{ "type": "arrayContains", "path": "virtualMachines", "match": { "name": "{{$args.n}}" } }`.

## 10. Step rules
Evaluated against the lab state: `arrayContains virtualMachines { name, "tags.env": "dev" }` (dotted keys allowed,
string comparison is case-insensitive), `includes git.branches "feature/readme"`, `visited <pageId>`,
`commandUsed "^git push"` (regex over terminal commands and SQL queries), `matches`, `textMinLength`, `allOf/anyOf/not`.
Avoid rules that pass before the learner does anything: combine `arrayNotContains` with an `arrayContains` in `allOf`.
Prefer outcome rules (state) over process rules (visited) — at most one `visited` rule per lab.

## 11. Terminal
```json
"terminal": { "title": "Cloud Shell (Bash)", "prompt": "alex@Azure:~$", "surface": "cloudshell", "welcome": "...",
  "commands": [ { "id": "vm-start", "pattern": "^az vm start (-g|--resource-group) (?<g>\\S+) (-n|--name) (?<n>\\S+)$",
                  "when": <rule>, "actions": [ ... ], "output": "...", "help": "az vm start -g <group> -n <name>" } ],
  "fallback": "optional template using {{$cmd}}" }
```
- Patterns are case-insensitive regular expressions tested against the trimmed input; anchor them (`^...$`); first
  matching command whose `when` passes wins, so put specific variants first and add "not found" variants with
  `when` + `error`. `error` makes the command fail (no actions).
- `surface`: `cloudshell` (panel inside the portal, default for azure), `app` (VM Terminal app), `both`.
- Built-ins: `help` (lists `help` texts), `history`, `clear`. Unknown commands print the fallback.
- The prompt is a template (`"{{shell.user}}@{{shell.host}}:~$"`), so `ssh`/`exit`/`cd` can change it via `set`.
- Keep outputs short and realistic; use `table:`/`json` filters for list commands.

## 12. SQL editor
State: `"sql": { "salesdb": { "tables": { "SalesLT.Product": { "columns": [ { "name": "ProductID", "type": "INT", "primaryKey": true }, ... ], "rows": [ { ... } ] } } } }`.
Supports CREATE/DROP TABLE, INSERT, UPDATE, DELETE and SELECT with WHERE, JOIN, GROUP BY, HAVING, ORDER BY, TOP,
DISTINCT, aggregates and common functions (T-SQL flavour). Document containers (Cosmos DB for NoSQL) have no `columns`:
set `defaultTable` and query `SELECT * FROM c WHERE c.status = 'shipped'` (single- or double-quoted strings as in Cosmos DB, case-sensitive strings, nested paths,
`SELECT VALUE COUNT(1)`, `IS_DEFINED`, `ARRAY_CONTAINS`, `CONTAINS`, `STARTSWITH`). Only set `defaultTable` for
document containers: as in Cosmos DB, the `FROM` name is then just an alias for that container, so relational editors
(Azure SQL, Fabric SQL endpoint) must leave it unset to get "Invalid object name" errors for unknown tables. Results
appear under the editor;
queries are also recorded for `commandUsed` rules (whitespace collapsed).

## 13. Chat
Responses are checked in order: optional `match` regex against the message and optional `when` rule (e.g. "content
filter is on", "knowledge source connected"). The first match replies (`reply` template, `blocked` styling,
`citations`) and runs its `actions`; otherwise `fallback`. The transcript is stored at `transcriptPath` (items
`{ role, text, replyId, blocked }`), so rules can check `arrayContains chats.playground { "replyId": "grounded" }`.

## 14. Walkthrough fixtures
```json
{ "certification": "SC-900", "lab": "entra-users-groups", "note": "...", "events": [
  { "type": "navigate", "page": "users" },
  { "type": "click", "componentId": "users-new" },
  { "type": "submitForm", "componentId": "new-user", "values": { "upn": "priya", "displayName": "Priya" } },
  { "type": "rowClick", "componentId": "user-list", "rowKey": "priya@contoso.example" },
  { "type": "rowAction", "componentId": "group-list", "rowKey": "Finance", "actionId": "add-member" },
  { "type": "setField", "componentId": "security-defaults", "fieldId": "enabled", "value": true },
  { "type": "click", "componentId": "services", "itemId": "virtual-machines" },
  { "type": "command", "command": "git status" },
  { "type": "query", "componentId": "query-editor", "sql": "SELECT TOP 5 * FROM SalesLT.Product" },
  { "type": "chat", "componentId": "playground", "message": "What is the return policy?" },
  { "type": "openUrl", "url": "http://203.0.113.21" },
  { "type": "back" },
  { "type": "submitForm", "componentId": "new-user", "values": { }, "expectError": true } ] }
```
The test replays the events and requires: every event is accepted (the component is on the open page), no error
message unless `expectError`, no failing terminal command, pages with `requires` always have their selection, all
step and final rules pass at the end, and not all steps pass at the start. Submit the values the learner would enter
for the **visible** fields (checkbox values as arrays, toggles as booleans). Prefer the events a learner would really
use (`click` on the tile, command or link rather than a direct `navigate` to a page that no visible link opens);
`npm run labs:ui-replay` checks this in the real UI.

## 15. Quality checklist
- Realistic navigation, page and field names for the platform; dense, believable seed data (3-8 existing items).
- Wrong choices are possible and explained (checks, failureFeedback) — not just a single happy path.
- Steps are outcome-based, instructions use the exact labels, guided `targetId`s point at the next control.
- Destructive or recovery actions exist where a learner could get stuck (delete/undo/edit).
- No sign-in/out, no passwords, no prices/limits, no logos, no real people/tenants.
- `content:validate` and the walkthrough tests pass.
