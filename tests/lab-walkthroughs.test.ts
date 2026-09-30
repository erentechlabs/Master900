/**
 * Replays the solution walkthrough of every lab (tests/fixtures/lab-walkthroughs/<cert>--<slug>.json) with the real
 * engines and checks that every step and final rule passes. Portal (UI_SIMULATION) labs must have a walkthrough.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listCourseDirectories, loadCourseDirectory } from "@/modules/content/package-loader";
import { validateCoursePackage, type LabInput } from "@/modules/content/package-schema";
import { evaluateRules, type KeyedRule } from "@/modules/labs/engine/rules";
import { architectureConfigSchema, architectureEventSchema, replayArchitecture } from "@/modules/labs/engine/architecture";
import { replaySandbox, sandboxConfigSchema } from "@/modules/labs/engine/command-sandbox";
import { decisionAnswerSchema, decisionConfigSchema, initialDecisionState, submitDecisionStage, type DecisionState } from "@/modules/labs/engine/decision";
import { applyUiSimEvent, buildContext, currentPage, initialUiSimState, uiSimConfigSchema, uiSimEventSchema } from "@/modules/labs/engine/ui-simulation";

const coursesRoot = path.resolve(__dirname, "../prisma/seed-data/courses");
const walkthroughRoot = path.resolve(__dirname, "fixtures/lab-walkthroughs");

type Walkthrough = { certification: string; lab: string; events: (Record<string, unknown> & { expectError?: boolean })[] };

/** Optional filter, e.g. LAB_CERT=GH-900 or LAB_CERT=dp-900,sc-900 (matches the package folder / certification code). */
const certFilter = (process.env.LAB_CERT ?? "")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);
const includeCert = (code: string) => certFilter.length === 0 || certFilter.includes(code.toLowerCase());
/** Optional filter, e.g. LAB_FILE=labs-git-cli.json: validates course.json plus only these lab files of each package. */
const fileFilter = (process.env.LAB_FILE ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);

const packages = listCourseDirectories(coursesRoot)
  .filter((dir) => includeCert(path.basename(dir)))
  .flatMap((dir) => {
    const selections: (string | undefined)[] = fileFilter.length > 0 ? fileFilter.filter((f) => fs.existsSync(path.join(dir, f))) : [undefined];
    return selections.map((only) => {
      const name = `${path.basename(dir)}${only ? ` (${only})` : ""}`;
      try {
        // Module references cannot resolve when only one lab file is loaded.
        const result = validateCoursePackage(loadCourseDirectory(dir, { only }), { strictReferences: !only });
        if (!result.ok) return { dir, name, error: result.issues.map((i) => `${i.path}: ${i.message}`).join("\n"), pkg: null };
        return { dir, name, error: null, pkg: result.pkg };
      } catch (error) {
        return { dir, name, error: error instanceof Error ? error.message : String(error), pkg: null };
      }
    });
  });

const labs = packages.flatMap(({ pkg }) => (pkg ? pkg.labs.map((lab) => ({ certification: pkg.certificationCode, lab })) : []));

function walkthroughFile(certification: string, slug: string) {
  return path.join(walkthroughRoot, `${certification.toLowerCase()}--${slug}.json`);
}

function loadWalkthrough(certification: string, slug: string): Walkthrough | null {
  const file = walkthroughFile(certification, slug);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as Walkthrough;
}

function keyed(lab: LabInput): { steps: { key: string; rules: KeyedRule[] }[]; final: KeyedRule[] } {
  return {
    steps: lab.steps.map((s) => ({ key: s.key, rules: s.rules.map((r) => ({ key: r.key, rule: r.rule as never })) })),
    final: lab.finalRules.map((r) => ({ key: r.key, rule: r.rule as never })),
  };
}

