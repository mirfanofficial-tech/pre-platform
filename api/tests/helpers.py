import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.attempts.models import MockTest, MockTestQuestion
from app.modules.catalog.hashing import question_hash
from app.modules.catalog.models import Exam, Question, QuestionOption, Subject, Topic
from app.modules.users.models import User

PASSWORD = "secret123"


@dataclass
class World:
    exam: Exam
    english: Subject
    maths: Subject
    mock_id: uuid.UUID
    questions: list[Question]  # published, in mock order


def correct_option(q: Question) -> QuestionOption:
    return next(o for o in q.options if o.is_correct)


def wrong_option(q: Question) -> QuestionOption:
    return next(o for o in q.options if not o.is_correct)


async def seed_world(db: AsyncSession, count: int = 6, duration_sec: int = 600) -> World:
    exam = Exam(slug="lat", name="LAT", full_name="Law Admission Test", category="Law")
    db.add(exam)
    await db.flush()
    english = Subject(exam_id=exam.id, name="English", sort=1)
    maths = Subject(exam_id=exam.id, name="Mathematics", sort=2)
    db.add_all([english, maths])
    await db.flush()
    grammar = Topic(subject_id=english.id, name="Grammar")
    algebra = Topic(subject_id=maths.id, name="Algebra")
    db.add_all([grammar, algebra])
    await db.flush()

    questions: list[Question] = []
    for i in range(count):
        subject, topic = (english, grammar) if i % 2 == 0 else (maths, algebra)
        texts = [f"Q{i} option {n}" for n in "ABCD"]
        questions.append(
            Question(
                exam_id=exam.id,
                subject_id=subject.id,
                topic_id=topic.id,
                text=f"Question number {i}?",
                explanation=f"Because {i}.",
                status="published",
                content_hash=question_hash(f"Question number {i}?", texts),
                options=[
                    QuestionOption(position=p + 1, text=t, is_correct=p == 1)  # B is correct
                    for p, t in enumerate(texts)
                ],
            )
        )
    db.add_all(questions)
    await db.flush()

    mock = MockTest(
        exam_id=exam.id,
        title="LAT Full Mock Test 10",
        duration_sec=duration_sec,
        status="published",
    )
    db.add(mock)
    await db.flush()
    db.add_all(
        MockTestQuestion(mock_test_id=mock.id, position=i + 1, question_id=q.id)
        for i, q in enumerate(questions)
    )
    await db.commit()
    for q in questions:
        await db.refresh(q, ["options"])
    return World(exam, english, maths, mock.id, questions)


async def signup(
    client: httpx.AsyncClient,
    db: AsyncSession,
    email: str = "ana@example.com",
    verified: bool = True,
) -> None:
    r = await client.post(
        "/api/v1/auth/register",
        json={"full_name": "Ana Khan", "email": email, "password": PASSWORD},
    )
    assert r.status_code == 201, r.text
    if verified:
        await db.execute(
            update(User).where(User.email == email).values(email_verified_at=datetime.now(UTC))
        )
        await db.commit()


async def option_ids(db: AsyncSession, question_id: uuid.UUID) -> list[uuid.UUID]:
    rows = await db.scalars(
        select(QuestionOption.id)
        .where(QuestionOption.question_id == question_id)
        .order_by(QuestionOption.position)
    )
    return list(rows)
