from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import AppError
from app.db.session import get_session
from app.modules.users import service
from app.modules.users.models import User

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def current_user_optional(request: Request, session: SessionDep) -> User | None:
    token = request.cookies.get(get_settings().session_cookie_name)
    if not token:
        return None
    return await service.find_session_user(session, token)


async def require_user(user: Annotated[User | None, Depends(current_user_optional)]) -> User:
    if user is None:
        raise AppError(401, "unauthenticated", "Please log in")
    return user


def require_role(*roles: str) -> Callable[..., Coroutine[Any, Any, User]]:
    async def dependency(user: Annotated[User, Depends(require_user)]) -> User:
        if user.role not in roles:
            raise AppError(403, "forbidden", "You do not have access to this")
        return user

    return dependency


CurrentUser = Annotated[User, Depends(require_user)]
