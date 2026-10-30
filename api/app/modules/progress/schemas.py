from datetime import date

from pydantic import BaseModel


class DayActivity(BaseModel):
    day: date
    answered: int


class SubjectAccuracy(BaseModel):
    name: str
    answered: int
    correct: int
    percent: int


class TopicAccuracy(BaseModel):
    topic_id: str
    topic: str
    subject: str
    answered: int
    correct: int
    percent: int


class TrendPoint(BaseModel):
    attempt_id: str
    title: str
    type: str
    percent: int
    submitted_at: str


class TargetExam(BaseModel):
    name: str
    slug: str
    date: date | None
    days_left: int | None


class ProgressOut(BaseModel):
    today: date
    answered: int
    correct: int
    accuracy: int | None
    answered_today: int
    daily_goal: int
    streak_days: int
    best_streak: int
    answered_this_week: int
    answered_last_week: int
    mocks_completed: int
    target: TargetExam | None
    week: list[DayActivity]
    subjects: list[SubjectAccuracy]
    weak_topics: list[TopicAccuracy]
    trend: list[TrendPoint]


class LeaderboardEntry(BaseModel):
    rank: int
    name: str
    answered: int
    correct: int
    percent: int
    is_me: bool


class LeaderboardOut(BaseModel):
    period: str
    opted_in: bool
    entries: list[LeaderboardEntry]
    me: LeaderboardEntry | None
