# Security & privacy

This document describes the threat model, the implemented controls and the operational guidance for
Microsoft Fundamentals Academy. Report vulnerabilities privately to the maintainers; do not open public issues.

## 1. Assets and threats

| Asset | Threats considered |
| --- | --- |
| Accounts & sessions | credential stuffing, brute force, session theft/fixation, privilege escalation, CSRF |
| Learner data (progress, notes, tutor chats) | IDOR / cross-user access, over-collection, leakage in exports |
| Assessment integrity | answer-key leakage to the client, forged scores, replaying/altering attempts, timer tampering |
| Content & catalog | unauthorized edits/publishing, malicious imports, stored XSS via Markdown/media |
| AI tutor | prompt injection, system-prompt/secret exfiltration, ungrounded or harmful claims, cost abuse |
| Infrastructure | secret leakage, SSRF via configurable AI endpoint, path traversal in storage, DoS |

## 2. Controls

### Authentication & sessions
* Credentials provider with **bcrypt** hashes (cost 12), password policy (length, letter + digit, common-password
  deny list), constant-time behaviour for unknown e-mails (dummy hash).
* **Rate limits** per account and per IP for sign-in, sign-up, answers, lab actions, tutor, uploads, import/export
  and generic mutations (`src/lib/rate-limit.ts`). The default store is in-memory; use a shared store
  (`setRateLimitStore`, e.g. Redis) when running more than one instance.
* JWT sessions (8 h default) carry only the user id and a **session version**. Every request reloads the user from the
  database: suspended users, deleted users, role changes and "sign out of all devices"/password changes
  (version bump) take effect immediately.
* next-auth CSRF protection for auth routes; Server Actions are POST-only with Next.js origin checks; JSON route
  handlers that mutate (`/api/tutor`, `/api/media/upload`, `/api/admin/import`) additionally verify the `Origin`.
* Open-redirect protection for `callbackUrl` (`src/lib/urls.ts`, unit-tested).
* `proxy.ts` rejects anonymous access to signed-in areas early (defence in depth — pages still authorize).

### Authorization
* Role-based permissions defined in code (`src/modules/auth/permissions.ts`): Learner, Instructor, Administrator.
* Every page uses `requireUser`/`requirePermission`; every Server Action and Route Handler calls `authorize()`.
* **Ownership checks** on all user-owned records (attempts, lab attempts, plans, sessions, notes, bookmarks, tutor
  conversations). Integration tests assert that foreign attempts are rejected.
* Administrators cannot demote/suspend themselves or remove the last administrator.
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
  `Cross-Origin-Opener-Policy`; **HSTS and `upgrade-insecure-requests` are emitted when `NEXTAUTH_URL` is HTTPS**.
* `X-Powered-By` disabled. Secure cookies are used automatically when the app URL is HTTPS.
* **CSP hardening path:** the current policy allows `'unsafe-inline'` scripts because of the theme bootstrap script and
  the Next.js inline runtime. To move to nonces, generate a nonce in `proxy.ts`, pass it via a request header, read it
  in the root layout for the theme script, and switch `script-src` to `'self' 'nonce-…' 'strict-dynamic'`.

### Auditing & monitoring
* `AuditLog` records admin and editorial actions (actor, action, entity, before/after summary, hashed IP, user agent).
* Structured JSON logs (`src/lib/logger.ts`) with levels; errors from Server Actions are logged with the action name.
* `GET /api/health` reports application and database status (no secrets).

## 3. Privacy

* **Data minimisation:** e-mail, optional display name, preferences and learning activity only.
* **Transparency:** sign-up consent text and a privacy section in Settings.
* **Self-service rights:** JSON export of all personal data (`/api/me/export`, secrets such as password hashes and
  answer keys excluded) and permanent account deletion (password + typed confirmation; cascades to personal data).
* **Analytics:** anonymous aggregates only, with a minimum cohort size (`analytics.minCohort`) and a per-user opt-out.
* Demo accounts are marked (`isDemo`) and cannot change password or delete themselves.

## 4. Operational guidance

1. Set a strong `NEXTAUTH_SECRET` (32+ random bytes); the app refuses to start in production without it.
2. Serve over HTTPS and set `NEXTAUTH_URL`/`APP_URL` to the HTTPS origin **at build time and runtime**.
3. Use a managed PostgreSQL with TLS, least-privilege credentials and backups.
4. Run more than one instance only with a shared rate-limit store and shared object storage.
5. Keep dependencies patched (`npm audit`, Dependabot) and review the `allowScripts` list in `package.json` when
   dependencies change.
6. Do not create demo accounts in production: seed with `SEED_DEMO_USERS=false` and bootstrap the first administrator
   with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (12+ characters), then remove `ADMIN_PASSWORD` from the environment.
7. Never commit `.env`; the Docker build context excludes it (`.dockerignore`).
