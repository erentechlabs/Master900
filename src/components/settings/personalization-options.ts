import { z } from "zod";

export const accentOptions = [
  { key: "default", name: "Default", light: { primary: "#005FB8", foreground: "#FFFFFF", tint: "#E8F3FF" }, dark: { primary: "#60CDFF", foreground: "#000000", tint: "#17384A" } },
  { key: "teal", name: "Teal", light: { primary: "#006B75", foreground: "#FFFFFF", tint: "#DDF7FA" }, dark: { primary: "#5BDDE8", foreground: "#00272B", tint: "#123D42" } },
  { key: "sea", name: "Sea green", light: { primary: "#0B6A3A", foreground: "#FFFFFF", tint: "#E4F7EB" }, dark: { primary: "#6DDA9B", foreground: "#002711", tint: "#173E27" } },
  { key: "purple", name: "Purple", light: { primary: "#6B3FA0", foreground: "#FFFFFF", tint: "#F1E8FF" }, dark: { primary: "#C7A7FF", foreground: "#22004D", tint: "#322345" } },
  { key: "orchid", name: "Orchid", light: { primary: "#8A347B", foreground: "#FFFFFF", tint: "#FCE7F7" }, dark: { primary: "#F0A6E3", foreground: "#3A0031", tint: "#47233F" } },
  { key: "rose", name: "Rose", light: { primary: "#B21D4C", foreground: "#FFFFFF", tint: "#FFE7EF" }, dark: { primary: "#FF9DB9", foreground: "#4A0017", tint: "#4F2030" } },
  { key: "red", name: "Red", light: { primary: "#B3261E", foreground: "#FFFFFF", tint: "#FFE8E6" }, dark: { primary: "#FFB4AB", foreground: "#4B0905", tint: "#51211E" } },
  { key: "orange", name: "Orange", light: { primary: "#8A4B00", foreground: "#FFFFFF", tint: "#FFF0DB" }, dark: { primary: "#FFBA66", foreground: "#3B2100", tint: "#49331A" } },
  { key: "gold", name: "Gold", light: { primary: "#6F5700", foreground: "#FFFFFF", tint: "#FFF5CC" }, dark: { primary: "#E4C95A", foreground: "#302600", tint: "#403719" } },
  { key: "graphite", name: "Graphite", light: { primary: "#4F5D66", foreground: "#FFFFFF", tint: "#EEF2F4" }, dark: { primary: "#C2CCD2", foreground: "#10181D", tint: "#2B3338" } },
] as const;

export type AccentKey = (typeof accentOptions)[number]["key"];
export const accentKeys = accentOptions.map((accent) => accent.key) as [AccentKey, ...AccentKey[]];
export const accentColorSchema = z.enum(accentKeys).catch("default");

export function parseAccentColor(value: unknown): AccentKey {
  return accentColorSchema.parse(value);
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function hexToHslVar(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}
