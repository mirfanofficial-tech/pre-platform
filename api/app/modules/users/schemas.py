import re
import uuid
from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, max_length=32)]
Token = Annotated[str, StringConstraints(min_length=20, max_length=200)]


def check_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Use at least 8 characters")
    if len(value) > 128:
        raise ValueError("Use at most 128 characters")
    if not re.search(r"\d", value):
        raise ValueError("Include at least one number")
    return value


class RegisterIn(BaseModel):
    full_name: Name
    email: EmailStr
    password: str
    phone: Phone | None = None
    target_exam: str | None = Field(default=None, max_length=64, description="Exam slug")

    _password = field_validator("password")(check_password)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    remember: bool = True


class TokenIn(BaseModel):
    token: Token


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: Token
    password: str

    _password = field_validator("password")(check_password)


class ProfilePatch(BaseModel):
    full_name: Name | None = None
    phone: Phone | None = None
    target_exam: str | None = Field(default=None, max_length=64)
    target_exam_date: date | None = None
    daily_goal: int | None = Field(default=None, ge=1, le=1000)
    leaderboard_opt_in: bool | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: str
    email_verified: bool
    phone: str | None
    target_exam: str | None
    target_exam_date: date | None
    daily_goal: int
    leaderboard_opt_in: bool


class StatusOut(BaseModel):
    status: str
