import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.modules.attempts.models import MockTest
from app.modules.billing import router as billing_router
from app.modules.billing.models import Payment, PaymentEvent, Plan, Subscription
from app.modules.billing.providers import FakeProvider, InvalidSignature, JazzCashProvider
from app.modules.billing.service import process_notification
from app.scripts.seed import seed_plans
from tests.helpers import World, correct_option, seed_world, signup


async def buy(
    client: httpx.AsyncClient, code: str = "premium_monthly", outcome: str = "success"
) -> dict:  # type: ignore[type-arg]
    checkout = await client.post("/api/v1/billing/checkout", json={"plan_code": code})
    assert checkout.status_code == 200, checkout.text
    ref = checkout.json()["fields"]["ref"]
    done = await client.post(
        "/api/v1/billing/test-gateway/complete", json={"ref": ref, "outcome": outcome}
    )
    assert done.status_code == 200, done.text
    return done.json()  # type: ignore[no-any-return]


# ---- plans and subscription ----


async def test_plans_are_public_and_priced_in_paisa(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    assert await seed_plans(db) == 3
    assert await seed_plans(db) == 0  # safe to repeat
    plans = (await client.get("/api/v1/plans")).json()
    assert [(p["code"], p["price_paisa"], p["period_days"]) for p in plans] == [
        ("free", 0, 0),
        ("premium_monthly", 120000, 30),
        ("premium_annual", 1200000, 365),
    ]
    assert plans[0]["limits"] == {"mcq_per_month": 300, "mock_per_month": 2, "saved_questions": 25}
    assert plans[1]["limits"] == {}


async def test_seeding_keeps_prices_you_changed(db: AsyncSession) -> None:
    await seed_plans(db)
    await db.execute(update(Plan).where(Plan.code == "premium_monthly").values(price_paisa=99900))
    await db.commit()
    await seed_plans(db)
    price = await db.scalar(select(Plan.price_paisa).where(Plan.code == "premium_monthly"))
    assert price == 99900


async def test_new_student_is_on_the_free_plan(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await seed_plans(db)
    await signup(client, db)
    body = (await client.get("/api/v1/me/subscription")).json()
    assert body["plan_code"] == "free" and body["premium"] is False and body["ends_at"] is None
    assert body["limits"]["mcq_per_month"] == 300
    assert body["usage"] == {"mcq_used": 0, "mock_used": 0}
    assert datetime.fromisoformat(body["resets_at"]) > datetime.now(UTC)


async def test_billing_endpoints_need_a_login(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/me/subscription")).status_code == 401
    assert (await client.get("/api/v1/me/payments")).status_code == 401
    r = await client.post("/api/v1/billing/checkout", json={"plan_code": "premium_monthly"})
    assert r.status_code == 401


# ---- checkout and payment ----


async def test_checkout_needs_a_confirmed_email(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await signup(client, db, verified=False)
    r = await client.post("/api/v1/billing/checkout", json={"plan_code": "premium_monthly"})
    assert r.status_code == 403 and r.json()["code"] == "email_not_verified"


async def test_checkout_rejects_free_and_unknown_plans(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await signup(client, db)
    for code in ("free", "gold"):
        r = await client.post("/api/v1/billing/checkout", json={"plan_code": code})
        assert r.status_code == 404


async def test_checkout_creates_a_pending_payment_at_the_server_price(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await signup(client, db)
    r = await client.post(
        "/api/v1/billing/checkout", json={"plan_code": "premium_monthly", "amount": 1}
    )
    body = r.json()
    payment = await db.scalar(select(Payment))
    assert payment is not None and str(payment.id) == body["payment_id"]
    assert payment.status == "pending" and payment.amount_paisa == 120000
    assert payment.provider_ref == body["fields"]["ref"]


async def test_successful_payment_activates_premium(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await signup(client, db)
    paid = await buy(client)
    assert paid["status"] == "paid" and paid["plan_name"] == "Premium Monthly"

    sub = (await client.get("/api/v1/me/subscription")).json()
    assert sub["premium"] is True and sub["plan_code"] == "premium_monthly"
    assert sub["limits"] == {}
    ends = datetime.fromisoformat(sub["ends_at"])
    assert timedelta(days=29, hours=23) < ends - datetime.now(UTC) < timedelta(days=30, minutes=1)

    history = (await client.get("/api/v1/me/payments")).json()
    assert [(p["status"], p["amount_paisa"]) for p in history] == [("paid", 120000)]


async def test_failed_payment_gives_no_access(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await seed_plans(db)
    await signup(client, db)
    assert (await buy(client, outcome="failure"))["status"] == "failed"
    assert (await client.get("/api/v1/me/subscription")).json()["premium"] is False
    assert await db.scalar(select(func.count()).select_from(Subscription)) == 0


async def test_replayed_notifications_grant_access_only_once(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await signup(client, db)
    checkout = (
        await client.post("/api/v1/billing/checkout", json={"plan_code": "premium_monthly"})
    ).json()
    ref = checkout["fields"]["ref"]
    for _ in range(3):
        r = await client.post(
            "/api/v1/billing/test-gateway/complete", json={"ref": ref, "outcome": "success"}
        )
        assert r.status_code == 200 and r.json()["status"] == "paid"
    assert await db.scalar(select(func.count()).select_from(Subscription)) == 1
    assert await db.scalar(select(func.count()).select_from(PaymentEvent)) == 1


async def test_a_late_failure_cannot_undo_a_paid_payment(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await signup(client, db)
    checkout = (
        await client.post("/api/v1/billing/checkout", json={"plan_code": "premium_monthly"})
    ).json()
    ref = checkout["fields"]["ref"]
    await client.post(
        "/api/v1/billing/test-gateway/complete", json={"ref": ref, "outcome": "success"}
    )
    late = await client.post(
        "/api/v1/billing/test-gateway/complete", json={"ref": ref, "outcome": "failure"}
    )
    assert late.json()["status"] == "paid"
    assert (await client.get("/api/v1/me/subscription")).json()["premium"] is True


async def test_wrong_amount_is_rejected(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await seed_plans(db)
    await signup(client, db)
    checkout = (
        await client.post("/api/v1/billing/checkout", json={"plan_code": "premium_monthly"})
    ).json()
    provider = FakeProvider(Settings())
    note = provider.parse_notification(
        provider.notification(checkout["fields"]["ref"], 100, "success")
    )
    payment = await process_notification(db, "fake", note)
    assert payment.status == "failed"
    assert (await client.get("/api/v1/me/subscription")).json()["premium"] is False


async def test_paying_early_extends_the_current_period(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await signup(client, db)
    await buy(client)
    await buy(client)
    ends = datetime.fromisoformat((await client.get("/api/v1/me/subscription")).json()["ends_at"])
    assert ends - datetime.now(UTC) > timedelta(days=59)


async def test_expired_subscription_reverts_to_free(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await signup(client, db)
    await buy(client)
    await db.execute(update(Subscription).values(ends_at=datetime.now(UTC) - timedelta(minutes=1)))
    await db.commit()
    body = (await client.get("/api/v1/me/subscription")).json()
    assert body["premium"] is False and body["plan_code"] == "free"


async def test_payments_are_private(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await signup(client, db)
    await signup(other_client, db, email="bilal@example.com")
    paid = await buy(client)
    assert (await other_client.get(f"/api/v1/me/payments/{paid['id']}")).status_code == 404
    assert (await other_client.get("/api/v1/me/payments")).json() == []
    blocked = await other_client.post(
        "/api/v1/billing/test-gateway/complete",
        json={"ref": "whatever", "outcome": "success"},
    )
    assert blocked.status_code == 404


# ---- signed callbacks ----


async def test_signed_callback_works_without_a_csrf_header_and_redirects(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await signup(client, db)
    checkout = (
        await client.post("/api/v1/billing/checkout", json={"plan_code": "premium_monthly"})
    ).json()
    fields = FakeProvider(Settings()).notification(checkout["fields"]["ref"], 120000, "success")
    r = await client.post(
        "/api/v1/billing/webhooks/fake",
        content=urlencode(fields),
        headers={"Content-Type": "application/x-www-form-urlencoded", "X-CSRF": ""},
    )
    assert r.status_code == 303
    assert r.headers["location"].endswith(f"/checkout/status?payment={checkout['payment_id']}")
    assert (await client.get("/api/v1/me/subscription")).json()["premium"] is True


async def test_callback_with_a_bad_signature_is_rejected(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await signup(client, db)
    checkout = (
        await client.post("/api/v1/billing/checkout", json={"plan_code": "premium_monthly"})
    ).json()
    fields = FakeProvider(Settings()).notification(checkout["fields"]["ref"], 120000, "success")
    fields["signature"] = "0" * 64
    r = await client.post(
        "/api/v1/billing/webhooks/fake",
        content=urlencode(fields),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 400 and r.json()["code"] == "invalid_signature"
    assert (await client.get("/api/v1/me/subscription")).json()["premium"] is False


async def test_callback_for_another_provider_is_not_found(client: httpx.AsyncClient) -> None:
    r = await client.post("/api/v1/billing/webhooks/jazzcash", content="a=b")
    assert r.status_code == 404


async def test_test_gateway_is_disabled_in_production(
    client: httpx.AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await seed_plans(db)
    await signup(client, db)
    monkeypatch.setattr(billing_router, "get_settings", lambda: Settings(environment="production"))
    r = await client.post(
        "/api/v1/billing/test-gateway/complete", json={"ref": "x", "outcome": "success"}
    )
    assert r.status_code == 404


def test_the_app_refuses_to_start_in_production_with_the_fake_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.main as main

    monkeypatch.setattr(
        main, "get_settings", lambda: Settings(environment="production", payment_provider="fake")
    )
    with pytest.raises(RuntimeError, match="not allowed in production"):
        main.create_app()


# ---- JazzCash signing ----

SALT = "salt123"


def jazzcash() -> JazzCashProvider:
    return JazzCashProvider(
        Settings(
            payment_provider="jazzcash",
            jazzcash_merchant_id="MC1",
            jazzcash_password="pw",
            jazzcash_integrity_salt=SALT,
            api_base_url="https://api.example.pk",
        )
    )


def expected_hash(fields: dict[str, str]) -> str:
    values = [v for k, v in sorted(fields.items()) if v != "" and k != "pp_SecureHash"]
    message = "&".join([SALT, *values])
    return hmac.new(SALT.encode(), message.encode(), hashlib.sha256).hexdigest().upper()


def test_jazzcash_request_is_signed_per_the_documented_scheme() -> None:
    req = jazzcash().build_request(ref="T20261030120000", amount_paisa=120000, description="Plan")
    f = req.fields
    assert req.method == "POST" and "jazzcash" in req.action_url
    assert f["pp_Amount"] == "120000" and f["pp_TxnCurrency"] == "PKR"
    assert f["pp_TxnRefNo"] == "T20261030120000" and f["pp_MerchantID"] == "MC1"
    assert f["pp_ReturnURL"] == "https://api.example.pk/api/v1/billing/webhooks/jazzcash"
    assert f["pp_SecureHash"] == expected_hash(f)


def test_jazzcash_refs_fit_the_gateway_limit() -> None:
    ref = jazzcash().new_ref()
    assert len(ref) <= 20 and ref.startswith("T")


def test_jazzcash_notification_needs_a_valid_signature() -> None:
    provider = jazzcash()
    data = {
        "pp_TxnRefNo": "T1",
        "pp_Amount": "120000",
        "pp_ResponseCode": "000",
        "pp_ResponseMessage": "Thank you for Using JazzCash",
    }
    data["pp_SecureHash"] = expected_hash(data)

    note = provider.parse_notification(data)
    assert note.success and note.ref == "T1" and note.amount_paisa == 120000

    declined = {**data, "pp_ResponseCode": "124"}
    declined["pp_SecureHash"] = expected_hash(declined)
    assert provider.parse_notification(declined).success is False

    tampered = {**data, "pp_Amount": "100"}
    with pytest.raises(InvalidSignature):
        provider.parse_notification(tampered)
    with pytest.raises(InvalidSignature):
        provider.parse_notification({k: v for k, v in data.items() if k != "pp_SecureHash"})


def test_jazzcash_notification_never_keeps_the_merchant_password() -> None:
    data = {"pp_TxnRefNo": "T1", "pp_Amount": "5", "pp_ResponseCode": "000", "pp_Password": "pw"}
    data["pp_SecureHash"] = expected_hash(data)
    assert "pp_Password" not in jazzcash().parse_notification(data).payload


# ---- plan limits ----


async def small_free_plan(db: AsyncSession) -> None:
    db.add(
        Plan(
            code="free",
            name="Free",
            price_paisa=0,
            period_days=0,
            limits={"mcq_per_month": 2, "mock_per_month": 1, "saved_questions": 1},
        )
    )
    await db.commit()


async def answer_one(client: httpx.AsyncClient, world: World, state: dict, index: int):  # type: ignore[type-arg]
    by_id = {str(q.id): q for q in world.questions}
    q = by_id[state["questions"][index]["id"]]
    return await client.post(
        f"/api/v1/attempts/{state['id']}/questions/{q.id}/check",
        json={"option_id": str(correct_option(q).id)},
    )


async def test_free_practice_is_capped_by_the_monthly_limit(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await small_free_plan(db)
    await signup(client, db)

    state = (await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": 5})).json()
    assert state["total"] == 2  # trimmed to what is left this month
    assert (await answer_one(client, world, state, 0)).status_code == 200
    assert (await answer_one(client, world, state, 1)).status_code == 200

    sub = (await client.get("/api/v1/me/subscription")).json()
    assert sub["usage"]["mcq_used"] == 2

    again = await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": 5})
    assert again.status_code == 403 and again.json()["code"] == "limit_reached"


async def test_answering_past_the_limit_is_blocked_even_in_an_open_set(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await small_free_plan(db)
    await signup(client, db)
    first = (await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": 2})).json()
    second = (await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": 2})).json()
    assert (await answer_one(client, world, first, 0)).status_code == 200
    assert (await answer_one(client, world, first, 1)).status_code == 200
    blocked = await answer_one(client, world, second, 0)
    assert blocked.status_code == 403 and blocked.json()["code"] == "limit_reached"


async def test_free_mock_limit_counts_starts_but_not_resumes(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await small_free_plan(db)
    await signup(client, db)
    url = f"/api/v1/mock-tests/{world.mock_id}/attempts"
    first = (await client.post(url)).json()
    assert (await client.post(url)).json()["id"] == first["id"]  # resume is free
    await client.post(f"/api/v1/attempts/{first['id']}/submit")

    again = await client.post(url)
    assert again.status_code == 403 and again.json()["code"] == "limit_reached"


async def test_premium_removes_the_limits(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await small_free_plan(db)
    await seed_plans(db)
    await signup(client, db)
    url = f"/api/v1/mock-tests/{world.mock_id}/attempts"
    first = (await client.post(url)).json()
    await client.post(f"/api/v1/attempts/{first['id']}/submit")
    assert (await client.post(url)).status_code == 403

    await buy(client)
    assert (await client.post(url)).status_code == 200
    state = (await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": 5})).json()
    assert state["total"] == 5


async def test_premium_only_mock_tests_need_premium(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await seed_plans(db)
    await db.execute(update(MockTest).values(access="premium"))
    await db.commit()
    await signup(client, db)
    url = f"/api/v1/mock-tests/{world.mock_id}/attempts"
    blocked = await client.post(url)
    assert blocked.status_code == 403 and blocked.json()["code"] == "premium_required"
    await buy(client)
    assert (await client.post(url)).status_code == 200


async def test_free_accounts_have_a_saved_question_limit(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await small_free_plan(db)
    await signup(client, db)
    first, second = world.questions[0].id, world.questions[1].id
    assert (await client.put(f"/api/v1/me/bookmarks/{first}")).status_code == 204
    assert (await client.put(f"/api/v1/me/bookmarks/{first}")).status_code == 204  # same again
    over = await client.put(f"/api/v1/me/bookmarks/{second}")
    assert over.status_code == 403 and over.json()["code"] == "limit_reached"
