/**
 * UI replay of portal-lab walkthroughs: drives every walkthrough (tests/fixtures/lab-walkthroughs) through the real
 * lab UI (renderer + server actions) of a running app and checks that each lab completes. When a walkthrough jumps
 * straight to a page, the script looks for a path a learner could click (navigation, resource menus, tiles, links,
 * commands, Back) and reports pages that cannot be reached, missing controls and forms that cannot be submitted.
 *
 * Usage: npm run labs:ui-replay -- [--base http://127.0.0.1:3000] [slug-filter]
 * Needs the running app (npm run dev) with a seeded database, and a Chromium browser for playwright-core: set
 * PLAYWRIGHT_CHANNEL=msedge or chrome to use an installed browser, or run `npx playwright-core install chromium`.
 * Each lab is reset through its "Reset lab" button first. Screenshots of failures go to .lab-ui-replay/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const baseIndex = args.indexOf("--base");
const base = baseIndex >= 0 ? args[baseIndex + 1] : "http://127.0.0.1:3000";
const filter = args.filter((a, i) => !a.startsWith("--") && (baseIndex < 0 || i !== baseIndex + 1))[0] ?? "";
const walkRoot = path.join(root, "tests/fixtures/lab-walkthroughs");
const coursesRoot = path.join(root, "prisma/seed-data/courses");
const shotDir = path.join(root, ".lab-ui-replay");

const prisma = new PrismaClient();
const labs = (
  await prisma.lab.findMany({
    where: { type: "UI_SIMULATION" },
    select: { id: true, slug: true, certification: { select: { code: true } } },
    orderBy: [{ certification: { code: "asc" } }, { slug: "asc" }],
  })
).map((l) => ({ id: l.id, slug: l.slug, cert: l.certification.code }));
await prisma.$disconnect();

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const results = [];
const configs = new Map();
for (const cert of fs.readdirSync(coursesRoot)) {
  const dir = path.join(coursesRoot, cert);
  for (const f of fs.readdirSync(dir).filter((f) => /^labs.*\.json$/.test(f))) {
    for (const l of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).labs ?? []) if (l.type === "UI_SIMULATION") configs.set(cert.toUpperCase() + ":" + l.slug, l.config);
  }
}
function gotoTarget(action) {
  if (!action) return undefined;
  if (action.type === "navigate") return action.page;
  if (action.type === "sequence") return [...action.actions].reverse().map(gotoTarget).find(Boolean);
  return undefined;
}
function edges(config, pageId) {
  const p = config.pages.find((x) => x.id === pageId);
  if (!p) return [];
  const out = [];
  if (p.layout !== "blank") out.push(...config.navigation.map((n) => n.page));
  out.push(...(p.menu ?? []).map((m) => m.page));
  for (const c of p.commands ?? []) out.push(gotoTarget(c.action));
  for (const c of p.components) {
    for (const it of c.items ?? []) out.push(it.page ?? gotoTarget(it.action));
    if (c.kind === "button") out.push(gotoTarget(c.action));
  }
  return [...new Set(out.filter(Boolean))];
}
function findPath(config, from, to) {
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const next of edges(config, cur)) if (!prev.has(next)) { prev.set(next, cur); queue.push(next); }
  }
  if (!prev.has(to)) return null;
  const hops = [];
  for (let at = to; at && at !== from; at = prev.get(at)) hops.unshift(at);
  return hops;
}

class Stop extends Error {}

async function replayLab(lab) {
  const file = path.join(walkRoot, `${lab.cert.toLowerCase()}--${lab.slug}.json`);
  if (!fs.existsSync(file)) return { lab, status: "NO-WALKTHROUGH", issues: [] };
  const walkthrough = JSON.parse(fs.readFileSync(file, "utf8"));
  const config = configs.get(lab.cert + ":" + lab.slug);
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  // The "Mission complete" dialog opens asynchronously once the last step passes; learners close it to keep exploring.
  await page.addLocatorHandler(page.getByRole("dialog", { name: "Mission complete" }), async () => {
    await page.keyboard.press("Escape");
  });
  const issues = [];
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 200)));
  await page.goto(`${base}/labs/${lab.id}`, { waitUntil: "networkidle", timeout: 90000 });

  // A fresh attempt opens the modal mission briefing; start the mission so the workspace is interactive.
  const dismissBriefing = async () => {
    const start = page.getByRole("button", { name: "Start mission" });
    await start
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => start.click())
      .catch(() => {});
  };
  await dismissBriefing();

  // Start from a clean attempt through the Reset button of the Resources tab.
  await page.getByRole("tab", { name: "Resources", exact: true }).click();
  const reset = page.getByRole("button", { name: "Reset lab" });
  if (await reset.isEnabled()) {
    await reset.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await dismissBriefing();
  }
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();

  const vm = page.locator("[data-sim-page]").first();
  const visible = (selector) => page.locator(selector).locator("visible=true").first();
  const currentPage = async () => (await vm.getAttribute("data-sim-page").catch(() => null)) ?? "?";
  let app = "browser";
  const fail = (message) => {
    issues.push(message);
    throw new Stop(message);
  };

  const showBrowserApp = async () => {
    if (app === "browser") return;
    await page.locator("button[aria-pressed]", { hasText: "Browser" }).first().click();
    app = "browser";
  };

  const setField = async (container, fieldId, value) => {
    const els = container.locator(`[data-sim-field="${fieldId}"]`);
    const count = await els.count();
    if (!count) return false;
    const first = els.first();
    if (await first.evaluate((el) => el.readOnly === true || el.disabled === true)) return true;
    const kind = await first.evaluate((el) => `${el.tagName.toLowerCase()}:${el.getAttribute("role") ?? el.getAttribute("type") ?? ""}`);
    if (kind.startsWith("select")) await first.selectOption(String(value));
    else if (kind.endsWith(":switch")) {
      if ((await first.getAttribute("aria-checked")) !== String(value === true)) await first.click();
    } else if (kind === "input:radio") await container.locator(`[data-sim-field="${fieldId}"][value="${String(value)}"]`).check();
    else if (kind === "input:checkbox") {
      const wanted = Array.isArray(value) ? value.map(String) : [];
      for (let i = 0; i < count; i += 1) {
        const box = els.nth(i);
        const should = wanted.includes((await box.getAttribute("value")) ?? "");
        if ((await box.isChecked()) !== should) await box.click();
      }
    } else await first.fill(String(value));
    return true;
  };

  for (const [index, event] of walkthrough.events.entries()) {
    const where = `#${index + 1} ${event.type}${event.componentId ? " " + event.componentId : ""}${event.page ? " " + event.page : ""}`;
    try {
      if (event.type !== "command") await showBrowserApp();
      switch (event.type) {
        case "navigate": {
          const selector = `[data-sim-nav="${event.page}"], [data-sim-goto="${event.page}"]`;
          let nav = visible(selector);
          if (!(await nav.count()) && /can.t be reached/i.test(await vm.innerText())) {
            await visible("[data-sim-back]").click();
            await page.waitForTimeout(250);
            nav = visible(selector);
          }
          if (!(await nav.count())) {
            let from = await currentPage();
            let hops = config ? findPath(config, from, event.page) : null;
            for (let backs = 0; !hops && backs < 3 && (await page.locator("[data-sim-back]:enabled").count()); backs += 1) {
              await visible("[data-sim-back]").click();
              await page.waitForTimeout(250);
              from = await currentPage();
              hops = config ? findPath(config, from, event.page) : null;
            }
            if (!hops) fail(`UNREACHABLE ${where}: no UI path to '${event.page}' from page '${from}'`);
            for (const hop of hops) {
              const step = visible(`[data-sim-nav="${hop}"], [data-sim-goto="${hop}"]`);
              if (!(await step.count())) fail(`UNREACHABLE ${where}: link to '${hop}' not visible on page '${await currentPage()}' (path ${hops.join(" > ")})`);
              await step.click();
              await page.waitForTimeout(250);
            }
            break;
          }
          await nav.click();
          break;
        }
        case "back":
          await visible("[data-sim-back]").click();
          break;
        case "openUrl":
          await page.locator("#sim-address-bar").fill(event.url);
          await page.locator("#sim-address-bar").press("Enter");
          break;
        case "click": {
          const target = visible(`[data-sim-click="${event.itemId ? `${event.componentId}:${event.itemId}` : event.componentId}"]`);
          if (!(await target.count())) fail(`MISSING ${where}${event.itemId ? ":" + event.itemId : ""} on page '${await currentPage()}'`);
          if (await target.isDisabled()) fail(`DISABLED ${where}`);
          await target.click();
          break;
        }
        case "rowClick":
        case "rowAction": {
          const selector = event.type === "rowClick" ? `[data-sim-row="${event.componentId}:${event.rowKey}"]` : `[data-sim-row-action="${event.componentId}:${event.rowKey}:${event.actionId}"]`;
          const target = visible(selector);
          if (!(await target.count())) fail(`MISSING ${where} ${event.rowKey}${event.actionId ? "/" + event.actionId : ""} on page '${await currentPage()}'`);
          await target.click();
          break;
        }
        case "setField": {
          const container = visible(`[data-sim-settings="${event.componentId}"]`);
          if (!(await container.count()) || !(await setField(container, event.fieldId, event.value))) fail(`MISSING ${where}.${event.fieldId} on page '${await currentPage()}'`);
          await page.keyboard.press("Tab");
          break;
        }
        case "submitForm": {
          const container = visible(`[data-sim-form="${event.componentId}"]`);
          if (!(await container.count())) fail(`MISSING ${where} on page '${await currentPage()}'`);
          const entries = Object.entries(event.values ?? {});
          const done = new Set();
          const tabs = container.locator("[data-sim-tab]");
          const tabCount = await tabs.count();
          const fillVisible = async () => {
            for (let pass = 0; pass < 3; pass += 1) {
              let progress = false;
              for (const [fieldId, value] of entries) {
                if (done.has(fieldId)) continue;
                if (!(await container.locator(`[data-sim-field="${fieldId}"]`).locator("visible=true").count())) continue;
                await setField(container, fieldId, value);
                done.add(fieldId);
                progress = true;
              }
              if (!progress) break;
            }
          };
          if (tabCount) {
            for (let t = 0; t < tabCount - 1; t += 1) {
              await tabs.nth(t).click();
              await fillVisible();
            }
            await tabs.nth(tabCount - 1).click();
          } else await fillVisible();
          const missing = entries.filter(([fieldId]) => !done.has(fieldId)).map(([fieldId]) => fieldId);
          if (missing.length) issues.push(`FIELDS-NOT-FOUND ${where}: ${missing.join(", ")}`);
          const submit = container.locator("[data-sim-submit]").first();
          if (await submit.isDisabled()) {
            if (!event.expectError) {
              const text = (await container.innerText()).split("\n").filter((l) => /required|must|invalid|expected|choose|format/i.test(l)).slice(0, 4).join(" / ");
              fail(`SUBMIT-DISABLED ${where}: ${text}`);
            }
          } else await submit.click();
          break;
        }
        case "command": {
          let input = visible("#ui-sim-terminal-input");
          if (!(await input.count())) {
            const terminalApp = page.locator("button[aria-pressed]", { hasText: "Terminal" }).first();
            if (await terminalApp.count()) {
              await terminalApp.click();
              app = "terminal";
            } else await vm.getByRole("button", { name: "Cloud Shell" }).first().click();
            input = visible("#ui-sim-terminal-input");
          }
          if (!(await input.count())) fail(`NO-TERMINAL ${where}`);
          await input.fill(event.command);
          await input.press("Enter");
          break;
        }
        case "query": {
          const container = visible(`[data-sim-sql="${event.componentId}"]`);
          if (!(await container.count())) fail(`MISSING ${where} on page '${await currentPage()}'`);
          await container.locator("textarea").fill(event.sql);
          await container.locator("[data-sim-run]").click();
          break;
        }
        case "chat": {
          const container = visible(`[data-sim-chat="${event.componentId}"]`);
          if (!(await container.count())) fail(`MISSING ${where} on page '${await currentPage()}'`);
          await container.locator("input").fill(event.message);
          await container.locator("input").press("Enter");
          break;
        }
        default:
          fail(`UNSUPPORTED ${where}`);
      }
      await page.waitForTimeout(250);
    } catch (error) {
      if (!(error instanceof Stop)) issues.push(`ERROR ${where}: ${String(error.message).split("\n")[0].slice(0, 180)}`);
      break;
    }
  }
  for (let waited = 0; waited < 12000; waited += 500) {
    if (/Lab completed/.test(await page.locator("aside[aria-label]").last().innerText().catch(() => ""))) break;
    await page.waitForTimeout(500);
  }
  let panel = await page.locator("aside[aria-label]").last().innerText().catch(() => "");
  if (!/Lab completed/.test(panel)) {
    const check = page.getByRole("button", { name: "Check my work" });
    if (await check.isEnabled().catch(() => false)) {
      await check.click();
      await page.waitForTimeout(1500);
      panel = await page.locator("aside[aria-label]").last().innerText().catch(() => "");
      const feedback = await page.locator("aside[aria-label] .text-destructive li").allInnerTexts().catch(() => []);
      if (feedback.length) issues.push("FEEDBACK: " + feedback.join(" | "));
      const vmText = await vm.innerText().catch(() => "");
      issues.push("PORTAL MESSAGE: " + (vmText.split("\n").find((l) => /error|required|must|cannot|not /i.test(l)) ?? "-"));
    }
  }
  const completed = /Lab completed/.test(panel);
  const progress = panel.match(/(\d+) of (\d+)/)?.[0] ?? "?";
  if (!completed) {
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: path.join(shotDir, `${lab.cert.toLowerCase()}--${lab.slug}.png`) });
  }
  await page.close();
  return { lab, status: completed ? "COMPLETED" : "INCOMPLETE", progress, issues, pageErrors: [...new Set(pageErrors)] };
}

for (const lab of labs) {
  if (filter && !lab.slug.includes(filter)) continue;
  const r = await replayLab(lab);
  results.push(r);
  console.log(`${r.status.padEnd(10)} ${r.lab.cert} ${r.lab.slug} (${r.progress ?? ""})${r.issues?.length ? "\n    " + r.issues.join("\n    ") : ""}${r.pageErrors?.length ? "\n    PAGE ERRORS: " + r.pageErrors.join(" | ") : ""}`);
}
console.log(`\n${results.filter((r) => r.status === "COMPLETED").length}/${results.length} labs completed through the UI`);
await browser.close();
process.exitCode = results.every((r) => r.status === "COMPLETED") ? 0 : 1;
