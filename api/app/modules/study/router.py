import uuid

from fastapi import APIRouter, Response, status
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from app.core.errors import AppError
from app.modules.billing.entitlements import check_bookmark
from app.modules.catalog.models import Question, Subject, Topic
from app.modules.study.models import Bookmark, QuestionReport
from app.modules.study.schemas import BookmarkOut, ReportIn, ReportOut
from app.modules.users.deps import CurrentUser, SessionDep

router = APIRouter(prefix="/api/v1", tags=["study"])


async def _published_question(session: SessionDep, question_id: uuid.UUID) -> Question:
    question = await session.get(Question, question_id)
    if question is None or question.status != "published":
        raise AppError(404, "not_found", "Question not found")
    return question


@router.get("/me/bookmarks", response_model=list[BookmarkOut])
async def list_bookmarks(user: CurrentUser, session: SessionDep) -> list[BookmarkOut]:
    rows = await session.execute(
        select(Question.id, Question.text, Subject.name, Topic.name, Bookmark.created_at)
        .select_from(Bookmark)
        .join(Question, Question.id == Bookmark.question_id)
        .join(Subject, Subject.id == Question.subject_id)
        .outerjoin(Topic, Topic.id == Question.topic_id)
        .where(Bookmark.user_id == user.id, Question.status == "published")
        .order_by(Bookmark.created_at.desc())
    )
    return [
        BookmarkOut(question_id=qid, text=text, section=subject, topic=topic, saved_at=at)
        for qid, text, subject, topic, at in rows.all()
    ]


@router.put("/me/bookmarks/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_bookmark(question_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> None:
    await _published_question(session, question_id)
    await check_bookmark(session, user, question_id)
    await session.execute(
        insert(Bookmark)
        .values(user_id=user.id, question_id=question_id)
        .on_conflict_do_nothing(index_elements=["user_id", "question_id"])
    )
    await session.commit()


@router.delete("/me/bookmarks/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_bookmark(question_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> None:
    await session.execute(
        Bookmark.__table__.delete().where(  # type: ignore[attr-defined]
            Bookmark.user_id == user.id, Bookmark.question_id == question_id
        )
    )
    await session.commit()


@router.post(
    "/questions/{question_id}/report", response_model=ReportOut, status_code=status.HTTP_201_CREATED
)
async def report_question(
    question_id: uuid.UUID,
    data: ReportIn,
    user: CurrentUser,
    session: SessionDep,
    response: Response,
) -> ReportOut:
    await _published_question(session, question_id)
    report = QuestionReport(
        question_id=question_id, user_id=user.id, reason=data.reason, note=data.note
    )
    session.add(report)
    await session.execute(
        update(Question)
        .where(Question.id == question_id)
        .values(reported_count=Question.reported_count + 1)
    )
    await session.commit()
    return ReportOut(id=report.id, status=report.status)
