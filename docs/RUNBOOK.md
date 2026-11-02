# Runbook (development)

## Prerequisites
Python 3.12, Node 20+, Docker Desktop.

## Start the database and API (Docker)
```
cd infra
docker compose up -d --build        # db on localhost:5433, api on localhost:8000
curl http://localhost:8000/readyz   # {"status":"ready",...}
docker compose logs -f api
docker compose down                 # keep data; add -v to wipe the database
```
The API container runs `alembic upgrade head` on start.

> Port 5433 is used because this machine already has a PostgreSQL on 5432 (another project). Do not stop it.

## Work on the API locally
```
cd api
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"     # Windows; use .venv/bin/python on Linux/macOS
copy .env.example .env
docker compose -f ../infra/docker-compose.yml up -d db
.venv\Scripts\python -m alembic upgrade head
.venv\Scripts\python -m uvicorn app.main:app --reload     # http://localhost:8000/docs
```

## Seed data and an admin account
```
docker compose -f infra/docker-compose.yml exec api python -m app.scripts.seed
docker compose -f infra/docker-compose.yml exec -it api python -m app.scripts.create_admin --email you@example.com --name "Your Name"
```
The seed is safe to run repeatedly. Without Docker use `.venv\Scripts\python -m app.scripts.seed` from `api/`.

## Trying the exam engine
After seeding, register in the web app, open the verification link from the API log (see below), then open **Mock tests** and start "LAT Full Mock Test 10" (15 minutes, 12 questions). Practice sets start from **Practice MCQs**. Answers are never in the page: they are checked by the API.

## Plans, prices and payments
- Plans live in the `plans` table (`api/seed/plans.json` holds the suggested ones: Free, Premium Monthly Rs 1,200 / 30 days, Premium Annual Rs 12,000 / 365 days). `python -m app.scripts.seed` creates any that are missing and **never overwrites** an existing row, so you can change a price in the database (`price_paisa` is in paisa: Rs 1,200 = 120000) and it stays. Free-plan limits are the `limits` JSON on the `free` row; a missing key means unlimited.
- **Development:** `PM_PAYMENT_PROVIDER=fake` (the default). Checkout sends you to `/checkout/test-gateway` where you choose "Pay successfully" or "Fail the payment". It uses the same signed code path as a real callback. The API refuses to start in production with the fake provider.
- **JazzCash:** set `PM_PAYMENT_PROVIDER=jazzcash`, `PM_JAZZCASH_MERCHANT_ID`, `PM_JAZZCASH_PASSWORD`, `PM_JAZZCASH_INTEGRITY_SALT` (sandbox first, then production), and `PM_API_BASE_URL` to the public https URL of the API. In the JazzCash merchant portal the return URL is `<API>/api/v1/billing/webhooks/jazzcash`. **The JazzCash code follows their published hosted-page scheme and is unit-tested against that scheme, but it has not been run against their sandbox yet. Do a sandbox payment, a declined payment and a replayed return before going live.**
- Premium never auto-renews. Paying again while Premium is active adds the new period after the current one.

## Emails in development
Emails (verify, reset) are printed to the API log instead of being sent:
```
docker compose -f infra/docker-compose.yml logs api | findstr token=
```
Open the printed link (it points at the web app, for example `/verify-email?token=...`).

## Checks (same as CI)
```
cd api
.venv\Scripts\python -m ruff check .
.venv\Scripts\python -m ruff format --check .
.venv\Scripts\python -m mypy app tests
.venv\Scripts\python -m pytest -q          # needs the db container running; uses a separate prepmaster_test database (created automatically)
```

## Migrations
```
.venv\Scripts\python -m alembic revision --autogenerate -m "describe change"
.venv\Scripts\python -m alembic upgrade head
.venv\Scripts\python -m alembic downgrade -1
```
Rule: migrations must stay backward-compatible for one release so a rollback is safe.

## API contract → frontend types
Whenever an endpoint or schema changes:
```
cd api
.venv\Scripts\python scripts/export_openapi.py     # writes docs/openapi.json
cd ../web
npm run api:types                                  # writes src/lib/api-types.ts
```
CI fails if either file is stale.

## Frontend
```
cd web
copy .env.example .env.local       # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                        # http://localhost:3001 (port 3000 is taken on this machine)
```
The browser origin must be listed in `PM_CORS_ORIGINS` for cookies to work.

## Repository note
`web/` currently has its own git repository (created by create-next-app). The plan assumes **one repository at `pmc/`** containing `web/`, `api/`, `infra/`, `docs/`. Decide before the first commit; CI lives in `pmc/.github`.
