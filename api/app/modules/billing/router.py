import logging
import uuid
from urllib.parse import parse_qsl

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.config import get_settings
from app.core.errors import AppError
from app.modules.billing import service
from app.modules.billing.models import Payment
from app.modules.billing.providers import FakeProvider, InvalidSignature, get_provider
from app.modules.billing.schemas import (
    CheckoutIn,
    CheckoutOut,
    FakeCompleteIn,
    PaymentOut,
    PlanOut,
    SubscriptionOut,
)
from app.modules.users.deps import CurrentUser, SessionDep

log = logging.getLogger("app.billing")
router = APIRouter(prefix="/api/v1", tags=["billing"])


@router.get("/plans", response_model=list[PlanOut])
async def list_plans(session: SessionDep) -> list[PlanOut]:
    return await service.list_plans(session)


@router.get("/me/subscription", response_model=SubscriptionOut)
async def my_subscription(user: CurrentUser, session: SessionDep) -> SubscriptionOut:
    return await service.my_subscription(session, user)


@router.get("/me/payments", response_model=list[PaymentOut])
async def my_payments(user: CurrentUser, session: SessionDep) -> list[PaymentOut]:
    return await service.list_payments(session, user)


@router.get("/me/payments/{payment_id}", response_model=PaymentOut)
async def my_payment(payment_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> PaymentOut:
    return await service.get_payment(session, user, payment_id)


@router.post("/billing/checkout", response_model=CheckoutOut)
async def checkout(data: CheckoutIn, user: CurrentUser, session: SessionDep) -> CheckoutOut:
    provider = get_provider(get_settings())
    return await service.create_checkout(session, user, provider, data.plan_code)


@router.post("/billing/webhooks/{provider_name}")
async def gateway_callback(
    provider_name: str, request: Request, session: SessionDep
) -> RedirectResponse:
    """Signed result from the gateway (JazzCash posts the shopper's browser here).

    Authenticity comes from the signature, not from a cookie, so this path is exempt from the
    CSRF header check. Replays are harmless: each event is applied once.
    """
    settings = get_settings()
    provider = get_provider(settings)
    if provider.name != provider_name:
        raise AppError(404, "not_found", "Unknown payment provider")

    body = (await request.body()).decode("utf-8", errors="replace")
    data = dict(parse_qsl(body, keep_blank_values=True))
    try:
        note = provider.parse_notification(data)
    except InvalidSignature:
        log.warning("rejected %s callback with an invalid signature", provider_name)
        raise AppError(400, "invalid_signature", "Invalid payment notification") from None

    payment = await service.process_notification(session, provider_name, note)
    return RedirectResponse(
        f"{settings.web_base_url}/checkout/status?payment={payment.id}", status_code=303
    )


@router.post("/billing/test-gateway/complete", response_model=PaymentOut)
async def complete_test_payment(
    data: FakeCompleteIn, user: CurrentUser, session: SessionDep
) -> PaymentOut:
    """Stand-in for the gateway in development: pays or fails a pending payment.

    It builds a correctly signed notification and runs it through the same code as a real
    callback. Unavailable in production and whenever a real provider is configured.
    """
    settings = get_settings()
    provider = get_provider(settings)
    if settings.is_production or not isinstance(provider, FakeProvider):
        raise AppError(404, "not_found", "Not found")

    payment = await session.scalar(
        select(Payment).where(
            Payment.provider == provider.name,
            Payment.provider_ref == data.ref,
            Payment.user_id == user.id,
        )
    )
    if payment is None:
        raise AppError(404, "not_found", "Payment not found")
    note = provider.parse_notification(
        provider.notification(data.ref, payment.amount_paisa, data.outcome)
    )
    await service.process_notification(session, provider.name, note)
    return await service.get_payment(session, user, payment.id)
