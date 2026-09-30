# Course package format

Learning content is authored as **course packages**: a folder of JSON files per certification. Packages are loaded
by the seed (`prisma/seed-data/courses/<code>/`), validated by `npm run content:validate`, and can be imported and
exported through **Admin → Import / export** (imports always land as drafts and support a dry run).

The Zod schema in [`src/modules/content/package-schema.ts`](../src/modules/content/package-schema.ts) is the source of
truth. A complete example of every field and question type lives in
[`tests/fixtures/course-example/`](../tests/fixtures/course-example/). Authors should also read the
[content authoring brief](CONTENT_AUTHORING_BRIEF.md) (originality, accuracy and style rules).

## Folder layout

```
courses/<code>/
  course.json                 package header: certification code, version label, source locale, domains & objectives
  modules-<domainKey>.json    { "domainKey": "...", "modules": [ ... ] }   (one file per domain)
  practice-questions*.json    { "questions": [ ... ] }                     (practice pool, not tied to a lesson)
  glossary*.json              { "terms": [ ... ] }                         (glossary terms, services and concepts)
  labs.json                   { "labs": [ ... ] }                          (hands-on labs, optional)
```

Every file except `course.json` is optional.

## `course.json`

```json
{
  "schemaVersion": 1,
  "certificationCode": "AZ-900",
  "contentVersionLabel": "2026-07",
  "sourceLocale": "en",
  "isDemo": true,
  "domains": [
    {
      "key": "cloud-concepts",
      "title": "Describe cloud concepts",
      "weightMin": 25, "weightMax": 30,
      "objectives": [{ "code": "1.1", "title": "Describe cloud computing" }]
    }
  ]
}
```

Domain keys and objective codes must match the certification's skills outline configured in the catalog
(`prisma/seed-data/catalog.json` or Admin → Certifications). Weights are the published percentage ranges.

## Modules and lessons

`modules-<domainKey>.json` attaches its modules to the domain declared in `course.json` with that key. A module has
`slug`, `title`, `summary`, `lessons[]` and optional `translations.tr`.

A lesson has a unique `slug`, `title`, `objectiveCode`, `estimatedMinutes` (3–60), `summary`, `sources` (official
Microsoft Learn URLs), `knowledgeCheck` (3–8 questions, same format as practice questions) and `flashcards` (2–10
`{ front, back }`), plus these content fields (Markdown unless noted):

| Field | Purpose |
| --- | --- |
| `learningObjectives` | 2–6 learning objectives (list) |
| `explanation` | beginner-friendly core explanation |
| `terminology` | 2–12 `{ term, definition }` pairs |
| `businessScenario` | scenario with a fictional organisation |
| `technicalExample` | technical example |
| `misconception` | `{ myth, reality }` |
| `examTakeaway` | exam-oriented takeaway (never "this is on the exam") |
| `recap` | short summary |
| `simplerExplanation`, `anotherExample` | on-demand "explain it more simply" / "another example" (hidden until requested) |
| `extraBlocks` | up to 5 comparison tables, diagrams (text description required), activities, videos (transcript), callouts |
| `needsVerification`, `verificationNote` | flags content that an editor must re-check against official sources |

`translations.tr` mirrors these fields (`title`, `summary`, `learningObjectives`, …, `extraBlocks` and `flashcards`
aligned by index) and carries a review `status` (`MACHINE_DRAFT`, `DRAFT`, `IN_REVIEW`, `APPROVED`). Only approved
translations are shown without a "translation pending review" notice; missing ones fall back to English with a notice.

## Questions

Common fields: `ref` (stable id, e.g. `az900-cc-001`), `type`, `domainKey`, `objectiveCode`, `difficulty`
(`EASY`/`MEDIUM`/`HARD`), `stem` (Markdown), optional `scenario`, `explanation` (why the correct answer is correct),
`sources` (1–6), optional `lessonSlug`, `shuffleOptions`, `needsVerification` and `translations.tr`.

| Type | Type-specific fields |
| --- | --- |
| `SINGLE_CHOICE`, `SCENARIO`, `COMMAND_SELECTION` | `options[]` with `key` (`A`, `B`, …), `text`, `correct` (exactly one), `explanation` for **every** option |
| `MULTIPLE_RESPONSE` | `options[]` with 2+ correct and `selectCount` |
| `TRUE_FALSE` | `options` with keys `TRUE` / `FALSE` |
| `MATCHING` | `matching: { prompts[], answers[], pairs: { promptId: answerId }, explanations: { promptId: text } }` |
| `ORDERING` | `ordering: { items[], correctOrder: [ids], explanations? }` (shuffled for learners) |
| `CATEGORIZATION` | `categorization: { categories[], items[{ id, text, category, explanation }] }` |
| `FILL_IN_BLANK` | `fillInBlank: { template: "... {{blankId}} ...", blanks[{ id, accepted[], explanation }], wordBank? }` |
| `CASE_STUDY` | `caseStudy: { statements[{ id, text, answer: boolean, explanation }] }` (Yes/No per statement) |
| `UI_SIMULATION` | `uiSimulation: { title, description?, fields[{ id, label, control: select/radio/toggle, options?, correct, explanation }] }` — rendered as a clearly labelled *fictional* interface |

Answer keys are stored separately from the learner-facing interaction and are never sent to the browser before an
answer is submitted.

## Glossary

`{ slug, term, kind: TERM | SERVICE | CONCEPT, definition, attributes?, source?, certifications[], translations? }`.
Service `attributes` (`category`, `serviceModel`, `useCases`, `keyFeatures`, `comparesWith`) power the comparison view
and the tutor's "compare two services" mode.

## Labs

`{ slug, type, title, summary, scenario, domainKey, moduleSlug, objectiveCode, complexity, estimatedMinutes,
learningObjectives[], prerequisites[], sources[], config, steps[], finalRules[], solution, translations? }`

| Type | `config` |
| --- | --- |
| `UI_SIMULATION` | pages with components (forms, tables, actions) and an initial state; the engine applies events |
| `COMMAND_SANDBOX` | simulated CLI: prompt, welcome text, initial resources, allowed commands |
| `ARCHITECTURE` | component palette, zones/tiers, allowed connections |
| `TROUBLESHOOTING`, `BUSINESS_SCENARIO` | decision stages with evidence, options, feedback and branching |

Each step (`key`, `title`, `instruction`, `hint`, `explanation`) has validation `rules[]` — each `{ key, description,
rule, successFeedback?, failureFeedback? }` where `rule` is one of the engine's rule types (e.g. `commandUsed`,
`arrayContains`, `placedIn`, `connected`, `stageCorrect`, `equals`, `matches`, `anyOf`/`allOf`/`not`). `finalRules`
are evaluated for challenge mode and completion. Rules and the solution are server-only. Labs never connect to real
Microsoft services.

## Validation

```bash
npm run content:validate -- prisma/seed-data/courses/az-900            # whole package
npm run content:validate -- prisma/seed-data/courses/az-900 --only practice-questions.json
```

The validator reports schema errors, cross-reference problems (unknown domain keys/objective codes/slugs), semantic
issues (e.g. wrong number of correct options, missing option explanations, invalid lab rules) and prints coverage by
domain and question type.
