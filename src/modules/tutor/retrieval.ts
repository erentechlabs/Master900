/** Lightweight BM25 retrieval over approved course content (pure). */

export type Chunk = {
  id: string;
  title: string;
  text: string;
  /** Internal link (lesson) or official documentation URL */
  url: string;
  kind: "lesson" | "glossary" | "source";
  certificationCode?: string;
  lessonId?: string;
};

export type ScoredChunk = Chunk & { score: number };

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could do does for from has have how i if in into is it its me my no not of on or our " +
    "so than that the their them then there these they this to too us was we what when where which who why will with you your " +
    "about explain tell please give show describe difference between vs versus compare example simple simply more " +
    "bir ve ile için bu şu o da de mi mı mu mü ne nedir nasıl neden gibi daha çok az ama veya ya ise olan olarak her hangi " +
    "açıkla anlat lütfen fark arasındaki örnek basit karşılaştır"
  ).split(/\s+/),
);

export function tokenizeForSearch(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[İIı]/g, "i")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

export type SearchIndex = {
  docs: { chunk: Chunk; tf: Map<string, number>; length: number }[];
  df: Map<string, number>;
  avgLength: number;
};

export function buildIndex(chunks: Chunk[]): SearchIndex {
  const df = new Map<string, number>();
  const docs = chunks.map((chunk) => {
    const tokens = tokenizeForSearch(`${chunk.title} ${chunk.title} ${chunk.text}`);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return { chunk, tf, length: tokens.length };
  });
  const avgLength = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length);
  return { docs, df, avgLength };
}

export function searchIndex(
  index: SearchIndex,
  query: string,
  options: { k?: number; certificationCode?: string | null; boostLessonId?: string | null } = {},
): ScoredChunk[] {
  const terms = [...new Set(tokenizeForSearch(query))];
  if (terms.length === 0) return [];
  const N = index.docs.length;
  const k1 = 1.4;
  const b = 0.75;
  const results: ScoredChunk[] = [];
  for (const doc of index.docs) {
    if (options.certificationCode && doc.chunk.certificationCode && doc.chunk.certificationCode !== options.certificationCode) continue;
    let score = 0;
    for (const term of terms) {
      const f = doc.tf.get(term);
      if (!f) continue;
      const n = index.df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.length) / (index.avgLength || 1))));
    }
    if (score > 0 && options.boostLessonId && doc.chunk.lessonId === options.boostLessonId) score *= 1.5;
    if (score > 0) results.push({ ...doc.chunk, score });
  }
  return results.sort((a, b2) => b2.score - a.score).slice(0, options.k ?? 4);
}

/** Minimum BM25 score considered "sufficiently grounded". */
export const GROUNDING_THRESHOLD = 1.2;
