import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Date, cast, distinct, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.modules.admin import audit
from app.modules.admin.schemas import (
    AdminPaymentPage,
    AdminPaymentRow,
    AdminStats,
    AuditRow,
    CountBy,
    GrantIn,
    ReportRow,
    StudentPage,
    StudentPatch,
    StudentRow,
    WeekPoint,
)
from app.modules.attempts.models import Attempt
from app.modules.billing.entitlements import TIMEZONE, month_bounds
from app.modules.billing.models import Payment, Plan, Subscription
from app.modules.catalog.models import Exam, Question
from app.modules.study.models import QuestionReport
from app.modules.users.models import AuditLog, User

SIGNUP_WEEKS = 8


# ---- students ----


async def list_students(
    session: AsyncSession, *, search: str | None, role: str | None, page: int, page_size: int
) -> StudentPage:
    stmt = select(User)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(User.full_name.ilike(like) | User.email.ilike(like))
    if role:
        stmt = stmt.where(User.role == role)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    users = (
        await session.scalars(
            stmt.order_by(User.created_at.desc(), User.id)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).all()

    plans: dict[uuid.UUID, str] = {}
    if users:
        rows = await session.execute(
            select(Subscription.user_id, Plan.name)
            .join(Plan, Plan.id == Subscription.plan_id)
            .where(
                Subscription.user_id.in_([u.id for u in users]),
                Subscription.status == "active",
                Subscription.ends_at > func.now(),
            )
            .order_by(Subscription.ends_at)
        )
        plans = {uid: name for uid, name in rows.all()}  # the latest-ending plan wins

    return StudentPage(
        items=[
            StudentRow(
                id=u.id,
                full_name=u.full_name,
                email=u.email,
                role=u.role,
                status=u.status,
                email_verified=u.email_verified_at is not None,
                plan=plans.get(u.id, "Free"),
                joined=u.created_at,
                last_seen=u.last_seen_at,
            )
            for u in users
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


async def _student(session: AsyncSession, student_id: uuid.UUID) -> User:
    user = await session.get(User, student_id)
    if user is None:
        raise AppError(404, "not_found", "User not found")
    return user


async def patch_student(
    session: AsyncSession, actor: User, student_id: uuid.UUID, patch: StudentPatch
) -> None:
    user = await _student(session, student_id)
    if user.id == actor.id:
        raise AppError(409, "own_account", "You cannot change your own role or status")
    before = {"role": user.role, "status": user.status}
    if patch.role is not None:
        user.role = patch.role
    if patch.status is not None:
        user.status = patch.status
    audit.record(
        session,
        actor,
        "user.update",
        "user",
        user.id,
        before=before,
        after={"role": user.role, "status": user.status},
    )
    # A suspended account is refused on its next request: sessions are only honoured for
    # active users.
    await session.commit()


async def grant_premium(
    session: AsyncSession, actor: User, student_id: uuid.UUID, data: GrantIn
) -> None:
    user = await _student(session, student_id)
    plan = await session.scalar(select(Plan).where(Plan.code == data.plan_code, Plan.active))
    if plan is None or plan.price_paisa <= 0:
        raise AppError(404, "not_found", "Plan not found")
    days = data.days or plan.period_days
    now = datetime.now(UTC)
    latest = await session.scalar(
        select(func.max(Subscription.ends_at)).where(
            Subscription.user_id == user.id,
            Subscription.status == "active",
            Subscription.ends_at > now,
        )
    )
    starts = latest or now
    session.add(
        Subscription(
            user_id=user.id,
            plan_id=plan.id,
            starts_at=starts,
            ends_at=starts + timedelta(days=days),
        )
    )
    audit.record(
        session,
        actor,
        "premium.grant",
        "user",
        user.id,
        after={"plan": plan.code, "days": days},
    )
    await session.commit()


async def revoke_premium(session: AsyncSession, actor: User, student_id: uuid.UUID) -> None:
    user = await _student(session, student_id)
    result = await session.execute(
        update(Subscription)
        .where(
            Subscription.user_id == user.id,
            Subscription.status == "active",
            Subscription.ends_at > func.now(),
        )
        .values(status="cancelled")
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise AppError(409, "no_active_premium", "This student has no active Premium")
    audit.record(session, actor, "premium.revoke", "user", user.id)
    await session.commit()


# ---- payments ----


async def list_payments(
    session: AsyncSession, *, status: str | None, page: int, page_size: int
) -> AdminPaymentPage:
    stmt = (
        select(Payment, User.full_name, User.email, Plan.name)
        .join(User, User.id == Payment.user_id)
        .join(Plan, Plan.id == Payment.plan_id)
    )
    if status:
        stmt = stmt.where(Payment.status == status)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await session.execute(
        stmt.order_by(Payment.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
    )
    return AdminPaymentPage(
        items=[
            AdminPaymentRow(
                id=p.id,
                student=name,
                email=email,
                plan=plan,
                amount_paisa=p.amount_paisa,
                status=p.status,
                provider=p.provider,
                provider_ref=p.provider_ref,
                created_at=p.created_at,
                paid_at=p.paid_at,
            )
            for p, name, email, plan in rows.all()
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


async def refund_payment(session: AsyncSession, actor: User, payment_id: uuid.UUID) -> None:
    """Mark a paid payment as refunded and end the Premium it bought.

    This does not move money: refund the customer in the JazzCash merchant portal too.
    """
    payment = await session.scalar(
        select(Payment).where(Payment.id == payment_id).with_for_update()
    )
    if payment is None:
        raise AppError(404, "not_found", "Payment not found")
    if payment.status != "paid":
        raise AppError(409, "not_refundable", "Only paid payments can be refunded")
    payment.status = "refunded"
    await session.execute(
        update(Subscription)
        .where(Subscription.source_payment_id == payment.id)
        .values(status="cancelled")
    )
    audit.record(
        session,
        actor,
        "payment.refund",
        "payment",
        payment.id,
        before={"status": "paid"},
        after={"status": "refunded", "amount_paisa": payment.amount_paisa},
    )
    await session.commit()


# ---- reported questions ----


async def list_reports(session: AsyncSession, status: str) -> list[ReportRow]:
    rows = await session.execute(
        select(QuestionReport, Question.text, User.full_name)
        .join(Question, Question.id == QuestionReport.question_id)
        .outerjoin(User, User.id == QuestionReport.user_id)
        .where(QuestionReport.status == status)
        .order_by(QuestionReport.created_at.desc())
        .limit(100)
    )
    return [
        ReportRow(
            id=r.id,
            question_id=r.question_id,
            question=text,
            reason=r.reason,
            note=r.note,
            status=r.status,
            reporter=name,
            created_at=r.created_at,
        )
        for r, text, name in rows.all()
    ]


async def resolve_report(
    session: AsyncSession, actor: User, report_id: uuid.UUID, status: str
) -> None:
    report = await session.get(QuestionReport, report_id)
    if report is None:
        raise AppError(404, "not_found", "Report not found")
    before = report.status
    report.status = status
    audit.record(
        session,
        actor,
        f"report.{status}",
        "question_report",
        report.id,
        before={"status": before},
        after={"status": status},
    )
    await session.commit()


# ---- stats and audit ----


async def stats(session: AsyncSession) -> AdminStats:
    month_start, _ = await month_bounds(session)
    today = await session.scalar(select(cast(func.timezone(TIMEZONE, func.now()), Date)))
    assert today is not None

    async def count(stmt: object) -> int:
        return (await session.scalar(stmt)) or 0  # type: ignore[call-overload]

    students = await count(select(func.count()).select_from(User).where(User.role == "student"))
    active = await count(
        select(func.count(distinct(Attempt.user_id))).where(
            Attempt.started_at >= func.now() - timedelta(days=7)
        )
    )
    premium = await count(
        select(func.count(distinct(Subscription.user_id))).where(
            Subscription.status == "active", Subscription.ends_at > func.now()
        )
    )
    paid = Payment.status == "paid"
    revenue_month = await count(
        select(func.coalesce(func.sum(Payment.amount_paisa), 0)).where(
            paid, Payment.paid_at >= month_start
        )
    )
    revenue_total = await count(
        select(func.coalesce(func.sum(Payment.amount_paisa), 0)).where(paid)
    )

    by_status = (
        await session.execute(
            select(Question.status, func.count())
            .group_by(Question.status)
            .order_by(Question.status)
        )
    ).all()
    by_exam = (
        await session.execute(
            select(Exam.name, func.count())
            .join(Question, Question.exam_id == Exam.id)
            .where(Question.status == "published")
            .group_by(Exam.id, Exam.name, Exam.sort)
            .order_by(Exam.sort, Exam.name)
        )
    ).all()
    pending = await count(
        select(func.count()).select_from(Question).where(Question.status == "in_review")
    )
    open_reports = await count(
        select(func.count()).select_from(QuestionReport).where(QuestionReport.status == "open")
    )

    this_monday = today - timedelta(days=today.weekday())
    first = this_monday - timedelta(weeks=SIGNUP_WEEKS - 1)
    week = cast(func.date_trunc("week", func.timezone(TIMEZONE, User.created_at)), Date)
    per_week: dict[date, int] = dict(
        (
            await session.execute(select(week, func.count()).where(week >= first).group_by(week))
        ).all()
    )
    return AdminStats(
        students=students,
        active_last_7_days=active,
        premium_now=premium,
        revenue_this_month_paisa=revenue_month,
        revenue_total_paisa=revenue_total,
        questions_by_status=[CountBy(name=s, value=n) for s, n in by_status],
        questions_by_exam=[CountBy(name=name, value=n) for name, n in by_exam],
        pending_reviews=pending,
        open_reports=open_reports,
        signups=[
            WeekPoint(
                week_start=first + timedelta(weeks=i),
                signups=per_week.get(first + timedelta(weeks=i), 0),
            )
            for i in range(SIGNUP_WEEKS)
        ],
    )


async def list_audit(session: AsyncSession, limit: int = 100) -> list[AuditRow]:
    rows = await session.execute(
        select(AuditLog, User.full_name)
        .outerjoin(User, User.id == AuditLog.actor_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    )
    return [
        AuditRow(
            id=a.id,
            actor=name,
            action=a.action,
            entity=a.entity,
            entity_id=a.entity_id,
            created_at=a.created_at,
        )
        for a, name in rows.all()
    ]
