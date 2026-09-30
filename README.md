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
| Labs | Safe simulations only: guided UI simulation, simulated Azure CLI, architecture design, troubleshooting and business scenarios — validated server-side |
| Personalization | Onboarding → diagnostic → study plan (ICS export, missed-session adjustment), dashboard with next best action, readiness estimate with explanations, optional gamification |
| AI tutor | Grounded in approved content with citations; explain, simplify, analogy, compare, quiz me, explain my mistake, summarize, flashcards; works fully offline by default |
| CMS | Editorial workflow (draft → technical review → editorial review → approved → published/scheduled), revisions & rollback, question bank, lab builder, AI-assisted drafts, import/export, users & roles, audit log, jobs, anonymous analytics |
| Quality | WCAG 2.2 AA-minded UI, EN/TR UI with typed keys, strict TypeScript, zod validation, RBAC, security headers, 150+ unit tests, integration and smoke scripts |

Demo content: complete learning paths for **AZ-900** (22 lessons, 140 questions, 4 labs) and **AI-901** (11 lessons,
71 questions, 2 labs). Other active certifications (DP-900, SC-900, PL-900, AB-900, GH-900) and retired ones (AI-900,
MS-900, MB-910, MB-920) are in the catalog. Demo content is labelled as such and is not a complete curriculum.

## Tech stack

Next.js 16 (App Router, React 19 Server Components, Server Actions) · TypeScript · Tailwind CSS 3 + Radix UI ·
PostgreSQL 17 + Prisma 6 · next-auth 4 (credentials, JWT with server-side revocation) · zod 4 · Vitest ·
Docker. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Quick start (local development)

Prerequisites: **Node.js ≥ 20.9** (tested with 24.x) and npm. PostgreSQL is optional — an embedded server is included.

```bash
npm install
cp .env.example .env            # then set NEXTAUTH_SECRET (see below)

# Terminal 1 - embedded PostgreSQL on port 5433 (data in ./.postgres-data), keep it running
npm run db:start

# Terminal 2
npm run db:migrate              # apply migrations (prisma migrate dev)
npm run db:seed                 # catalog, AZ-900/AI-901 content, labs, badges, demo accounts and activity
npm run dev                     # http://localhost:3000
```

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
Using your own PostgreSQL instead? Point `DATABASE_URL` at it and skip `db:start`.

### Demo accounts (created by the seed)

| Role | E-mail | Password |
| --- | --- | --- |
| Administrator | `admin@example.com` | `Admin12345!` |
| Instructor | `instructor@example.com` | `Instructor123!` |
| Learner (with realistic history) | `learner@example.com` | `Learner12345!` |
| Cohort learners | `learner1@example.com` … `learner5@example.com` | `Learner12345!` |

The sign-in page lists these accounts (outside production only) with a button that fills in the credentials. Demo
accounts cannot change their password or delete themselves.

## Docker

```bash
echo "NEXTAUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" > .env
docker compose up --build       # db → migrate (+ seed if empty) → app + worker
```

Open http://localhost:3000. Services: `db` (PostgreSQL 17), `migrate` (one-off `prisma migrate deploy` + seed when the
database is empty), `app` (standalone Next.js server, non-root, health-checked) and `worker` (background jobs).
For real deployments set `SEED_DEMO_USERS=false` with `ADMIN_EMAIL`/`ADMIN_PASSWORD` to bootstrap the first
administrator, and set `APP_URL` to your HTTPS origin (enables HSTS). *The Docker files were written for this release
but could not be executed in the authoring environment; the standalone production server itself was verified.*

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `NEXTAUTH_SECRET` | — | Session signing secret; **32+ characters required in production** |
| `NEXTAUTH_URL` / `APP_URL` | `http://localhost:3000` | Public origin (HTTPS enables secure cookies, HSTS and `upgrade-insecure-requests`) |
| `SESSION_MAX_AGE_HOURS` | `8` | JWT session lifetime |
| `REGISTRATION_ENABLED` | `true` | Allow self-registration (also switchable in Admin → Settings) |
| `AI_PROVIDER` | `mock` | `mock` = local grounded tutor (no external calls); `openai` = any OpenAI-compatible endpoint |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS` | — | External AI configuration (key only from the environment) |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR` | `local`, `./storage` | Media storage |
| `LOG_LEVEL` | `info` | `debug` · `info` · `warn` · `error` (JSON logs) |
| `SEED_DEMO_USERS` | `true` | Seed: create demo accounts and activity |
| `SEED_MODE` | — | Seed: `if-empty` skips seeding when a catalog already exists |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | — | Seed: bootstrap administrator when demo users are disabled |

Runtime settings (tutor on/off and daily limit, AI provider/model, full-exam length and duration, internal practice
target, registration, analytics cohort size) are managed in **Admin → Settings**.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop, build (standalone output), run production server |
| `npm run typecheck` / `lint` | TypeScript strict check, ESLint |
| `npm test` | Vitest unit tests (engines, RBAC, workflow, i18n parity, content packages, …) |
| `npm run test:flows` | Integration flows against the database (all practice modes, diagnostic → plan, labs) |
| `npm run smoke [-- <baseUrl>]` | HTTP smoke test of public, learner and admin pages against a running server |
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
