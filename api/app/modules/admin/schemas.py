import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
OptionText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]

Status = Literal["draft", "in_review", "published", "archived"]
Difficulty = Literal["easy", "medium", "hard"]


# ---- questions -----------------------------------------------------------------------


class OptionAdmin(BaseModel):
    position: int
    text: str
    is_correct: bool


class QuestionIn(BaseModel):
    exam: str = Field(min_length=1, max_length=64, description="Exam slug")
    subject_id: uuid.UUID
    topic_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)] | None = (
        None
    )
    text: Text
    options: list[OptionText] = Field(min_length=2, max_length=6)
    correct_index: int = Field(ge=0, le=5, description="0-based index into options")
    explanation: Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)] = ""
    difficulty: Difficulty = "medium"

    @field_validator("options")
    @classmethod
    def distinct(cls, value: list[str]) -> list[str]:
        if len({o.strip().lower() for o in value}) != len(value):
            raise ValueError("Options must be different from each other")
        return value

    def check(self) -> None:
        if self.correct_index >= len(self.options):
            raise ValueError("The correct answer must be one of the options")


class QuestionAdminOut(BaseModel):
    id: uuid.UUID
    exam: str
    subject_id: uuid.UUID
    subject: str
    topic: str | None
    difficulty: str
    text: str
    explanation: str
    status: str
    version: int
    options: list[OptionAdmin]
    reported_count: int
    created_by: str | None
    reviewed_by: str | None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None


class QuestionRow(BaseModel):
    id: uuid.UUID
    exam: str
    subject: str
    topic: str | None
    difficulty: str
    text: str
    status: str
    reported_count: int
    updated_at: datetime


class QuestionPage(BaseModel):
    items: list[QuestionRow]
    total: int
    page: int
    page_size: int


class TransitionIn(BaseModel):
    to: Status


class ImportError(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    dry_run: bool
    total: int
    created: int
    duplicates: int
    errors: list[ImportError]


# ---- people and money -----------------------------------------------------------------


class StudentRow(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str
    status: str
    email_verified: bool
    plan: str
    joined: datetime
    last_seen: datetime | None


class StudentPage(BaseModel):
    items: list[StudentRow]
    total: int
    page: int
    page_size: int


class StudentPatch(BaseModel):
    status: Literal["active", "suspended"] | None = None
    role: Literal["student", "editor", "reviewer", "admin"] | None = None


class GrantIn(BaseModel):
    plan_code: str = Field(min_length=1, max_length=40)
    days: int | None = Field(default=None, ge=1, le=3650)


class AdminPaymentRow(BaseModel):
    id: uuid.UUID
    student: str
    email: str
    plan: str
    amount_paisa: int
    status: str
    provider: str
    provider_ref: str
    created_at: datetime
    paid_at: datetime | None


class AdminPaymentPage(BaseModel):
    items: list[AdminPaymentRow]
    total: int
    page: int
    page_size: int


class ReportRow(BaseModel):
    id: uuid.UUID
    question_id: uuid.UUID
    question: str
    reason: str
    note: str | None
    status: str
    reporter: str | None
    created_at: datetime


class ReportResolve(BaseModel):
    status: Literal["resolved", "dismissed"]


# ---- stats ------------------------------------------------------------------------------


class CountBy(BaseModel):
    name: str
    value: int


class WeekPoint(BaseModel):
    week_start: date
    signups: int


class AdminStats(BaseModel):
    students: int
    active_last_7_days: int
    premium_now: int
    revenue_this_month_paisa: int
    revenue_total_paisa: int
    questions_by_status: list[CountBy]
    questions_by_exam: list[CountBy]
    pending_reviews: int
    open_reports: int
    signups: list[WeekPoint]


class AuditRow(BaseModel):
    id: int
    actor: str | None
    action: str
    entity: str
    entity_id: str | None
    created_at: datetime
