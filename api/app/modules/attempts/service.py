import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError
from app.modules.attempts.models import (
    Attempt,
    AttemptAnswer,
    AttemptQuestion,
    MockTest,
    MockTestQuestion,
)
from app.modules.attempts.schemas import (
    AnswerIn,
    AttemptResult,
    AttemptState,
    AttemptSummary,
    CheckOut,
    LastAttempt,
    MockTestOut,
    OptionOut,
    PracticeSetIn,
    QuestionOut,
    ReviewItem,
    ReviewOption,
    SavedAnswer,
    SectionResult,
)
from app.modules.catalog.models import Exam, Question, QuestionOption, Subject, Topic
from app.modules.users.models import User

# Answers saved this long after the deadline are still accepted (network delay).
DEADLINE_GRACE = timedelta(seconds=10)


def now() -> datetime:
    return datetime.now(UTC)


# ---- loading and access ---------------------------------------------------


async def get_owned_attempt(session: AsyncSession, user: User, attempt_id: uuid.UUID) -> Attempt:
    attempt = await session.get(Attempt, attempt_id)
    if attempt is None or attempt.user_id != user.id:
        raise AppError(404, "not_found", "Attempt not found")
    await close_if_expired(session, attempt)
    return attempt


async def close_if_expired(session: AsyncSession, attempt: Attempt) -> None:
    """Grade and close a timed attempt whose deadline (plus grace) has passed."""
    if (
        attempt.status == "in_progress"
        and attempt.deadline_at is not None
        and now() > attempt.deadline_at + DEADLINE_GRACE
    ):
        await grade(session, attempt, "expired")


async def _question_rows(
    session: AsyncSession, attempt: Attempt
) -> list[tuple[int, Question, str, str | None]]:
    rows = await session.execute(
        select(AttemptQuestion.position, Question, Subject.name, Topic.name)
        .join(Question, Question.id == AttemptQuestion.question_id)
        .join(Subject, Subject.id == Question.subject_id)
        .outerjoin(Topic, Topic.id == Question.topic_id)
        .where(AttemptQuestion.attempt_id == attempt.id)
        .order_by(AttemptQuestion.position)
        .options(selectinload(Question.options))
    )
    return [(pos, q, subj, topic) for pos, q, subj, topic in rows.all()]


async def build_state(session: AsyncSession, attempt: Attempt) -> AttemptState:
    questions: list[QuestionOut] = []
    answers: list[SavedAnswer] = []
    if attempt.status == "in_progress":
        verdicts: dict[uuid.UUID, tuple[uuid.UUID, str]] = {}
        for pos, q, subject, topic in await _question_rows(session, attempt):
            verdicts[q.id] = (next(o.id for o in q.options if o.is_correct), q.explanation)
            questions.append(
                QuestionOut(
                    id=q.id,
                    position=pos,
                    section=subject,
                    topic=topic,
                    difficulty=q.difficulty,
                    text=q.text,
                    options=[
                        OptionOut(id=o.id, position=o.position, text=o.text) for o in q.options
                    ],
                )
            )
        saved = await session.scalars(
            select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id)
        )
        for a in saved:
            feedback = None
            if attempt.mode == "practice" and a.is_correct is not None:
                right, explanation = verdicts[a.question_id]
                feedback = CheckOut(
                    correct=a.is_correct, correct_option_id=right, explanation=explanation
                )
            answers.append(
                SavedAnswer(
                    question_id=a.question_id,
                    selected_option_id=a.selected_option_id,
                    marked_for_review=a.marked_for_review,
                    feedback=feedback,
                )
            )
    return AttemptState(
        id=attempt.id,
        type=attempt.type,
        mode=attempt.mode,
        status=attempt.status,
        title=attempt.title,
        total=attempt.total,
        started_at=attempt.started_at,
        deadline_at=attempt.deadline_at,
        server_now=now(),
        questions=questions,
        answers=answers,
    )


# ---- starting attempts ----------------------------------------------------


def _new_attempt(user: User, **fields: object) -> Attempt:
    return Attempt(user_id=user.id, started_at=now(), **fields)


