from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.db.session import get_session
from app.modules.attempts.models import MockTest
from app.modules.catalog.models import Exam, Question, Subject
from app.modules.catalog.schemas import ExamDetail, ExamSummary, SubjectOut

router = APIRouter(prefix="/api/v1", tags=["catalogue"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _exam_query() -> Select[Exam, int, int, int]:
    questions = (
        select(func.count())
        .select_from(Question)
        .where(Question.exam_id == Exam.id, Question.status == "published")
        .scalar_subquery()
    )
    subjects = (
        select(func.count())
        .select_from(Subject)
        .where(Subject.exam_id == Exam.id)
        .scalar_subquery()
    )
    mocks = (
        select(func.count())
        .select_from(MockTest)
        .where(MockTest.exam_id == Exam.id, MockTest.status == "published")
        .scalar_subquery()
    )
    return select(
        Exam,
        subjects.label("subject_count"),
        questions.label("question_count"),
        mocks.label("mock_test_count"),
    ).where(Exam.status == "published")


def _summary(
    exam: Exam, subject_count: int, question_count: int, mock_test_count: int
) -> ExamSummary:
    return ExamSummary(
        slug=exam.slug,
        name=exam.name,
        full_name=exam.full_name,
        category=exam.category,
        description=exam.description,
        access=exam.access,
        subject_count=subject_count,
        question_count=question_count,
        mock_test_count=mock_test_count,
    )


@router.get("/exams", response_model=list[ExamSummary])
async def list_exams(session: SessionDep) -> list[ExamSummary]:
    rows = await session.execute(_exam_query().order_by(Exam.sort, Exam.name))
    return [_summary(exam, sc, qc, mc) for exam, sc, qc, mc in rows.all()]


@router.get("/exams/{slug}", response_model=ExamDetail)
async def get_exam(slug: str, session: SessionDep) -> ExamDetail:
    row = (await session.execute(_exam_query().where(Exam.slug == slug))).first()
    if row is None:
        raise AppError(404, "not_found", "Exam not found")
    exam, subject_count, question_count, mock_test_count = row

    per_subject = dict(
        (
            await session.execute(
                select(Question.subject_id, func.count())
                .where(Question.exam_id == exam.id, Question.status == "published")
                .group_by(Question.subject_id)
            )
        ).all()
    )
    subjects = (
        (
            await session.execute(
                select(Subject).where(Subject.exam_id == exam.id).order_by(Subject.sort)
            )
        )
        .scalars()
        .all()
    )
    return ExamDetail(
        **_summary(exam, subject_count, question_count, mock_test_count).model_dump(),
        subjects=[
            SubjectOut(id=s.id, name=s.name, kind=s.kind, question_count=per_subject.get(s.id, 0))
            for s in subjects
        ],
    )
