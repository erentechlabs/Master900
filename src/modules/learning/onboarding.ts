import { z } from "zod";
import { addDaysISO, isISODate, isValidTimeZone, todayISO } from "@/lib/dates";

export const goalValues = ["student", "business", "it", "developer", "data-ai", "manager", "other"] as const;
export const languageValues = ["en", "tr"] as const;

export const onboardingInputSchema = z
  .object({
    certificationCodes: z.array(z.string().trim().toUpperCase().min(1).max(20)).min(1),
    careerGoal: z.enum(goalValues).optional(),
    goalDetail: z.string().trim().max(500).optional(),
    experienceLevel: z.enum(["NEW_TO_TECH", "SOME_EXPERIENCE", "EXPERIENCED"]),
    targetExamDate: z.string().trim().optional(),
    studyDays: z.array(z.coerce.number().int().min(0).max(6)).min(1),
    sessionMinutes: z.coerce.number().int().min(10).max(240),
    learningStyle: z.enum(["READING", "VISUAL", "GUIDED_PRACTICE", "QUIZZES"]),
    locale: z.enum(languageValues),
    timezone: z.string().trim().min(1).max(100),
    dailyGoalMinutes: z.coerce.number().int().min(5).max(240).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.targetExamDate && !isISODate(value.targetExamDate)) {
      ctx.addIssue({ code: "custom", path: ["targetExamDate"], message: "invalid_date" });
    }
    if (value.targetExamDate && isISODate(value.targetExamDate) && value.targetExamDate <= todayISO(value.timezone)) {
      ctx.addIssue({ code: "custom", path: ["targetExamDate"], message: "future_date" });
    }
    if (!isValidTimeZone(value.timezone)) {
      ctx.addIssue({ code: "custom", path: ["timezone"], message: "invalid_timezone" });
    }
  })
  .transform((value) => ({
    ...value,
    certificationCodes: [...new Set(value.certificationCodes)],
    studyDays: [...new Set(value.studyDays)].sort((a, b) => a - b),
    careerGoal: value.careerGoal ? [value.careerGoal, value.goalDetail].filter(Boolean).join(": ") : value.goalDetail || null,
    targetExamDate: value.targetExamDate || null,
    dailyGoalMinutes: value.dailyGoalMinutes ?? Math.min(120, Math.max(10, value.sessionMinutes)),
  }));

export type OnboardingInput = z.input<typeof onboardingInputSchema>;
export type ValidOnboardingInput = z.output<typeof onboardingInputSchema>;

export function parseOnboardingFormData(formData: FormData): OnboardingInput {
  return {
    certificationCodes: formData.getAll("certificationCodes").map(String),
    careerGoal: (formData.get("careerGoal") as OnboardingInput["careerGoal"]) || undefined,
    goalDetail: String(formData.get("goalDetail") ?? ""),
    experienceLevel: String(formData.get("experienceLevel") || "NEW_TO_TECH") as OnboardingInput["experienceLevel"],
    targetExamDate: String(formData.get("targetExamDate") ?? ""),
    studyDays: formData.getAll("studyDays").map(Number),
    sessionMinutes: Number(formData.get("sessionMinutes") || 30),
    learningStyle: String(formData.get("learningStyle") || "READING") as OnboardingInput["learningStyle"],
    locale: String(formData.get("locale") || "en") as OnboardingInput["locale"],
    timezone: String(formData.get("timezone") || "UTC"),
    dailyGoalMinutes: Number(formData.get("dailyGoalMinutes") || formData.get("sessionMinutes") || 30),
  };
}

export function defaultTargetExamDate(timeZone: string, now = new Date()): string {
  return addDaysISO(todayISO(timeZone, now), 42);
}

