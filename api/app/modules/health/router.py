from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import problem
from app.db.session import get_session

router = APIRouter(tags=["ops"])


class Health(BaseModel):
    status: str
    version: str


@router.get("/healthz", response_model=Health, summary="Liveness check")
async def healthz() -> Health:
    return Health(status="ok", version=get_settings().app_version)


@router.get("/readyz", response_model=Health, summary="Readiness check (includes database)")
async def readyz(session: Annotated[AsyncSession, Depends(get_session)]) -> Health | JSONResponse:
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        return problem(503, "Database unavailable", code="db_unavailable")
    return Health(status="ready", version=get_settings().app_version)
