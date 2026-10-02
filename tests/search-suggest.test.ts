import { describe, expect, it } from "vitest";
import { rankSuggestions, scoreSuggestion } from "@/modules/learning/search-suggest-utils";

describe("search suggestion ranking", () => {
  const items = [
    { id: "settings", title: "Settings", href: "/settings", group: "goTo", keywords: ["preferences"] },
    { id: "labs", title: "Labs", href: "/labs", group: "goTo", keywords: ["hands on"] },
    { id: "learn", title: "Learn", href: "/learn", group: "goTo", keywords: ["lessons"] },
  ];

  it("prefers exact and prefix title matches over keywords", () => {
    expect(scoreSuggestion("settings", items[0]!)).toBeGreaterThan(scoreSuggestion("set", items[0]!));
    expect(rankSuggestions("la", items).map((item) => item.id)).toEqual(["labs"]);
    expect(rankSuggestions("pref", items).map((item) => item.id)).toEqual(["settings"]);
  });
});