async def list_mock_tests(
    session: AsyncSession, user: User, exam_slug: str | None
) -> list[MockTestOut]:
    stmt = (
        select(
            MockTest,
            Exam.slug,
            select(func.count())
            .select_from(MockTestQuestion)
            .where(MockTestQuestion.mock_test_id == MockTest.id)
            .scalar_subquery(),
        )
        .join(Exam, Exam.id == MockTest.exam_id)
        .where(MockTest.status == "published", Exam.status == "published")
        .order_by(Exam.sort, MockTest.title)
    )
    if exam_slug:
        stmt = stmt.where(Exam.slug == exam_slug)
    rows = (await session.execute(stmt)).all()

    latest: dict[uuid.UUID, Attempt] = {}
    attempts = await session.scalars(
        select(Attempt)
        .where(Attempt.user_id == user.id, Attempt.mock_test_id.is_not(None))
        .order_by(Attempt.started_at)
    )
    for a in attempts:
        if a.mock_test_id is not None:
            latest[a.mock_test_id] = a  # later rows overwrite earlier ones

    out: list[MockTestOut] = []
    for mock, slug, count in rows:
        last = latest.get(mock.id)
        out.append(
            MockTestOut(
                id=mock.id,
                exam=slug,
                title=mock.title,
                kind=mock.kind,
                duration_sec=mock.duration_sec,
                total_questions=count,
                access=mock.access,
                last_attempt=None
                if last is None
                else LastAttempt(
                    id=last.id,
                    status=last.status,
                    percent=_percent(last),
                    submitted_at=last.submitted_at,
                ),
            )
        )
    return out


async def start_mock(session: AsyncSession, user: User, mock_id: uuid.UUID) -> AttemptState:
    if user.email_verified_at is None:
        raise AppError(
            403,
            "email_not_verified",
            "Confirm your email address first",
            "Mock tests unlock once your email address is confirmed.",
        )
    mock = await session.get(MockTest, mock_id)
    if mock is None or mock.status != "published":
        raise AppError(404, "not_found", "Mock test not found")

    existing = await session.scalar(
        select(Attempt).where(
            Attempt.user_id == user.id,
            Attempt.mock_test_id == mock.id,
            Attempt.status == "in_progress",
        )
    )
    if existing is not None:
        await close_if_expired(session, existing)
        if existing.status == "in_progress":
            return await build_state(session, existing)

    question_ids = list(
        await session.scalars(
            select(MockTestQuestion.question_id)
            .where(MockTestQuestion.mock_test_id == mock.id)
            .order_by(MockTestQuestion.position)
        )
    )
    if not question_ids:
        raise AppError(409, "empty_mock_test", "This mock test has no questions yet")

    started = now()
    attempt = _new_attempt(
        user,
        type="mock",
        mode="test",
        title=mock.title,
        exam_id=mock.exam_id,
        mock_test_id=mock.id,
        total=len(question_ids),
        marks_per_question=mock.marks_per_question,
        deadline_at=started + timedelta(seconds=mock.duration_sec),
    )
    attempt.started_at = started
    session.add(attempt)
    try:
        await session.flush()
    except IntegrityError:  # two requests raced: use the one that won
        await session.rollback()
        winner = await session.scalar(
            select(Attempt).where(
                Attempt.user_id == user.id,
                Attempt.mock_test_id == mock.id,
                Attempt.status == "in_progress",
            )
        )
        if winner is None:
            raise
        return await build_state(session, winner)
    session.add_all(
        AttemptQuestion(attempt_id=attempt.id, position=i + 1, question_id=qid)
        for i, qid in enumerate(question_ids)
    )
    await session.commit()
    return await build_state(session, attempt)


async def start_practice(session: AsyncSession, user: User, data: PracticeSetIn) -> AttemptState:
    exam = await session.scalar(
        select(Exam).where(Exam.slug == data.exam, Exam.status == "published")
    )
    if exam is None:
        raise AppError(404, "not_found", "Exam not found")

    stmt = select(Question.id).where(Question.exam_id == exam.id, Question.status == "published")
    label = "Mixed"
    if data.subject_id is not None:
        subject = await session.get(Subject, data.subject_id)
        if subject is None or subject.exam_id != exam.id:
            raise AppError(422, "unknown_subject", "Unknown subject for this exam")
        stmt = stmt.where(Question.subject_id == subject.id)
        label = subject.name
    if data.topic_id is not None:
        stmt = stmt.where(Question.topic_id == data.topic_id)
    ids = list(await session.scalars(stmt.order_by(func.random()).limit(data.count)))
    if not ids:
        raise AppError(422, "no_questions", "There are no questions for that selection yet")

    attempt = _new_attempt(
        user,
        type="practice",
        mode=data.mode,
        title=f"{exam.name} practice · {label}",
        exam_id=exam.id,
        total=len(ids),
    )
    session.add(attempt)
    await session.flush()
    session.add_all(
        AttemptQuestion(attempt_id=attempt.id, position=i + 1, question_id=qid)
        for i, qid in enumerate(ids)
    )
    await session.commit()
    return await build_state(session, attempt)


