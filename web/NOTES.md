# PrepMaster frontend — working notes

Running log of what is built, why, and what is next. Updated after every chunk of work.

## Project
- Student exam-prep site (LAT, MDCAT, ECAT, CSS/PMS, NTS — Pakistan, prices in PKR) with paid plans.
- Source design: pen.dev file (31 screens + component library), emerald brand, Inter font.
- Scope right now: **frontend only**, mock data, no backend or real payments.

## Run
```
cd web
npm run dev     # http://localhost:3000
npm run build   # must pass before finishing any chunk
```
Use npm (pnpm not installed on this machine).

## Stack
Next.js 16 (App Router, `cacheComponents` on) · TypeScript · Tailwind v4 · lucide-react · React Hook Form + Zod · Zustand · TanStack Query (installed, not used yet) · Recharts (installed, charts are hand-built bars for now).

## Structure
```
src/app
  (public)/   landing /, /pricing            header + footer layout
  (auth)/     /login, /register              split-screen layout
  (app)/      student app with sidebar:
              /dashboard /exams /exams/[slug] /practice /mock-tests
              /mock-tests/[id]/results /analytics /materials
  (exam)/     full-screen, no sidebar:
              /practice/session  /mock-tests/[id]/take
src/components
  ui/         button, badge, card (+ProgressBar, Eyebrow), field, modal
  layout/     site-header, site-footer, app-sidebar
  marketing/  section, plan-cards (monthly/annual toggle), faq
  exam/       palette (+OptionButton), practice-runner, mock-runner, results-view
  auth/       auth-form (login + register, Zod validation)
src/data      content.ts (copy, exams, plans, sections), questions.ts (12-question demo bank)
src/store     mock-store.ts (Zustand, persisted to sessionStorage)
```

## Design tokens
Pencil variables are mapped in `src/app/globals.css` (`@theme inline`): `brand-50…900`, `ink*`, `surface*`, `line*`, `warning/danger/info`, radii 8/12/16.

## Done
1. Scaffold + tokens + UI primitives.
2. Landing page (all sections), pricing page, login, register.
3. Student shell + dashboard.
4. Exam engine:
   - Practice mode / test mode toggle, instant explanations, palette, bookmark, mark for review, submit summary.
   - Timed mock: countdown from a stored `endsAt` (survives refresh), palette, mark/clear, submit modal, auto-submit at zero, low-time warning under 5 min.
   - Results: score, correct/incorrect/unanswered, time taken, per-section accuracy, score trend.
5. Exam discovery (search + category filter), exam detail (`/exams/lat` full; other exams show "coming soon").
6. Practice hub, mock-tests list, analytics, materials (simple versions).

## Decisions and gotchas
- Demo paper is **12 questions / 15 min**, not the design's 100 / 110. Real questions come from a backend later.
- `cacheComponents` requires: dynamic params need `generateStaticParams`; client hooks like `usePathname` need a `<Suspense>` boundary (done in `(app)/layout.tsx`); no `Date.now()` during render (mock-runner sets `now` in an effect).
- Mock store uses `skipHydration`; pages call `useMockStore.persist.rehydrate()` in an effect.
- Plan prices (Rs 1,499 / 2,499 per month; annual = 20% off) are placeholders.
- Login/register just redirect to `/dashboard`; no real auth.

7. Remaining screens (second pass):
   - Student: saved questions, leaderboard, subscription, settings.
   - `/checkout` (in the `(auth)` layout): plan summary from `?plan=&billing=`, JazzCash / Easypaisa / card choice, fake payment, success state.
   - Admin (`(admin)/admin`, own layout): overview dashboard, question bank list, **create MCQ** (live preview, 2–6 options, tags, difficulty, bulk-import card), students list. Other admin sections (exams, mock-tests, materials, subscriptions, reports, settings) are one "not in first release" placeholder (`[section]`).
   - Responsive: student sidebar is full at `lg`, an icon rail at `md`, and a top bar + bottom tab bar below `md`. Public header has a mobile menu. Admin shows a scrolling pill nav below `lg`.
   - Extra mock data lives in `src/data/extra.ts`.

