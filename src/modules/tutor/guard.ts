/**
 * AI tutor safeguards (pure):
 *  - detect prompt-injection attempts in learner input
 *  - sanitize input before it reaches a model
 *  - check model output for prohibited claims (real exam questions, pass guarantees)
 *
 * Content-access rules are enforced in code (retrieval only returns approved,
 * published content and never answer keys); these checks are defense in depth.
 */

const INJECTION_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|prior|above|earlier|all|your|the)\b.{0,30}\b(instructions?|rules?|prompts?|guidelines?|polic(y|ies)|guardrails?)\b/i, reason: "override_instructions" },
  { re: /\b(reveal|show|print|repeat|display|output|leak|tell me)\b.{0,40}\b(system|hidden|developer|initial|original)\s+(prompt|message|instructions?)\b/i, reason: "system_prompt_extraction" },
  { re: /\byou are (now|no longer)\b|\bpretend (to be|you are)\b|\bact as (an? )?(unfiltered|jailbroken|evil|dan)\b/i, reason: "role_hijack" },
  { re: /\b(developer|debug|god|jailbreak|dan)\s+mode\b/i, reason: "jailbreak_mode" },
  { re: /\banswer keys?\b/i, reason: "answer_key_request" },
  { re: /\b(all|every|list(\s+of)?|give me|show me|reveal|dump)\b.{0,20}\bcorrect answers\b/i, reason: "answer_key_request" },
  { re: /\b(unpublished|draft|hidden|private)\b.{0,20}\b(content|questions?|lessons?|labs?|data)\b/i, reason: "restricted_content_request" },
  { re: /\b(other|another) (users?|learners?|students?)('s)?\b.{0,40}\b(data|answers|scores|emails?|progress)\b/i, reason: "private_data_request" },
  { re: /<\/?\s*(system|assistant|developer|instructions?)\s*>|\[\s*(system|inst)\s*\]|###\s*(system|instruction)/i, reason: "delimiter_injection" },
  { re: /\b(real|actual|leaked)\s+(exam|test)\s+(questions?|dumps?)\b|\bexam dumps?\b|\bbraindumps?\b/i, reason: "exam_dump_request" },
  // Turkish
  { re: /(önceki|yukarıdaki|tüm)\s+(talimatları|kuralları|yönergeleri)\s+(yok say|görmezden gel|unut|atla)/i, reason: "override_instructions" },
  { re: /(sistem|gizli)\s+(istemini|mesajını|talimatlarını|komutunu)\s+(göster|yaz|söyle|açıkla|paylaş)/i, reason: "system_prompt_extraction" },
  { re: /cevap anahtar|(tüm|bütün)\s+doğru\s+cevaplar/i, reason: "answer_key_request" },
  { re: /(gerçek|asıl|sızdırılmış)\s+sınav\s+soru/i, reason: "exam_dump_request" },
];

export type InjectionCheck = { flagged: boolean; reasons: string[] };

export function detectPromptInjection(text: string): InjectionCheck {
  const reasons = INJECTION_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.reason);
  return { flagged: reasons.length > 0, reasons: [...new Set(reasons)] };
}

export const MAX_TUTOR_INPUT = 1500;

/** Normalize learner input: strip control characters, neutralise delimiter tokens, clamp length. */
export function sanitizeTutorInput(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<<<|>>>|```/g, "'''")
    .replace(/<\/?\s*(system|assistant|developer)\s*>/gi, "")
    .trim()
    .slice(0, MAX_TUTOR_INPUT);
}

const OUTPUT_RULES: { re: RegExp; replacement: string; reason: string }[] = [
  {
    re: /[^.\n]*\b(this|these|the following)\b[^.\n]{0,40}\b(is|are|was|were|comes?|came)\b[^.\n]{0,30}\b(from|on|in)\b[^.\n]{0,20}\b(the )?(real|actual|official)\s+(microsoft\s+)?(certification\s+)?exam\b[^.\n]*[.\n]?/gi,
    replacement: "",
    reason: "real_exam_claim",
  },
  {
    re: /[^.\n]*\b(you will|you'll|guaranteed? to|100% sure to|certain to)\b[^.\n]{0,20}\bpass\b[^.\n]*[.\n]?/gi,
    replacement: "",
    reason: "pass_guarantee",
  },
  { re: /[^.\n]*(kesinlikle geçersiniz|geçmeniz garanti)[^.\n]*[.\n]?/gi, replacement: "", reason: "pass_guarantee" },
];

export function checkTutorOutput(text: string, systemMarkers: string[] = []): { text: string; modified: boolean; reasons: string[] } {
  let out = text;
  const reasons: string[] = [];
  for (const rule of OUTPUT_RULES) {
    if (rule.re.test(out)) {
      reasons.push(rule.reason);
      out = out.replace(rule.re, rule.replacement);
    }
    rule.re.lastIndex = 0;
  }
  for (const marker of systemMarkers) {
    if (marker && out.includes(marker)) {
      reasons.push("system_prompt_leak");
      out = out.split(marker).join("[removed]");
    }
  }
  return { text: out.trim(), modified: reasons.length > 0, reasons };
}

export const TUTOR_MODES = ["explain", "simpler", "analogy", "compare", "scenario", "socratic", "mistake", "summarize", "flashcards", "next"] as const;
export type TutorMode = (typeof TUTOR_MODES)[number];
export const TUTOR_DEPTHS = ["beginner", "intermediate", "technical"] as const;
export type TutorDepth = (typeof TUTOR_DEPTHS)[number];

export function isTutorMode(v: unknown): v is TutorMode {
  return typeof v === "string" && (TUTOR_MODES as readonly string[]).includes(v);
}
