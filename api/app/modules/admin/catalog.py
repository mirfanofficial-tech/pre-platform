import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.modules.admin import audit
from app.modules.admin.schemas import (
    ExamAdmin,
    ExamIn,
    ExamStructure,
    SubjectAdmin,
    SubjectIn,
    TopicAdmin,
    TopicIn,
)
from app.modules.attempts.models import MockTest
from app.modules.catalog.models import Exam, Question, Subject, Topic
from app.modules.users.models import User


async def _count(session: AsyncSession, stmt: object) -> int:
    return (await session.scalar(stmt)) or 0  # type: ignore[call-overload]


def _exam_fields(exam: Exam) -> dict[str, object]:
    return {
        "slug": exam.slug,
        "name": exam.name,
        "full_name": exam.full_name,
        "category": exam.category,
        "description": exam.description,
        "access": exam.access,
        "status": exam.status,
        "sort": exam.sort,
    }


async def _exam_admin(session: AsyncSession, exam: Exam) -> ExamAdmin:
    return ExamAdmin(
        id=exam.id,
        subject_count=await _count(
            session, select(func.count()).select_from(Subject).where(Subject.exam_id == exam.id)
        ),
        question_count=await _count(
            session, select(func.count()).select_from(Question).where(Question.exam_id == exam.id)
        ),
        mock_count=await _count(
            session, select(func.count()).select_from(MockTest).where(MockTest.exam_id == exam.id)
        ),
        **_exam_fields(exam),
    )


async def _exam(session: AsyncSession, slug: str) -> Exam:
    exam = await session.scalar(select(Exam).where(Exam.slug == slug))
    if exam is None:
        raise AppError(404, "not_found", "Exam not found")
    return exam


# ---- exams ----------------------------------------------------------------------------------


async def list_exams(session: AsyncSession) -> list[ExamAdmin]:
    exams = await session.scalars(select(Exam).order_by(Exam.sort, Exam.name))
    return [await _exam_admin(session, e) for e in exams]


async def create_exam(session: AsyncSession, actor: User, data: ExamIn) -> ExamAdmin:
    if await session.scalar(select(Exam.id).where(Exam.slug == data.slug)) is not None:
        raise AppError(409, "slug_taken", "That web address name is already used")
    exam = Exam(**data.model_dump())
    session.add(exam)
    await session.flush()
    audit.record(session, actor, "exam.create", "exam", exam.slug, after=_exam_fields(exam))
    await session.commit()
    return await _exam_admin(session, exam)


async def update_exam(session: AsyncSession, actor: User, slug: str, data: ExamIn) -> ExamAdmin:
    exam = await _exam(session, slug)
    if data.slug != exam.slug:
        raise AppError(
            422, "slug_locked", "The web address name cannot be changed", "Links would break."
        )
    before = _exam_fields(exam)
    for field, value in data.model_dump().items():
        setattr(exam, field, value)
    await session.flush()
    audit.record(
        session, actor, "exam.update", "exam", exam.slug, before=before, after=_exam_fields(exam)
    )
    await session.commit()
    return await _exam_admin(session, exam)


# ---- subjects and topics ----------------------------------------------------------------------


async def structure(session: AsyncSession, slug: str) -> ExamStructure:
    exam = await _exam(session, slug)
    by_subject = dict(
        (
            await session.execute(
                select(Question.subject_id, func.count())
                .where(Question.exam_id == exam.id)
                .group_by(Question.subject_id)
            )
        ).all()
    )
    by_topic = dict(
        (
            await session.execute(
                select(Question.topic_id, func.count())
                .where(Question.exam_id == exam.id, Question.topic_id.is_not(None))
                .group_by(Question.topic_id)
            )
        ).all()
    )
    subjects = (
        await session.scalars(
            select(Subject).where(Subject.exam_id == exam.id).order_by(Subject.sort, Subject.name)
        )
    ).all()
    topics = (
        await session.scalars(
            select(Topic)
            .where(Topic.subject_id.in_([s.id for s in subjects]))
            .order_by(func.lower(Topic.name))
        )
    ).all()
    return ExamStructure(
        exam=await _exam_admin(session, exam),
        subjects=[
            SubjectAdmin(
                id=s.id,
                name=s.name,
                kind=s.kind,
                sort=s.sort,
                question_count=by_subject.get(s.id, 0),
                topics=[
                    TopicAdmin(id=t.id, name=t.name, question_count=by_topic.get(t.id, 0))
                    for t in topics
                    if t.subject_id == s.id
                ],
            )
            for s in subjects
        ],
    )


