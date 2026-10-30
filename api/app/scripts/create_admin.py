"""Create (or promote) an admin account.

    python -m app.scripts.create_admin --email you@example.com --name "Your Name"

The password is prompted for, never passed on the command line.
"""

import argparse
import asyncio
import getpass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import hash_password
from app.db.session import dispose_engine, get_engine
from app.modules.users.models import User
from app.modules.users.schemas import check_password


async def create_admin(session: AsyncSession, email: str, name: str, password: str) -> User:
    check_password(password)
    user = await session.scalar(select(User).where(User.email == email.lower()))
    if user is None:
        user = User(email=email.lower(), full_name=name, password_hash=hash_password(password))
        session.add(user)
    else:
        user.password_hash = hash_password(password)
    user.role = "admin"
    user.status = "active"
    user.email_verified_at = user.email_verified_at or datetime.now(UTC)
    await session.commit()
    return user


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Administrator")
    args = parser.parse_args()
    password = getpass.getpass("Password: ")
    if password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords do not match")

    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as session:
        user = await create_admin(session, args.email, args.name, password)
    await dispose_engine()
    print(f"admin ready: {user.email}")


if __name__ == "__main__":
    asyncio.run(main())
