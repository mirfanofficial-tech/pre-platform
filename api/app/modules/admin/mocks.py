import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.modules.admin import audit
from app.modules.admin.schemas import (
    MockAdmin,
    MockDetail,
    MockIn,
    MockQuestionRow,
)
from app.modules.attempts.models import Attempt, MockTest, MockTestQuestion
from app.modules.catalog.models import Exam, Question, Subject
from app.modules.users.models import User


async def _exam(session: AsyncSession, slug: str) -> Exam:
    exam = await session.scalar(select(Exam).where(Exam.slug == slug))
    if exam is None:
        raise AppError(404, "not_found", "Exam not found")
    return exam


async def _load(session: AsyncSession, mock_id: uuid.UUID) -> MockTest:
    mock = await session.get(MockTest, mock_id)
    if mock is None:
        raise AppError(404, "not_found", "Mock test not found")
    return mock


async def _row(session: AsyncSession, mock: MockTest, slug: str) -> MockAdmin:
    questions = await session.scalar(
        select(func.count())
        .select_from(MockTestQuestion)
        .where(MockTestQuestion.mock_test_id == mock.id)
    )
    attempts = await session.scalar(
        select(func.count()).select_from(Attempt).where(Attempt.mock_test_id == mock.id)
    )
    return MockAdmin(
        id=mock.id,
        exam=slug,
        title=mock.title,
        kind=mock.kind,
        duration_minutes=mock.duration_sec // 60,
        marks_per_question=mock.marks_per_question,
        access=mock.access,
        status=mock.status,
        question_count=questions or 0,
        attempts=attempts or 0,
        updated_at=mock.updated_at,
    )


async def _detail(session: AsyncSession, mock: MockTest) -> MockDetail:
    exam = await session.get(Exam, mock.exam_id)
    assert exam is not None
    rows = await session.execute(
        select(MockTestQuestion.position, Question, Subject.name)
        .join(Question, Question.id == MockTestQuestion.question_id)
        .join(Subject, Subject.id == Question.subject_id)
        .where(MockTestQuestion.mock_test_id == mock.id)
        .order_by(MockTestQuestion.position)
    )
    base = await _row(session, mock, exam.slug)
    return MockDetail(
        **base.model_dump(),
        questions=[
            MockQuestionRow(
                question_id=q.id,
                position=position,
                text=q.text,
                subject=subject,
                difficulty=q.difficulty,
                status=q.status,
            )
            for position, q, subject in rows.all()
        ],
    )


async def list_mocks(session: AsyncSession, exam: str | None) -> list[MockAdmin]:
    stmt = select(MockTest, Exam.slug).join(Exam, Exam.id == MockTest.exam_id)
    if exam:
        stmt = stmt.where(Exam.slug == exam)
    rows = await session.execute(stmt.order_by(Exam.sort, MockTest.title))
    return [await _row(session, mock, slug) for mock, slug in rows.all()]


async def get_mock(session: AsyncSession, mock_id: uuid.UUID) -> MockDetail:
    return await _detail(session, await _load(session, mock_id))


async def create_mock(session: AsyncSession, actor: User, data: MockIn) -> MockDetail:
    exam = await _exam(session, data.exam)
    mock = MockTest(
        exam_id=exam.id,
        title=data.title,
        kind=data.kind,
        duration_sec=data.duration_minutes * 60,
        marks_per_question=data.marks_per_question,
        access=data.access,
        status="draft",
    )
    session.add(mock)
    await session.flush()
    audit.record(session, actor, "mock.create", "mock_test", mock.id, after={"title": data.title})
    await session.commit()
    return await _detail(session, mock)


