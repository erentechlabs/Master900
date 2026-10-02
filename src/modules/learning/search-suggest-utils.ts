export type SuggestionInput = { id: string; title: string; href: string; group: string; keywords?: string[] };

export function scoreSuggestion(query: string, item: SuggestionInput): number {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return 1;
  const title = item.title.toLocaleLowerCase();
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 50;
  if ((item.keywords ?? []).some((keyword) => keyword.toLocaleLowerCase().startsWith(q))) return 35;
  if ((item.keywords ?? []).some((keyword) => keyword.toLocaleLowerCase().includes(q))) return 20;
  return 0;
}

export function rankSuggestions<T extends SuggestionInput>(query: string, items: T[], limit = 8): T[] {
  return items
    .map((item, index) => ({ item, index, score: scoreSuggestion(query, item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}
