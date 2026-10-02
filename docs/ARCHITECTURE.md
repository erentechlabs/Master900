# Architecture — Microsoft Fundamentals Academy

> Independent learning and exam-practice platform for Microsoft foundational certifications.
> Not affiliated with, endorsed by or sponsored by Microsoft. All practice content is original.

This document covers the requirements analysis, the architecture, the data model, the information architecture
(page map), the key runtime flows, security/privacy highlights, the MVP boundary and the phased plan.
Related documents: [SECURITY.md](SECURITY.md), [CONTENT_FORMAT.md](CONTENT_FORMAT.md),
[CONTENT_AUTHORING_BRIEF.md](CONTENT_AUTHORING_BRIEF.md) and the top-level [README](../README.md).

---

## 1. Requirements analysis

### 1.1 Product principles (non-negotiable)

| Principle | How it is enforced |
| --- | --- |
| **Independence & honesty** | Global footer disclaimer and trademark notice; certificates are labelled "course completion record, not a Microsoft certification". |
| **Original content only** | Content brief + review workflow; question bank carries author type (`HUMAN`, `AI_ASSISTED`, `AI_GENERATED`, `SEED_DEMO`, `IMPORTED`); AI drafts always enter as `DRAFT` and need human review. |
| **Current, data-driven catalog** | Certifications, domains, weights, objectives, sources and relations live in the database (`catalog.json` seed + admin CMS). Status (`ACTIVE`, `ANNOUNCED`, `RETIRING`, `RETIRED`) and replacement relations (e.g. AI-900 → AI-901) drive UI banners. Curriculum changes create `CurriculumAlert`s and mark affected content `OUTDATED`. |
| **No pass guarantees** | Readiness is an explicit *estimate* with a disclaimer everywhere it is shown; practice target is an internal goal, not an official passing score; the tutor output filter removes guarantee/“real exam” claims. |
| **Grounded AI** | The tutor only answers from approved, learner-visible content (BM25 retrieval + citations) and refuses when grounding is insufficient. |

### 1.2 Functional requirements (by area)

* **Catalog** — list/detail of certifications with status, exam version, skills-outline domains & weights, official
  sources, last curriculum review, retired → replacement guidance, comparison of certifications.
* **Learning** — learning paths (domain → module → lesson), rich lesson blocks (objectives, explanation, terminology,
  business scenario, technical example, misconception, exam takeaway, recap, on-demand "simpler" and "another example",
  comparison, diagram, activity, video, callout), knowledge checks, notes, bookmarks, glossary, concept map, flashcards
  (spaced repetition), global search, translation fallback notices, outdated/verification banners.
* **Assessment** — 11 question types (single choice, multiple response, true/false, matching, ordering, categorization,
  fill-in-the-blank, case study, scenario, command selection, UI simulation); knowledge checks, domain assessments,
  diagnostic; practice modes: quick, domain, full timed exam, adaptive, daily challenge, mistake review
  (with explain-first) and **lightning round** (10 quick questions, 120-second server deadline, instant feedback, combo
  multiplier x2/x3, time bonus, personal best per certification); immediate-feedback vs exam mode; mark for review;
  final review screen; timer with accessible announcements; keyboard shortcuts; exam-style restrictions; results with
  domain breakdown, review, similar questions, review queue and celebrations for targets and personal bests.
