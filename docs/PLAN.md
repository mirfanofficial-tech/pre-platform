# PrepMaster — full build plan

Status: **proposal for review.** The frontend (`web/`) is built against mock data. Everything below the "Where we are" section is planned, not built.
Companion file: `web/NOTES.md` (running log of what has been built and why).

---

## 1. Where we are

- Frontend in `web/`: Next.js 16 + TypeScript + Tailwind v4. 45 static routes covering the public site, auth, student app, exam engine, checkout, and admin. Verified by build, lint, 8 unit tests, and headless-browser screenshots at 1440 / 834 / 390 px.
- All data is fake (`src/data/*.ts`). The 12-question demo bank ships **with correct answers in the browser**. Auth, payments, admin saves and file downloads do nothing real.

## 2. Decisions and assumptions

| # | Decision | Status |
|---|---|---|
| D1 | Backend: **FastAPI (Python 3.12+)** | Proposed by owner, accepted here |
| D2 | Database: **PostgreSQL 16** with `pgvector` and `pg_trgm` | Proposed by owner |
| D3 | Hosting: **VPS**, not shared cPanel | **Confirmed by owner (2026-10-28)** |
| D4 | Frontend stays Next.js; talks to the API over HTTPS | Assumed |
| D5 | Market: Pakistan, prices in PKR, timezone `Asia/Karachi` | From the design |
| D6 | Payments: JazzCash and Easypaisa first, card gateway optional | **Needs owner confirmation** |
| D7 | English first; Urdu content stored as UTF-8, RTL UI later | Assumed |
| D8 | Content comes from teachers, partners, licensed sources and reviewed AI drafts; scraping only licensed sources | See section 9 |

Assumptions about gateway behaviour (hash signing, return URL, server notification) are **unverified** — confirm against each gateway's sandbox documentation before building phase 5.

## 3. Architecture

```
Browser ──HTTPS──► Next.js (web/)  ──HTTPS, cookies──►  FastAPI (api/)  ──►  PostgreSQL
                      │                                    │  ▲                 ▲
                      │                                    │  └─ Procrastinate ─┘ (job queue in Postgres)
                      │                                    ▼
                      │                          Worker process: scheduled jobs, emails, scraper runs
                      ▼                                    │
                 Vercel or VPS                             ├─► Cloudflare R2 (PDFs, images, backups)
                                                           ├─► Resend (email)
                                                           └─► JazzCash / Easypaisa (checkout + webhook)
```

- API on a sub-domain of the same site (`api.example.com`) so secure cookies work.
- One Docker Compose stack on the VPS: `api`, `worker`, `postgres`, `caddy`. Optional `web` if the frontend is self-hosted.
- The **scraper never runs in the API process.** It runs as a worker job (or on a separate machine) and writes only to staging tables.

### Repository layout

```
pmc/
  web/               existing Next.js frontend
  api/
    app/
      main.py  config.py  deps.py
      core/            security.py  errors.py  pagination.py  time.py
      db/              base.py  session.py  migrations/ (Alembic)
      modules/
        auth/  users/  catalog/  questions/  attempts/  practice/
        analytics/  library/  billing/  admin/  ingestion/
        (each: models.py  schemas.py  service.py  router.py)
      workers/         tasks.py  scheduler.py
    tests/
    pyproject.toml  Dockerfile
  scraper/           (or api/app/modules/ingestion/sources/) source adapters
  infra/             docker-compose.yml  Caddyfile  backup scripts
  docs/              PLAN.md  API.md (generated)  RUNBOOK.md
```

Rule: **routers are thin, services hold the rules.** Services take a DB session and a user; they are unit-testable without HTTP.

## 4. Database design (PostgreSQL)

Conventions: `id` is UUIDv7 (or bigint identity); `created_at`/`updated_at` timestamptz in UTC; money is **integer paisa**; enums are Postgres enums or checked text; soft delete only where listed.

### 4.1 Identity and access
| Table | Key columns |
|---|---|
| `users` | id, email (citext, unique), phone, password_hash, full_name, role (`student`,`editor`,`reviewer`,`admin`), status (`active`,`suspended`), email_verified_at, target_exam_id, target_exam_date, daily_goal, last_seen_at |
| `sessions` | id, user_id, token_hash, user_agent, ip, expires_at, revoked_at |
| `email_tokens` | id, user_id, purpose (`verify`,`reset`), token_hash, expires_at, used_at |
| `audit_log` | id, actor_id, action, entity, entity_id, before jsonb, after jsonb, ip, created_at |

