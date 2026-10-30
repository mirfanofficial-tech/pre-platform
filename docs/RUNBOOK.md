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
