import { describe, expect, it } from "vitest";
import { changedDomainKeys, normalizeOutline, outlineFromConfig } from "@/modules/catalog/sync";

const config = {
  domains: [
    { key: "cloud-concepts", title: "Describe cloud concepts", weightMin: 25, weightMax: 30, objectives: [{ code: "1.1", title: "Describe cloud computing" }] },
    { key: "management", title: "Describe management and governance", weightMin: 30, weightMax: 35, objectives: [{ code: "3.1", title: "Describe cost management" }] },
  ],
} as unknown as Parameters<typeof outlineFromConfig>[0];

/** What PostgreSQL jsonb hands back: keys ordered by length, then bytewise (weightMax before weightMin). */
function jsonbRoundTrip(outline: unknown): unknown {
  const reorder = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reorder);
    if (!value || typeof value !== "object") return value;
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, reorder(v)]));
  };
  return reorder(JSON.parse(JSON.stringify(outline)));
}

describe("certification outline versioning", () => {
  it("treats an outline read back from jsonb as unchanged", () => {
    const outline = outlineFromConfig(config);
    const stored = jsonbRoundTrip(outline);
    expect(JSON.stringify(stored)).not.toBe(JSON.stringify(outline));
    expect(JSON.stringify(normalizeOutline(stored))).toBe(JSON.stringify(outline));
    expect(changedDomainKeys(normalizeOutline(stored), outline)).toEqual([]);
  });

  it("still detects real changes per domain", () => {
    const outline = outlineFromConfig(config);
    const next = outlineFromConfig({
      domains: [config.domains[0]!, { ...config.domains[1]!, weightMax: 40 }, { key: "new-domain", title: "New", weightMin: 5, weightMax: 10, objectives: [] }],
    } as unknown as Parameters<typeof outlineFromConfig>[0]);
    expect(changedDomainKeys(normalizeOutline(jsonbRoundTrip(outline)), next).sort()).toEqual(["management", "new-domain"]);
  });

  it("normalizes missing or malformed stored outlines safely", () => {
    expect(normalizeOutline(null)).toEqual([]);
    expect(normalizeOutline([{ key: "a", objectives: [{ code: 1 }] }])).toEqual([{ key: "a", title: "", weightMin: null, weightMax: null, objectives: [{ code: "1", title: "" }] }]);
  });
});
