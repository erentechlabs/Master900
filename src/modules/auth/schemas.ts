import { z } from "zod";

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "1234567890",
  "12345678910",
  "qwertyuiop",
  "qwerty123",
  "iloveyou1",
  "letmein123",
  "welcome123",
  "admin12345",
  "abc1234567",
]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export const passwordSchema = z
  .string()
  .min(10, "password_too_short")
  .max(128, "password_too_long")
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), "password_needs_letter_and_digit")
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), "password_too_common");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const signUpSchema = z
  .object({
    name: z.string().trim().max(80).optional().or(z.literal("")),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    locale: z.enum(["en", "tr"]).default("en"),
    acceptTerms: z.literal("on", { message: "terms_required" }),
  })
  .refine((v) => v.password === v.confirmPassword, { message: "passwords_do_not_match", path: ["confirmPassword"] });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: "passwords_do_not_match", path: ["confirmPassword"] });