async def update_mock(
    session: AsyncSession, actor: User, mock_id: uuid.UUID, data: MockIn
) -> MockDetail:
    mock = await _load(session, mock_id)
    exam = await session.get(Exam, mock.exam_id)
    assert exam is not None
    if data.exam != exam.slug:
        raise AppError(
            422, "exam_locked", "A mock test cannot move to another exam", "Create a new one."
        )
    before = {
        "title": mock.title,
        "minutes": mock.duration_sec // 60,
        "marks": mock.marks_per_question,
        "access": mock.access,
    }
    mock.title = data.title
    mock.kind = data.kind
    mock.duration_sec = data.duration_minutes * 60
    mock.marks_per_question = data.marks_per_question
    mock.access = data.access
    await session.flush()
    audit.record(
        session,
        actor,
        "mock.update",
        "mock_test",
        mock.id,
        before=before,
        after={
            "title": mock.title,
            "minutes": data.duration_minutes,
            "marks": mock.marks_per_question,
            "access": mock.access,
        },
    )
    await session.commit()
    await session.refresh(mock)  # updated_at is set by the database
    return await _detail(session, mock)


async def set_questions(
    session: AsyncSession, actor: User, mock_id: uuid.UUID, question_ids: list[uuid.UUID]
) -> MockDetail:
    mock = await _load(session, mock_id)
    if mock.status == "published" and not question_ids:
        raise AppError(
            409, "empty_mock_test", "A published mock test needs questions", "Unpublish it first."
        )
    valid = set(
        await session.scalars(
            select(Question.id).where(
                Question.id.in_(question_ids),
                Question.exam_id == mock.exam_id,
                Question.status == "published",
            )
        )
    )
    missing = [q for q in question_ids if q not in valid]
    if missing:
        raise AppError(
            422,
            "invalid_questions",
            "Some questions cannot be used",
            f"{len(missing)} question(s) are not published questions of this exam.",
        )

    before = await session.scalar(
        select(func.count())
        .select_from(MockTestQuestion)
        .where(MockTestQuestion.mock_test_id == mock.id)
    )
    await session.execute(delete(MockTestQuestion).where(MockTestQuestion.mock_test_id == mock.id))
    await session.flush()  # positions are part of the key, so clear before re-inserting
    session.add_all(
        MockTestQuestion(mock_test_id=mock.id, position=i + 1, question_id=qid)
        for i, qid in enumerate(question_ids)
    )
    await session.flush()
    audit.record(
        session,
        actor,
        "mock.questions",
        "mock_test",
        mock.id,
        before={"count": before},
        after={"count": len(question_ids)},
    )
    await session.commit()
    await session.refresh(mock)
    return await _detail(session, mock)


async def set_status(
    session: AsyncSession, actor: User, mock_id: uuid.UUID, status: str
) -> MockDetail:
    mock = await _load(session, mock_id)
    if status == "published":
        rows = (
            await session.execute(
                select(func.count(), func.count().filter(Question.status != "published"))
                .select_from(MockTestQuestion)
                .join(Question, Question.id == MockTestQuestion.question_id)
                .where(MockTestQuestion.mock_test_id == mock.id)
            )
        ).one()
        total, unpublished = rows
        if total == 0:
            raise AppError(409, "empty_mock_test", "Add questions before publishing")
        if unpublished:
            raise AppError(
                409,
                "unpublished_questions",
                "Some questions are not published",
                f"{unpublished} question(s) in this paper are no longer published. "
                "Replace them first.",
            )
    before = mock.status
    mock.status = status
    audit.record(
        session,
        actor,
        f"mock.{status}",
        "mock_test",
        mock.id,
        before={"status": before},
        after={"status": status},
    )
    await session.commit()
    await session.refresh(mock)
    return await _detail(session, mock)


async def delete_mock(session: AsyncSession, actor: User, mock_id: uuid.UUID) -> None:
    mock = await _load(session, mock_id)
    attempts = await session.scalar(
        select(func.count()).select_from(Attempt).where(Attempt.mock_test_id == mock.id)
    )
    if attempts:
        raise AppError(
            409,
            "has_attempts",
            "Students have taken this mock test",
            "Archive it instead so their results stay intact.",
        )
    audit.record(session, actor, "mock.delete", "mock_test", mock.id, before={"title": mock.title})
    await session.delete(mock)
    await session.commit()
