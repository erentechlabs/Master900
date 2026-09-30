import "server-only";
import { getEnv } from "@/lib/env";
import { getSettings } from "@/modules/admin/settings";
import { LocalTutorProvider } from "./providers/local";
import { OpenAICompatibleProvider } from "./providers/openai";
import type { TutorProvider } from "./providers/types";

export type AiConfig = {
  provider: "local" | "openai";
  model: string;
  baseUrl: string;
  keyConfigured: boolean;
  draftsEnabled: boolean;
};

/** Effective AI configuration: admin settings override the environment; the API key only ever comes from the environment. */
export async function getAiConfig(): Promise<AiConfig> {
  const env = getEnv();
  const settings = await getSettings();
  const keyConfigured = !!env.AI_API_KEY;
  const requested = settings["ai.provider"] === "env" ? (env.AI_PROVIDER === "openai" ? "openai" : "local") : settings["ai.provider"];
  return {
    provider: requested === "openai" && keyConfigured ? "openai" : "local",
    model: settings["ai.model"] || env.AI_MODEL,
    baseUrl: settings["ai.baseUrl"] || env.AI_BASE_URL,
    keyConfigured,
    draftsEnabled: settings["ai.draftsEnabled"],
  };
}

const local = new LocalTutorProvider();

/** The configured provider plus the always-available local fallback. */
export async function getTutorProvider(): Promise<{ provider: TutorProvider; fallback: TutorProvider; config: AiConfig }> {
  const config = await getAiConfig();
  if (config.provider === "openai") {
    const env = getEnv();
    return {
      provider: new OpenAICompatibleProvider({ apiKey: env.AI_API_KEY!, baseUrl: config.baseUrl, model: config.model, timeoutMs: env.AI_TIMEOUT_MS }),
      fallback: local,
      config,
    };
  }
  return { provider: local, fallback: local, config };
}
