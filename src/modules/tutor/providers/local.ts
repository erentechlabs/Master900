/**
 * Local, deterministic tutor provider. It never calls external services: it
 * composes answers only from retrieved, approved course content and the
 * lesson/glossary context, and cites what it used. It is the default provider
 * so the platform works without any paid AI service.
 */
import { interpolate } from "@/i18n/translator";
import { GROUNDING_THRESHOLD, tokenizeForSearch, type ScoredChunk } from "../retrieval";
import type { TermInfo, TutorProvider, TutorRequest, TutorResponse } from "./types";

function words(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.split(" ");
  return parts.length <= max ? clean : `${parts.slice(0, max).join(" ")}…`;
}

/**
 * Extractive answer: the complete sentences of a chunk that overlap most with the question, kept in their
 * original order. List fragments (headings, objective bullets) are skipped when real sentences exist.
 */
export function relevantSentences(text: string, query: string, max: number): string {
  const sentences = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.split(" ").length >= 6 && /[.!?:]$/.test(s));
  if (sentences.length === 0) return words(text, 80);
  const queryTokens = new Set(tokenizeForSearch(query));
  const scored = sentences.map((s, index) => ({ s, index, score: tokenizeForSearch(s).filter((tok) => queryTokens.has(tok)).length }));
  return [...scored]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.s)
    .join(" ");
}

function termBlock(t: TermInfo, p: TutorRequest["phrases"]): string {
  const lines = [`**${t.term}**`, `- ${p.definition}: ${t.definition}`];
  if (t.category) lines.push(`- ${p.category}: ${t.category}`);
  if (t.serviceModel) lines.push(`- ${p.serviceModel}: ${t.serviceModel}`);
  if (t.useCases?.length) lines.push(`- ${p.useCases}: ${t.useCases.join("; ")}`);
  if (t.keyFeatures?.length) lines.push(`- ${p.keyFeatures}: ${t.keyFeatures.join("; ")}`);
  return lines.join("\n");
}

const FICTIONAL_COMPANIES = ["Tailwind Traders", "Northwind Traders", "Fabrikam", "Contoso", "Adventure Works", "Woodgrove Bank", "Alpine Ski House"];

export class LocalTutorProvider implements TutorProvider {
  readonly name = "local";

