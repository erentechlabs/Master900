# Microsoft Fundamentals Academy

An independent, production-ready web platform that takes complete beginners to exam-ready for Microsoft
foundational certifications — with structured lessons, original practice questions, simulated hands-on labs, a
grounded AI tutor, a personal study planner and transparent readiness analytics, in **English and Turkish**.

> **Independence notice.** Microsoft Fundamentals Academy is not an official Microsoft product and is not affiliated
> with, endorsed by or sponsored by Microsoft. It does not contain actual certification exam questions. Microsoft,
> Azure, Microsoft 365, Dynamics 365, Power Platform, Copilot and GitHub are trademarks of the Microsoft group of
> companies. Official Microsoft Learn pages are the authoritative source for exam objectives.

## Highlights

| Area | What you get |
| --- | --- |
| Catalog | Data-driven certifications (status, exam version, skills-outline weights, official sources, retirements → replacements, e.g. AI-900 → AI-901), comparison view |
| Learning | Paths → modules → lessons with rich blocks, on-demand simpler explanations, knowledge checks, notes, bookmarks, glossary, concept map, spaced-repetition flashcards, search |
| Assessment | 11 question types; quick, domain, full timed, adaptive, daily and mistake-review modes; exam or feedback mode; mark for review; accessible timer; detailed results and review queue |
| Labs | Hands-on labs in a simulated **lab VM** (desktop with browser and terminal apps): look-alikes of the Azure portal, Microsoft Entra, Purview, Defender, Microsoft 365 and SharePoint admin centers, Power Apps, Power Automate, Copilot Studio, Power Platform admin center, Power BI, Fabric, Microsoft Foundry and GitHub — with Cloud Shell / VM terminals, SQL query editors and chat test panes; plus simulated Azure CLI, architecture design, troubleshooting and business scenarios. Everything is simulated and validated server-side |
| Personalization | Onboarding → diagnostic → study plan (ICS export, missed-session adjustment), dashboard with next best action, readiness estimate with explanations, optional gamification |
| AI tutor | Grounded in approved content with citations; explain, simplify, analogy, compare, quiz me, explain my mistake, summarize, flashcards; works fully offline by default |
| CMS | Editorial workflow (draft → technical review → editorial review → approved → published/scheduled), revisions & rollback, question bank, lab builder, AI-assisted drafts, import/export, audit log, jobs, anonymous analytics |
| Quality | Windows 11 / WinUI (Fluent) design system in light and dark, WCAG 2.2 AA-checked UI (axe), EN/TR UI with typed keys, strict TypeScript, zod validation, RBAC, security headers, 350+ unit tests (including a solving walkthrough for every portal lab), integration, smoke and lab UI replay scripts |

Demo content: complete learning paths for **AZ-900** (22 lessons, 140 questions, 11 labs) and **AI-901** (11 lessons,
71 questions, 5 labs), and hands-on lab packages for **DP-900** (5 labs), **SC-900** (6), **PL-900** (5), **AB-900**
(4) and **GH-900** (6). Retired certifications (AI-900, MS-900, MB-910, MB-920) are in the catalog. Demo content is
labelled as such and is not a complete curriculum. Lab authors: see [docs/LAB_AUTHORING.md](docs/LAB_AUTHORING.md).

## Tech stack

Next.js 16 (App Router, React 19 Server Components, Server Actions) · TypeScript · Tailwind CSS 3 + Radix UI ·
PostgreSQL 17 + Prisma 6 · single-user local profile with RBAC · zod 4 · Vitest ·
Docker. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Quick start (local development)

Prerequisites: **Node.js ≥ 20.9** (tested with 24.x) and npm. PostgreSQL is optional — an embedded server is included.

```bash
npm install
cp .env.example .env

# Terminal 1 - embedded PostgreSQL on port 5433 (data in ./.postgres-data), keep it running
npm run db:start

# Terminal 2
npm run db:migrate              # apply migrations (prisma migrate dev)
npm run db:seed                 # catalog, course and lab packages for all seven certifications, badges and local profile
npm run dev                     # http://127.0.0.1:3000 (localhost only)
```

