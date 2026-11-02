from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import AuditLog, User


def record(
    session: AsyncSession,
    actor: User,
    action: str,
    entity: str,
    entity_id: object | None = None,
    *,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    """Queue an audit row; it is saved by the caller's commit, in the same transaction."""
    session.add(
        AuditLog(
            actor_id=actor.id,
            action=action,
            entity=entity,
            entity_id=None if entity_id is None else str(entity_id),
            before=before,
            after=after,
        )
    )
