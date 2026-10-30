import asyncio
import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


def _test_database_url() -> str:
    base = os.environ.get(
        "PM_DATABASE_URL", "postgresql+asyncpg://prep:prep@localhost:5433/prepmaster"
    )
    parts = urlsplit(base)
    name = parts.path.lstrip("/")
    if not name.endswith("_test"):
        name += "_test"
    return urlunsplit(parts._replace(path=f"/{name}"))


# Must happen before the app (and its cached settings) are imported.
os.environ["PM_DATABASE_URL"] = _test_database_url()
os.environ["PM_ENVIRONMENT"] = "test"

from argon2 import PasswordHasher  # noqa: E402

import app.core.security as security  # noqa: E402
import app.modules.users.service as user_service  # noqa: E402

# Production uses Argon2's strong defaults, which are deliberately slow. Tests hash passwords
# constantly, so use the cheapest settings (the stored format is still argon2id).
security._hasher = PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1)
security.DUMMY_HASH = security._hasher.hash("not-a-real-password")
user_service.__dict__["DUMMY_HASH"] = security.DUMMY_HASH

from app.core.email import OUTBOX  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import dispose_engine, get_engine  # noqa: E402
from app.main import create_app  # noqa: E402


async def _ensure_database() -> None:
    parts = urlsplit(os.environ["PM_DATABASE_URL"].replace("+asyncpg", ""))
    name = parts.path.lstrip("/")
    admin_url = urlunsplit(parts._replace(path="/postgres"))
    conn = await asyncpg.connect(admin_url)
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", name)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{name}"')
        # Throwaway data: do not wait for the disk on every commit (big win on Docker volumes).
        await conn.execute(f'ALTER DATABASE "{name}" SET synchronous_commit = off')
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> Iterator[None]:
    asyncio.run(_ensure_database())
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[1] / "migrations")
    )
    command.upgrade(config, "head")
    yield


@pytest.fixture(autouse=True)
async def clean_database() -> AsyncIterator[None]:
    OUTBOX.clear()
    # DELETE children before parents. (TRUNCATE rewrites every table file and forces disk
    # syncs, which made each test take seconds on Docker volumes.)
    async with get_engine().begin() as conn:
        await conn.execute(text("SET LOCAL synchronous_commit = off"))
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(text(f'DELETE FROM "{table.name}"'))
    yield
    await dispose_engine()


@pytest.fixture
def app() -> FastAPI:
    return create_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver", headers={"X-CSRF": "1"}
    ) as c:
        yield c


@pytest.fixture
async def other_client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    """A second browser (separate cookies) talking to the same app."""
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver", headers={"X-CSRF": "1"}
    ) as c:
        yield c


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as session:
        yield session
