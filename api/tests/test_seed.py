import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.hashing import question_hash
from app.modules.catalog.models import Question, QuestionOption
from app.modules.users.models import User
from app.scripts.create_admin import create_admin
from app.scripts.seed import seed_demo


async def test_seed_loads_the_demo_catalogue(client: httpx.AsyncClient, db: AsyncSession) -> None:
    created = await seed_demo(db)
    assert created["exams"] == 10 and created["subjects"] == 9 and created["questions"] == 12
    assert created["mock_tests"] == 1

    lat = (await client.get("/api/v1/exams/lat")).json()
    assert lat["question_count"] == 12 and lat["subject_count"] == 9
    english = next(s for s in lat["subjects"] if s["name"] == "English")
    assert english["question_count"] == 2


async def test_seed_is_idempotent(db: AsyncSession) -> None:
    await seed_demo(db)
    again = await seed_demo(db)
    assert again == {"exams": 0, "subjects": 0, "topics": 0, "questions": 0, "mock_tests": 0}
    assert await db.scalar(select(func.count()).select_from(Question)) == 12


async def test_every_seeded_question_has_exactly_one_correct_option(db: AsyncSession) -> None:
    await seed_demo(db)
    rows = await db.execute(
        select(QuestionOption.question_id, func.count())
        .where(QuestionOption.is_correct)
        .group_by(QuestionOption.question_id)
    )
    counts = [c for _, c in rows.all()]
    assert len(counts) == 12 and set(counts) == {1}


def test_question_hash_ignores_case_and_spacing() -> None:
    a = question_hash("What  is 2+2?", ["3", "4"])
    assert a == question_hash(" what is 2+2? ", ["3 ", "4"])
    assert a != question_hash("What is 2+2?", ["4", "3"])


async def test_create_admin_promotes_and_verifies(db: AsyncSession) -> None:
    user = await create_admin(db, "Boss@Example.com", "The Boss", "strongpass1")
    assert user.role == "admin" and user.email == "boss@example.com"
    assert user.email_verified_at is not None

    await create_admin(db, "boss@example.com", "The Boss", "anotherpass2")
    assert await db.scalar(select(func.count()).select_from(User)) == 1


async def test_seed_creates_a_startable_demo_mock_test(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    from tests.helpers import signup

    await seed_demo(db)
    await signup(client, db)
    listing = (await client.get("/api/v1/mock-tests")).json()
    assert [(m["title"], m["total_questions"], m["duration_sec"]) for m in listing] == [
        ("LAT Full Mock Test 10", 12, 900)
    ]
    attempt = await client.post(f"/api/v1/mock-tests/{listing[0]['id']}/attempts")
    assert attempt.status_code == 200 and len(attempt.json()["questions"]) == 12