# ---- answering -------------------------------------------------------------


async def _require_open(session: AsyncSession, attempt: Attempt) -> None:
    if attempt.status != "in_progress":
        raise AppError(409, "attempt_closed", "This attempt is already finished")


async def _attempt_question_ids(session: AsyncSession, attempt: Attempt) -> set[uuid.UUID]:
    return set(
        await session.scalars(
            select(AttemptQuestion.question_id).where(AttemptQuestion.attempt_id == attempt.id)
        )
    )


async def save_answers(session: AsyncSession, attempt: Attempt, items: list[AnswerIn]) -> int:
    await _require_open(session, attempt)
    valid_questions = await _attempt_question_ids(session, attempt)
    option_ids = {i.selected_option_id for i in items if i.selected_option_id is not None}
    option_question: dict[uuid.UUID, uuid.UUID] = {}
    if option_ids:
        rows = await session.execute(
            select(QuestionOption.id, QuestionOption.question_id).where(
                QuestionOption.id.in_(option_ids)
            )
        )
        option_question = {oid: qid for oid, qid in rows.all()}

    for item in items:
        if item.question_id not in valid_questions:
            raise AppError(422, "unknown_question", "A question is not part of this attempt")
        if item.selected_option_id is not None:
            if option_question.get(item.selected_option_id) != item.question_id:
                raise AppError(422, "unknown_option", "An option does not belong to its question")
            if attempt.mode == "practice":
                raise AppError(
                    422,
                    "use_check_endpoint",
                    "In practice mode, answers are submitted one at a time for feedback",
                )

    for item in items:
        values: dict[str, object] = {"attempt_id": attempt.id, "question_id": item.question_id}
        update: dict[str, object] = {"answered_at": now()}
        if item.clear:
            values["selected_option_id"] = None
            update["selected_option_id"] = None
        elif item.selected_option_id is not None:
            values["selected_option_id"] = item.selected_option_id
            update["selected_option_id"] = item.selected_option_id
        if item.marked_for_review is not None:
            values["marked_for_review"] = item.marked_for_review
            update["marked_for_review"] = item.marked_for_review
        await session.execute(
            insert(AttemptAnswer)
            .values(**values)
            .on_conflict_do_update(index_elements=["attempt_id", "question_id"], set_=update)
        )
    await session.commit()
    return len(items)


async def check_answer(
    session: AsyncSession, attempt: Attempt, question_id: uuid.UUID, option_id: uuid.UUID
) -> CheckOut:
    await _require_open(session, attempt)
    if attempt.mode != "practice":
        raise AppError(409, "feedback_disabled", "Feedback is hidden until you submit in test mode")
    if question_id not in await _attempt_question_ids(session, attempt):
        raise AppError(422, "unknown_question", "That question is not part of this attempt")

    question = await session.scalar(
        select(Question).where(Question.id == question_id).options(selectinload(Question.options))
    )
    assert question is not None
    chosen = next((o for o in question.options if o.id == option_id), None)
    correct = next(o for o in question.options if o.is_correct)
    if chosen is None:
        raise AppError(422, "unknown_option", "That option does not belong to the question")

    already = await session.get(AttemptAnswer, (attempt.id, question_id))
    if already is not None and already.is_correct is not None:
        raise AppError(409, "already_answered", "You already answered this question")

    is_correct = chosen.id == correct.id
    await session.execute(
        insert(AttemptAnswer)
        .values(
            attempt_id=attempt.id,
            question_id=question_id,
            selected_option_id=chosen.id,
            is_correct=is_correct,
        )
        .on_conflict_do_update(
            index_elements=["attempt_id", "question_id"],
            set_={"selected_option_id": chosen.id, "is_correct": is_correct, "answered_at": now()},
        )
    )
    await session.commit()
    return CheckOut(
        correct=is_correct, correct_option_id=correct.id, explanation=question.explanation
    )


# ---- grading and results --------------------------------------------------


