"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./config";
import { createFormatters, type Formatters } from "./format";
import type { Messages } from "./messages/en";
import { createTranslator, type TFunction } from "./translator";

type I18nContextValue = { locale: Locale; t: TFunction; fmt: Formatters; messages: Messages };

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(
    () => ({ locale, messages, t: createTranslator(messages), fmt: createFormatters(locale) }),
    [locale, messages],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
