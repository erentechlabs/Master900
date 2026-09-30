export type HighlightSegment = { text: string; match: boolean };

export function clampSearchQuery(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 100);
}

export function buildSnippet(text: string, query: string, radius = 80): string {
  const source = text.replace(/\s+/g, " ").trim();
  if (!query) return source.slice(0, radius * 2);
  const index = source.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return source.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(source.length, index + query.length + radius);
  return `${start > 0 ? "…" : ""}${source.slice(start, end)}${end < source.length ? "…" : ""}`;
}

export function highlightSegments(text: string, query: string): HighlightSegment[] {
  if (!query) return [{ text, match: false }];
  const lower = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = lower.indexOf(needle, cursor);
    if (index === -1) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (index > cursor) segments.push({ text: text.slice(cursor, index), match: false });
    segments.push({ text: text.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
  }
  return segments.filter((segment) => segment.text.length > 0);
}