async def grade(session: AsyncSession, attempt: Attempt, final_status: str) -> None:
    rows = await session.execute(
        select(AttemptQuestion.question_id, QuestionOption.id)
        .join(
            QuestionOption,
            (QuestionOption.question_id == AttemptQuestion.question_id) & QuestionOption.is_correct,
        )
        .where(AttemptQuestion.attempt_id == attempt.id)
    )
    correct_option = dict(rows.all())
    answers = {
        a.question_id: a
        for a in await session.scalars(
            select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id)
        )
    }

    correct = incorrect = 0
    for question_id, right in correct_option.items():
        answer = answers.get(question_id)
        if answer is None or answer.selected_option_id is None:
            continue
        answer.is_correct = answer.selected_option_id == right
        if answer.is_correct:
            correct += 1
        else:
            incorrect += 1

    submitted = now()
    if attempt.deadline_at is not None:
        submitted = min(submitted, attempt.deadline_at)
    attempt.status = final_status
    attempt.submitted_at = submitted
    attempt.correct = correct
    attempt.incorrect = incorrect
    attempt.skipped = attempt.total - correct - incorrect
    attempt.score = correct * attempt.marks_per_question
    attempt.time_spent_sec = max(0, int((submitted - attempt.started_at).total_seconds()))
    await session.commit()


async def submit(session: AsyncSession, attempt: Attempt) -> AttemptResult:
    if attempt.status == "in_progress":
        await grade(session, attempt, "submitted")
    return await build_result(session, attempt)


def _percent(attempt: Attempt) -> int | None:
    if attempt.correct is None or not attempt.total:
        return None
    return round(attempt.correct / attempt.total * 100)


async def build_result(session: AsyncSession, attempt: Attempt) -> AttemptResult:
    if attempt.status == "in_progress":
        raise AppError(409, "attempt_in_progress", "Submit the attempt to see results")
    assert attempt.submitted_at is not None
    rows = await session.execute(
        select(Subject.name, AttemptAnswer.is_correct)
        .select_from(AttemptQuestion)
        .join(Question, Question.id == AttemptQuestion.question_id)
        .join(Subject, Subject.id == Question.subject_id)
        .outerjoin(
            AttemptAnswer,
            (AttemptAnswer.attempt_id == AttemptQuestion.attempt_id)
            & (AttemptAnswer.question_id == AttemptQuestion.question_id),
        )
        .where(AttemptQuestion.attempt_id == attempt.id)
    )
    totals: dict[str, list[int]] = {}
    for name, is_correct in rows.all():
        bucket = totals.setdefault(name, [0, 0])
        bucket[1] += 1
        if is_correct:
            bucket[0] += 1
    sections = sorted(
        (SectionResult(name=n, correct=c, total=t) for n, (c, t) in totals.items()),
        key=lambda s: (-s.correct / s.total, s.name),
    )
    return AttemptResult(
        id=attempt.id,
        type=attempt.type,
        mode=attempt.mode,
        status=attempt.status,
        title=attempt.title,
        total=attempt.total,
        correct=attempt.correct or 0,
        incorrect=attempt.incorrect or 0,
        skipped=attempt.skipped or 0,
        score=attempt.score or 0,
        max_score=attempt.total * attempt.marks_per_question,
        percent=_percent(attempt) or 0,
        time_spent_sec=attempt.time_spent_sec or 0,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        sections=sections,
    )


async def build_review(session: AsyncSession, attempt: Attempt) -> list[ReviewItem]:
    if attempt.status == "in_progress":
        raise AppError(409, "attempt_in_progress", "Submit the attempt to review the answers")
    answers = {
        a.question_id: a
        for a in await session.scalars(
            select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id)
        )
    }
    items: list[ReviewItem] = []
    for pos, q, subject, topic in await _question_rows(session, attempt):
        answer = answers.get(q.id)
        correct = next(o for o in q.options if o.is_correct)
        selected = answer.selected_option_id if answer else None
        items.append(
            ReviewItem(
                position=pos,
                question_id=q.id,
                section=subject,
                topic=topic,
                text=q.text,
                options=[
                    ReviewOption(id=o.id, position=o.position, text=o.text, is_correct=o.is_correct)
                    for o in q.options
                ],
                selected_option_id=selected,
                correct_option_id=correct.id,
                is_correct=None if selected is None else selected == correct.id,
                explanation=q.explanation,
                marked_for_review=answer.marked_for_review if answer else False,
            )
        )
    return items


async def list_attempts(
    session: AsyncSession, user: User, kind: str | None, limit: int
) -> list[AttemptSummary]:
    stmt = select(Attempt).where(Attempt.user_id == user.id)
    if kind:
        stmt = stmt.where(Attempt.type == kind)
    rows = await session.scalars(stmt.order_by(Attempt.started_at.desc()).limit(limit))
    return [
        AttemptSummary(
            id=a.id,
            type=a.type,
            mode=a.mode,
            status=a.status,
            title=a.title,
            total=a.total,
            score=a.score,
            percent=_percent(a),
            started_at=a.started_at,
            submitted_at=a.submitted_at,
        )
        for a in rows
    ]
