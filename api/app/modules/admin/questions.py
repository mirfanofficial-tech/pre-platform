import csv
import io
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError
from app.modules.admin import audit
from app.modules.admin.schemas import (
    ImportError,
    ImportResult,
    OptionAdmin,
    QuestionAdminOut,
    QuestionIn,
    QuestionPage,
    QuestionRow,
)
from app.modules.catalog.hashing import question_hash
from app.modules.catalog.models import Exam, Question, QuestionOption, Subject, Topic
from app.modules.users.models import User

MAX_IMPORT_ROWS = 1000
MAX_IMPORT_BYTES = 2_000_000
LETTERS = "abcdef"

# (from, to) -> roles that may make the change
TRANSITIONS: dict[tuple[str, str], tuple[str, ...]] = {
    ("draft", "in_review"): ("editor", "reviewer", "admin"),
    ("in_review", "draft"): ("reviewer", "admin"),
    ("in_review", "published"): ("reviewer", "admin"),
    ("draft", "published"): ("admin",),
    ("draft", "archived"): ("reviewer", "admin"),
    ("published", "archived"): ("reviewer", "admin"),
    ("archived", "draft"): ("admin",),
}


# ---- helpers ----


async def _exam(session: AsyncSession, slug: str) -> Exam:
    exam = await session.scalar(select(Exam).where(Exam.slug == slug))
    if exam is None:
        raise AppError(404, "not_found", "Exam not found")
    return exam


async def _subject(session: AsyncSession, exam: Exam, subject_id: uuid.UUID) -> Subject:
    subject = await session.get(Subject, subject_id)
    if subject is None or subject.exam_id != exam.id:
        raise AppError(422, "unknown_subject", "That subject does not belong to this exam")
    return subject


async def _topic_id(session: AsyncSession, subject: Subject, name: str | None) -> uuid.UUID | None:
    if not name:
        return None
    topic = await session.scalar(
        select(Topic).where(Topic.subject_id == subject.id, func.lower(Topic.name) == name.lower())
    )
    if topic is None:
        topic = Topic(subject_id=subject.id, name=name)
        session.add(topic)
        await session.flush()
    return topic.id


async def _duplicate_of(
    session: AsyncSession, exam: Exam, digest: str, exclude: uuid.UUID | None = None
) -> uuid.UUID | None:
    stmt = select(Question.id).where(Question.exam_id == exam.id, Question.content_hash == digest)
    if exclude is not None:
        stmt = stmt.where(Question.id != exclude)
    return await session.scalar(stmt.limit(1))


def _duplicate_error(existing: uuid.UUID) -> AppError:
    return AppError(
        409,
        "duplicate_question",
        "This question already exists",
        f"An identical question is already in the bank (id {existing}).",
    )


async def _load(session: AsyncSession, question_id: uuid.UUID) -> Question:
    q = await session.scalar(
        select(Question).where(Question.id == question_id).options(selectinload(Question.options))
    )
    if q is None:
        raise AppError(404, "not_found", "Question not found")
    return q


async def _name(session: AsyncSession, user_id: uuid.UUID | None) -> str | None:
    if user_id is None:
        return None
    return await session.scalar(select(User.full_name).where(User.id == user_id))


async def _out(session: AsyncSession, q: Question) -> QuestionAdminOut:
    exam = await session.get(Exam, q.exam_id)
    subject = await session.get(Subject, q.subject_id)
    topic = await session.get(Topic, q.topic_id) if q.topic_id else None
    assert exam is not None and subject is not None
    return QuestionAdminOut(
        id=q.id,
        exam=exam.slug,
        subject_id=subject.id,
        subject=subject.name,
        topic=topic.name if topic else None,
        difficulty=q.difficulty,
        text=q.text,
        explanation=q.explanation,
        status=q.status,
        version=q.version,
        options=[
            OptionAdmin(position=o.position, text=o.text, is_correct=o.is_correct)
            for o in q.options
        ],
        reported_count=q.reported_count,
        created_by=await _name(session, q.created_by),
        reviewed_by=await _name(session, q.reviewed_by),
        created_at=q.created_at,
        updated_at=q.updated_at,
        published_at=q.published_at,
    )


def _validated(data: QuestionIn) -> None:
    try:
        data.check()
    except ValueError as exc:
        raise AppError(422, "invalid_question", str(exc)) from exc


def _summary(q: Question) -> dict[str, object]:
    return {
        "text": q.text,
        "difficulty": q.difficulty,
        "status": q.status,
        "options": [o.text for o in q.options],
        "correct": next((o.position for o in q.options if o.is_correct), None),
    }


