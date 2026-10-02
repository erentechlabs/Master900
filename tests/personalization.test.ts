import { describe, expect, it } from "vitest";
import { accentOptions, contrastRatio, parseAccentColor } from "@/components/settings/personalization-options";

const surfaces = {
  light: { background: "#F3F3F3", card: "#FFFFFF" },
  dark: { background: "#202020", card: "#2D2D2D" },
} as const;

describe("personalization accents", () => {
  it("has stable unique keys and default fallback", () => {
    expect(accentOptions[0]?.key).toBe("default");
    expect(new Set(accentOptions.map((accent) => accent.key)).size).toBe(accentOptions.length);
    expect(parseAccentColor("purple")).toBe("purple");
    expect(parseAccentColor("unknown")).toBe("default");
  });

  it("keeps primary foreground and link text contrast AA in both themes", () => {
    for (const accent of accentOptions) {
      for (const theme of ["light", "dark"] as const) {
        const palette = accent[theme];
        expect(contrastRatio(palette.primary, palette.foreground), `${accent.key} ${theme} foreground`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(palette.primary, surfaces[theme].background), `${accent.key} ${theme} background`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(palette.primary, surfaces[theme].card), `${accent.key} ${theme} card`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