  async generate(req: TutorRequest): Promise<TutorResponse> {
    const p = req.phrases;
    const lesson = req.context.lesson ?? null;
    const grounded = req.chunks.filter((c) => c.score >= GROUNDING_THRESHOLD);
    const used: ScoredChunk[] = [];
    const cite = (chunk: ScoredChunk) => {
      let idx = used.findIndex((u) => u.id === chunk.id);
      if (idx === -1) {
        used.push(chunk);
        idx = used.length - 1;
      }
      return `[${idx + 1}]`;
    };
    const lessonChunk = lesson ? req.chunks.find((c) => c.lessonId === lesson.id) ?? null : null;
    const lessonCite = () => (lessonChunk ? ` ${cite(lessonChunk)}` : "");
    const done = (text: string, insufficient = false): TutorResponse => ({
      text: text.trim(),
      usedChunkIds: used.map((u) => u.id),
      insufficient,
      provider: this.name,
    });

    switch (req.mode) {
      case "simpler":
      case "analogy": {
        if (!lesson?.simpler) break;
        const intro = req.mode === "analogy" ? p.analogyIntro : p.simplerIntro;
        return done(`${intro}\n\n${lesson.simpler}${lessonCite()}${lesson.another ? `\n\n${lesson.another}` : ""}`);
      }
      case "compare": {
        const cmp = req.context.compare;
        if (!cmp) return done(p.noCompare, true);
        const sameCategory = cmp.a.category && cmp.b.category && cmp.a.category === cmp.b.category;
        const diff = interpolate(sameCategory ? p.compareSameCategory : p.compareDifference, {
          a: cmp.a.term,
          b: cmp.b.term,
          aCategory: cmp.a.category ?? cmp.a.serviceModel ?? "-",
          bCategory: cmp.b.category ?? cmp.b.serviceModel ?? "-",
        });
        for (const c of req.chunks.slice(0, 2)) cite(c);
        return done(`${interpolate(p.compareIntro, { a: cmp.a.term, b: cmp.b.term })}\n\n${termBlock(cmp.a, p)}\n\n${termBlock(cmp.b, p)}\n\n${diff}`);
      }
      case "mistake": {
        const m = req.context.mistake;
        if (!m) return done(p.noMistake, true);
        const lines = [
          p.mistakeIntro,
          "",
          `> ${words(m.stem, 60)}`,
          "",
          `**${p.mistakeYourAnswer}:** ${m.given}${m.givenExplanation ? ` - ${m.givenExplanation}` : ""}`,
          `**${p.mistakeCorrect}:** ${m.correct}`,
          "",
          m.explanation,
          "",
          interpolate(p.mistakeTip, { lesson: m.lessonTitle ?? "" }),
        ];
        return done(lines.join("\n"));
      }
      case "summarize": {
        if (!lesson) return done(p.noLesson, true);
        const lines = [`${p.summarizeIntro} **${lesson.title}**${lessonCite()}`, "", lesson.recap ?? words(lesson.explanation, 80)];
        if (lesson.objectives.length) lines.push("", `**${p.objectives}**`, ...lesson.objectives.map((o) => `- ${o}`));
        if (lesson.takeaway) lines.push("", `**${p.takeaway}:** ${lesson.takeaway}`);
        return done(lines.join("\n"));
      }
      case "flashcards": {
        if (!lesson) return done(p.noLesson, true);
        const cards = lesson.flashcards.length ? lesson.flashcards : lesson.terminology.map((t) => ({ front: t.term, back: t.definition }));
        return done([`${p.flashcardsIntro}${lessonCite()}`, "", ...cards.slice(0, 8).map((c, i) => `${i + 1}. **${c.front}** - ${c.back}`)].join("\n"));
      }
      case "socratic": {
        if (!lesson) return done(p.noLesson, true);
        const questions = lesson.objectives.slice(0, 3).map((o, i) => `${i + 1}. ${o}?`);
        return done([`${interpolate(p.socraticIntro, { lesson: lesson.title })}${lessonCite()}`, "", ...questions, "", p.socraticClosing].join("\n"));
      }
      case "scenario": {
        if (!lesson) return done(p.noLesson, true);
        const company = FICTIONAL_COMPANIES[lesson.title.length % FICTIONAL_COMPANIES.length]!;
        const base = lesson.scenario ? words(lesson.scenario, 70) : words(lesson.explanation, 50);
        const term = lesson.terminology[0]?.term ?? lesson.title;
        return done(
          [
            `${p.scenarioIntro}${lessonCite()}`,
            "",
            `_${p.scenarioDisclaimer}_`,
            "",
            `**${company}** - ${base.replace(/\b(Contoso|Fabrikam|Northwind Traders|Tailwind Traders|Adventure Works|Woodgrove Bank|Litware|Proseware)\b/g, company)}`,
            "",
            interpolate(p.scenarioQuestion, { term }),
          ].join("\n"),
        );
      }
      case "next": {
        const r = req.context.recommendation;
        if (!r) break;
        return done(`${p.nextIntro}\n\n**${r.title}** - ${r.reason}`);
      }
      default:
        break;
    }

    // explain (default): depth-aware answer grounded in retrieved chunks.
    const lessonMatchesQuery = lesson && lessonChunk && lessonChunk.score >= GROUNDING_THRESHOLD;
    if (lesson && (lessonMatchesQuery || !req.message.trim())) {
      if (req.depth === "beginner" && lesson.simpler) {
        return done(`${p.simplerIntro}\n\n${lesson.simpler}${lessonCite()}\n\n**${p.takeaway}:** ${lesson.takeaway ?? ""}`);
      }
      if (req.depth === "technical" && lesson.technical) {
        const terms = lesson.terminology.slice(0, 4).map((t) => `- **${t.term}**: ${t.definition}`);
        return done(`${p.technicalIntro}\n\n${lesson.technical}${lessonCite()}\n\n**${p.keyTerms}**\n${terms.join("\n")}`);
      }
      const misconception = lesson.misconception ? `\n\n**${p.misconception}:** ${lesson.misconception.reality}` : "";
      return done(`${p.groundedIntro}\n\n${words(lesson.explanation, 170)}${lessonCite()}${misconception}`);
    }

    if (grounded.length === 0) return done(p.insufficient, true);
    const parts = grounded
      .slice(0, req.depth === "beginner" ? 1 : 2)
      .map((c) => `**${c.title}** - ${relevantSentences(c.text, req.message, req.depth === "technical" ? 5 : 3)} ${cite(c)}`);
    return done(`${p.groundedIntro}\n\n${parts.join("\n\n")}`);
  }
}
