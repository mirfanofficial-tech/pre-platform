"""What a student may do, decided in one place and enforced on the server.

Usage is derived from attempts: practice answers given this month and mock tests started this
month (months run on Asia/Karachi time). A plan limit that is missing means unlimited.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.modules.attempts.models import Attempt, AttemptAnswer
from app.modules.billing.models import Plan, Subscription
from app.modules.study.models import Bookmark
from app.modules.users.models import User

TIMEZONE = "Asia/Karachi"
FREE_CODE = "free"
# Used when the plans table has no free plan (for example before seeding).
FREE_DEFAULTS = {"mcq_per_month": 300, "mock_per_month": 2, "saved_questions": 25}


@dataclass
class Entitlement:
    plan_code: str
    plan_name: str
    premium: bool
    ends_at: datetime | None
    limits: dict[str, int]
    mcq_used: int
    mock_used: int
    resets_at: datetime

    def remaining(self, key: str, used: int) -> int | None:
        limit = self.limits.get(key)
        return None if limit is None else max(0, limit - used)


async def _month(session: AsyncSession) -> tuple[datetime, datetime]:
    local_now = func.timezone(TIMEZONE, func.now())
    start = func.timezone(TIMEZONE, func.date_trunc("month", local_now))
    nxt = func.timezone(
        TIMEZONE, func.date_trunc("month", local_now + literal_column("interval '1 month'"))
    )
    row = (await session.execute(select(start, nxt))).one()
    return row[0], row[1]


async def active_subscription(
    session: AsyncSession, user_id: uuid.UUID
) -> tuple[Subscription, Plan] | None:
    row = (
        await session.execute(
            select(Subscription, Plan)
            .join(Plan, Plan.id == Subscription.plan_id)
            .where(
                Subscription.user_id == user_id,
                Subscription.status == "active",
                Subscription.ends_at > func.now(),
            )
            .order_by(Subscription.ends_at.desc())
            .limit(1)
        )
    ).first()
    return None if row is None else (row[0], row[1])


async def get_entitlement(session: AsyncSession, user: User) -> Entitlement:
    month_start, resets_at = await _month(session)
    mcq_used = (
        await session.scalar(
            select(func.count())
            .select_from(AttemptAnswer)
            .join(Attempt, Attempt.id == AttemptAnswer.attempt_id)
            .where(
                Attempt.user_id == user.id,
                Attempt.type == "practice",
                AttemptAnswer.selected_option_id.is_not(None),
                AttemptAnswer.answered_at >= month_start,
            )
        )
    ) or 0
    mock_used = (
        await session.scalar(
            select(func.count())
            .select_from(Attempt)
            .where(
                Attempt.user_id == user.id,
                Attempt.type == "mock",
                Attempt.started_at >= month_start,
            )
        )
    ) or 0

    current = await active_subscription(session, user.id)
    if current is not None:
        sub, plan = current
        limits = {k: int(v) for k, v in plan.limits.items()}
        return Entitlement(
            plan.code, plan.name, True, sub.ends_at, limits, mcq_used, mock_used, resets_at
        )
    free = await session.scalar(select(Plan).where(Plan.code == FREE_CODE))
    limits = {k: int(v) for k, v in free.limits.items()} if free else dict(FREE_DEFAULTS)
    name = free.name if free else "Free"
    return Entitlement(FREE_CODE, name, False, None, limits, mcq_used, mock_used, resets_at)


def limit_reached(what: str) -> AppError:
    return AppError(
        403,
        "limit_reached",
        "Monthly limit reached",
        f"You have used all your free {what} for this month. Upgrade to Premium to continue.",
    )


async def mcq_allowance(session: AsyncSession, user: User) -> int | None:
    """Practice answers still available this month (None = unlimited)."""
    ent = await get_entitlement(session, user)
    return ent.remaining("mcq_per_month", ent.mcq_used)


async def check_mock_start(session: AsyncSession, user: User, mock_access: str) -> None:
    ent = await get_entitlement(session, user)
    if mock_access == "premium" and not ent.premium:
        raise AppError(
            403, "premium_required", "Premium mock test", "This mock test is part of Premium."
        )
    if ent.remaining("mock_per_month", ent.mock_used) == 0:
        raise limit_reached("mock tests")


async def check_bookmark(session: AsyncSession, user: User, question_id: uuid.UUID) -> None:
    ent = await get_entitlement(session, user)
    limit = ent.limits.get("saved_questions")
    if limit is None:
        return
    if await session.get(Bookmark, (user.id, question_id)) is not None:
        return
    saved = (
        await session.scalar(
            select(func.count()).select_from(Bookmark).where(Bookmark.user_id == user.id)
        )
    ) or 0
    if saved >= limit:
        raise AppError(
            403,
            "limit_reached",
            "Saved question limit reached",
            f"Free accounts can save {limit} questions. Upgrade to Premium to save more.",
        )