# ---- reads ----


async def list_questions(
    session: AsyncSession,
    *,
    exam: str | None,
    subject_id: uuid.UUID | None,
    status: str | None,
    search: str | None,
    page: int,
    page_size: int,
) -> QuestionPage:
    stmt = (
        select(Question, Exam.slug, Subject.name, Topic.name)
        .join(Exam, Exam.id == Question.exam_id)
        .join(Subject, Subject.id == Question.subject_id)
        .outerjoin(Topic, Topic.id == Question.topic_id)
    )
    if exam:
        stmt = stmt.where(Exam.slug == exam)
    if subject_id:
        stmt = stmt.where(Question.subject_id == subject_id)
    if status:
        stmt = stmt.where(Question.status == status)
    if search:
        stmt = stmt.where(Question.text.ilike(f"%{search}%"))
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await session.execute(
        stmt.order_by(Question.updated_at.desc(), Question.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    return QuestionPage(
        items=[
            QuestionRow(
                id=q.id,
                exam=slug,
                subject=subject,
                topic=topic,
                difficulty=q.difficulty,
                text=q.text,
                status=q.status,
                reported_count=q.reported_count,
                updated_at=q.updated_at,
            )
            for q, slug, subject, topic in rows.all()
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


async def get_question(session: AsyncSession, question_id: uuid.UUID) -> QuestionAdminOut:
    return await _out(session, await _load(session, question_id))


# ---- writes ----


async def create_question(session: AsyncSession, user: User, data: QuestionIn) -> QuestionAdminOut:
    _validated(data)
    exam = await _exam(session, data.exam)
    subject = await _subject(session, exam, data.subject_id)
    digest = question_hash(data.text, data.options)
    existing = await _duplicate_of(session, exam, digest)
    if existing is not None:
        raise _duplicate_error(existing)

    q = Question(
        exam_id=exam.id,
        subject_id=subject.id,
        topic_id=await _topic_id(session, subject, data.topic_name),
        text=data.text,
        explanation=data.explanation,
        difficulty=data.difficulty,
        status="draft",
        content_hash=digest,
        created_by=user.id,
        options=[
            QuestionOption(position=i + 1, text=t, is_correct=i == data.correct_index)
            for i, t in enumerate(data.options)
        ],
    )
    session.add(q)
    await session.flush()
    audit.record(session, user, "question.create", "question", q.id, after=_summary(q))
    await session.commit()
    return await _out(session, await _load(session, q.id))


async def update_question(
    session: AsyncSession, user: User, question_id: uuid.UUID, data: QuestionIn
) -> QuestionAdminOut:
    _validated(data)
    q = await _load(session, question_id)
    if q.status == "archived":
        raise AppError(409, "archived", "Restore this question before editing it")
    if q.status == "published" and user.role == "editor":
        raise AppError(
            403, "forbidden", "Published questions can only be changed by a reviewer or admin"
        )
    exam = await _exam(session, data.exam)
    subject = await _subject(session, exam, data.subject_id)
    digest = question_hash(data.text, data.options)
    existing = await _duplicate_of(session, exam, digest, exclude=q.id)
    if existing is not None:
        raise _duplicate_error(existing)

    before = _summary(q)
    await session.execute(delete(QuestionOption).where(QuestionOption.question_id == q.id))
    session.add_all(
        QuestionOption(question_id=q.id, position=i + 1, text=t, is_correct=i == data.correct_index)
        for i, t in enumerate(data.options)
    )
    q.exam_id = exam.id
    q.subject_id = subject.id
    q.topic_id = await _topic_id(session, subject, data.topic_name)
    q.text = data.text
    q.explanation = data.explanation
    q.difficulty = data.difficulty
    q.content_hash = digest
    if q.status == "published":
        q.version += 1  # live content changed
    await session.flush()
    await session.refresh(q, ["options"])
    audit.record(
        session, user, "question.update", "question", q.id, before=before, after=_summary(q)
    )
    await session.commit()
    return await _out(session, await _load(session, q.id))


async def transition(
    session: AsyncSession, user: User, question_id: uuid.UUID, to: str
) -> QuestionAdminOut:
    q = await _load(session, question_id)
    allowed = TRANSITIONS.get((q.status, to))
    if allowed is None:
        raise AppError(409, "invalid_transition", f"A {q.status} question cannot become {to}")
    if user.role not in allowed:
        raise AppError(403, "forbidden", "You do not have permission to do that")
    if to == "published" and user.role == "reviewer" and q.created_by == user.id:
        raise AppError(403, "two_person_rule", "Another reviewer must approve a question you wrote")

    was = q.status
    q.status = to
    if to == "published":
        q.reviewed_by = user.id
        q.published_at = datetime.now(UTC)
    audit.record(
        session,
        user,
        f"question.{to}",
        "question",
        q.id,
        before={"status": was},
        after={"status": to},
    )
    await session.commit()
    return await _out(session, await _load(session, q.id))


# ---- CSV import ----


async def import_csv(
    session: AsyncSession, user: User, exam_slug: str, body: bytes, dry_run: bool
) -> ImportResult:
    """Import questions as drafts. All or nothing: any invalid row rejects the whole file.

    Columns: subject, topic, difficulty, question, option_a ... option_f, correct, explanation.
    """
    if len(body) > MAX_IMPORT_BYTES:
        raise AppError(413, "file_too_large", "The file is too large (2 MB at most)")
    exam = await _exam(session, exam_slug)
    subjects = {
        s.name.lower(): s
        for s in await session.scalars(select(Subject).where(Subject.exam_id == exam.id))
    }

    reader = csv.DictReader(io.StringIO(body.decode("utf-8-sig", errors="replace")))
    rows = [
        {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()} for row in reader
    ]
    if not rows:
        raise AppError(422, "empty_file", "The file has no rows")
    if len(rows) > MAX_IMPORT_ROWS:
        raise AppError(422, "too_many_rows", f"At most {MAX_IMPORT_ROWS} rows per file")

    errors: list[ImportError] = []
    valid: list[tuple[Subject, str, QuestionIn, str]] = []
    seen: set[str] = set()
    duplicates = 0

    for number, row in enumerate(rows, start=2):  # row 1 is the header
        subject = subjects.get(row.get("subject", "").lower())
        given = [(letter, row.get(f"option_{letter}", "")) for letter in LETTERS]
        given = [(letter, text) for letter, text in given if text]
        correct = row.get("correct", "").lower()
        difficulty = (row.get("difficulty") or "medium").lower()
        problem = None
        if subject is None:
            problem = f"Unknown subject '{row.get('subject', '')}' for this exam"
        elif not row.get("question"):
            problem = "Question text is empty"
        elif len(given) < 2:
            problem = "At least two options are needed"
        elif correct not in [letter for letter, _ in given]:
            problem = "The 'correct' column must be the letter of one of the options"
        elif difficulty not in ("easy", "medium", "hard"):
            problem = "Difficulty must be easy, medium or hard"
        if problem:
            errors.append(ImportError(row=number, message=problem))
            continue
        assert subject is not None
        texts = [t for _, t in given]
        try:
            data = QuestionIn(
                exam=exam.slug,
                subject_id=subject.id,
                topic_name=row.get("topic") or None,
                text=row["question"],
                options=texts,
                correct_index=[letter for letter, _ in given].index(correct),
                explanation=row.get("explanation", ""),
                difficulty=difficulty,
            )
        except ValueError as exc:
            errors.append(ImportError(row=number, message=str(exc).splitlines()[-1][:200]))
            continue
        digest = question_hash(data.text, data.options)
        if digest in seen or await _duplicate_of(session, exam, digest) is not None:
            duplicates += 1
            continue
        seen.add(digest)
        valid.append((subject, row.get("topic", ""), data, digest))

    if errors or dry_run:
        return ImportResult(
            dry_run=dry_run,
            total=len(rows),
            created=0 if errors else len(valid),
            duplicates=duplicates,
            errors=errors,
        )

    for subject, topic, data, digest in valid:
        session.add(
            Question(
                exam_id=exam.id,
                subject_id=subject.id,
                topic_id=await _topic_id(session, subject, topic or None),
                text=data.text,
                explanation=data.explanation,
                difficulty=data.difficulty,
                status="draft",
                content_hash=digest,
                created_by=user.id,
                licence="Imported by staff",
                options=[
                    QuestionOption(position=i + 1, text=t, is_correct=i == data.correct_index)
                    for i, t in enumerate(data.options)
                ],
            )
        )
    audit.record(
        session,
        user,
        "question.import",
        "exam",
        exam.slug,
        after={"created": len(valid), "duplicates": duplicates},
    )
    await session.commit()
    return ImportResult(
        dry_run=False, total=len(rows), created=len(valid), duplicates=duplicates, errors=[]
    )
