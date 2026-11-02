import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.modules.billing.entitlements import get_entitlement
from app.modules.billing.models import Payment, PaymentEvent, Plan, Subscription
from app.modules.billing.providers import Notification, PaymentProvider
from app.modules.billing.schemas import (
    CheckoutOut,
    PaymentOut,
    PlanOut,
    SubscriptionOut,
    UsageOut,
)
from app.modules.users.models import User

log = logging.getLogger("app.billing")


def plan_out(plan: Plan) -> PlanOut:
    return PlanOut(
        code=plan.code,
        name=plan.name,
        blurb=plan.blurb,
        price_paisa=plan.price_paisa,
        period_days=plan.period_days,
        limits={k: int(v) for k, v in plan.limits.items()},
        features=list(plan.features),
        badge=plan.badge,
    )


async def list_plans(session: AsyncSession) -> list[PlanOut]:
    rows = await session.scalars(
        select(Plan).where(Plan.active).order_by(Plan.sort, Plan.price_paisa)
    )
    return [plan_out(p) for p in rows]


async def my_subscription(session: AsyncSession, user: User) -> SubscriptionOut:
    ent = await get_entitlement(session, user)
    return SubscriptionOut(
        plan_code=ent.plan_code,
        plan_name=ent.plan_name,
        premium=ent.premium,
        ends_at=ent.ends_at,
        limits=ent.limits,
        usage=UsageOut(mcq_used=ent.mcq_used, mock_used=ent.mock_used),
        resets_at=ent.resets_at,
    )


# ---- checkout ---------------------------------------------------------------------


async def create_checkout(
    session: AsyncSession, user: User, provider: PaymentProvider, plan_code: str
) -> CheckoutOut:
    if user.email_verified_at is None:
        raise AppError(
            403,
            "email_not_verified",
            "Confirm your email address first",
            "We send your receipt to your email, so confirm it before paying.",
        )
    plan = await session.scalar(select(Plan).where(Plan.code == plan_code, Plan.active))
    if plan is None or plan.price_paisa <= 0:
        raise AppError(404, "not_found", "Plan not found")

    ref = provider.new_ref()
    request = provider.build_request(
        ref=ref, amount_paisa=plan.price_paisa, description=f"PrepMaster {plan.name}"
    )
    payment = Payment(
        user_id=user.id,
        plan_id=plan.id,
        provider=provider.name,
        provider_ref=ref,
        amount_paisa=plan.price_paisa,
        # Never store the merchant password or the hash we computed.
        raw_request={
            k: v for k, v in request.fields.items() if k not in ("pp_Password", "pp_SecureHash")
        },
    )
    session.add(payment)
    await session.commit()
    return CheckoutOut(
        payment_id=payment.id,
        method=request.method,
        action_url=request.action_url,
        fields=request.fields,
    )


# ---- gateway notifications ------------------------------------------------------------


async def process_notification(
    session: AsyncSession, provider_name: str, note: Notification
) -> Payment:
    """Apply a verified notification exactly once, however often it is delivered."""
    payment = await session.scalar(
        select(Payment)
        .where(Payment.provider == provider_name, Payment.provider_ref == note.ref)
        .with_for_update()
    )
    if payment is None:
        raise AppError(404, "not_found", "Unknown payment")

    first_time = await session.scalar(
        insert(PaymentEvent)
        .values(provider=provider_name, event_id=note.event_id, payload=note.payload)
        .on_conflict_do_nothing(index_elements=["provider", "event_id"])
        .returning(PaymentEvent.id)
    )
    if first_time is None or payment.status != "pending":
        await session.commit()
        return payment

    payment.raw_response = note.payload
    if note.amount_paisa != payment.amount_paisa:
        log.warning(
            "payment %s amount mismatch: expected %s got %s",
            payment.id,
            payment.amount_paisa,
            note.amount_paisa,
        )
        payment.status = "failed"
    elif not note.success:
        payment.status = "failed"
    else:
        payment.status = "paid"
        payment.paid_at = datetime.now(UTC)
        await _grant(session, payment)
    await session.commit()
    return payment


async def _grant(session: AsyncSession, payment: Payment) -> None:
    plan = await session.get(Plan, payment.plan_id)
    assert plan is not None
    now = datetime.now(UTC)
    latest_end = await session.scalar(
        select(Subscription.ends_at)
        .where(
            Subscription.user_id == payment.user_id,
            Subscription.status == "active",
            Subscription.ends_at > now,
        )
        .order_by(Subscription.ends_at.desc())
        .limit(1)
    )
    starts = latest_end or now  # renewing early extends the current period
    session.add(
        Subscription(
            user_id=payment.user_id,
            plan_id=plan.id,
            starts_at=starts,
            ends_at=starts + timedelta(days=plan.period_days),
            source_payment_id=payment.id,
        )
    )


# ---- history ----------------------------------------------------------------------------


def _payment_out(payment: Payment, plan_name: str) -> PaymentOut:
    return PaymentOut(
        id=payment.id,
        plan_name=plan_name,
        amount_paisa=payment.amount_paisa,
        status=payment.status,
        provider=payment.provider,
        created_at=payment.created_at,
        paid_at=payment.paid_at,
    )


async def list_payments(session: AsyncSession, user: User) -> list[PaymentOut]:
    rows = await session.execute(
        select(Payment, Plan.name)
        .join(Plan, Plan.id == Payment.plan_id)
        .where(Payment.user_id == user.id)
        .order_by(Payment.created_at.desc())
        .limit(50)
    )
    return [_payment_out(p, name) for p, name in rows.all()]


async def get_payment(session: AsyncSession, user: User, payment_id: uuid.UUID) -> PaymentOut:
    row = (
        await session.execute(
            select(Payment, Plan.name)
            .join(Plan, Plan.id == Payment.plan_id)
            .where(Payment.id == payment_id, Payment.user_id == user.id)
        )
    ).first()
    if row is None:
        raise AppError(404, "not_found", "Payment not found")
    return _payment_out(row[0], row[1])
