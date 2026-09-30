/**
 * Architecture and service-selection lab engine: learners place service cards
 * into solution zones and optionally connect them. Validation uses the shared
 * rule engine (placedIn / zoneHasAny / zoneLacks / connected ...).
 */
import { z } from "zod";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/);

export const architectureConfigSchema = z.object({
  zones: z.array(z.object({ id, label: z.string().min(1).max(120), description: z.string().max(400).optional() })).min(2).max(8),
  palette: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(120),
        category: z.string().min(1).max(60),
        description: z.string().min(1).max(400),
      }),
    )
    .min(3)
    .max(30),
  allowConnections: z.boolean().default(true),
  maxPerZone: z.number().int().min(1).max(20).optional(),
});
export type ArchitectureConfig = z.infer<typeof architectureConfigSchema>;

export type ArchitectureState = { placements: Record<string, string>; connections: [string, string][] };

export const architectureEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("place"), item: id, zone: id }),
  z.object({ type: z.literal("remove"), item: id }),
  z.object({ type: z.literal("connect"), from: id, to: id }),
  z.object({ type: z.literal("disconnect"), from: id, to: id }),
]);
export type ArchitectureEvent = z.infer<typeof architectureEventSchema>;

export function initialArchitectureState(): ArchitectureState {
  return { placements: {}, connections: [] };
}

export function applyArchitectureEvent(config: ArchitectureConfig, state: ArchitectureState, event: ArchitectureEvent): ArchitectureState {
  const items = new Set(config.palette.map((p) => p.id));
  const zones = new Set(config.zones.map((z) => z.id));
  switch (event.type) {
    case "place": {
      if (!items.has(event.item) || !zones.has(event.zone)) return state;
      const inZone = Object.entries(state.placements).filter(([item, z]) => z === event.zone && item !== event.item).length;
      if (config.maxPerZone && inZone >= config.maxPerZone) return state;
      return { ...state, placements: { ...state.placements, [event.item]: event.zone } };
    }
    case "remove": {
      if (!(event.item in state.placements)) return state;
      const placements = { ...state.placements };
      delete placements[event.item];
      return { placements, connections: state.connections.filter(([a, b]) => a !== event.item && b !== event.item) };
    }
    case "connect": {
      if (!config.allowConnections || event.from === event.to) return state;
      if (!(event.from in state.placements) || !(event.to in state.placements)) return state;
      const exists = state.connections.some(([a, b]) => (a === event.from && b === event.to) || (a === event.to && b === event.from));
      return exists ? state : { ...state, connections: [...state.connections, [event.from, event.to]] };
    }
    case "disconnect":
      return {
        ...state,
        connections: state.connections.filter(([a, b]) => !((a === event.from && b === event.to) || (a === event.to && b === event.from))),
      };
  }
}

export function replayArchitecture(config: ArchitectureConfig, events: ArchitectureEvent[]): ArchitectureState {
  return events.slice(0, 500).reduce((s, e) => applyArchitectureEvent(config, s, e), initialArchitectureState());
}
