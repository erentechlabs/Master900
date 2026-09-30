import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { mergeSettings, type Settings } from "./settings-defaults";

/** Application settings for this request (defaults merged with stored values). */
export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await prisma.appSetting.findMany();
  return mergeSettings(rows);
});
