from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.email import Email, EmailSender
from app.core.errors import AppError
from app.core.security import (
    DUMMY_HASH,
    hash_password,
    hash_token,
    new_token,
    password_needs_rehash,
    verify_password,
)
from app.modules.catalog.models import Exam
from app.modules.users.models import EmailToken, User, UserSession
from app.modules.users.schemas import ProfilePatch, RegisterIn, UserOut

RESEND_COOLDOWN_SECONDS = 60


def now() -> datetime:
    return datetime.now(UTC)


def to_out(user: User, target_exam_slug: str | None) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        email_verified=user.email_verified_at is not None,
        phone=user.phone,
        target_exam=target_exam_slug,
        target_exam_date=user.target_exam_date,
        daily_goal=user.daily_goal,
        leaderboard_opt_in=user.leaderboard_opt_in,
    )


async def exam_slug(session: AsyncSession, exam_id: object) -> str | None:
    if exam_id is None:
        return None
    return await session.scalar(select(Exam.slug).where(Exam.id == exam_id))


async def exam_id_for_slug(session: AsyncSession, slug: str | None) -> object | None:
    if slug is None:
        return None
    found = await session.scalar(select(Exam.id).where(Exam.slug == slug))
    if found is None:
        raise AppError(422, "unknown_exam", "Unknown exam", f"No exam with slug '{slug}'")
    return found


# ---- sessions -------------------------------------------------------------


async def create_session(
    session: AsyncSession, user: User, ip: str | None, user_agent: str | None, remember: bool
) -> tuple[str, int]:
    settings = get_settings()
    days = settings.session_ttl_days if remember else 1
    token = new_token()
    session.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            user_agent=(user_agent or "")[:255] or None,
            ip=ip,
            expires_at=now() + timedelta(days=days),
        )
    )
    return token, days * 86400


async def revoke_session(session: AsyncSession, token: str) -> None:
    await session.execute(
        update(UserSession)
        .where(UserSession.token_hash == hash_token(token), UserSession.revoked_at.is_(None))
        .values(revoked_at=now())
    )
    await session.commit()


async def revoke_all_sessions(session: AsyncSession, user_id: object) -> None:
    await session.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=now())
    )


async def find_session_user(session: AsyncSession, token: str) -> User | None:
    row = (
        await session.execute(
            select(UserSession, User)
            .join(User, User.id == UserSession.user_id)
            .where(
                UserSession.token_hash == hash_token(token),
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now(),
                User.status == "active",
            )
        )
    ).first()
    if row is None:
        return None
    user_session, user = row
    if now() - user_session.last_used_at > timedelta(minutes=5):
        user_session.last_used_at = now()
        user.last_seen_at = now()
        await session.commit()
    return user


# ---- registration and login ----------------------------------------------


async def issue_email_token(session: AsyncSession, user: User, purpose: str, ttl: timedelta) -> str:
    await session.execute(
        update(EmailToken)
        .where(
            EmailToken.user_id == user.id,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
        )
        .values(used_at=now())
    )
    token = new_token()
    session.add(
        EmailToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_token(token),
            expires_at=now() + ttl,
        )
    )
    return token


async def send_verification(session: AsyncSession, sender: EmailSender, user: User) -> None:
    settings = get_settings()
    token = await issue_email_token(
        session, user, "verify", timedelta(hours=settings.verify_token_ttl_hours)
    )
    await sender.send(
        Email(
            to=user.email,
            subject="Confirm your PrepMaster email address",
            body=(
                f"Hi {user.full_name},\n\nConfirm your email to unlock mock tests:\n"
                f"{settings.web_base_url}/verify-email?token={token}\n\n"
                f"The link expires in {settings.verify_token_ttl_hours} hours."
            ),
        )
    )


