import type { LabType } from "@prisma/client";
import type { MessageKey, TFunction } from "@/i18n/translator";

/**
 * What a lab "runs in", for cards and briefings: the simulated product of a portal lab (its authored
 * `config.portal.name`, e.g. "Microsoft Entra admin center"), a terminal, the architecture designer, or a
 * scenario/troubleshooting desk. Pure and client-safe.
 */
export type LabProductKind = "portal" | "terminal" | "designer" | "scenario";

export type LabProductInfo = {
  kind: LabProductKind;
  type: LabType;
  /** Authored portal name (portal labs only). */
  name: string | null;
  /** Portal theme key such as "azure", "entra" or "github" (portal labs only). */
  theme: string | null;
  /** The lab VM also offers a terminal app. */
  hasTerminal: boolean;
};

export function labProductFromParts(type: LabType, name: unknown, theme: unknown, apps: unknown): LabProductInfo {
  const hasTerminal = Array.isArray(apps) && apps.includes("terminal");
  if (type === "COMMAND_SANDBOX") return { kind: "terminal", type, name: null, theme: null, hasTerminal: true };
  if (type === "ARCHITECTURE") return { kind: "designer", type, name: null, theme: null, hasTerminal: false };
  if (type !== "UI_SIMULATION") return { kind: "scenario", type, name: null, theme: null, hasTerminal: false };
  return {
    kind: "portal",
    type,
    name: typeof name === "string" && name.trim() ? name.trim() : null,
    theme: typeof theme === "string" && theme ? theme : null,
    hasTerminal,
  };
}

/** Product facts from a full lab config (the player already has it). */
export function labProductFromConfig(type: LabType, config: unknown): LabProductInfo {
  const value = (config && typeof config === "object" ? config : {}) as { portal?: { name?: unknown; theme?: unknown }; vm?: { apps?: unknown } };
  return labProductFromParts(type, value.portal?.name, value.portal?.theme, value.vm?.apps);
}

export function labProductLabel(info: LabProductInfo, t: TFunction): string {
  switch (info.kind) {
    case "terminal":
      return t("labs.vm.terminal");
    case "designer":
      return t("labs.vm.architectureDesigner");
    case "scenario":
      return t(`enums.labType.${info.type}` as MessageKey);
    default:
      return info.name ?? t("labs.sim.portalLabel");
  }
}
