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
| **Independence & honesty** | Global footer disclaimer and trademark notice; sign-up consent; certificates are labelled "course completion record, not a Microsoft certification". |
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
  (with explain-first); immediate-feedback vs exam mode; mark for review; final review screen; timer with accessible
  announcements; exam-style restrictions; results with domain breakdown, review, similar questions, review queue.
* **Labs** — sandboxed simulations only: guided UI simulation, command sandbox (simulated Azure CLI), architecture
  design, troubleshooting, business scenario (decision stages); guided vs challenge mode, hints, solution reveal,
  server-side validation by replaying an event log.
* **Personalization** — onboarding wizard, diagnostic → strengths/focus areas → study plan; dashboard with next best
  action; readiness score (7 weighted signals with caps); study planner with calendar export (ICS), missed-session
  detection and automatic adjustment; review queue (SM-2 style SRS); gamification (XP, levels, badges, streaks —
  optional); progress analytics.
* **AI tutor** — modes (explain, simpler, analogy, compare, scenario, Socratic quiz, explain my mistake, summarize,
  flashcards, what next), depth levels, lesson/question context, citations, prompt-injection defence, daily limits,
  provider abstraction (local grounded provider by default; OpenAI-compatible optional).
* **CMS / admin** — certification CRUD with curriculum sync, content tree, lesson editor with revisions/diff/rollback,
  question bank + editor + AI draft generation, lab builder, editorial workflow with review queue and scheduling,
  users & roles, media uploads, audit log, background jobs, settings, import/export, anonymous cohort analytics.
* **Account** — registration, sign-in, preferences, language & timezone, privacy toggle, data export, password change,
  sign out everywhere, account deletion.

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
| Server | Server Actions + Route Handlers, `proxy.ts` auth gate, next-auth v4 (credentials, JWT) |
| Domain | TypeScript modules in `src/modules/*` (pure engines + DB services), zod 4 validation |
| Data | PostgreSQL 17 via Prisma 6 (migrations in `prisma/migrations`) |
| Jobs | DB-backed queue (`Job` table) processed by `scripts/worker.ts` |
| Storage | `ObjectStorage` interface, local-disk driver (S3-compatible drivers can be added) |
| AI | `TutorProvider` interface: local grounded provider (default) and OpenAI-compatible provider |
| Tests | Vitest unit tests, service-level integration flows, HTTP smoke test |

