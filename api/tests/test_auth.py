import re
from datetime import UTC, datetime, timedelta
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import OUTBOX
from app.modules.catalog.models import Exam
from app.modules.users.deps import require_role
from app.modules.users.models import EmailToken, User

EMAIL = "ana@example.com"
PASSWORD = "secret123"


async def register(
    client: httpx.AsyncClient, email: str = EMAIL, **extra: object
) -> httpx.Response:
    body = {"full_name": "Ana Khan", "email": email, "password": PASSWORD, **extra}
    return await client.post("/api/v1/auth/register", json=body)


async def login(
    client: httpx.AsyncClient, password: str = PASSWORD, email: str = EMAIL
) -> httpx.Response:
    return await client.post("/api/v1/auth/login", json={"email": email, "password": password})


def token_from_outbox(index: int = -1) -> str:
    match = re.search(r"token=([\w-]+)", OUTBOX[index].body)
    assert match, OUTBOX[index].body
    return match.group(1)


# ---- registration -----------------------------------------------------------


async def test_register_creates_user_session_and_verification_email(
    client: httpx.AsyncClient,
) -> None:
    r = await register(client, phone="+92 300 1234567")
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == EMAIL
    assert body["role"] == "student"
    assert body["email_verified"] is False
    assert "password" not in r.text

    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "pm_session=" in cookie

    assert len(OUTBOX) == 1 and OUTBOX[0].to == EMAIL and "verify-email?token=" in OUTBOX[0].body
    assert (await client.get("/api/v1/me")).json()["email"] == EMAIL


async def test_duplicate_email_is_rejected_case_insensitively(client: httpx.AsyncClient) -> None:
    await register(client)
    r = await register(client, email="ANA@Example.com")
    assert r.status_code == 409
    assert r.json()["code"] == "email_taken"


async def test_weak_passwords_are_rejected(client: httpx.AsyncClient) -> None:
    short = await client.post(
        "/api/v1/auth/register", json={"full_name": "Ana", "email": EMAIL, "password": "abc1"}
    )
    no_digit = await client.post(
        "/api/v1/auth/register", json={"full_name": "Ana", "email": EMAIL, "password": "abcdefghij"}
    )
    assert short.status_code == no_digit.status_code == 422
    assert short.json()["errors"][0]["field"] == "password"
    assert "number" in no_digit.json()["errors"][0]["message"]