## Verified
- `npm run build` passes (42 static pages) and eslint is clean.
- All 25 main routes return HTTP 200 on the dev server.
- **Visual pass (headless Edge via playwright-core, scripts kept in the session scratchpad, not in the repo):** screenshots at 1440, 834 and 390 wide of landing, pricing, dashboard, exams, LAT page, mock test, practice, admin, create MCQ, checkout, login. No horizontal overflow anywhere.
- Fixed in that pass:
  - Bar charts rendered empty (percent heights inside a column with no height). Columns now use `h-full justify-end`. Same fix in hero, results, analytics, admin.
  - Mobile tab bar labels ("My", "Performance") replaced by Home / Exams / Practice / Analytics / Profile.
  - Mock test and practice action buttons are now a sticky bottom bar below `lg`, with short labels on phones.
  - Dashboard mock card now says "Demo paper · 12 questions · 15 minutes".
- Still **not** compared pixel-by-pixel with the Pencil frames; checked for layout bugs and overall look only. Results page, modals and the practice feedback state were not screenshotted.

## Pencil comparison (landing hero, mock test)
Close match. Changed: hero badge is now a white pill with a dot, secondary hero button reads "Explore Exams" (links to `/#exams`), the tallest weekly bar is the darker green. Design's palette is a full-height right panel; ours is a card — left as is.

## Pencil comparison, second round (results, submit modal, practice feedback)
Compared with frames 07, 06 and 04; the flow was driven with a Playwright script (answer, mark, submit, results). Added:
- Results: score ring, "Review answers" / "Try another mock test" buttons, icon stat cards with "to spare" time, performance bars (amber under 50%), **Where to focus next** panel (lowest sections), **Answer breakdown** donut, two-column layout.
- Submit modal: warning icon; the auto-submit note turns red under 5 minutes.
- Practice: check / cross icons on options, palette summary (answered, marked, not visited), "Try another question" jumps to the next unanswered one.
Left as is: the design's focus topics are specific topic names; ours are section names derived from the result, because the demo bank has no topic taxonomy per section beyond one topic per question.

## Pencil comparison, third round (pricing, exam discovery, LAT page)
- **Plans now match the design:** Free (Rs 0 / forever), Premium Monthly (Rs 1,200 / month, "Most popular"), Premium Annual (Rs 9,600 / year, "Best value"). The earlier made-up Bootcamp plan and the monthly/annual toggle were removed. Data: `plans`, `comparison`, `pricingFaqs` in `src/data/content.ts`. Checkout reads `?plan=<id>` (`free`, `premium-monthly`, `premium-annual`) and the price from `plan.price`. The design still labels prices as placeholders, so keep that note.
- Pricing page: plan cards + "Compare what you get" table (Premium Monthly column tinted) + 3 pricing FAQs.
- Exam discovery: featured LAT banner (hidden while filtering), access and sort selects, "Request an exam" (mailto), 9 exam cards with access badge top-right, "Showing 9 exams / More exams are added every term". Catalog now has 10 exams (LAT featured + 9), including CSS Screening (MPT), University Entry (LUMS, IBA), Army / CAA.
- LAT page: progress bar and 118 / 7,400 / 62 stat boxes in the hero, tab row (anchors), design's four overview stats, "Saved and bookmarked" panel, "View all 62" link.
- Still different: the design's LAT page shows the Saved questions list in a right-hand column; ours is a full-width section at the bottom. Exam cards' "Free" badge uses the info (blue) tone.

## Pencil comparison, fourth round (dashboard, login, register, study materials)
- **Dashboard:** search + daily goal chip, "Welcome back, Ahmed!" with the target-exam card (118 days), 4 stats incl. streak, "Continue preparation" card, weekly activity (best day darker), accuracy by subject, recent test results table, recommended topics, daily challenge card. Data in `src/data/library.ts`.
- **Auth:** new `AuthShell` (brand panel with bullets + testimonial; `wide` for register). `(auth)/layout.tsx` is now a pass-through; login, register and checkout each wrap themselves in `AuthShell`. Login: show/hide password, keep me signed in, forgot password link, Google / phone buttons (show "not connected in this demo"). Register: phone (optional), exam select, password rule (8+ chars and a number), confirm-password match, terms checkbox, "Verification email sent" note, then redirect. `Field` got a `trailing` slot.
- Zod 4 gotcha: a cross-field `.refine` is skipped when another field already failed; the password-match check uses `when: () => true` so both errors show.
- **Study materials:** library page with search, subject / format selects, category pills, 9 resource cards (format badge, bookmark toggle, Preview / Download), info bar. Preview and Download show a "not connected in this demo" note. "Saved resources (n)" is computed (4 at start; the design says 12).
- Not done: the design's login error banner ("Incorrect email or password… 3 attempts remaining") — there is no real auth to fail, so it isn't shown.
- Verified by script: empty login submit → email + password errors; register with mismatched passwords and no terms → both errors; valid register → success note → `/dashboard`.

