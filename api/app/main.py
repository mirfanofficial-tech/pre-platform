import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.csrf import CsrfMiddleware
from app.core.errors import register_error_handlers
from app.core.request_id import RequestIdMiddleware
from app.db.session import dispose_engine
from app.modules.admin.router import router as admin_router
from app.modules.attempts.router import router as attempts_router
from app.modules.billing.router import router as billing_router
from app.modules.catalog.router import router as catalog_router
from app.modules.health.router import router as health_router
from app.modules.progress.router import router as progress_router
from app.modules.study.router import router as study_router
from app.modules.users.router import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await dispose_engine()


def configure_logging() -> None:
    app_logger = logging.getLogger("app")
    if not app_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s [%(name)s] %(message)s"))
        app_logger.addHandler(handler)
    app_logger.setLevel(logging.INFO)
    app_logger.propagate = False


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    if settings.is_production and settings.payment_provider == "fake":
        raise RuntimeError("PM_PAYMENT_PROVIDER=fake is not allowed in production")
    app = FastAPI(
        title="PrepMaster API",
        version=settings.app_version,
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF", "Idempotency-Key", "X-Request-ID"],
    )
    app.add_middleware(CsrfMiddleware)
    app.add_middleware(RequestIdMiddleware)
    register_error_handlers(app)
    app.include_router(health_router)
    app.include_router(users_router)
    app.include_router(catalog_router)
    app.include_router(attempts_router)
    app.include_router(study_router)
    app.include_router(progress_router)
    app.include_router(billing_router)
    app.include_router(admin_router)
    return app


app = create_app()