async def _subject(session: AsyncSession, subject_id: uuid.UUID) -> Subject:
    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise AppError(404, "not_found", "Subject not found")
    return subject


async def _subject_questions(session: AsyncSession, subject_id: uuid.UUID) -> int:
    return await _count(
        session, select(func.count()).select_from(Question).where(Question.subject_id == subject_id)
    )


def _name_taken() -> AppError:
    return AppError(409, "name_taken", "That name is already used here")


async def create_subject(
    session: AsyncSession, actor: User, slug: str, data: SubjectIn
) -> SubjectAdmin:
    exam = await _exam(session, slug)
    subject = Subject(exam_id=exam.id, name=data.name, kind=data.kind, sort=data.sort)
    session.add(subject)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise _name_taken() from None
    audit.record(session, actor, "subject.create", "subject", subject.id, after={"name": data.name})
    await session.commit()
    return SubjectAdmin(
        id=subject.id,
        name=subject.name,
        kind=subject.kind,
        sort=subject.sort,
        question_count=0,
        topics=[],
    )


async def update_subject(
    session: AsyncSession, actor: User, subject_id: uuid.UUID, data: SubjectIn
) -> None:
    subject = await _subject(session, subject_id)
    if data.kind != subject.kind and await _subject_questions(session, subject.id) > 0:
        raise AppError(
            409, "in_use", "This subject has questions", "Its type cannot be changed now."
        )
    before = {"name": subject.name, "kind": subject.kind, "sort": subject.sort}
    subject.name, subject.kind, subject.sort = data.name, data.kind, data.sort
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise _name_taken() from None
    audit.record(
        session,
        actor,
        "subject.update",
        "subject",
        subject.id,
        before=before,
        after={"name": data.name, "kind": data.kind, "sort": data.sort},
    )
    await session.commit()


async def delete_subject(session: AsyncSession, actor: User, subject_id: uuid.UUID) -> None:
    subject = await _subject(session, subject_id)
    if await _subject_questions(session, subject.id) > 0:
        raise AppError(
            409,
            "in_use",
            "This subject has questions",
            "Move or archive its questions first; a subject with questions cannot be deleted.",
        )
    audit.record(
        session, actor, "subject.delete", "subject", subject.id, before={"name": subject.name}
    )
    await session.delete(subject)
    await session.commit()


async def create_topic(
    session: AsyncSession, actor: User, subject_id: uuid.UUID, data: TopicIn
) -> TopicAdmin:
    subject = await _subject(session, subject_id)
    topic = Topic(subject_id=subject.id, name=data.name)
    session.add(topic)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise _name_taken() from None
    audit.record(session, actor, "topic.create", "topic", topic.id, after={"name": data.name})
    await session.commit()
    return TopicAdmin(id=topic.id, name=topic.name, question_count=0)


async def _topic(session: AsyncSession, topic_id: uuid.UUID) -> Topic:
    topic = await session.get(Topic, topic_id)
    if topic is None:
        raise AppError(404, "not_found", "Topic not found")
    return topic


async def rename_topic(
    session: AsyncSession, actor: User, topic_id: uuid.UUID, data: TopicIn
) -> None:
    topic = await _topic(session, topic_id)
    before = topic.name
    topic.name = data.name
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise _name_taken() from None
    audit.record(
        session,
        actor,
        "topic.rename",
        "topic",
        topic.id,
        before={"name": before},
        after={"name": data.name},
    )
    await session.commit()


async def delete_topic(session: AsyncSession, actor: User, topic_id: uuid.UUID) -> None:
    topic = await _topic(session, topic_id)
    used = await _count(
        session, select(func.count()).select_from(Question).where(Question.topic_id == topic.id)
    )
    if used:
        raise AppError(
            409, "in_use", "This topic has questions", "Rename it instead, or move its questions."
        )
    audit.record(session, actor, "topic.delete", "topic", topic.id, before={"name": topic.name})
    await session.delete(topic)
    await session.commit()