## Mobile and tablet pass (Pencil frames 16–21)
Compared with the mobile landing, dashboard, MCQ practice, timed mock, results and tablet dashboard frames, then built the phone behaviour for the exam screens:
- **Mock test (below `lg`):** compact header (title, "Question n of N · Test mode", timer pill), Answered / Unanswered / For review chips, "Review" chip next to the section label, full-width "Clear response" under the options, collapsible palette ("Tap to expand" with a scrolling number strip when collapsed), sticky bottom bar = back arrow, red-outline **Submit**, **Save & next**. Desktop layout unchanged.
- **Practice (below `lg`):** back arrow + two-line title, bookmark and flag icon buttons in the header, progress line, sticky bottom bar = back arrow, **palette button (opens a sheet)**, Submit, Next question. The desktop palette column is hidden on phones.
- **Results:** stat cards two across, the Performance column of the subject table is hidden on phones (scrolled out of view before).
- **Dashboard / landing:** stats two across on phones, hero buttons full width, hero stats three across; the dashboard's "Continue preparation" icon is hidden on phones.
- Student app already had the top bar + bottom tab bar (Home / Exams / Practice / Analytics / Profile) and the tablet icon rail.
- Layout gotcha found: grid children need `min-w-0` or a wide child (scroll strip, table, option rows) stretches the whole page sideways. Fixed in mock runner, results and the create-MCQ form.
- Dev-only: reading `params` outside `<Suspense>` in `admin/[section]` logged an error in dev; the page now wraps the param read in Suspense.
- Verified with headless Edge: **no horizontal overflow on any of 22 routes at 390 and 834 wide**; palette sheet opens/closes, expanded palette, submit modal and results flow work on a phone-size viewport with no page errors.
- Not matched to the design on phones: the results page has no sticky "Review answers / Try another mock" bar (the sticky tab bar is shown instead, and the same buttons sit in the hero); the mobile landing's section designs were not compared beyond the hero; there is no separate tablet layout beyond the icon rail.

