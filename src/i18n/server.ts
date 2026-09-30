import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/modules/auth/session";
import { isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "./config";
import { createFormatters } from "./format";
import { getMessages } from "./messages";
import { createTranslator } from "./translator";

export const getLocale = cache(async (): Promise<Locale> => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;
  const user = await getCurrentUser();
  if (user && isLocale(user.locale)) return user.locale;
  return matchLocale((await headers()).get("accept-language"));
});

export const getI18n = cache(async () => {
  const locale = await getLocale();
  const messages = getMessages(locale);
  return { locale, messages, t: createTranslator(messages), fmt: createFormatters(locale) };
});
