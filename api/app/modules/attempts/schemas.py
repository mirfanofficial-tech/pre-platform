import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class OptionOut(BaseModel):
    """An answer choice as shown to a student. Never says which one is correct."""

    id: uuid.UUID
    position: int
    text: str


class QuestionOut(BaseModel):
    id: uuid.UUID
    position: int
    section: str
    topic: str | None
    difficulty: str
    text: str
    options: list[OptionOut]


class CheckOut(BaseModel):
    correct: bool
    correct_option_id: uuid.UUID
    explanation: str


class SavedAnswer(BaseModel):
    question_id: uuid.UUID
    selected_option_id: uuid.UUID | None
    marked_for_review: bool
    # Practice mode only: feedback the student has already been shown for this question.
    feedback: CheckOut | None = None


class AttemptState(BaseModel):
    id: uuid.UUID
    type: Literal["practice", "mock"]
    mode: Literal["practice", "test"]
    status: Literal["in_progress", "submitted", "expired"]
    title: str
    total: int
    started_at: datetime
    deadline_at: datetime | None
    server_now: datetime
    questions: list[QuestionOut]
    answers: list[SavedAnswer]


class AnswerIn(BaseModel):
    question_id: uuid.UUID
    selected_option_id: uuid.UUID | None = None
    marked_for_review: bool | None = Field(
        default=None, description="Leave out to keep the current flag"
    )
    clear: bool = Field(default=False, description="Remove the selected option")


class AnswersIn(BaseModel):
    answers: list[AnswerIn] = Field(min_length=1, max_length=200)


class AnswersSaved(BaseModel):
    saved: int
    server_now: datetime


class CheckIn(BaseModel):
    option_id: uuid.UUID


class PracticeSetIn(BaseModel):
    exam: str = Field(max_length=64, description="Exam slug")
    subject_id: uuid.UUID | None = None
    topic_id: uuid.UUID | None = None
    count: int = Field(default=10, ge=1, le=50)
    mode: Literal["practice", "test"] = "practice"


class SectionResult(BaseModel):
    name: str
    correct: int
    total: int


class AttemptResult(BaseModel):
    id: uuid.UUID
    type: Literal["practice", "mock"]
    mode: Literal["practice", "test"]
    status: Literal["submitted", "expired"]
    title: str
    total: int
    correct: int
    incorrect: int
    skipped: int
    score: int
    max_score: int
    percent: int
    time_spent_sec: int
    started_at: datetime
    submitted_at: datetime
    sections: list[SectionResult]


class ReviewOption(BaseModel):
    id: uuid.UUID
    position: int
    text: str
    is_correct: bool


class ReviewItem(BaseModel):
    position: int
    question_id: uuid.UUID
    section: str
    topic: str | None
    text: str
    options: list[ReviewOption]
    selected_option_id: uuid.UUID | None
    correct_option_id: uuid.UUID
    is_correct: bool | None
    explanation: str
    marked_for_review: bool


class AttemptSummary(BaseModel):
    id: uuid.UUID
    type: Literal["practice", "mock"]
    mode: Literal["practice", "test"]
    status: Literal["in_progress", "submitted", "expired"]
    title: str
    total: int
    score: int | None
    percent: int | None
    started_at: datetime
    submitted_at: datetime | None


class LastAttempt(BaseModel):
    id: uuid.UUID
    status: Literal["in_progress", "submitted", "expired"]
    percent: int | None
    submitted_at: datetime | None


class MockTestOut(BaseModel):
    id: uuid.UUID
    exam: str
    title: str
    kind: str
    duration_sec: int
    total_questions: int
    access: str
    last_attempt: LastAttempt | None
