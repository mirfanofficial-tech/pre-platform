"""Load the demo catalogue and questions (taken from the web app's mock data).

Safe to run repeatedly: existing exams, subjects, topics and questions are left alone.

    python -m app.scripts.seed
"""

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.session import dispose_engine, get_engine
from app.modules.attempts.models import MockTest, MockTestQuestion
from app.modules.billing.models import Plan
from app.modules.catalog.hashing import question_hash
from app.modules.catalog.models import Exam, Question, QuestionOption, Subject, Topic

SEED_FILE = Path(__file__).resolve().parents[2] / "seed" / "demo.json"
PLANS_FILE = Path(__file__).resolve().parents[2] / "seed" / "plans.json"
LICENCE = "PrepMaster demo content"
DEMO_MOCK_TITLE = "LAT Full Mock Test 10"
DEMO_MOCK_SECONDS = 15 * 60


async def seed_demo(session: AsyncSession, data: dict[str, Any] | None = None) -> dict[str, int]:
    data = data or json.loads(SEED_FILE.read_text(encoding="utf-8"))
    created = {"exams": 0, "subjects": 0, "topics": 0, "questions": 0, "mock_tests": 0}

    exams: dict[str, Exam] = {}
    for item in data["exams"]:
        exam = await session.scalar(select(Exam).where(Exam.slug == item["slug"]))
        if exam is None:
            exam = Exam(**item)
            session.add(exam)
            created["exams"] += 1
        exams[item["slug"]] = exam
    await session.flush()

    lat = exams["lat"]
    subjects: dict[str, Subject] = {}
    for item in data["lat_subjects"]:
        subject = await session.scalar(
            select(Subject).where(Subject.exam_id == lat.id, Subject.name == item["name"])
        )
        if subject is None:
            subject = Subject(exam_id=lat.id, **item)
            session.add(subject)
            created["subjects"] += 1
        subjects[item["name"]] = subject
    await session.flush()

    topics: dict[tuple[str, str], Topic] = {}
    for q in data["questions"]:
        key = (q["subject"], q["topic"])
        if key in topics:
            continue
        subject = subjects[q["subject"]]
        topic = await session.scalar(
            select(Topic).where(Topic.subject_id == subject.id, Topic.name == q["topic"])
        )
        if topic is None:
            topic = Topic(subject_id=subject.id, name=q["topic"])
            session.add(topic)
            created["topics"] += 1
        topics[key] = topic
    await session.flush()

    for q in data["questions"]:
        digest = question_hash(q["text"], q["options"])
        exists = await session.scalar(
            select(Question.id).where(Question.exam_id == lat.id, Question.content_hash == digest)
        )
        if exists:
            continue
        session.add(
            Question(
                exam_id=lat.id,
                subject_id=subjects[q["subject"]].id,
                topic_id=topics[(q["subject"], q["topic"])].id,
                difficulty=q["difficulty"],
                text=q["text"],
                explanation=q["explanation"],
                status="published",
                published_at=datetime.now(UTC),
                content_hash=digest,
                licence=LICENCE,
                options=[
                    QuestionOption(position=i + 1, text=text, is_correct=i == q["answer"])
                    for i, text in enumerate(q["options"])
                ],
            )
        )
        created["questions"] += 1

    await session.flush()

    mock = await session.scalar(
        select(MockTest).where(MockTest.exam_id == lat.id, MockTest.title == DEMO_MOCK_TITLE)
    )
    if mock is None:
        mock = MockTest(
            exam_id=lat.id,
            title=DEMO_MOCK_TITLE,
            kind="full",
            duration_sec=DEMO_MOCK_SECONDS,
            status="published",
        )
        session.add(mock)
        await session.flush()
        for position, q in enumerate(data["questions"], start=1):
            question_id = await session.scalar(
                select(Question.id).where(
                    Question.exam_id == lat.id,
                    Question.content_hash == question_hash(q["text"], q["options"]),
                )
            )
            session.add(
                MockTestQuestion(mock_test_id=mock.id, position=position, question_id=question_id)
            )
        created["mock_tests"] += 1

    await session.commit()
    return created


async def seed_plans(session: AsyncSession) -> int:
    """Create any missing plans. Existing plans are never overwritten, so prices you
    have changed in the database stay as they are."""
    created = 0
    for item in json.loads(PLANS_FILE.read_text(encoding="utf-8")):
        if await session.scalar(select(Plan.id).where(Plan.code == item["code"])) is None:
            session.add(Plan(**item))
            created += 1
    await session.commit()
    return created


async def main() -> None:
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as session:
        created = await seed_demo(session)
        created["plans"] = await seed_plans(session)
    await dispose_engine()
    print("seeded:", ", ".join(f"{n} {k}" for k, n in created.items()))


if __name__ == "__main__":
    asyncio.run(main())