```
Browser ──► proxy.ts (anonymous → 307 /sign-in for protected areas)
        ──► App Router pages (RSC)  ──► src/modules/* services ──► Prisma ──► PostgreSQL
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
    auth/                 permissions (RBAC), session (DB-backed user per request), options, schemas
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
  proxy.ts                Early authentication gate (Next 16 "proxy", formerly middleware)
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
   rebuilt by replaying the log through the engine, so the client can never forge progress.
4. **DB-backed session checks.** JWT sessions carry only `uid` and a `sessionVersion`; every request reloads the user
   (status, roles, version) so suspension, role changes and "sign out everywhere" apply immediately.
5. **Content lifecycle.** `DRAFT → TECHNICAL_REVIEW → EDITORIAL_REVIEW → APPROVED → PUBLISHED` (or scheduled via
   `publishAt`), plus `OUTDATED` and `ARCHIVED`. Learners only ever see `learnerVisibleWhere()` content.
6. **Typed i18n.** Message keys are type-checked; Turkish files are typed as complete dictionaries; a test enforces
   parity and placeholder consistency.
7. **Graceful AI.** The platform is fully functional without any external AI service. External providers are opt-in,
   use keys from the environment only, and fall back to the local provider on failure.

---

## 3. Data model

~57 Prisma models (see `prisma/schema.prisma`). Grouped overview:

| Group | Models | Notes |
| --- | --- | --- |
| Identity & access | `User`, `Role`, `UserRole`, `UserPreference` | bcrypt hashes, `sessionVersion`, status, locale, timezone, study preferences, gamification & privacy flags |
| Catalog & curriculum | `Certification`, `CertificationRelation`, `CertificationVersion`, `CurriculumAlert`, `ExamDomain`, `ExamObjective`, `OfficialSource` | weights, exam version, retirement/replacement, change history |
| Learning content | `Module`, `Lesson`, `ContentBlock`, `LessonTranslation`, `LessonSource`, `Flashcard`, `GlossaryTerm`, `GlossaryTermCertification`, `Concept`, `ConceptLink` | status + `publishAt`, translations with review status, curriculum version |
| Questions | `Question`, `QuestionOption`, `QuestionVersion`, `QuestionTranslation`, `QuestionSource` | public `interaction` vs secret `answerKey`, statistics (served/answered/correct/time) |
| Assessment | `Quiz`, `QuizQuestion`, `QuizAttempt`, `PracticeExam`, `PracticeExamAttempt`, `QuestionAttempt`, `ReviewQueueItem` | attempt `items` snapshot, domain breakdown, SRS fields |
| Labs | `Lab`, `LabStep`, `LabValidationRule`, `LabSource`, `LabAttempt` | validated JSON config, event log, hints, solution flag, score |
| Progress & planning | `Enrollment`, `LessonProgress`, `StudyPlan`, `StudySession`, `ReadinessSnapshot`, `LearningEvent`, `Badge`, `UserBadge`, `Bookmark`, `Note` | diagnostic result on enrollment, adjustment log on plan |
| Tutor | `TutorConversation`, `TutorMessage` | citations, flagged, provider |
| CMS & operations | `ContentReview`, `ContentRevision`, `AuditLog`, `AppSetting`, `Job`, `MediaAsset` | review decisions, snapshots for diff/rollback, IP hash + user agent in audit |

Important conventions:
* IDs are `cuid()`; human-readable `code`/`slug` fields are unique per certification.
* Calendar dates (plan sessions, target exam date) are stored as UTC midnight and displayed with `fmt.calendarDate`.
* Translations: small entities use a `translations` JSON (`{ tr: { title } }`); lessons and questions have dedicated
  translation tables with a `status` so unreviewed translations are labelled.
* Deleting a user cascades to all personal data; content authored by users keeps an optional author reference.

---

## 4. Information architecture (page map)

**Public (marketing layout):** `/` landing · `/certifications` catalog · `/certifications/[code]` detail ·
`/glossary` · `/compare` · `/concepts` · `/sign-in` · `/sign-up` · `/forbidden` · 404.

**Learner (app shell, sign-in required):**

| Route | Purpose |
| --- | --- |
| `/onboarding` | 4-step wizard → enrollments, preferences → diagnostic |
| `/dashboard` | next best action, readiness, continue learning, today's sessions, reviews due, streak/XP, alerts |
| `/learn`, `/learn/[code]`, `/learn/[code]/[lessonSlug]` | my paths, path view with mastery, lesson page |
| `/practice` | practice hub (quick, domain, full, adaptive, daily, mistakes) + history |
| `/practice/[attemptId]`, `/quiz/[attemptId]` | assessment runner |
| `/practice/[attemptId]/results`, `/quiz/[attemptId]/results` | results & review |
| `/practice/mistakes` | mistake review with filters |
| `/diagnostic/[code]`, `/diagnostic/[code]/results` | diagnostic intro & results (plan + initial readiness) |
| `/labs`, `/labs/[labId]` | lab catalog & players |
| `/plan` | study planner, ICS export |
| `/progress` | analytics, readiness history, badges |
| `/tutor` | AI tutor (`?lessonId=`, `?questionId=` context) |
| `/flashcards`, `/bookmarks`, `/search` | knowledge tools |
| `/certificates/[code]` | printable course completion record |
| `/settings` | profile, preferences, privacy, security, data (export/delete) |

**Admin (`content:read_drafts` and finer permissions):** `/admin` overview · `/admin/certifications[/new|/[id]]` ·
`/admin/content`, `/admin/content/lessons/[id]` · `/admin/questions[/new|/[id]]` · `/admin/labs[/new|/[id]]` ·
`/admin/reviews` · `/admin/users` · `/admin/audit` · `/admin/jobs` · `/admin/settings` · `/admin/import-export` ·
`/admin/analytics`.

**API:** `GET /api/health` · `/api/auth/*` (next-auth) · `POST /api/tutor` · `GET /api/plan/ics` ·
`GET /api/me/export` · `POST /api/media/upload`, `GET /api/media/[...key]` · `POST /api/admin/import` ·
`GET /api/admin/export`.

Roles: **Learner** (`learn:use`), **Instructor** (content editing, review and publishing, questions, labs, AI drafts,
import/export, anonymous analytics), **Administrator** (everything, additionally catalog management, users & roles,
audit log, settings, jobs and AI configuration). Permissions are code-defined (`src/modules/auth/permissions.ts`) and
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

**Labs.** `startLab` → `applyLabEvent` (zod-validated event, rate limit, max 500 events) → replay → rule evaluation
(`commandUsed`, `arrayContains`, `placedIn`, `connected`, `stageCorrect`, `matches`, `equals`, `anyOf`/`allOf`/`not`,
…) → public state + step status → completion awards XP (reduced when the solution was revealed).

**Tutor.** sanitize → injection detection (EN/TR) → daily limit → retrieval over learner-visible lessons & glossary
(locale-aware, cached index) → context (lesson / answered question only) → provider → output check (strips real-exam
claims, guarantees, canary leaks) → persisted messages with citations.

**Editorial workflow.** Editors submit → technical review → editorial review → approve → publish now or schedule;
every transition is permission-checked, commented where required, recorded as `ContentReview` + `AuditLog`, and
revisions allow diff and rollback.

---

## 6. Testing strategy

| Level | What | Command |
| --- | --- | --- |
| Unit | engines (scoring, projection/no-leak, exam builder, adaptive, readiness, SRS, planner, ICS, labs, guard, retrieval), RBAC, workflow, i18n parity, content packages | `npm test` |
| Integration | real DB: all practice modes, diagnostic → plan → readiness, knowledge check, ownership rejection, lab completion | `npm run test:flows` |
| Smoke | HTTP: public/learner/admin pages, redirects, 404, APIs, sign-in via credentials | `npm run smoke` (against a running server) |
| Static | TypeScript strict, ESLint (incl. React compiler rules) | `npm run typecheck`, `npm run lint` |

---

## 7. MVP boundary

**Implemented (this release):** everything in the page map above, with full demo paths for **AZ-900** (22 lessons,
140 questions, 4 labs, 30 glossary terms) and **AI-901** (11 lessons, 71 questions, 2 labs, 20 glossary terms),
English + Turkish UI, Turkish content for selected lessons/questions/glossary entries (others show a fallback notice).

**Deliberately out of scope / next phases:**
* Email delivery (verification, password reset, reminders) — reminders are in-app; admins reset passwords.
* SSO/OAuth providers, MFA.
* Horizontal scaling helpers: shared rate-limit store (Redis) and object storage driver (S3/Azure Blob) — interfaces exist.
* Full learning paths for the remaining certifications (catalog entries exist).
* Real-time collaboration in the CMS, WYSIWYG editors (JSON editors with validation are provided).
* Payment, organisations/classes, public leaderboards (intentionally avoided).

## 8. Phased plan

1. **Foundation (done):** schema, auth/RBAC, i18n, catalog, content pipeline, engines, seed.
2. **Learner MVP (done):** paths, lessons, assessments, labs, planner, dashboard, readiness, tutor, settings.
3. **CMS (done):** workflow, editors, question bank, lab builder, import/export, audit, jobs, analytics.
4. **Hardening (next):** e-mail + password reset, MFA, CSP nonces, Redis rate limiting, S3 storage, E2E browser tests
   (Playwright + axe), load tests.
5. **Content scale-out (next):** DP-900, SC-900, PL-900, AB-900, GH-900 paths; more Turkish translations; SME review.
