/** iCalendar (RFC 5545) export for study sessions. */

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM local (floating) time */
  startTime: string;
  durationMinutes: number;
  url?: string;
};

export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets (RFC 5545 section 3.1). */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (encoder.encode(current + ch).length > limit) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  if (current) parts.push(current);
  return parts.map((p, i) => (i === 0 ? p : ` ${p}`)).join("\r\n");
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(events: IcsEvent[], options: { calendarName: string; now?: Date }): string {
  const dtstamp = stamp(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fundamentals Academy//Study Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
  ];
  for (const e of events) {
    const [hh = "18", mm = "00"] = /^\d{2}:\d{2}$/.test(e.startTime) ? e.startTime.split(":") : ["18", "00"];
    const start = `${e.date.replace(/-/g, "")}T${hh}${mm}00`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(e.uid)}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${start}`,
      `DURATION:PT${Math.max(5, Math.round(e.durationMinutes))}M`,
      `SUMMARY:${escapeIcsText(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT15M", `DESCRIPTION:${escapeIcsText(e.title)}`, "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
