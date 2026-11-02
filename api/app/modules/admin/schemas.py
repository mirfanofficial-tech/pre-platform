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


# ---- exams, subjects and topics ----------------------------------------------------------

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class ExamIn(BaseModel):
    slug: Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=64)]
    name: Name
    full_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ]
    category: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""
    access: Literal["free", "premium", "mixed"] = "mixed"
    status: Literal["draft", "published", "archived"] = "draft"
    sort: int = Field(default=0, ge=0, le=10000)


class ExamAdmin(ExamIn):
    id: uuid.UUID
    subject_count: int
    question_count: int
    mock_count: int


class SubjectIn(BaseModel):
    name: Name
    kind: Literal["mcq", "written"] = "mcq"
    sort: int = Field(default=0, ge=0, le=10000)


class TopicIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class TopicAdmin(BaseModel):
    id: uuid.UUID
    name: str
    question_count: int


class SubjectAdmin(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    sort: int
    question_count: int
    topics: list[TopicAdmin]


class ExamStructure(BaseModel):
    exam: ExamAdmin
    subjects: list[SubjectAdmin]


# ---- mock tests ------------------------------------------------------------------------------


class MockIn(BaseModel):
    exam: str = Field(min_length=1, max_length=64, description="Exam slug")
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    kind: Literal["full", "sectional"] = "full"
    duration_minutes: int = Field(ge=1, le=600)
    marks_per_question: int = Field(default=1, ge=1, le=10)
    access: Literal["free", "premium"] = "free"


class MockAdmin(BaseModel):
    id: uuid.UUID
    exam: str
    title: str
    kind: str
    duration_minutes: int
    marks_per_question: int
    access: str
    status: str
    question_count: int
    attempts: int
    updated_at: datetime


class MockQuestionRow(BaseModel):
    question_id: uuid.UUID
    position: int
    text: str
    subject: str
    difficulty: str
    status: str


class MockDetail(MockAdmin):
    questions: list[MockQuestionRow]


class MockQuestionsIn(BaseModel):
    question_ids: list[uuid.UUID] = Field(max_length=300)

    @field_validator("question_ids")
    @classmethod
    def unique(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(value)) != len(value):
            raise ValueError("A question can only appear once in a mock test")
        return value


class MockStatusIn(BaseModel):
    status: Literal["draft", "published", "archived"]