The app is single-user by default. Opening it provisions one local learner profile with admin access; there is no sign-in, sign-up or sign-out UI and no account menu — profile, preferences and privacy are under **Settings** at the bottom of the navigation pane.

## Docker

```bash
docker compose up --build       # db → migrate (+ seed if empty) → app + worker
```

Open http://127.0.0.1:3000. Services: `db` (PostgreSQL 17), `migrate` (one-off `prisma migrate deploy` + seed when the
database is empty), `app` (standalone Next.js server, non-root, health-checked) and `worker` (background jobs).
The app and Docker port mapping bind to localhost by default. Do not expose it to an untrusted network unless an authenticating reverse proxy is placed in front of it. For deployments set `APP_URL` to your HTTPS origin (enables HSTS).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `APP_URL` | `http://localhost:3000` | Public origin (HTTPS enables HSTS and `upgrade-insecure-requests`) |
| `AI_PROVIDER` | `mock` | `mock` = local grounded tutor (no external calls); `openai` = any OpenAI-compatible endpoint |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS` | — | External AI configuration (key only from the environment) |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR` | `local`, `./storage` | Media storage |
| `LOG_LEVEL` | `info` | `debug` · `info` · `warn` · `error` (JSON logs) |
| `SEED_MODE` | — | Seed: `if-empty` skips seeding when a catalog already exists |

Runtime settings (tutor on/off and daily limit, AI provider/model, full-exam length and duration, internal practice
target and analytics cohort size) are managed in **Admin → Settings**.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop, build (standalone output), run production server |
| `npm run typecheck` / `lint` | TypeScript strict check, ESLint |
| `npm test` | Vitest unit tests (engines, RBAC, workflow, i18n parity, content packages, lab walkthroughs, …) |
| `npm run test:flows` | Integration flows against the database (all practice modes, diagnostic → plan, labs) |
| `npm run smoke [-- <baseUrl>]` | HTTP smoke test of public, learner and admin pages against a running server |
| `npm run labs:ui-replay [-- --base <url>] [slug]` | Drives every portal-lab walkthrough through the real lab UI of a running server and checks each lab completes (needs `PLAYWRIGHT_CHANNEL=msedge`/`chrome` or `npx playwright-core install chromium`) |
| `npm run db:start` | Embedded PostgreSQL for local development |
| `npm run db:migrate` / `db:deploy` / `db:reset` / `db:seed` / `db:studio` | Database lifecycle |
| `npm run worker` | Background worker: schedules and runs jobs (scheduled publishing every 5 min, plan rebalancing after missed sessions hourly, nightly readiness snapshots, AI draft generation) |
| `npm run content:validate -- <dir> [--only <file>]` | Validate course packages |

Production build and run without Docker:

```bash
npm run build
cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
NODE_ENV=production node .next/standalone/server.js
```

## Project structure

```
src/app            routes: marketing, learner app, admin, API
src/components     UI kit, layout, feature components
src/modules        domain modules (assessment, labs, learning, planner, analytics, tutor, content, catalog, auth, admin)
src/i18n           typed translator, formatters, messages/en/*, messages/tr/*
prisma             schema, migrations, seed and seed-data (catalog + course packages)
scripts            dev database, worker, content validation, smoke and integration tests
tests              Vitest suites
docs               ARCHITECTURE, SECURITY, CONTENT_FORMAT, CONTENT_AUTHORING_BRIEF
```

## Documentation

* [Architecture, data model, page map and roadmap](docs/ARCHITECTURE.md)
* [Security & privacy](docs/SECURITY.md)
* [Course package format](docs/CONTENT_FORMAT.md) and [content authoring rules](docs/CONTENT_AUTHORING_BRIEF.md)

## Contributing content

All questions and lessons must be **original**, cite official Microsoft Learn pages, avoid prices/SLAs/quotas, and
never claim to reproduce exam questions. Validate packages with `npm run content:validate`, then import them through
Admin → Import / export (dry run first). Imported and AI-assisted content always starts as a draft and goes through
technical and editorial review before publication.