async def test_password_is_stored_as_argon2id(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await register(client)
    stored = await db.scalar(select(User.password_hash))
    assert stored is not None and stored.startswith("$argon2id$") and PASSWORD not in stored


async def test_register_with_target_exam(client: httpx.AsyncClient, db: AsyncSession) -> None:
    db.add(Exam(slug="lat", name="LAT", full_name="Law Admission Test", category="Law"))
    await db.commit()
    ok = await register(client, target_exam="lat")
    assert ok.json()["target_exam"] == "lat"
    bad = await register(client, email="b@example.com", target_exam="nope")
    assert bad.status_code == 422 and bad.json()["code"] == "unknown_exam"


# ---- login / logout / sessions ---------------------------------------------


async def test_login_succeeds_and_failures_look_identical(client: httpx.AsyncClient) -> None:
    await register(client)
    client.cookies.clear()

    wrong = await login(client, password="wrongpass1")
    unknown = await login(client, email="nobody@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()

    ok = await login(client)
    assert ok.status_code == 200 and ok.json()["email"] == EMAIL
    assert (await client.get("/api/v1/me")).status_code == 200


async def test_account_locks_after_repeated_failures(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await register(client)
    client.cookies.clear()
    for _ in range(5):
        assert (await login(client, password="wrongpass1")).status_code == 401

    locked = await login(client)  # correct password, but locked
    assert locked.status_code == 429 and locked.json()["code"] == "account_locked"

    await db.execute(update(User).values(locked_until=datetime.now(UTC) - timedelta(seconds=1)))
    await db.commit()
    assert (await login(client)).status_code == 200


async def test_logout_revokes_the_session(client: httpx.AsyncClient) -> None:
    await register(client)
    saved = client.cookies.get("pm_session")
    assert saved
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    assert (await client.get("/api/v1/me")).status_code == 401

    client.cookies.set("pm_session", saved)  # replaying the old cookie must not work
    assert (await client.get("/api/v1/me")).status_code == 401


async def test_me_requires_login(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/me")
    assert r.status_code == 401 and r.json()["code"] == "unauthenticated"


async def test_expired_and_suspended_sessions_are_rejected(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await register(client)
    await db.execute(text("UPDATE sessions SET expires_at = now() - interval '1 minute'"))
    await db.commit()
    assert (await client.get("/api/v1/me")).status_code == 401

    await login(client)
    assert (await client.get("/api/v1/me")).status_code == 200
    await db.execute(update(User).values(status="suspended"))
    await db.commit()
    assert (await client.get("/api/v1/me")).status_code == 401


# ---- csrf -------------------------------------------------------------------


async def test_state_changing_requests_need_the_csrf_header(client: httpx.AsyncClient) -> None:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        headers={"X-CSRF": ""},
    )
    assert r.status_code == 403 and r.json()["code"] == "csrf_failed"
    assert (await client.get("/api/v1/exams", headers={"X-CSRF": ""})).status_code == 200


# ---- email verification -----------------------------------------------------


async def test_verify_email_flow(client: httpx.AsyncClient) -> None:
    await register(client)
    token = token_from_outbox()

    assert (
        await client.post("/api/v1/auth/verify-email", json={"token": token})
    ).status_code == 200
    assert (await client.get("/api/v1/me")).json()["email_verified"] is True

    again = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert again.status_code == 400 and again.json()["code"] == "invalid_token"
    junk = await client.post("/api/v1/auth/verify-email", json={"token": "x" * 40})
    assert junk.status_code == 400


async def test_resend_verification_has_a_cooldown_and_replaces_the_old_link(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await register(client)
    first = token_from_outbox()

    too_soon = await client.post("/api/v1/auth/resend-verification")
    assert too_soon.status_code == 429 and too_soon.json()["code"] == "too_soon"

    await db.execute(update(EmailToken).values(created_at=datetime.now(UTC) - timedelta(minutes=5)))
    await db.commit()
    assert (await client.post("/api/v1/auth/resend-verification")).status_code == 202
    assert len(OUTBOX) == 2

    old = await client.post("/api/v1/auth/verify-email", json={"token": first})
    assert old.status_code == 400
    new = await client.post("/api/v1/auth/verify-email", json={"token": token_from_outbox()})
    assert new.status_code == 200


async def test_expired_verification_link_is_rejected(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await register(client)
    await db.execute(update(EmailToken).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
    await db.commit()
    r = await client.post("/api/v1/auth/verify-email", json={"token": token_from_outbox()})
    assert r.status_code == 400


# ---- password reset ---------------------------------------------------------


async def test_forgot_password_does_not_reveal_accounts(client: httpx.AsyncClient) -> None:
    await register(client)
    OUTBOX.clear()
    known = await client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})
    unknown = await client.post("/api/v1/auth/forgot-password", json={"email": "no@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert len(OUTBOX) == 1 and OUTBOX[0].to == EMAIL


async def test_reset_password_flow(client: httpx.AsyncClient) -> None:
    await register(client)
    old_cookie = client.cookies.get("pm_session")
    OUTBOX.clear()
    await client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})
    token = token_from_outbox()

    r = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "brandnew99"}
    )
    assert r.status_code == 200

    client.cookies.set("pm_session", old_cookie or "")
    assert (await client.get("/api/v1/me")).status_code == 401  # all sessions revoked

    client.cookies.clear()
    assert (await login(client, password=PASSWORD)).status_code == 401
    assert (await login(client, password="brandnew99")).status_code == 200

    reuse = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "another123"}
    )
    assert reuse.status_code == 400


async def test_reset_password_enforces_the_password_rules(client: httpx.AsyncClient) -> None:
    await register(client)
    OUTBOX.clear()
    await client.post("/api/v1/auth/forgot-password", json={"email": EMAIL})
    r = await client.post(
        "/api/v1/auth/reset-password", json={"token": token_from_outbox(), "password": "nodigits"}
    )
    assert r.status_code == 422


# ---- profile and roles ------------------------------------------------------


async def test_update_profile(client: httpx.AsyncClient, db: AsyncSession) -> None:
    db.add(Exam(slug="lat", name="LAT", full_name="Law Admission Test", category="Law"))
    await db.commit()
    await register(client)

    r = await client.patch(
        "/api/v1/me",
        json={
            "full_name": "Ana K.",
            "daily_goal": 40,
            "target_exam": "lat",
            "target_exam_date": "2027-02-22",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["full_name"] == "Ana K." and body["daily_goal"] == 40
    assert body["target_exam"] == "lat" and body["target_exam_date"] == "2027-02-22"

    assert (await client.patch("/api/v1/me", json={"daily_goal": 0})).status_code == 422
    cleared = await client.patch("/api/v1/me", json={"target_exam": None})
    assert cleared.json()["target_exam"] is None


async def test_role_guard(app: FastAPI, client: httpx.AsyncClient, db: AsyncSession) -> None:
    @app.get("/_t/admin")
    async def admin_only(user: Annotated[User, Depends(require_role("admin"))]) -> dict[str, str]:
        return {"ok": user.email}

    await register(client)
    assert (await client.get("/_t/admin")).status_code == 403
    await db.execute(update(User).values(role="admin"))
    await db.commit()
    assert (await client.get("/_t/admin")).json() == {"ok": EMAIL}
