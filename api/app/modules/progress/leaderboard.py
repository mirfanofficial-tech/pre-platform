from datetime import timedelta
from typing import Any

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.attempts.models import Attempt, AttemptAnswer
from app.modules.progress.schemas import LeaderboardEntry, LeaderboardOut
from app.modules.progress.service import TIMEZONE
from app.modules.users.models import User

TOP = 20
WEEK_DAYS = 7


def public_name(full_name: str) -> str:
    """First name plus the initial of the last name: "Ana Khan" -> "Ana K."."""
    parts = full_name.split()
    if len(parts) < 2:
        return parts[0] if parts else "Student"
    return f"{parts[0]} {parts[-1][0].upper()}."


async def build_leaderboard(session: AsyncSession, user: User, period: str) -> LeaderboardOut:
    graded = AttemptAnswer.is_correct.is_not(None)
    correct = func.count().filter(AttemptAnswer.is_correct.is_(True))
    answered = func.count()

    stats = (
        select(
            User.id.label("user_id"),
            User.full_name.label("full_name"),
            answered.label("answered"),
            correct.label("correct"),
        )
        .select_from(AttemptAnswer)
        .join(Attempt, Attempt.id == AttemptAnswer.attempt_id)
        .join(User, User.id == Attempt.user_id)
        .where(graded, User.leaderboard_opt_in.is_(True), User.status == "active")
        .group_by(User.id, User.full_name)
    )
    if period == "week":
        today = select(cast(func.timezone(TIMEZONE, func.now()), Date)).scalar_subquery()
        day = cast(func.timezone(TIMEZONE, AttemptAnswer.answered_at), Date)
        stats = stats.where(day >= today - timedelta(days=WEEK_DAYS - 1))
    s = stats.subquery()

    ranked = select(
        s.c.user_id,
        s.c.full_name,
        s.c.answered,
        s.c.correct,
        func.row_number()
        .over(
            order_by=(
                s.c.correct.desc(),
                (s.c.correct * 1.0 / s.c.answered).desc(),
                s.c.answered.asc(),
                s.c.user_id,
            )
        )
        .label("rank"),
    ).subquery()

    rows = (
        await session.execute(
            select(ranked)
            .where((ranked.c.rank <= TOP) | (ranked.c.user_id == user.id))
            .order_by(ranked.c.rank)
        )
    ).all()

    def entry(row: Any) -> LeaderboardEntry:
        user_id, full_name, n, c, rank = row
        return LeaderboardEntry(
            rank=rank,
            name=public_name(full_name),
            answered=n,
            correct=c,
            percent=round(c / n * 100) if n else 0,
            is_me=user_id == user.id,
        )

    entries = [entry(r) for r in rows]
    return LeaderboardOut(
        period=period,
        opted_in=user.leaderboard_opt_in,
        entries=[e for e in entries if e.rank <= TOP],
        me=next((e for e in entries if e.is_me), None),
    )