### 4.2 Catalogue and questions
| Table | Key columns |
|---|---|
| `exams` | id, slug, name, full_name, category, description, access (`free`,`premium`,`mixed`), status, sort |
| `subjects` | id, exam_id, name, kind (`mcq`,`written`), sort |
| `topics` | id, subject_id, name |
| `questions` | id, exam_id, subject_id, topic_id, language, text, image_url, difficulty (`easy`,`medium`,`hard`), explanation, status (`draft`,`in_review`,`published`,`archived`), version, content_hash, source_id, licence, created_by, reviewed_by, published_at, reported_count |
| `question_options` | id, question_id, position (1–6), text, **is_correct** (never sent to students before grading) |
| `question_tags` | question_id, tag |
| `question_reports` | id, question_id, user_id, reason, note, status |
| `mock_tests` | id, exam_id, title, kind (`full`,`sectional`), duration_sec, total_questions, marks_per_question, negative_marking, access, status |
| `mock_test_questions` | mock_test_id, question_id, position, section |

### 4.3 Attempts (the exam engine)
| Table | Key columns |
|---|---|
| `attempts` | id, user_id, type (`practice`,`mock`), mock_test_id nullable, exam_id, subject_id nullable, mode (`practice`,`test`), status (`in_progress`,`submitted`,`expired`), started_at, deadline_at nullable, submitted_at, score, correct, incorrect, skipped, time_spent_sec |
| `attempt_questions` | attempt_id, position, question_id, section — **snapshot** of the questions served, so later edits cannot change a past paper |
| `attempt_answers` | attempt_id, question_id, selected_option_id nullable, marked_for_review, answered_at, time_spent_sec, is_correct (set at grading) |
| `bookmarks` | user_id, question_id, created_at |
| `daily_stats` | user_id, day (Asia/Karachi), questions_answered, correct, minutes_studied — rollup, rebuilt nightly |
| `topic_stats` | user_id, topic_id, answered, correct, last_answered_at — updated at grading |

### 4.4 Library
| Table | Key columns |
|---|---|
| `resources` | id, exam_id, subject_id, kind (`notes`,`guide`,`formula`,`vocab`,`past_paper`), format, title, summary, file_key (R2), pages, size_bytes, access, licence, status |
| `resource_saves` | user_id, resource_id |
| `resource_downloads` | id, user_id, resource_id, created_at |

### 4.5 Billing
| Table | Key columns |
|---|---|
| `plans` | id, code (`free`,`premium_monthly`,`premium_annual`), name, price_paisa, period_days, limits jsonb (`mcq_per_month`, `mock_per_month`, `saved_questions`), features jsonb, active |
| `subscriptions` | id, user_id, plan_id, status (`active`,`expired`,`cancelled`), starts_at, ends_at, source_payment_id |
| `payments` | id, user_id, plan_id, provider (`jazzcash`,`easypaisa`,`card`), provider_ref (unique), amount_paisa, currency, status (`pending`,`paid`,`failed`,`refunded`), raw_request jsonb, raw_response jsonb, paid_at |
| `payment_events` | id, provider, event_id (unique), payload jsonb, processed_at — **idempotency log** for webhooks |
| `usage_counters` | user_id, period (`2026-10`), mcq_answered, mocks_started — enforces free-plan limits |

### 4.6 Content ingestion
| Table | Key columns |
|---|---|
| `sources` | id, name, base_url, kind (`manual`,`partner`,`web`,`pdf`), licence, permission_note, scraping_allowed bool, rate_limit_per_min, last_run_at, enabled |
| `scrape_runs` | id, source_id, started_at, finished_at, status, found, accepted, rejected, error |
| `question_candidates` | id, source_id, run_id, raw jsonb, normalised jsonb, source_url, content_hash, embedding vector, dup_of_question_id, quality_flags jsonb, status (`new`,`rejected`,`approved`,`imported`), reviewed_by |

### 4.7 Indexes and rules worth deciding now
- `questions (exam_id, subject_id, topic_id, status)`; GIN on `to_tsvector(text)`; trigram index for admin search.
- `attempts (user_id, started_at desc)`; unique partial index so a user has **one** `in_progress` mock per `mock_test_id`.
- `payments (provider, provider_ref)` unique; `payment_events (provider, event_id)` unique.
- `question_options`: exactly one `is_correct = true` per question (check via constraint trigger or service validation).
- Retention: keep attempts indefinitely; purge raw payment payloads after the legal retention period.

## 5. API design

