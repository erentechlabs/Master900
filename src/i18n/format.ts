import { LOCALE_TAGS, type Locale } from "./config";

export type Formatters = ReturnType<typeof createFormatters>;

export function createFormatters(locale: Locale) {
  const tag = LOCALE_TAGS[locale];
  return {
    date(value: Date | string | number, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
      return new Intl.DateTimeFormat(tag, options).format(new Date(value));
    },
    /** Format a calendar date stored as UTC midnight without shifting it into the viewer's zone. */
    calendarDate(value: Date | string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
      return new Intl.DateTimeFormat(tag, { ...options, timeZone: "UTC" }).format(new Date(value));
    },
    dateTime(value: Date | string | number) {
      return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    },
    number(value: number, options?: Intl.NumberFormatOptions) {
      return new Intl.NumberFormat(tag, options).format(value);
    },
    percent(value: number, digits = 0) {
      return new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: digits }).format(value / 100);
    },
    duration(totalSeconds: number) {
      const s = Math.max(0, Math.round(totalSeconds));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
      return `${m}:${String(sec).padStart(2, "0")}`;
    },
    relative(value: Date | string | number, now: Date = new Date()) {
      const diffSec = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
      const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
      const abs = Math.abs(diffSec);
      if (abs < 60) return rtf.format(diffSec, "second");
      if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
      if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
      if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
      if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
      return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
    },
    list(values: string[]) {
      return new Intl.ListFormat(tag, { style: "long", type: "conjunction" }).format(values);
    },
  };
}
