import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )


class MockTest(TimestampMixin, Base):
    __tablename__ = "mock_tests"
    __table_args__ = (
        CheckConstraint("kind IN ('full','sectional')", name="kind_valid"),
        CheckConstraint("status IN ('draft','published','archived')", name="status_valid"),
        CheckConstraint("duration_sec > 0", name="duration_positive"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), server_default="full", nullable=False)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    marks_per_question: Mapped[int] = mapped_column(Integer, server_default="1", nullable=False)
    access: Mapped[str] = mapped_column(String(16), server_default="free", nullable=False)
    status: Mapped[str] = mapped_column(String(16), server_default="draft", nullable=False)


class MockTestQuestion(Base):
    __tablename__ = "mock_test_questions"
    __table_args__ = (UniqueConstraint("mock_test_id", "question_id", name="mock_question"),)

    mock_test_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("mock_tests.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id"), nullable=False)


class Attempt(Base):
    __tablename__ = "attempts"
    __table_args__ = (
        CheckConstraint("type IN ('practice','mock')", name="type_valid"),
        CheckConstraint("mode IN ('practice','test')", name="mode_valid"),
        CheckConstraint("status IN ('in_progress','submitted','expired')", name="status_valid"),
        # A student can have only one unfinished attempt per mock test.
        Index(
            "uq_attempts_one_open_mock",
            "user_id",
            "mock_test_id",
            unique=True,
            postgresql_where=text("status = 'in_progress' AND mock_test_id IS NOT NULL"),
        ),
        Index("ix_attempts_user_started", "user_id", "started_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    exam_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exams.id"), nullable=False)
    mock_test_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("mock_tests.id"))
    status: Mapped[str] = mapped_column(String(16), server_default="in_progress", nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    marks_per_question: Mapped[int] = mapped_column(Integer, server_default="1", nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    correct: Mapped[int | None] = mapped_column(Integer)
    incorrect: Mapped[int | None] = mapped_column(Integer)
    skipped: Mapped[int | None] = mapped_column(Integer)
    score: Mapped[int | None] = mapped_column(Integer)
    time_spent_sec: Mapped[int | None] = mapped_column(Integer)


class AttemptQuestion(Base):
    """Snapshot of the questions served in an attempt, in order."""

    __tablename__ = "attempt_questions"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="attempt_question"),)

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id"), nullable=False)


class AttemptAnswer(Base):
    __tablename__ = "attempt_answers"

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("attempts.id", ondelete="CASCADE"), primary_key=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id"), primary_key=True)
    selected_option_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("question_options.id"))
    marked_for_review: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