Conventions: base path `/api/v1`; JSON; Pydantic v2 schemas; **OpenAPI is the contract** — the frontend generates TypeScript types from it (`openapi-typescript`). Errors use `{type, title, status, detail, code}`. Lists use cursor pagination. `Idempotency-Key` header on submit and checkout. Cookies: `HttpOnly; Secure; SameSite=Lax`; state-changing calls also require an `X-CSRF` header.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password`, `GET /me`, `PATCH /me` |
| Catalogue | `GET /exams`, `/exams/{slug}`, `/exams/{slug}/sections`, `/exams/{slug}/mock-tests`, `/topics?subject=` |
| Practice | `POST /practice/sets` (create a set: exam, subject, topic, count, mode) → returns questions **without answers**; `POST /practice/sets/{id}/answers` (practice mode: returns correctness + explanation); `POST /practice/sets/{id}/submit` |
| Mock tests | `POST /mock-tests/{id}/attempts` (start; returns questions without answers + `deadline_at`); `GET /attempts/{id}`; `PUT /attempts/{id}/answers` (autosave, bulk); `POST /attempts/{id}/submit`; `GET /attempts/{id}/result`; `GET /attempts/{id}/review` (answers + explanations, only after submit) |
| Student data | `GET /me/dashboard`, `/me/analytics`, `/me/attempts`, `/me/streak`, `/me/recommendations`, `/leaderboard` |
| Saved | `GET/PUT/DELETE /me/bookmarks/{questionId}`, `POST /questions/{id}/report` |
| Library | `GET /resources`, `POST/DELETE /resources/{id}/save`, `GET /resources/{id}/download` (signed URL, entitlement-checked) |
| Billing | `GET /plans`, `GET /me/subscription`, `POST /billing/checkout` (creates `pending` payment, returns gateway redirect/form), `GET /billing/return`, `POST /billing/webhooks/{provider}`, `GET /me/payments` |
| Admin | CRUD on exams, subjects, topics, questions, mock tests, resources; `POST /admin/questions/import` (CSV/XLSX); `POST /admin/questions/{id}/transition` (submit/approve/reject/archive); `GET /admin/students`, `/admin/stats`, `/admin/reports`; `GET /admin/candidates`, `POST /admin/candidates/{id}/approve|reject`; `GET /admin/audit` |
| Ops | `GET /healthz`, `GET /readyz` |

## 6. Core behaviour (the rules that must live on the server)

### 6.1 Questions and answers
- Student-facing question payloads **never include** `is_correct` or `explanation` until the rules allow it:
  - Practice mode: after the student answers that question.
  - Test/mock mode: only after the attempt is `submitted`.
- Option order may be shuffled per attempt (store the order in `attempt_questions`).

### 6.2 Mock attempt lifecycle
1. **Start** — check entitlement and monthly mock limit; create `attempts` row with `deadline_at = now + duration`; snapshot questions into `attempt_questions`; one `in_progress` per mock. Returns questions, `deadline_at`, and server `now` (so the client can correct clock skew).
2. **Autosave** — `PUT answers` every few seconds and on navigation; rejected if past `deadline_at + 10 s grace`.
3. **Submit** — idempotent; grades from stored options; writes `is_correct`, score, section breakdown; updates `topic_stats`, `daily_stats` source rows, `usage_counters`; status `submitted`.
4. **Expiry** — a worker job closes `in_progress` attempts past deadline and grades whatever was saved (`expired`).
5. **Review/result** — available only after submission; includes explanations.

### 6.3 Plans and limits
| Rule | Free | Premium |
|---|---|---|
| Practice MCQs | 300 / month | Unlimited |
| Mock tests | 2 / month | Unlimited |
| Explanations | Practice only | Every question |
| Analytics | Basic | Full |
| Saved questions | 25 | Unlimited |
| Study materials | Community only | All |

Limits reset on the 1st (`Asia/Karachi`). Enforced in a single `entitlements` service used by every router. Frontend shows limits but is never the authority.

### 6.4 Payments
- Amounts in paisa. Prices come from `plans`, never from the client.
- `POST /billing/checkout` creates a `pending` payment with a unique reference, signs the gateway request, returns the redirect.
- The **webhook/IPN** is the source of truth: verify the signature, look up the payment by reference, check the amount matches, insert into `payment_events` (unique key = idempotency), then in **one transaction** mark paid and create/extend the subscription. Duplicate deliveries do nothing.
- The browser return URL only shows a "checking payment…" page that polls `GET /me/subscription`.
- No auto-renewal at first (gateway recurring support varies): send renewal reminders at 7 and 1 day, expire access via a nightly job, revert to Free but keep all data.
- Refunds are manual from admin; marking refunded ends the subscription.

### 6.5 Analytics
- Accuracy per subject/topic from `topic_stats`; trend from `attempts`; weekly activity and streak from `daily_stats` (day boundaries in `Asia/Karachi`).
- Recommendations: lowest-accuracy topics with enough attempts, plus topics not seen recently.
- Leaderboard: best full-mock score this month per exam; opt-out flag for privacy.

## 7. Security and compliance

- Passwords: Argon2id. Email verification before mock tests (as in the design). Login/reset rate limits per IP and per account; lockout with backoff.
- Sessions: server-side session rows, rotating tokens, revoke on password change.
- Authorisation: role checks as FastAPI dependencies; admin routes need `editor`/`reviewer`/`admin`; every admin write goes to `audit_log`.
- Input: Pydantic validation, size limits, file type sniffing on uploads, signed URLs for downloads (short expiry), no public bucket listing.
- Secrets in environment / secret manager; never in the repo. Dependency and image scanning in CI.
- Transport: HTTPS only, HSTS, strict CORS to the web origin, CSP on the web app.
- Privacy: privacy policy, terms and refund policy pages (footer links exist); account deletion/export endpoint; store the minimum (phone optional). Check Pakistani data-protection and consumer rules and gateway merchant requirements before launch (legal review needed — not done).
- Anti-cheating is limited: server-side answers, timer and marking prevent tampering; screenshots and sharing cannot be prevented.

## 8. Frontend changes (`web/`)

| Change | Notes |
|---|---|
| API client | Generate types from OpenAPI; one `lib/api.ts` fetch wrapper (cookies, CSRF header, error mapping); TanStack Query for server state (already installed) |
| Remove answers from the bundle | `src/data/questions.ts` becomes dev-only fixtures; real questions come from the API |
| Auth | Real login/register/verify/reset flows; route protection (middleware or layout checks); `/admin` role gate; logout; session-expired handling |
| Exam engine | Replace the Zustand store's source of truth with the attempt API: start → autosave (debounced) → submit; timer from server `deadline_at` and skew correction; resume after refresh; handle offline/retry |
| Practice | Call `answers` endpoint per question; show server explanation; quota/upgrade prompt when limit hit |
| Billing | Pricing/checkout use `/plans` and `/billing/checkout`; payment-pending polling page; subscription page shows real data and history |
| Admin | Forms save to the API; review queue, candidates, import with progress and error report |
| States | Loading skeletons, empty states, error boundaries, 401/403/429 handling, toasts |
| Content | Urdu/RTL support later (CSS logical properties now where cheap) |
| Tests | Component tests (Vitest + Testing Library); Playwright end-to-end for register → practice → mock → result → upgrade |

## 9. Content pipeline and scraper

### 9.1 Rules
- The site promises original material and past papers "only where the examining body permits redistribution". Scrape **only** sources with a clear licence or written permission, recorded in `sources`.
- Do not copy other prep sites or copyrighted books. Do not use an AI model to reword copied questions.
- Preferred supply, in order: teacher-written, partner-licensed, AI-drafted from the syllabus **and teacher-reviewed**, then permitted scraping.

### 9.2 Pipeline
```
source adapter ─► raw fetch (polite, cached) ─► parse (HTML / PDF / OCR)
   ─► normalise to schema ─► quality checks ─► dedupe (hash + trigram + vector)
   ─► question_candidates (staging) ─► human review queue ─► questions (draft → in_review → published)