/** Replays a walkthrough; returns the initial and final state. Each UI simulation event must be accepted. */
function replay(lab: LabInput, walkthrough: Walkthrough): { initial: unknown; final: unknown } {
  switch (lab.type) {
    case "UI_SIMULATION": {
      const config = uiSimConfigSchema.parse(lab.config);
      const initial = initialUiSimState(config);
      let state = initial;
      walkthrough.events.forEach((raw, index) => {
        const event = uiSimEventSchema.parse(raw);
        const next = applyUiSimEvent(config, state, event);
        const where = `${lab.slug} event #${index + 1} (${event.type}${"componentId" in event ? ` ${event.componentId}` : ""})`;
        expect(next.__meta.events, `${where} was ignored: is the component on the page that is open at that moment?`).toBe(state.__meta.events + 1);
        const error = next.__meta.message?.tone === "error" ? next.__meta.message.text : null;
        if (raw.expectError) expect(error, `${where} was expected to fail`).toBeTruthy();
        else expect(error, `${where} failed`).toBeNull();
        const lastTerminal = next.__meta.terminal?.at(-1);
        if (event.type === "command" && !raw.expectError) expect(lastTerminal?.error, `${where} terminal error: ${lastTerminal?.output}`).toBe(false);
        const open = currentPage(config, next);
        if (open.requires) {
          const selected = (buildContext(config, next).$sel as Record<string, unknown>)[open.requires];
          expect(selected, `${where}: page '${open.id}' requires the selection '${open.requires}', which is not set (learners would see "resource not found")`).toBeDefined();
        }
        state = next;
      });
      return { initial, final: state };
    }
    case "COMMAND_SANDBOX": {
      const config = sandboxConfigSchema.parse(lab.config);
      const commands = walkthrough.events.map((e) => String(e.command ?? ""));
      return { initial: replaySandbox(config, []), final: replaySandbox(config, commands) };
    }
    case "ARCHITECTURE": {
      const config = architectureConfigSchema.parse(lab.config);
      const events = walkthrough.events.map((e) => architectureEventSchema.parse(e));
      return { initial: replayArchitecture(config, []), final: replayArchitecture(config, events) };
    }
    case "TROUBLESHOOTING":
    case "BUSINESS_SCENARIO": {
      const config = decisionConfigSchema.parse(lab.config);
      let state: DecisionState = initialDecisionState();
      for (const raw of walkthrough.events) {
        const answer = decisionAnswerSchema.parse(raw);
        const result = submitDecisionStage(config, state, answer.stageId, answer.answer);
        if ("error" in result) throw new Error(`${lab.slug}: ${result.error}`);
        state = result.state;
      }
      return { initial: initialDecisionState(), final: state };
    }
  }
}

function componentTargets(config: unknown): Set<string> {
  const parsed = uiSimConfigSchema.parse(config);
  const ids = new Set<string>();
  for (const page of parsed.pages) {
    (page.commands ?? []).forEach((c) => ids.add(c.id));
    page.components.forEach((c) => {
      if ("id" in c && c.id) ids.add(c.id);
    });
  }
  return ids;
}

describe("lab walkthroughs", () => {
  for (const { name, error } of packages) {
    it(`course package ${name} is valid`, () => {
      expect(error, `Invalid course package ${name}`).toBeNull();
    });
  }

  it("has a walkthrough for every portal (UI simulation) lab", () => {
    const missing = labs.filter(({ certification, lab }) => {
      if (lab.type !== "UI_SIMULATION") return false;
      try {
        return !loadWalkthrough(certification, lab.slug);
      } catch {
        return false;
      }
    });
    expect(missing.map(({ certification, lab }) => path.basename(walkthroughFile(certification, lab.slug)))).toEqual([]);
  });

  it("has no walkthrough files without a matching lab", () => {
    if (fileFilter.length > 0) return; // other labs of the package are not loaded
    const known = new Set(labs.map(({ certification, lab }) => path.basename(walkthroughFile(certification, lab.slug))));
    const files = fs.existsSync(walkthroughRoot) ? fs.readdirSync(walkthroughRoot).filter((f) => f.endsWith(".json")) : [];
    const loaded = new Set(packages.filter((p) => p.pkg).map((p) => path.basename(p.dir).toLowerCase()));
    expect(files.filter((f) => loaded.has(f.split("--")[0]) && !known.has(f))).toEqual([]);
  });

  for (const { certification, lab } of labs) {
    let walkthrough: Walkthrough | null;
    try {
      walkthrough = loadWalkthrough(certification, lab.slug);
    } catch (error) {
      it(`${certification} ${lab.slug}: the walkthrough file is valid JSON`, () => {
        throw error;
      });
      continue;
    }
    if (!walkthrough) continue;

    it(`${certification} ${lab.slug}: the walkthrough completes every step`, () => {
      const { initial, final } = replay(lab, walkthrough);
      const rules = keyed(lab);
      const failing = [
        ...rules.steps.flatMap((s) => evaluateRules(s.rules, final).filter((o) => !o.passed).map((o) => `${s.key}/${o.key}`)),
        ...evaluateRules(rules.final, final).filter((o) => !o.passed).map((o) => `final/${o.key}`),
      ];
      expect(failing).toEqual([]);
      const initiallyPassing = rules.steps.filter((s) => s.rules.length > 0 && evaluateRules(s.rules, initial).every((o) => o.passed)).map((s) => s.key);
      expect(initiallyPassing.length, `${lab.slug}: steps already complete before any action: ${initiallyPassing.join(", ")}`).toBeLessThan(rules.steps.length);
    });

    if (lab.type === "UI_SIMULATION") {
      it(`${certification} ${lab.slug}: step targets exist`, () => {
        const targets = componentTargets(lab.config);
        const unknown = lab.steps.filter((s) => s.targetId && !targets.has(s.targetId)).map((s) => `${s.key} -> ${s.targetId}`);
        expect(unknown).toEqual([]);
      });
    }
  }
});