* **Labs** — sandboxed simulations only, presented as a simulated **lab VM** (desktop, taskbar, browser and terminal
  apps): portal look-alike labs (Azure portal, Microsoft Entra, Purview, Defender, Microsoft 365 / SharePoint admin
  centers, Power Apps / Automate / Copilot Studio / Power Platform admin, Power BI, Fabric, Microsoft Foundry, GitHub)
  with Cloud Shell / VM terminals, SQL query editors and chat test panes; command sandbox (simulated Azure CLI);
  architecture design; troubleshooting; business scenario (decision stages); guided vs challenge mode, hints, solution
  reveal, server-side validation by replaying an event log. Labs are framed as **missions**: a briefing (scenario,
  objectives, product, time, mode), "step complete" feedback, a completion dialog with 0–3 stars (3 = no hints and no
  solution), time, XP, "What you learned" (each step's explanation) and the next lab; the catalog shows stars, progress
  and a "continue where you left off" row.
* **Personalization & motivation** — onboarding wizard, diagnostic → strengths/focus areas → study plan; dashboard
  with next best action, level/XP bar, streak, daily-goal ring and "jump back in"; **daily quests** (three per local
  day, balanced learn/practice/hands-on, claimable XP and an all-quests bonus); **focus sessions** (Windows Clock style
  timer in the title bar); readiness score (7 weighted signals with caps); study planner with calendar export (ICS),
  missed-session detection and automatic adjustment; review queue (SM-2 style SRS); gamification (XP, levels, badges
  with an achievements gallery showing locked badges and progress, streaks, level-up moments — optional); progress
  analytics; **Windows personalization** (theme, accent colour, transparency effects, animation effects).
* **AI tutor** — modes (explain, simpler, analogy, compare, scenario, Socratic quiz, explain my mistake, summarize,
  flashcards, what next), depth levels, lesson/question context, citations, prompt-injection defence, daily limits,
  provider abstraction (local grounded provider by default; OpenAI-compatible optional).
* **CMS / admin** — certification CRUD with curriculum sync, content tree, lesson editor with revisions/diff/rollback,
  question bank + editor + AI draft generation, lab builder, editorial workflow with review queue and scheduling,
  media uploads, audit log, background jobs, settings, import/export, anonymous cohort analytics.
* **Local profile** — one auto-provisioned learner/admin profile, preferences, language & timezone, privacy toggle, data export and learning-progress reset.

### 1.3 Non-functional requirements

| Area | Target / approach |
| --- | --- |
| Security | OWASP ASVS L2-inspired controls — see [SECURITY.md](SECURITY.md). |
| Privacy | Data minimisation, self-service export & deletion, anonymous aggregate analytics with minimum cohort size. |
| Accessibility | WCAG 2.2 AA: semantic landmarks, one `h1` per page, labelled controls, keyboard-only operation for every interaction (no drag-only UI), live regions, visible focus, reduced motion, text alternatives for charts, no colour-only signals. |
| Internationalisation | English + Turkish UI (typed message keys, parity test); content translations per lesson/question/glossary with review status and fallback notices; locale-aware dates/numbers. |
| Performance | Server components by default, small client islands, parallel queries, indexed access paths; pages render in tens of milliseconds on the seed dataset (measured ~50 ms on the standalone server). |
| Reliability | Idempotent submissions (`updateMany where status = IN_PROGRESS`), server-authoritative timers with grace period, replay-based lab state, DB-backed job queue with retries. |
| Maintainability | Modular monolith, pure/tested engines, zod validation at every boundary, strict TypeScript, ESLint (React compiler rules). |
| Operability | Health endpoint, structured JSON logs, Docker images, migrations, seed, smoke & integration scripts. |

### 1.4 Verified catalog facts (as seeded, September 2026)

The seed reflects the official Microsoft Learn pages at build time; admins keep it current through the CMS.

| Code | Status | Notes |
| --- | --- | --- |
| AZ-900 | Active | Skills measured as of July 20, 2026 — 3 domains. **Full demo learning path.** |
| AI-901 | Active | Replaces AI-900; skills measured as of April 15, 2026 — 2 domains. **Full demo learning path.** |
| AI-900 | Retired (June 30, 2026) | `replacementCode` → AI-901; banner redirects learners. |
| DP-900, SC-900, PL-900, AB-900, GH-900 | Active | Catalog entries (paths "coming soon"). |
| MS-900 | Retired (March 31, 2026) | Catalog entry with retirement banner. |
| MB-910, MB-920 | Retired (December 31, 2025) | Catalog entries with retirement banners. |

---

## 2. Architecture

### 2.1 Style and stack

A **modular monolith** on the Next.js App Router. Business logic lives in framework-agnostic modules; the web layer
(pages, server actions, route handlers) is thin.

| Layer | Technology |
| --- | --- |
| UI | Next.js 16 (App Router, React 19 Server Components), Tailwind CSS 3, Radix primitives, lucide icons |
| Server | Server Actions + Route Handlers, local single-user profile provisioning |
| Domain | TypeScript modules in `src/modules/*` (pure engines + DB services), zod 4 validation |
| Data | PostgreSQL 17 via Prisma 6 (migrations in `prisma/migrations`) |
| Jobs | DB-backed queue (`Job` table) processed by `scripts/worker.ts` |
| Storage | `ObjectStorage` interface, local-disk driver (S3-compatible drivers can be added) |
| AI | `TutorProvider` interface: local grounded provider (default) and OpenAI-compatible provider |
| Tests | Vitest unit tests, service-level integration flows, HTTP smoke test |

```
Browser ──► App Router pages (RSC)  ──► src/modules/* services ──► Prisma ──► PostgreSQL
        ──► Server Actions (runAction: authorize → rate limit → zod → service → ActionResult)
        ──► Route Handlers (/api/*: health, tutor, ICS, export, media, admin import/export)
Worker  ──► src/lib/jobs (queue + handlers) ──► Prisma
```

### 2.2 Source layout

```
src/
  app/                    Routes (marketing, learner app, admin, api) — thin: load data, render, call services
  components/             UI kit (ui/*), layout shell, feature components (assessment, labs, learning, tutor, …)
  i18n/                   Locale negotiation, typed translator, formatters, messages (en/*, tr/*)
  lib/                    db, env (lazy zod validation), logger, rate limit, actions helper, dates, storage, jobs
  modules/
    auth/                 permissions (RBAC), local-user provisioning, session helpers
    catalog/              catalog queries, certification config sync + curriculum change detection
    content/              package schema/loader/importer/exporter, editorial workflow, blocks, diff
    assessment/           engine/ (types, scoring, projection, exam builder, adaptive, results, response) + services
    labs/                 engine/ (ui-simulation, command-sandbox, architecture, decision, rules) + service/projection
    learning/             path, lesson, bookmarks, notes, flashcards, glossary, concepts, search, onboarding, SRS, …
    planner/              generator (pure), service, ICS, actions, grouping
    analytics/            readiness (pure), gamification, recommendations, data loaders, dashboard
    tutor/                guard, retrieval (BM25), providers, context builder, service
    admin/                settings, audit, CMS services, AI drafts, workflow actions
    account/              data export serializer
prisma/                   schema, migrations, seed (+ seed-data content packages)
scripts/                  dev-db (embedded PostgreSQL), worker, content validation, smoke & integration tests
tests/                    Vitest suites
```

### 2.3 Key design decisions

1. **Pure engines, thin services.** Scoring, answer projection, exam building, adaptive selection, readiness, SRS,
   planning, lab simulations, retrieval and guards are pure functions with unit tests. Services add persistence and
   authorization.
2. **Server-authoritative assessments.** The client receives a *projection* of each question without answer keys
   (tested). Answers are scored on the server; attempts snapshot the question version and option order
   (`items` JSON) so later edits never change past results.
3. **Replay-based labs.** Labs store an event log; every action is validated with zod, appended, and the state is
   rebuilt by replaying the log through the engine, so the client can never forge progress. Portal labs are pure data
   (pages, components, actions, templates, terminal commands, SQL tables, chat responses — see
   [LAB_AUTHORING.md](LAB_AUTHORING.md)); the same deterministic reducer runs in the browser (optimistic updates) and
   on the server (authoritative state).
4. **Local profile checks.** `getCurrentUser()` ensures the single local profile exists and loads its roles/preferences for every request.
5. **Content lifecycle.** `DRAFT → TECHNICAL_REVIEW → EDITORIAL_REVIEW → APPROVED → PUBLISHED` (or scheduled via
   `publishAt`), plus `OUTDATED` and `ARCHIVED`. Learners only ever see `learnerVisibleWhere()` content.
6. **Typed i18n.** Message keys are type-checked; Turkish files are typed as complete dictionaries; a test enforces
   parity and placeholder consistency.
7. **Graceful AI.** The platform is fully functional without any external AI service. External providers are opt-in,
   use keys from the environment only, and fall back to the local provider on failure.
8. **Windows 11 / WinUI design system.** The UI follows Fluent (WinUI 3): a title bar and a `NavigationView`-style pane
   (expanded or compact; the choice is kept in a cookie, the lab page opens compact) on a Mica-like base, a content
   layer with a rounded top-left corner, Segoe UI Variable type ramp (Caption 12 · Body 14 · Subtitle 20 · Title 28),
   4px control / 8px overlay corners, standard buttons with an elevation stroke, text boxes with the accent focus
   underline, acrylic menus and flyouts, InfoBars, SelectorBar tabs and ToggleSwitches. Tokens (layer, card, control,
   stroke, tint and shadow colours for light and dark) live in `globals.css` and `tailwind.config.ts`; the UI kit in
   `src/components/ui` maps them to controls. There is no account avatar or user menu: profile, preferences and
   privacy live under **Settings**, pinned at the bottom of the pane. Contrast is checked with axe (WCAG 2.2 AA).
    Personalization mirrors Windows Settings: the accent colour is applied server-side as `data-accent` on `<html>`
    (palettes with contrast-tested light/dark values), transparency effects toggle Mica/acrylic (`html.no-transparency`
    makes every surface solid) and animation effects map to the reduced-motion preference. Mica/acrylic blur lives on a
    `::before` layer so flyouts inside the title bar are never nested in a backdrop-filter root. The title bar holds an
    AutoSuggestBox (`GET /api/search/suggest`), the focus-session timer, keyboard shortcuts (Ctrl+K, `/`, `?`, Ctrl+B)
    and InfoBadges on navigation items. Pages enter with a short Fluent animation; celebrations (`celebrate()`) are
    decorative, always paired with a text announcement and skipped when reduced motion is requested.
9. **Rewards are events.** Quests, focus sessions, lightning rounds and labs only record `LearningEvent`s with a small
    metadata contract (`QUEST_COMPLETED {questKey, date}`, `FOCUS_SESSION_COMPLETED {minutes}` without study duration,
    `PRACTICE_COMPLETED {mode, correct, total, bestCombo, score}`, `LAB_COMPLETED {stars, mode, attemptId}`); XP, quest
    progress, achievements and badge criteria are derived from those events by pure functions, so each reward is
    idempotent and recomputable.
10. **Content quality gates.** Besides schema and reference checks, `content:validate` warns when lesson text is copied
    between lessons or objectives paste the lesson title into a template (`src/modules/content/quality.ts`), and a test
    keeps the seeded packages at zero warnings. Certification outlines are compared in a normalized form because
    `jsonb` does not preserve key order (otherwise every re-seed would raise a false "outline changed" alert).

---

## 3. Data model

~57 Prisma models (see `prisma/schema.prisma`). Grouped overview:

| Group | Models | Notes |
| --- | --- | --- |
| Identity & access | `User`, `Role`, `UserRole`, `UserPreference` | optional legacy password hash, `sessionVersion`, status, locale, timezone, study preferences, gamification & privacy flags, personalization (`accentColor`, `transparencyEffects`, `reducedMotion`) |
| Catalog & curriculum | `Certification`, `CertificationRelation`, `CertificationVersion`, `CurriculumAlert`, `ExamDomain`, `ExamObjective`, `OfficialSource` | weights, exam version, retirement/replacement, change history |
| Learning content | `Module`, `Lesson`, `ContentBlock`, `LessonTranslation`, `LessonSource`, `Flashcard`, `GlossaryTerm`, `GlossaryTermCertification`, `Concept`, `ConceptLink` | status + `publishAt`, translations with review status, curriculum version |
| Questions | `Question`, `QuestionOption`, `QuestionVersion`, `QuestionTranslation`, `QuestionSource` | public `interaction` vs secret `answerKey`, statistics (served/answered/correct/time) |
| Assessment | `Quiz`, `QuizQuestion`, `QuizAttempt`, `PracticeExam`, `PracticeExamAttempt`, `QuestionAttempt`, `ReviewQueueItem` | attempt `items` snapshot, domain breakdown, SRS fields |
| Labs | `Lab`, `LabStep`, `LabValidationRule`, `LabSource`, `LabAttempt` | validated JSON config, event log, hints, solution flag, score |
| Progress & planning | `Enrollment`, `LessonProgress`, `StudyPlan`, `StudySession`, `ReadinessSnapshot`, `LearningEvent`, `Badge`, `UserBadge`, `Bookmark`, `Note` | diagnostic result on enrollment, adjustment log on plan; event types include `QUEST_COMPLETED` and `FOCUS_SESSION_COMPLETED`; practice modes include `LIGHTNING` |
| Tutor | `TutorConversation`, `TutorMessage` | citations, flagged, provider |
| CMS & operations | `ContentReview`, `ContentRevision`, `AuditLog`, `AppSetting`, `Job`, `MediaAsset` | review decisions, snapshots for diff/rollback, IP hash + user agent in audit |

Important conventions:
* IDs are `cuid()`; human-readable `code`/`slug` fields are unique per certification.
* Calendar dates (plan sessions, target exam date) are stored as UTC midnight and displayed with `fmt.calendarDate`.
* Translations: small entities use a `translations` JSON (`{ tr: { title } }`); lessons and questions have dedicated
  translation tables with a `status` so unreviewed translations are labelled.
* Learning-progress reset deletes personal learning data but preserves the single user row so audit logs and authored content keep stable references.

---

## 4. Information architecture (page map)

**Public (marketing layout):** `/` landing · `/certifications` catalog · `/certifications/[code]` detail ·
`/glossary` · `/compare` · `/concepts` · `/forbidden` · 404. `/sign-in` and `/sign-up` are not defined.

**Learner (app shell, local profile):**

| Route | Purpose |
| --- | --- |
| `/onboarding` | 4-step wizard → enrollments, preferences → diagnostic |
| `/dashboard` | greeting, level/XP, streak, daily-goal ring, next best action, jump back in, daily quests, readiness, today's sessions, recommended labs, reviews due, achievements, alerts |
| `/learn`, `/learn/[code]`, `/learn/[code]/[lessonSlug]` | my paths, path view with mastery, lesson page |
| `/practice` | practice hub (lightning round, quick, domain, full, adaptive, daily, mistakes) + history |
| `/practice/[attemptId]`, `/quiz/[attemptId]` | assessment runner |
| `/practice/[attemptId]/results`, `/quiz/[attemptId]/results` | results & review |
| `/practice/mistakes` | mistake review with filters |
| `/diagnostic/[code]`, `/diagnostic/[code]/results` | diagnostic intro & results (plan + initial readiness) |
| `/labs`, `/labs/[labId]` | lab catalog (stats, stars, certification pills, continue row) & mission players |
| `/plan` | study planner, ICS export |
| `/progress` | analytics, readiness history, achievements (earned and locked badges with progress) |
| `/tutor` | AI tutor (`?lessonId=`, `?questionId=` context) |
| `/flashcards`, `/bookmarks`, `/search` | knowledge tools |
| `/certificates/[code]` | printable course completion record |
| `/settings` | personalization (theme, accent colour, transparency, animation effects), profile, preferences, privacy, data export and learning-progress reset |

**Admin (`content:read_drafts` and finer permissions):** `/admin` overview · `/admin/certifications[/new|/[id]]` ·
`/admin/content`, `/admin/content/lessons/[id]` · `/admin/questions[/new|/[id]]` · `/admin/labs[/new|/[id]]` ·
`/admin/reviews` · `/admin/audit` · `/admin/jobs` · `/admin/settings` · `/admin/import-export` ·
`/admin/analytics`.

**API:** `GET /api/health` · `POST /api/tutor` · `GET /api/plan/ics` · `GET /api/search/suggest` (title-bar suggestions) ·
`GET /api/me/export` · `POST /api/media/upload`, `GET /api/media/[...key]` · `POST /api/admin/import` ·
`GET /api/admin/export`.

Roles: **Learner** (`learn:use`), **Instructor** (content editing, review and publishing, questions, labs, AI drafts,
import/export, anonymous analytics), **Administrator** (everything, additionally catalog management, audit log, settings, jobs and AI configuration). Permissions are code-defined (`src/modules/auth/permissions.ts`) and
checked in every page, action and route handler.

---

## 5. Key flows

**Onboarding → diagnostic → plan.** The wizard saves preferences and enrollments, sets the locale, then starts the
diagnostic (easy/medium questions distributed by blueprint, no feedback). Submission classifies domains
(strong ≥ 75 %, weak < 60 %), stores the result on the enrollment, generates the study plan (weak domains first,
revision weeks, practice exams) and a readiness snapshot.

**Assessment lifecycle.** `start*` builds items (blueprint allocation, difficulty mix, recency/mastery weighting,
per-attempt option shuffling) → runner answers via `answerAction` (validated response kind, explain-first check,
idempotent upsert, immediate review or deferred side effects) → `submitAction` (idempotent status transition,
review-queue updates, XP events, knowledge-check lesson completion, plan adjustment for weak domains, readiness,
badges). Full exams have a server `expiresAt` + 30 s grace; expired attempts auto-submit.

**Readiness.** Seven signals — performance 35 %, coverage 20 %, practice exams 15 %, difficulty 10 %, consistency 10 %,
labs 5 % (redistributed when a path has no labs), recency 5 % — with caps (fewer than 10 answers → Starting; "Practice
exam ready" needs a full exam at/above the internal target and ≥ 75 % coverage).

**Labs.** `startLab` → `applyLabEvent` (zod-validated event, rate limit, max 800 events) → replay → rule evaluation
(`commandUsed`, `arrayContains`, `placedIn`, `connected`, `stageCorrect`, `matches`, `equals`, `includes`,
`anyOf`/`allOf`/`not`, …) → public state + step status → completion awards XP (reduced when the solution was
revealed). Portal-lab events: `navigate`, `back`, `openUrl`, `click`, `rowClick`, `rowAction`, `setField`,
`submitForm`, `command` (terminal), `query` (SQL editor) and `chat`; the renderer applies them optimistically with
the same reducer and adopts the server state when no event is in flight.

**Tutor.** sanitize → injection detection (EN/TR) → daily limit → retrieval over learner-visible lessons & glossary
(locale-aware, cached index) → context (lesson / answered question only) → provider → output check (strips real-exam
claims, guarantees, canary leaks) → persisted messages with citations.

**Daily quests.** `selectDailyQuests` picks three quests per local day (seeded by user and date, balanced as learn /
practice / hands-on, targets adapted to the daily goal) → `computeQuestProgress` reads today's events →
`claimQuestReward` re-checks completion on the server and records one `QUEST_COMPLETED` per quest and day (plus the
all-quests bonus) in a transaction, then awards badges.

**Lightning round.** `startPractice(LIGHTNING)` picks 10 quick questions → each answer is scored on the server against
the attempt deadline (late answers do not count) → `engine/lightning.ts` computes the combo multiplier, round score and
time bonus → submission records `PRACTICE_COMPLETED` with the round metadata and compares with previous rounds for a
personal best.

**Focus sessions.** The timer runs in the browser (end timestamp in local storage, survives navigation and reloads);
on completion a server action validates the minutes and idempotency key and records `FOCUS_SESSION_COMPLETED`
without study duration, so the daily study goal is never counted twice.

**Editorial workflow.** Editors submit → technical review → editorial review → approve → publish now or schedule;
every transition is permission-checked, commented where required, recorded as `ContentReview` + `AuditLog`, and
revisions allow diff and rollback.

---

## 6. Testing strategy

| Level | What | Command |
| --- | --- | --- |
| Unit | engines (scoring, projection/no-leak, exam builder, adaptive, readiness, SRS, planner, ICS, labs, portal simulation, SQL, guard, retrieval), RBAC, workflow, i18n parity, content packages | `npm test` |
| Lab walkthroughs | every portal lab has a solving walkthrough (`tests/fixtures/lab-walkthroughs`) that is replayed through the real engines: every event accepted, no unexpected errors, all step and final rules pass, required selections resolve | `npx vitest run tests/lab-walkthroughs.test.ts` (`LAB_CERT` / `LAB_FILE` filters) |
| Lab UI replay | every walkthrough is played through the real lab UI of a running app with Playwright (mission briefing and completion dialogs included): each portal lab must complete | `npm run labs:ui-replay -- --base <url>` |
| Content quality | course packages validate with zero warnings, including the copy-paste/template detector | `npm run content:validate` + `tests/content-quality.test.ts` |
| Integration | real DB: all practice modes, diagnostic → plan → readiness, knowledge check, ownership rejection, lab completion | `npm run test:flows` |
| Smoke | HTTP: public/learner/admin pages, 404s and APIs without auth cookies | `npm run smoke` (against a running server) |
| Static | TypeScript strict, ESLint (incl. React compiler rules) | `npm run typecheck`, `npm run lint` |

---

## 7. MVP boundary

**Implemented (this release):** everything in the page map above, with full demo paths for **AZ-900** (22 lessons,
140 questions, 11 labs, 30 glossary terms) and **AI-901** (11 lessons, 71 questions, 5 labs, 20 glossary terms), plus
lab packages for **DP-900** (5 labs), **SC-900** (6), **PL-900** (5), **AB-900** (4) and **GH-900** (6) — 42 labs, 38
of them portal labs in the lab VM. English + Turkish UI, Turkish content for selected lessons/questions/glossary
entries (others show a fallback notice).

**Deliberately out of scope / next phases:**
* Multi-user accounts, e-mail verification, password reset, SSO/OAuth providers and MFA.
* Horizontal scaling helpers: shared rate-limit store (Redis) and object storage driver (S3/Azure Blob) — interfaces exist.
* Full learning paths for the remaining certifications (catalog entries exist).
* Real-time collaboration in the CMS, WYSIWYG editors (JSON editors with validation are provided).
* Payment, organisations/classes, public leaderboards (intentionally avoided).

## 8. Phased plan

1. **Foundation (done):** schema, local profile/RBAC, i18n, catalog, content pipeline, engines, seed.
2. **Learner MVP (done):** paths, lessons, assessments, labs, planner, dashboard, readiness, tutor, settings.
3. **CMS (done):** workflow, editors, question bank, lab builder, import/export, audit, jobs, analytics.
4. **Hardening (next):** CSP nonces, Redis rate limiting, S3 storage, E2E browser tests
   (Playwright + axe), load tests.
5. **Content scale-out (next):** DP-900, SC-900, PL-900, AB-900, GH-900 paths; more Turkish translations; SME review.
