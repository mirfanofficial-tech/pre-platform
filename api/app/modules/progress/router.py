from typing import Literal

from fastapi import APIRouter

from app.modules.progress import leaderboard, service
from app.modules.progress.schemas import LeaderboardOut, ProgressOut
from app.modules.users.deps import CurrentUser, SessionDep

router = APIRouter(prefix="/api/v1", tags=["progress"])


@router.get("/me/progress", response_model=ProgressOut)
async def my_progress(user: CurrentUser, session: SessionDep) -> ProgressOut:
    return await service.build_progress(session, user)


@router.get("/leaderboard", response_model=LeaderboardOut)
async def get_leaderboard(
    user: CurrentUser, session: SessionDep, period: Literal["week", "all"] = "week"
) -> LeaderboardOut:
    return await leaderboard.build_leaderboard(session, user, period)
