from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from app.config import get_settings
from app.core.email import EmailSender, get_email_sender
from app.modules.users import service
from app.modules.users.deps import CurrentUser, SessionDep
from app.modules.users.schemas import (
    ForgotPasswordIn,
    LoginIn,
    ProfilePatch,
    RegisterIn,
    ResetPasswordIn,
    StatusOut,
    TokenIn,
    UserOut,
)

router = APIRouter(prefix="/api/v1", tags=["auth"])
Sender = Annotated[EmailSender, Depends(get_email_sender)]


def set_session_cookie(response: Response, token: str, max_age: int) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=max_age,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/",
        domain=settings.cookie_domain,
    )


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/auth/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterIn, request: Request, response: Response, session: SessionDep, sender: Sender
) -> UserOut:
    user, token, max_age, slug = await service.register(
        session, sender, data, client_ip(request), request.headers.get("user-agent")
    )
    set_session_cookie(response, token, max_age)
    return service.to_out(user, slug)


@router.post("/auth/login", response_model=UserOut)
async def login(
    data: LoginIn, request: Request, response: Response, session: SessionDep
) -> UserOut:
    user = await service.authenticate(session, data.email, data.password)
    token, max_age = await service.create_session(
        session, user, client_ip(request), request.headers.get("user-agent"), data.remember
    )
    await session.commit()
    set_session_cookie(response, token, max_age)
    return service.to_out(user, await service.exam_slug(session, user.target_exam_id))


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, session: SessionDep) -> None:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        await service.revoke_session(session, token)
    response.delete_cookie(settings.session_cookie_name, path="/", domain=settings.cookie_domain)


@router.post("/auth/verify-email", response_model=StatusOut)
async def verify_email(data: TokenIn, session: SessionDep) -> StatusOut:
    await service.verify_email(session, data.token)
    return StatusOut(status="verified")


@router.post(
    "/auth/resend-verification", response_model=StatusOut, status_code=status.HTTP_202_ACCEPTED
)
async def resend_verification(user: CurrentUser, session: SessionDep, sender: Sender) -> StatusOut:
    await service.resend_verification(session, sender, user)
    return StatusOut(status="sent")


@router.post(
    "/auth/forgot-password", response_model=StatusOut, status_code=status.HTTP_202_ACCEPTED
)
async def forgot_password(data: ForgotPasswordIn, session: SessionDep, sender: Sender) -> StatusOut:
    await service.request_password_reset(session, sender, data.email)
    return StatusOut(status="sent")


@router.post("/auth/reset-password", response_model=StatusOut)
async def reset_password(data: ResetPasswordIn, session: SessionDep) -> StatusOut:
    await service.reset_password(session, data.token, data.password)
    return StatusOut(status="password_changed")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser, session: SessionDep) -> UserOut:
    return service.to_out(user, await service.exam_slug(session, user.target_exam_id))


@router.patch("/me", response_model=UserOut)
async def update_me(patch: ProfilePatch, user: CurrentUser, session: SessionDep) -> UserOut:
    user = await service.update_profile(session, user, patch)
    return service.to_out(user, await service.exam_slug(session, user.target_exam_id))
