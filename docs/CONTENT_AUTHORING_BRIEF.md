# Content authoring brief (shared by all content agents)

You are writing ORIGINAL demonstration learning content for "Microsoft Fundamentals Academy", an independent
learning platform that is NOT affiliated with Microsoft. The content is loaded into the app from JSON files.

## Environment
- Windows, PowerShell. Project root: `C:\Projects\Master900`
- Node.js is portable. Prefix every PowerShell command that uses node/npx with:
  `$env:Path = "$env:LOCALAPPDATA\Programs\node-portable\node-v24.21.0-win-x64;$env:Path"; Set-Location C:\Projects\Master900;`
- Python 3.12 is on PATH as `python`. RECOMMENDED: author content as Python dicts in a scratch script and write the
  JSON with `json.dump(data, f, ensure_ascii=False, indent=2)` so escaping is always valid. Keep scratch scripts under
  `%TEMP%\mfa-content-<your-agent-name>\` and delete them when done.
- Do NOT run npm install, do NOT modify any file other than the file(s) assigned to you, do NOT edit course.json.

## Format (read these first)
1. `C:\Projects\Master900\src\modules\content\package-schema.ts` - the Zod schema (source of truth).
2. `C:\Projects\Master900\tests\fixtures\course-example\` - a complete, valid example of every field and every
   question type (`modules-example-domain.json`, `practice-questions.json`, `glossary.json`).
3. The course header for your certification: `prisma\seed-data\courses\<code>\course.json` (domain keys and objective
   codes you must use).

## Validation (mandatory, repeat until 0 errors and 0 warnings)
`npx tsx scripts/validate-content.ts prisma/seed-data/courses/<code> --only <your-file-name>.json`
The command prints counts by domain and by question type - use them to check the required mix.

## Legal and integrity rules (strict)
- Everything must be ORIGINAL and written in your own words. Never copy or closely paraphrase real Microsoft exam
  questions, official practice assessments, exam dumps, or third-party practice tests.
- Never claim or imply that a question comes from a real exam. Do not write "this is on the exam".
- Do not copy large parts of Microsoft Learn. Summarize concepts in your own words and cite the page.
- Use fictional organizations only (Contoso, Fabrikam, Northwind Traders, Tailwind Traders, Adventure Works,
  Woodgrove Bank, Litware, Proseware, Wide World Importers, Alpine Ski House, Relecloud). Fictional people: use
  first names only (e.g., "Alex", "Priya", "Mehmet"), never real public figures.

## Accuracy rules (strict)
- Use current Microsoft terminology (e.g., Microsoft Entra ID, not Azure Active Directory; Microsoft Defender for
  Cloud; Microsoft Purview; Microsoft Foundry).
- Verify any fact you are not completely sure about against learn.microsoft.com using your web tools.
- Do NOT include prices, SLA percentages, quotas, limits, region counts, or dates. They change and are out of scope.
- Never invent exam objectives, passing scores or certification facts.
- If a lesson describes product details that may change quickly (portal names, preview features), set
  `"needsVerification": true` and add a short `"verificationNote"` explaining what to re-check. Questions can set
  `"needsVerification": true` as well.
- Every lesson and every question cites 1-3 sources. Use only https URLs on learn.microsoft.com (preferred) or
  azure.microsoft.com. VERIFY that every distinct URL you use resolves (web_fetch it once); reuse a small, verified
  set of URLs rather than guessing new ones.

## Lesson rules
- Beginner-friendly, focused (do not overload): roughly 500-900 words across all sections. Markdown allowed (bold,
  italics, bullet lists, short tables, inline code). No raw HTML, no images, no VIDEO blocks.
- Every lesson has ALL required fields: slug, title, objectiveCode, estimatedMinutes (8-15), summary,
  learningObjectives (2-4), explanation, terminology (3-6 terms), businessScenario, technicalExample,
  misconception {myth, reality}, examTakeaway, recap, simplerExplanation (plain-language, analogy welcome),
  anotherExample, extraBlocks (1-2 of COMPARISON / DIAGRAM / ACTIVITY / CALLOUT), flashcards (3-6), sources,
  knowledgeCheck (exactly 5 questions).
- DIAGRAM blocks must include a meaningful `caption` (text alternative for screen readers).
- Every lesson is written for its own topic: never reuse the same analogy, example, misconception, takeaway, extra
  block, flashcard or knowledge-check stem across lessons, and write 2–4 specific learning objectives that start with
  an action verb and name the concepts taught (never "Explain <lesson title> in practical language"). Make every stem
  self-contained, also for case studies and fill-in-the-blank ("Complete the sentence about how Azure Cosmos DB
  partitions data."). `content:validate` reports copied text and templated objectives as `quality` warnings — keep
  them at zero.

## Question rules
- Test understanding: scenarios, comparisons, choosing the right service, responsibilities, governance, security,
  cost reasoning, use cases. Avoid pure product-name memorization and trivia.
- Plausible distractors. EVERY option (or item/statement/pair/blank/field) has an explanation of why it is correct
  or why it is wrong. `explanation` on the question explains why the correct answer is correct.
- No "All of the above" / "None of the above". Avoid negative stems; if unavoidable, bold the word (**NOT**).
- Difficulty mix roughly 30% EASY, 50% MEDIUM, 20% HARD.
- MULTIPLE_RESPONSE: say how many to choose in the stem ("Which **two** ...") and set `selectCount`.
- TRUE_FALSE: options with keys "TRUE" and "FALSE" (texts "True"/"False"). Each option explanation names the fact
  that makes the statement true or false — never a generic "This statement is accurate." (`content:validate` warns
  when a True/False rationale repeats across questions). The statement must be fully true or clearly false.
- FILL_IN_BLANK: always provide a `wordBank` (3-6 words) that contains an accepted answer. The stem and the rest of
  the template must not contain the answer ("Complete the sentence about Parquet ..." gives Parquet away).
- ORDERING: exactly one defensible order — each step needs the result of the previous one (create the resource group,
  then deploy into it). Process steps that teams sequence differently belong in a SINGLE_CHOICE question instead.
- CASE_STUDY: a short fictional `scenario` + 2-4 Yes/No statements.
- SCENARIO: requires `scenario` (context) + `stem` (the question) + options.
- COMMAND_SELECTION: options are commands or configuration snippets in backticks. Commands must be real, valid
  syntax verified on Learn (Azure CLI `az ...`, Azure PowerShell, etc.). Configuration snippets are fine.
- UI_SIMULATION: describe a FICTIONAL simplified settings screen; the title must include "(simulated)"; never claim it
  is the real portal.
- `ref` values must be unique and follow the prefix given in your assignment (e.g., az900-cc-001, az900-cc-002, ...).
- Questions are exam-style: scenarios describe real-world situations and never refer to this app's labs or folders.
- No two questions may reuse the same stem, explanation or item skeleton with only the topic swapped;
  `content:validate` reports such near-duplicates as `quality` warnings.
- `domainKey` must equal your domain; `objectiveCode` must be one of the domain's objective codes; knowledge-check
  questions should set `lessonSlug` to their lesson's slug (practice questions: only use slugs from the lesson plan
  given in your assignment).

## Turkish translations (only when your assignment asks for them)
- Natural, accurate Turkish (not word-for-word). Keep product and service names in English (Azure, Microsoft Entra ID,
  Microsoft Foundry ...). Always set `"status": "DRAFT"` (they still need human review).
- Lesson translation (`translations.tr`) must include: title, summary, learningObjectives, explanation, terminology,
  businessScenario, technicalExample, misconception, examTakeaway, recap, simplerExplanation, anotherExample,
  extraBlocks (same length and order as extraBlocks; each item is the translated `data` object with the same keys),
  flashcards (same length and order).
- Question translation (`translations.tr`) must include stem, scenario (if any), explanation and the type-specific
  maps (options / matching / ordering / categorization / fillInBlank incl. Turkish `accepted` answers and `wordBank` /
  caseStudy / uiSimulation) - see the fixture for the shape.

## Finish
When validation passes with 0 errors and 0 warnings, reply with: file path(s), lesson count, question count by type,
number of translated lessons/questions, and a list of anything flagged `needsVerification`.