```
- Politeness: robots.txt, per-source rate limit, clear user agent with contact, per-source enable switch, conditional requests/caching.
- Quality checks: question present, 2–6 options, exactly one answer marked, language tag, length limits, no placeholder text, suspicious-pattern flags.
- Dedupe: exact `content_hash`; trigram similarity; embedding similarity with a threshold; link `dup_of_question_id` and show side by side in review.
- Classification: suggest subject/topic/difficulty (rules first, optional model assist) — suggestions only, reviewer confirms.
- Provenance on every question: `source_id`, `licence`, `reviewed_by`, `published_at`. One-click "remove everything from source X". Reported-question flow feeds the same queue.
- OCR for scanned past papers; Urdu needs a human proof-read.
- Monitoring: alert when a source returns zero items or a spike of rejects (layout change).
- Run location: worker on the VPS, or a separate machine posting to the API, so heavy browsers don't compete with the API.

### 9.3 Roles
`editor` writes/imports; `reviewer` approves publication (two-person rule for scraped and AI-drafted content); `admin` manages users, sources, billing.

## 10. Infrastructure and operations

- **Environments:** local (Docker Compose), staging (small VPS, test gateway keys), production.
- **Compose services:** `api` (uvicorn/gunicorn workers), `worker`, `postgres`, `caddy` (TLS, reverse proxy, gzip). Health checks and restart policies.
- **CI (GitHub Actions):** lint (ruff, mypy), tests with a Postgres service, frontend lint/test/build, OpenAPI diff check (fail if the generated client is stale), Docker build.
- **Deploy:** tagged release → SSH pull and `docker compose up -d`; Alembic migrations run before the API starts; rollback = previous image tag. Migrations must be backward-compatible for one release.
- **Backups:** nightly `pg_dump` to R2 (encrypted), weekly restore test, retain 30 days; WAL archiving later.
- **Monitoring:** uptime check on `/healthz`; error tracking (Sentry); structured logs; alerts for failed webhooks, queue backlog, disk, backup failures.
- **Capacity (starting point):** 2 vCPU / 4 GB serves a few thousand students; the heaviest moment is many students starting a mock at once — keep the start and autosave endpoints light and indexed; add a read replica or cache later only if measured.
- **Cost estimate (rough, verify current prices):** VPS ~$6–12/mo, R2 and Resend free tiers at first, domain ~$10–15/yr, gateway fees per transaction.

## 11. Testing strategy

| Level | What |
|---|---|
| Unit | Services: grading, entitlements, limit resets, payment state machine, streak/day boundaries (Karachi), CSV import validation |
| API | pytest + httpx against a real Postgres (transactional fixtures): auth, answer hiding, deadline enforcement, idempotent submit, webhook replay, role checks |
| Contract | OpenAPI snapshot; generated TS types compile in `web/` |
| E2E | Playwright: register → verify → practice → mock → result → upgrade (sandbox gateway) → download |
| Security | Authorisation matrix tests (student cannot read admin or other users' attempts), rate-limit tests, dependency audit |
| Load | k6 script: 500 concurrent mock starts plus autosave; budget p95 < 300 ms |
| Content | Ingestion adapters tested on saved fixtures; golden files for parsers |

## 12. Roadmap

Rough effort for **one full-time developer**; halve parallelisable parts with two. Ranges, not promises.

| Phase | Scope | Deliverable / acceptance | Est. |
|---|---|---|---|
| **0. Foundations** ✅ *done 2026-10-28* | Repo layout, FastAPI skeleton, Docker Compose, Postgres, Alembic, CI, config, error format, OpenAPI → TS client pipeline | `docker compose up` gives a healthy API; CI green; client types generated | 1 wk |
| **1. Identity and catalogue** ✅ *done 2026-10-28, with two gaps (see section 17)* | Users, sessions, register/verify/login/reset, roles; exams/subjects/topics/questions tables; seed script from current mock data; read-only catalogue API; web login + route protection | Real accounts work end to end; catalogue pages read from API | 2 wk |
| **2. Exam engine** ✅ *done 2026-10-30, with gaps (see section 18)* | Attempts, snapshot, autosave, server timer, grading, practice answer endpoint, results/review, bookmarks, reports; web switched to the API; answers removed from bundle | A student can take practice and a mock fully server-side; tampering tests pass | 2–3 wk |
| **3. Progress** 🟡 *dashboard and analytics done 2026-10-30; rest open (section 19)* | `topic_stats`, `daily_stats`, streaks, dashboard/analytics/recommendations/leaderboard APIs; web dashboard + analytics wired | Dashboard numbers come from real attempts | 1–2 wk |
| **4. Billing** | Plans, usage counters, entitlements service, checkout, webhook, subscriptions, expiry job, reminders, payment history; web checkout/subscription | Sandbox payment upgrades an account exactly once, even with replayed webhooks | 2 wk |
| **5. Admin and content** | Admin CRUD, review workflow, CSV/XLSX import with error report, resources + R2 uploads and signed downloads, audit log, students and reports pages | Teacher can import, review and publish questions; students download materials | 2–3 wk |
| **6. Scraper** | Sources registry, staging tables, one licensed source adapter, dedupe, candidate review UI, monitoring, takedown tool | One real source flows scrape → review → published with provenance | 2 wk |
| **7. Hardening and launch** | Rate limits, security review, load test, backups + restore drill, Sentry, legal pages, Urdu/RTL decision, Playwright suite, beta with real students | Launch checklist (section 13) fully ticked | 2 wk |

Total ≈ **14–17 weeks** for one developer. Suggested milestones:
- **M1 (end of phase 2):** internal demo — real login and real exams.
- **M2 (end of phase 4):** private beta with paid upgrade in sandbox.
- **M3 (end of phase 7):** public launch.

Parallel work that does not block: payment-gateway merchant applications (start in phase 0 — approval can take weeks), content sourcing and teacher recruitment, legal pages, brand assets.

## 13. Launch checklist

- [ ] Gateway merchant accounts approved; live keys in production only; one real small transaction tested and refunded
- [ ] Terms, Privacy, Refund policies published and reviewed
- [ ] Question bank minimum per exam met (target agreed with owner); all published questions reviewed; provenance recorded
- [ ] Past papers published only where redistribution is permitted
- [ ] Backups running and a restore tested
- [ ] Error tracking and uptime alerts live; on-call contact defined
- [ ] Security checks: authorisation matrix tests, dependency audit, HTTPS/HSTS, secrets rotated
- [ ] Load test passed at the target concurrency
- [ ] Accessibility pass (keyboard, contrast, screen reader on the exam flow)
- [ ] Support email and contact details real (placeholders replaced); help centre content
- [ ] Analytics/consent approach decided

## 14. Risks and open decisions

| Risk / question | Mitigation or owner decision needed |
|---|---|
| Hosting may stay shared cPanel | FastAPI needs a VPS/PaaS. **Owner: confirm.** Fallback: Laravel + MySQL plan in `web/NOTES.md` |
| Gateway approval delay or different integration style than assumed | Apply now; build behind a `PaymentProvider` interface; verify in sandbox before phase 4 |
| Content volume and quality (the real cost of the product) | Teacher/partner pipeline in parallel with engineering; staging + review gates; start with one exam (LAT) |
| Copyright/licensing of scraped or imported material | Section 9 rules; provenance and takedown tool; legal review |
| Exam-day traffic spikes | Light, indexed start/autosave endpoints; load test; scale vertically first |
| One-developer bus factor | Docs (`PLAN.md`, `RUNBOOK.md`), CI, migrations, infra as code |
| Scope creep (leaderboard, Urdu, auto-renewal, mobile app) | Post-launch backlog below |
| Open: who reviews content? exam launch order? price changes? student discounts? | **Owner decisions** |

### Post-launch backlog
Urdu/RTL UI, auto-renewal, referral/discounts for partner institutions, mobile app (PWA first), adaptive practice sets, study planner, push/email nudges for streaks, teacher dashboards, public question reports/errata.

## 15. Next steps (updated after phase 1)

1. ~~Owner confirms hosting~~ — **VPS confirmed.** Still open: D6 (payment gateway); owner starts merchant applications.
2. ~~Phase 0~~ — **done** (see section 16).
3. ~~Phase 1~~ — **done** (section 17). ~~Phase 2~~ — **done** (section 18). Next: **phase 3, progress** (topic and daily stats, streaks, real dashboard/analytics/leaderboard) and moving the catalogue pages (exam list, LAT page) to the API.
4. Update `web/NOTES.md` after each phase.

## 16. Phase 0 result (2026-10-28)

Built and verified:
- `api/`: FastAPI app factory, settings (`PM_` env prefix), async SQLAlchemy session, declarative base with naming convention and timestamp mixin, RFC 7807 error format (`AppError`, validation, unhandled — no internal leaks), `X-Request-ID` middleware, strict CORS, `/healthz` and `/readyz` (checks the database), docs disabled in production.
- Alembic async setup and migration `0001` enabling `citext`, `pg_trgm`, `pgcrypto`, `vector` (confirmed present in the running database).
- `infra/docker-compose.yml`: `pgvector/pgvector:pg16` + the API image; the API runs `alembic upgrade head` on start. **Database is published on host port 5433** because another PostgreSQL already uses 5432 on the dev machine.
- Checks passing: ruff (lint + format), mypy strict (app and tests), pytest 8/8 against a real Postgres. Docker image builds and the container answers `/readyz` over HTTP.
- OpenAPI export (`api/scripts/export_openapi.py` → `docs/openapi.json`) and generated TypeScript types in the web app (`npm run api:types` → `src/lib/api-types.ts`); small typed fetch wrapper `web/src/lib/api.ts` (cookies, CSRF header, problem → `ApiError`) with 4 tests. Web: lint, types, 12 tests and production build pass.
- CI workflow `.github/workflows/ci.yml` (API lint/type/test with a Postgres service; web lint/test/build; fails if the OpenAPI spec or generated types are stale) and `docs/RUNBOOK.md`.

Not done / caveats:
- The CI workflow has **not been run** (the project is not in a git repository at `pmc/` yet; `web/` has its own). Decide on one repo before the first commit.
- Still to add in later phases: the Procrastinate worker service, Caddy for production TLS, backups, Sentry.

## 17. Phase 1 result (2026-10-28)

Built and verified:
- **Tables (migration `0002`):** `users` (CITEXT unique email, role and status checks, lockout counters), `sessions`, `email_tokens`, `audit_log`, `exams`, `subjects`, `topics`, `questions` (status, provenance fields, content hash), `question_options` (partial unique index: at most one correct option). Upgrade and downgrade both run cleanly.
- **Accounts:** register, login, logout, verify email, resend verification (60 s cool-down), forgot and reset password, `GET/PATCH /me`. Argon2id hashes; random 256-bit session tokens stored only as SHA-256; `HttpOnly` + `SameSite=Lax` cookie (`Secure` in production); sessions are revoked on logout and on password reset; login failures look identical for unknown and wrong-password cases; account lock for 15 minutes after 5 failed logins; forgot-password never reveals whether an account exists; single-use, expiring email links.
- **CSRF:** every state-changing `/api/` request needs an `X-CSRF` header (webhook path exempt for later); CORS only allows the web origin.
- **Roles:** `require_role` dependency (student, editor, reviewer, admin) and a `create_admin` script (password prompted, never on the command line).
- **Catalogue (read-only):** `GET /api/v1/exams` and `/exams/{slug}` with subject and published-question counts; draft, archived and unpublished content is hidden; no endpoint exposes answers or explanations.
- **Seed:** `python -m app.scripts.seed` loads the web app's 10 demo exams, LAT's 9 sections, and the 12 demo questions (idempotent; run twice, second run adds nothing). `api/seed/demo.json` was generated from `web/src/data`.
- **Web:** real login and register (field errors from the API, the design's "Incorrect email or password" banner, lock message), forgot-password, reset-password and verify-email pages, `next=` redirect after login (open-redirect safe), a Next.js `proxy.ts` that redirects visitors without a session cookie, an `AuthGuard` for the student, exam and admin layouts (401 → login; non-staff blocked from `/admin`), a "confirm your email" banner with resend, real user name in the sidebar and dashboard greeting, logout, and a settings page that saves to the API. TanStack Query is now in use.
- **Checks:** API 37 tests (real Postgres, separate `prepmaster_test` database), ruff, mypy strict; web 16 tests, lint, types, production build. A browser run (headless Edge, real API and database) passed all 16 steps: protected-page redirect, wrong credentials, register, greeting, verify email, settings persistence, admin block, logout, password reset, old password rejected, new password works, `next=` honoured.
- **Bugs found by running it for real and fixed:** seed script failed standalone because not every model was registered (now registered when the engine is created, with a regression test); application logs were not being emitted (now configured).

Gaps — **not** done:
- **Email is not delivered.** The console sender prints the message to the API log. A real provider (Resend) must be connected before any user outside development can verify or reset.
- **Catalogue pages in the web app still use mock data.** The exam discovery and LAT pages read `src/data`; the API has no tags, blurbs or mock-test lists yet, so these pages switch over in phase 2 together with the exam engine.
- No IP-based rate limiting yet (only per-account lockout); planned for phase 7.
- Verified-email is shown but not yet enforced for mock tests (enforced server-side in phase 2).
- Dev logins use the console email, so tokens are read from `docker compose logs api`.

## 18. Phase 2 result (2026-10-30)

Built and verified:
- **Tables (migration `0003`):** `mock_tests`, `mock_test_questions`, `attempts`, `attempt_questions` (snapshot of the questions served), `attempt_answers`, `bookmarks`, `question_reports`. A partial unique index guarantees one in-progress attempt per student per mock test.
- **Endpoints:** `GET /mock-tests`, `POST /mock-tests/{id}/attempts` (start or resume), `POST /practice/sets`, `GET /attempts/{id}`, `PUT /attempts/{id}/answers` (bulk autosave), `POST /attempts/{id}/questions/{qid}/check` (practice feedback), `POST /attempts/{id}/submit`, `GET /attempts/{id}/result`, `GET /attempts/{id}/review`, `GET /me/attempts`, bookmarks (`GET/PUT/DELETE /me/bookmarks`), `POST /questions/{id}/report`.
- **Rules enforced on the server:**
  - Question payloads never contain the correct option or explanation. In practice mode the verdict and explanation come back only after the student answers that question (and are restored after a reload); in test/mock mode nothing is revealed until the attempt is submitted.
  - The timer lives on the server: `deadline_at = start + duration`; answers are accepted up to 10 s after the deadline; an attempt past its deadline is graded and closed the next time it is touched (`expired`) with only the answers saved before the deadline; `server_now` is returned so the client corrects clock skew.
  - Grading is server-side from the stored options, idempotent, and final (no answers after submit). Scores, per-section breakdown and time spent are stored on the attempt.
  - Results and review are locked until the attempt is finished; attempts are private to their owner (other users get 404).
  - Mock tests require a verified email; practice does not.
  - Practice mode accepts one answer per question (no changing it after feedback); test mode saves and can change answers; marking for review works in both.
- **Web:** mock runner (server timer, queued autosave with retry and an offline banner, resume after reload, submit modal, auto-submit at zero), practice runner (server-created sets, instant feedback, mode switch only before answering, bookmarks, palette sheet on phones), results page, new answer-review page with filters, mock-test list with Start / Resume / Retake / Review, practice hub using real subject counts, saved-questions page on the bookmarks API. The old local score store, scoring helper and bundled question bank were deleted, so **no question or answer data ships in the web bundle any more**.
- **Seed:** now also creates the demo mock test ("LAT Full Mock Test 10": 12 questions, 15 minutes).
- **Checks:** API 66 tests (ruff, mypy strict clean); web lint, 8 unit tests and production build pass. A real-browser run (headless Edge, real API and database) passed **25/25** steps: unverified user blocked, real counts in the list, no answers in the page, offline banner then recovery with the queued answer saved, resume after reload with answers and server-clock timer, correct score/counts/sections, review filters and explanations, another student blocked from the result, practice feedback restored after reload and locked, bookmark add/remove, practice summary, and auto-submit when a 20-second paper ran out.

Gaps — **not** done:
- **No plan limits yet.** Free users can start unlimited practice and mock tests; the 300 MCQ / 2 mock monthly limits arrive with billing (phase 4).
- **Expiry is lazy.** A timed paper is closed and graded when next opened or submitted; there is no background job yet, so an abandoned paper stays `in_progress` in the database (and in the mock-test list) until the student touches it. A worker job is planned.
- **Options are not shuffled** per attempt.
- Practice sets are 10 random questions per subject; the API supports a topic filter but the UI does not expose it.
- Only the 12-question demo bank exists. The dashboard, analytics, leaderboard, exam list and LAT page still use mock data (phase 3 and the catalogue switch).
- The one-open-attempt rule is covered by a database-level test; the concurrent double-start path is not load-tested.
- A student who closes the tab while offline can lose the last queued answers (each answer is sent immediately when online).

Test-suite notes: tests use cheap Argon2 parameters, `DELETE` cleanup and `synchronous_commit = off` on the throwaway `prepmaster_test` database (TRUNCATE and full-strength hashing made the suite take minutes on Docker volumes). Next.js 16 keeps recently visited pages mounted but hidden, so browser tests must use role-based locators.

## 19. Phase 3 progress (2026-10-30)

Done:
- **`GET /api/v1/me/progress`** (new `progress` module): questions answered, correct, accuracy, answered today vs the daily goal, current and best study streak, this week vs last week, mock tests completed, target exam with days left, 7-day activity, accuracy per subject, weak topics (under 80% with at least 3 answers), and the score trend of the last 10 finished attempts.
- **Design change from section 4.3:** no `daily_stats` / `topic_stats` tables. Everything is computed from `attempt_answers` (graded answers only: practice answers count when checked, test-mode answers once the attempt is submitted). Days use `Asia/Karachi`. Rollup tables can be added later if the queries ever get slow; until then they would only be a second copy of the truth to keep in sync.
- **Web:** dashboard and analytics read the real endpoint (loading, error and empty states included); the dashboard "continue" card resumes a real open practice set; weak topics link to practice. The fake "daily challenge" card and the dashboard search box were removed (they did nothing).
- **Checks:** 11 new API tests (streak rules, graded-only counting, privacy between students); API now 77 tests; browser run 13/13 (empty state, 8 answers → 8 attempted / 75% / 1-day streak / 8 of 50 goal, subjects, analytics, no overflow on a phone, no page errors).

- **Exam list and exam page on the API (done, same day):** `/exams` and `/exams/[slug]` now read `GET /exams` and `GET /exams/{slug}`; the exam page works for any exam (no LAT special case) and shows sections with the student's accuracy, the exam's real mock tests, weak topics, bookmarks. `ExamSummary` gained `mock_test_count`. The practice hub accepts `?exam=`. The seeded LAT description had invented counts (7,400 MCQs, 62 mocks); replaced with a plain description. API 78 tests; browser 12/12.

- **Leaderboard (done, same day):** `GET /api/v1/leaderboard?period=week|all`. Opt-in only (`users.leaderboard_opt_in`, default off, migration `0004`), toggled in Settings or on the leaderboard page. Shows first name plus last initial, answered, accuracy and correct answers; ranked by correct answers, then accuracy, then fewer answers. Top 20, and a student outside it still sees their own rank. "This week" means the last 7 Karachi days. No email, surname or id is returned. API 85 tests; browser 10/10.

Not done yet in phase 3:
- Sidebar "1 free mock test left" box is still static (arrives with plan limits in phase 4).
- No "recommended practice set" yet; weak topics only link to the practice hub.
