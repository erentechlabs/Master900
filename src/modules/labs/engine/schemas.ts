import type { z } from "zod";
import { architectureConfigSchema } from "./architecture";
import { sandboxConfigSchema } from "./command-sandbox";
import { decisionConfigSchema } from "./decision";
import { uiSimConfigSchema } from "./ui-simulation";

export type LabTypeValue = "UI_SIMULATION" | "COMMAND_SANDBOX" | "ARCHITECTURE" | "TROUBLESHOOTING" | "BUSINESS_SCENARIO";

export function labConfigSchema(type: LabTypeValue): z.ZodType {
  switch (type) {
    case "UI_SIMULATION":
      return uiSimConfigSchema;
    case "COMMAND_SANDBOX":
      return sandboxConfigSchema;
    case "ARCHITECTURE":
      return architectureConfigSchema;
    case "TROUBLESHOOTING":
    case "BUSINESS_SCENARIO":
      return decisionConfigSchema;
  }
}

export function validateLabConfig(type: LabTypeValue, config: unknown): { ok: true; config: unknown } | { ok: false; errors: string[] } {
  const parsed = labConfigSchema(type).safeParse(config);
  if (parsed.success) return { ok: true, config: parsed.data };
  return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
}
