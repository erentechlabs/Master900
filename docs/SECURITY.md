# Security & privacy

This document describes the threat model, the implemented controls and the operational guidance for
Microsoft Fundamentals Academy. Report vulnerabilities privately to the maintainers; do not open public issues.

## 1. Assets and threats

| Asset | Threats considered |
| --- | --- |
| Local profile & admin access | unintended network exposure, privilege escalation, CSRF |
| Learner data (progress, notes, tutor chats) | IDOR / cross-user access, over-collection, leakage in exports |
| Assessment integrity | answer-key leakage to the client, forged scores, replaying/altering attempts, timer tampering |
| Content & catalog | unauthorized edits/publishing, malicious imports, stored XSS via Markdown/media |
| AI tutor | prompt injection, system-prompt/secret exfiltration, ungrounded or harmful claims, cost abuse |
| Infrastructure | secret leakage, SSRF via configurable AI endpoint, path traversal in storage, DoS |

## 2. Controls

### Single-user local model
* The app has exactly one local profile (`local-learner@fundamentals-academy.local`) provisioned idempotently on first use. It has both Learner and Administrator roles.
* There is no account registration, sign-in, sign-out, password storage or browser session cookie. Opening the app locally loads the profile immediately.
* Development and production scripts bind the Next.js server to `127.0.0.1`, and Docker publishes `127.0.0.1:3000:3000`. Do **not** expose the app to untrusted networks without an authenticating reverse proxy.
* Rate limits still protect answers, lab actions, tutor, uploads, import/export and generic mutations (`src/lib/rate-limit.ts`). The default store is in-memory; use a shared store (`setRateLimitStore`, e.g. Redis) when running more than one instance.
* Server Actions are POST-only with Next.js origin checks; JSON route handlers that mutate (`/api/tutor`, `/api/media/upload`, `/api/admin/import`) additionally verify the `Origin`.

### Authorization
* Role-based permissions defined in code (`src/modules/auth/permissions.ts`): Learner, Instructor, Administrator.
* Every page uses `requireUser`/`requirePermission`; every Server Action and Route Handler calls `authorize()`. These APIs now resolve the local profile instead of a remote session.
* **Ownership checks** on all user-owned records (attempts, lab attempts, plans, sessions, notes, bookmarks, tutor
  conversations). Integration tests assert that foreign attempts are rejected.
* Editorial workflow transitions are permission-checked per action; comments are required where configured.

### Input handling & output encoding
* All inputs are validated with **zod** at the boundary (actions, route handlers, imports, lab events, question
  responses, JSON configs).
* React escapes all text. Markdown is rendered with `react-markdown` + GFM **without raw HTML**; no
  `dangerouslySetInnerHTML` is used for user or content data.
* Uploads: authenticated editors only, 2 MB limit, **magic-byte detection** (PNG/JPEG/GIF/WebP only — no SVG),
  random keys, strict key pattern when serving, `nosniff`, sandboxing CSP on media responses.
* Storage keys are normalised and confined to the storage root (path traversal protection).
* Imports are schema-validated, support dry-run, and always land as **drafts** for review.

### Assessment integrity
* Clients receive a **projection** without answer keys, correct flags or explanations until feedback is due
  (unit-tested for every question type). Lab clients never receive solutions or validation rules until the learner
  reveals the solution.
* Scoring happens only on the server; attempts snapshot question versions and option order.
* Timers are server-authoritative (`expiresAt` + 30 s grace); late answers auto-submit the attempt.
* Submissions are idempotent (`updateMany … where status = IN_PROGRESS`).

### AI tutor
* Input sanitisation and length limit; **prompt-injection detection** (English and Turkish patterns) short-circuits
  the provider.
* Retrieval is limited to approved, learner-visible content; question context is only added for questions the learner
  has already answered.
* System prompt includes a canary token; **output checks** remove canary leaks, claims about real exam questions and
  pass guarantees.
* Daily per-user message cap (`ai.tutorDailyLimit`) and per-minute rate limit; administrators can disable the tutor.
* API keys are read **only from environment variables** (`AI_API_KEY`), never stored in the database or sent to the
  client; the base URL is administrator-controlled.

### Transport & browser hardening
* Security headers on every response (`next.config.ts`): Content-Security-Policy, `X-Content-Type-Options`,
  `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`; **HSTS and `upgrade-insecure-requests` are emitted when `APP_URL` is HTTPS**.
* `X-Powered-By` disabled. * **CSP hardening path:** the current policy allows `'unsafe-inline'` scripts because of the theme bootstrap script and
  the Next.js inline runtime. To move to nonces, generate a nonce in a request boundary, pass it via a request header, read it
  in the root layout for the theme script, and switch `script-src` to `'self' 'nonce-…' 'strict-dynamic'`.

### Auditing & monitoring
* `AuditLog` records admin and editorial actions (actor, action, entity, before/after summary, hashed IP, user agent).
* Structured JSON logs (`src/lib/logger.ts`) with levels; errors from Server Actions are logged with the action name.
* `GET /api/health` reports application and database status (no secrets).

## 3. Privacy

* **Data minimisation:** fixed local e-mail, optional display name, preferences and learning activity only.
* **Transparency:** Settings describes the stored local profile, preferences and learning activity.
* **Self-service rights:** JSON export of local profile data (`/api/me/export`, answer keys excluded) and a typed-confirmation reset that deletes learning progress while preserving the `User` row for audit/content references.
* **Analytics:** anonymous aggregates only, with a minimum cohort size (`analytics.minCohort`) and a per-user opt-out.

## 4. Operational guidance

1. Keep the app bound to localhost unless an authenticating reverse proxy protects it.
2. Serve over HTTPS and set `APP_URL` to the HTTPS origin at build time and runtime when deploying behind a proxy.
3. Use a managed PostgreSQL with TLS, least-privilege credentials and backups.
4. Run more than one instance only with a shared rate-limit store and shared object storage.
5. Keep dependencies patched (`npm audit`, Dependabot) and review the `allowScripts` list in `package.json` when dependencies change.
6. Reseed to provision the local profile and remove legacy demo users marked `isDemo` with `@example.com` e-mail addresses.
7. Never commit `.env`; the Docker build context excludes it (`.dockerignore`).