## Backend progress
- **Hosting: VPS confirmed (2026-10-28)** → FastAPI + PostgreSQL plan is the chosen one; the cPanel/Laravel notes below are kept only as history.
- **Phase 0 done:** `../api` (FastAPI skeleton, Alembic, tests), `../infra/docker-compose.yml`, `../docs/openapi.json`, generated `src/lib/api-types.ts`, `src/lib/api.ts` client, CI workflow, `../docs/RUNBOOK.md`. Details and caveats in `../docs/PLAN.md` section 16.
- **Phase 1 done (2026-10-28):** real accounts end to end. Backend: users/sessions/tokens/catalogue tables, register/login/logout/verify/forgot/reset/me, CSRF header, role guard, seed + create-admin scripts, 37 API tests. Web: real login/register (API errors mapped to fields and a banner), forgot/reset/verify pages, `src/proxy.ts` (cookie check → redirect to login with `next`), `AuthGuard` in the `(app)`, `(exam)` and `(admin)` layouts, `useMe` hook (TanStack Query), logout, settings saved to API, verify-email banner. Browser run against the real API passed 16/16 steps. Details: `../docs/PLAN.md` section 17.
- **Phase 2 done (2026-10-30):** exam engine on the real API. Server-side timer, grading, answer hiding, practice feedback, bookmarks, reports, results and review. Web: `src/lib/exam.ts` client, rewritten `mock-runner`, `practice-runner`, `results-view`, new `review-view`, `mock-test-list`, `/attempts/[id]/result` and `/review` routes, `/mock-tests/[id]/take` is now dynamic (UUID). Deleted: local score store, scoring helper, bundled question bank. API 66 tests; browser run 25/25. Details and gaps: `../docs/PLAN.md` section 18.
- **Phase 3 (partly done, 2026-10-30):** dashboard and analytics use `GET /me/progress` (`src/components/progress/*`, `getProgress` in `lib/exam.ts`). API 77 tests, browser 13/13. Details: `../docs/PLAN.md` section 19.
- **Exam list and exam page** now use the API (`src/components/exams/*`); tags and invented counts were dropped. Practice hub reads `?exam=`.
- **Leaderboard** on the API, opt-in (`src/components/progress/leaderboard-view.tsx`, toggle in Settings).
- **Phase 4 (2026-11-02):** pricing, checkout, payment status, subscription and sidebar use the billing API (`src/lib/billing.ts`, `src/components/checkout/*`, `src/components/billing/*`). Hardcoded plans and payment methods removed. JazzCash needs a sandbox check; details in `../docs/PLAN.md` section 20 and `../docs/RUNBOOK.md`.
- **Phase 5 (2026-11-02):** admin console on the API (`src/lib/admin.ts`, `src/components/admin/*`): overview, question bank with editor and review workflow, CSV import, students, payments and refunds, reported questions, audit log. Mock admin components and data deleted. Details: `../docs/PLAN.md` section 21.
- **Phase 5 part 2 (2026-11-02):** admin Exams & Subjects (`exams-admin.tsx`, `exam-structure.tsx`) and the mock-test builder (`mocks-admin.tsx`, `mock-builder.tsx`). Details: `../docs/PLAN.md` section 22.
- **Still mock data:** study materials, landing page content, and the admin placeholders for materials and settings. **No plan limits** until billing.
- **Not done (phase 1):** email is only printed to the API log (no provider yet); exam discovery / LAT / practice / mock / results / analytics pages still use mock data; no IP rate limiting.
- To log in during development: register in the web app, or run `create_admin` for a staff account (see `../docs/RUNBOOK.md`). Tokens for verify/reset links are in `docker compose logs api`.
- Dev database runs on **port 5433** (a different PostgreSQL already owns 5432 here). Frontend dev server: port 3001 (3000 is another app).
- Frontend still runs on mock data; nothing calls the API yet (the client and types are ready for phase 1).
- Next: phase 1 (users, auth, catalogue tables, seed, web login).

## Full plan
The complete build plan (architecture, database schema, API, server-side rules, security, frontend changes, scraper pipeline, infrastructure, testing, roadmap, launch checklist, risks) is in `../docs/PLAN.md`. It assumes FastAPI + PostgreSQL on a VPS/PaaS; owner has not yet confirmed hosting or payment gateway.

## Backend option under discussion: FastAPI + PostgreSQL (user proposal)
- Better fit than Laravel for the scraper (Scrapy/Playwright, PDF/OCR, dedupe with `pgvector`) and gives a typed TS client for the frontend via the OpenAPI spec.
- **Requires a VPS or PaaS, not shared cPanel** (ASGI + workers + Postgres are poor or missing on shared cPanel). If the host stays shared cPanel, fall back to the Laravel + MySQL plan below.
- Proposed: FastAPI (async), SQLAlchemy 2 + Alembic, PostgreSQL + pgvector, `fastapi-users` or Authlib (secure cookies, email verification, roles), Procrastinate (Postgres job queue) for scraper and scheduled jobs, Cloudflare R2, Resend, JazzCash / Easypaisa webhooks as endpoints, Docker Compose on a VPS (Caddy/Nginx), or Railway/Render + Neon. Frontend on Vercel or same server; keep API on a subdomain of the same site so cookies work. Daily database dumps to R2.
- **Open:** can hosting move to a VPS / PaaS? comfortable with Python?

