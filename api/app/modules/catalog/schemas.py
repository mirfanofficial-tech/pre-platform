import uuid

from pydantic import BaseModel


class SubjectOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    question_count: int


class ExamSummary(BaseModel):
    slug: str
    name: str
    full_name: str
    category: str
    description: str
    access: str
    subject_count: int
    question_count: int
    mock_test_count: int


class ExamDetail(ExamSummary):
    subjects: list[SubjectOut]
