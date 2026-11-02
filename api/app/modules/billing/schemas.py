import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PlanOut(BaseModel):
    code: str
    name: str
    blurb: str
    price_paisa: int
    period_days: int
    limits: dict[str, int]
    features: list[str]
    badge: str | None


class UsageOut(BaseModel):
    mcq_used: int
    mock_used: int


class SubscriptionOut(BaseModel):
    plan_code: str
    plan_name: str
    premium: bool
    ends_at: datetime | None
    limits: dict[str, int]
    usage: UsageOut
    resets_at: datetime


class CheckoutIn(BaseModel):
    plan_code: str = Field(min_length=1, max_length=40)


class CheckoutOut(BaseModel):
    payment_id: uuid.UUID
    method: Literal["GET", "POST"]
    action_url: str
    fields: dict[str, str]


class PaymentOut(BaseModel):
    id: uuid.UUID
    plan_name: str
    amount_paisa: int
    status: str
    provider: str
    created_at: datetime
    paid_at: datetime | None


class FakeCompleteIn(BaseModel):
    ref: str = Field(min_length=1, max_length=40)
    outcome: Literal["success", "failure"]