## Hosting decision (cPanel) — applies only if the host stays shared cPanel
- Hosting will be **cPanel**. Shared cPanel usually means PHP + MySQL only: no reliable Node server, no long-running workers, no Playwright, often no PostgreSQL.
- **Revised plan:** backend = **Laravel (PHP) + MySQL 8 / MariaDB with `utf8mb4`** (needed for Urdu) on cPanel; Sanctum for auth; Laravel scheduler driven by one cPanel cron entry, database queue for light jobs; frontend = the existing Next.js app on Vercel (or cPanel Node.js app if the host supports it); scraper = separate program on a local machine or small VPS that posts reviewed candidates to the API staging endpoint. Duplicate detection (hash + similarity) happens in the scraper since MySQL has no `pgvector`. Search via MySQL FULLTEXT.
- **Ask the host:** shared vs VPS/WHM, SSH access, PHP version (Laravel needs 8.2+), "Setup Node.js App" availability and Node version, PostgreSQL availability, memory/process/cron limits. If it is a VPS, revisit PostgreSQL.
- The frontend will need an API client layer and the answers-not-in-the-browser change regardless of backend language.

## Backend plan (proposed, not started)
- **Original stack idea (before cPanel):** backend inside the Next.js app (server actions + route handlers), PostgreSQL (Neon or Supabase), Drizzle or Prisma, Better Auth or Auth.js, Resend for email, Cloudflare R2 / Supabase Storage for PDFs, JazzCash / Easypaisa (+ optional card gateway) for payments via hosted checkout and webhooks.
- **Must change from the demo:** correct answers currently ship to the browser; timer and marking must be server-side; free-plan limits and Premium content need server checks; payment state only from idempotent webhooks; admin needs roles; add rate limits, audit log, backups.
- **Core tables:** users, exams, subjects, topics, questions, question_options, mock_tests, attempts, attempt_answers, plans, subscriptions, payments, resources, bookmarks, daily_stats, audit_log.
- **Build order:** (1) DB + migrations + seed from current mock data + auth/roles, (2) content API + working admin form, (3) exam engine with server attempts/timer/marking, (4) real analytics, (5) payments + entitlements, (6) import, review queue, reports, hardening.
- **Open decisions:** payment gateway; hosting (Vercel + managed DB vs own VPS).

## Scraper plan (proposed, not started)
- **Legal first:** the site promises original material and past papers only where redistribution is allowed. Scrape only sources with a clear licence or explicit permission (official published past papers, open-licence content). Do not copy other prep sites or copyrighted books. Do not use an LLM to reword copied questions. Prefer teacher-written, partner-licensed and teacher-reviewed generated-from-syllabus questions.
- **Design:** separate worker (not in the web app) with its own DB role limited to staging tables; Playwright for dynamic pages, plain HTTP + parser otherwise; job queue (pg-boss); obey robots.txt, rate-limit, clear user agent, per-source on/off switch; PDF text extraction with OCR fallback (Urdu OCR needs human check).
- **Pipeline:** normalise to schema, quality checks (4 options, answer key, language), duplicate detection (hash + similarity), staging table with provenance (`source_url`, licence, `scraped_at`, content hash), human review queue (Draft → In review → Published, matching the admin design), takedown by source, alerts when a source layout changes.
- **Tables to add:** `sources`, `scrape_runs`, `question_candidates`; on `questions`: `source_id`, `licence`, `reviewed_by`, `published_at`.
- **Order:** staging table + review queue first, then one clearly licensed source end to end, then more sources only after each licence is confirmed.
- **Open questions:** which sources; who reviews content before it goes live.

## Tests
- `npm test` runs Vitest (config: `vitest.config.mts`). 8 tests pass: scoring (`src/lib/score.ts`, extracted from the results page) and the mock store (`src/store/mock-store.ts`).
- No component or browser (Playwright) tests yet.

## Dev-server note
Port 3000 on this machine is used by another app ("Sehat Desk"); the PrepMaster dev server ran on **3001**.

## Not built yet (next)
- Compare the remaining screens with the Pencil frames (done: landing hero, mock test, results, submit modal, practice). Also done: pricing, exam discovery, LAT page, dashboard, login, register, study materials. Mobile and tablet frames 16–21 done (see above). Not yet: analytics, saved questions, admin screens vs their frames.
- Dead links: footer links (`#`), study material "Open", admin placeholder sections.
- Mobile-specific exam layouts (palette as a drawer, sticky action bars) — currently the desktop layout just stacks.
- Real auth gating, MSW mock API + TanStack Query wiring, tests (Vitest, Playwright).
- Full-size mock paper (100 questions) and a real question bank.
