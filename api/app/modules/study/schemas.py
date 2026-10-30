import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class BookmarkOut(BaseModel):
    question_id: uuid.UUID
    text: str
    section: str
    topic: str | None
    saved_at: datetime


class ReportIn(BaseModel):
    reason: Literal["wrong_answer", "typo", "unclear", "other"]
    note: str | None = Field(default=None, max_length=1000)


class ReportOut(BaseModel):
    id: uuid.UUID
    status: str