async def register(
    session: AsyncSession,
    sender: EmailSender,
    data: RegisterIn,
    ip: str | None,
    user_agent: str | None,
) -> tuple[User, str, int, str | None]:
    exam_id = await exam_id_for_slug(session, data.target_exam)
    user = User(
        email=data.email.lower(),
        full_name=data.full_name,
        phone=data.phone or None,
        password_hash=hash_password(data.password),
        target_exam_id=exam_id,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise AppError(
            409, "email_taken", "Email already registered", "Try logging in instead."
        ) from None
    token, max_age = await create_session(session, user, ip, user_agent, remember=True)
    await send_verification(session, sender, user)
    await session.commit()
    return user, token, max_age, data.target_exam


async def authenticate(session: AsyncSession, email: str, password: str) -> User:
    settings = get_settings()
    user = await session.scalar(select(User).where(User.email == email.lower()))
    generic = AppError(401, "invalid_credentials", "Incorrect email or password")

    if user is None:
        verify_password(DUMMY_HASH, password)  # keep timing similar
        raise generic

    if user.locked_until is not None and user.locked_until > now():
        minutes = max(1, int((user.locked_until - now()).total_seconds() // 60) + 1)
        raise AppError(
            429,
            "account_locked",
            "Too many failed attempts",
            f"Try again in about {minutes} minutes or reset your password.",
        )

    if not verify_password(user.password_hash, password):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.max_failed_logins:
            user.locked_until = now() + timedelta(minutes=settings.lockout_minutes)
            user.failed_login_count = 0
        await session.commit()
        raise generic

    if user.status != "active":
        raise AppError(403, "account_suspended", "This account is suspended")

    user.failed_login_count = 0
    user.locked_until = None
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    await session.commit()
    return user


# ---- email verification and password reset -------------------------------


async def _consume_token(session: AsyncSession, token: str, purpose: str) -> User:
    row = await session.scalar(
        select(EmailToken)
        .where(EmailToken.token_hash == hash_token(token), EmailToken.purpose == purpose)
        .with_for_update()
    )
    if row is None or row.used_at is not None or row.expires_at <= now():
        raise AppError(
            400, "invalid_token", "This link is invalid or has expired", "Request a new one."
        )
    user = await session.get(User, row.user_id)
    if user is None:
        raise AppError(400, "invalid_token", "This link is invalid or has expired")
    row.used_at = now()
    return user


async def verify_email(session: AsyncSession, token: str) -> None:
    user = await _consume_token(session, token, "verify")
    if user.email_verified_at is None:
        user.email_verified_at = now()
    await session.commit()


async def resend_verification(session: AsyncSession, sender: EmailSender, user: User) -> None:
    if user.email_verified_at is not None:
        return
    latest = await session.scalar(
        select(EmailToken.created_at)
        .where(EmailToken.user_id == user.id, EmailToken.purpose == "verify")
        .order_by(EmailToken.created_at.desc())
        .limit(1)
    )
    if latest is not None and (now() - latest).total_seconds() < RESEND_COOLDOWN_SECONDS:
        raise AppError(429, "too_soon", "Please wait a minute before requesting another email")
    await send_verification(session, sender, user)
    await session.commit()


async def request_password_reset(session: AsyncSession, sender: EmailSender, email: str) -> None:
    settings = get_settings()
    user = await session.scalar(select(User).where(User.email == email.lower()))
    if user is None or user.status != "active":
        return  # same response either way: never reveal whether an account exists
    token = await issue_email_token(
        session, user, "reset", timedelta(minutes=settings.reset_token_ttl_minutes)
    )
    await session.commit()
    await sender.send(
        Email(
            to=user.email,
            subject="Reset your PrepMaster password",
            body=(
                "Use this link to choose a new password:\n"
                f"{settings.web_base_url}/reset-password?token={token}\n\n"
                f"It expires in {settings.reset_token_ttl_minutes} minutes. "
                "If you did not ask for this, you can ignore this email."
            ),
        )
    )


async def reset_password(session: AsyncSession, token: str, new_password: str) -> None:
    user = await _consume_token(session, token, "reset")
    user.password_hash = hash_password(new_password)
    user.failed_login_count = 0
    user.locked_until = None
    await revoke_all_sessions(session, user.id)
    await session.commit()


# ---- profile --------------------------------------------------------------


async def update_profile(session: AsyncSession, user: User, patch: ProfilePatch) -> User:
    data = patch.model_dump(exclude_unset=True)
    if "target_exam" in data:
        slug = data.pop("target_exam")
        user.target_exam_id = await exam_id_for_slug(session, slug)  # type: ignore[assignment]
    for field, value in data.items():
        if field in ("full_name", "leaderboard_opt_in") and value is None:
            continue
        setattr(user, field, value)
    await session.commit()
    return user
