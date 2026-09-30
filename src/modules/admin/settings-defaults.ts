/** Application settings stored in the AppSetting table (never secrets). */
export const SETTING_DEFAULTS = {
  "ai.provider": "env" as "env" | "local" | "openai",
  "ai.model": "",
  "ai.baseUrl": "",
  "ai.draftsEnabled": true,
  /** Learner-facing AI tutor on/off and per-user daily message cap. */
  "ai.enabled": true,
  "ai.tutorDailyLimit": 50,
  "platform.registrationEnabled": true,
  "practice.fullExamQuestions": 40,
  "practice.fullExamMinutes": 45,
  "practice.targetPercent": 75,
  "analytics.minCohort": 3,
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = { [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] };

export function mergeSettings(rows: { key: string; value: unknown }[]): Settings {
  const out = { ...SETTING_DEFAULTS } as Record<string, unknown>;
  for (const r of rows) {
    if (r.key in SETTING_DEFAULTS && typeof r.value === typeof (SETTING_DEFAULTS as Record<string, unknown>)[r.key]) out[r.key] = r.value;
  }
  return out as Settings;
}
