from collections.abc import Collection
from datetime import date, timedelta

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.attempts.models import Attempt, AttemptAnswer
from app.modules.catalog.models import Exam, Question, Subject, Topic
from app.modules.progress.schemas import (
    DayActivity,
    ProgressOut,
    SubjectAccuracy,
    TargetExam,
    TopicAccuracy,
    TrendPoint,
)
from app.modules.users.models import User

TIMEZONE = "Asia/Karachi"
WEAK_TOPIC_MIN_ANSWERS = 3
WEAK_TOPIC_LIMIT = 5
TREND_POINTS = 10


def streaks(active_days: Collection[date], today: date) -> tuple[int, int]:
    """Return (current, best) run of consecutive study days.

    The current streak stays alive until the end of the day after the last
    study day, so a student who has not studied yet today keeps yesterday's run.
    """
    if not active_days:
        return 0, 0
    days = sorted(set(active_days))
    best = run = 1
    for prev, cur in zip(days, days[1:], strict=False):
        run = run + 1 if cur - prev == timedelta(days=1) else 1
        best = max(best, run)

    current = 0
    if days[-1] >= today - timedelta(days=1):
        current = 1
        for prev, cur in zip(reversed(days[:-1]), reversed(days[1:]), strict=True):
            if cur - prev != timedelta(days=1):
                break
            current += 1
    return current, best


def _percent(correct: int, answered: int) -> int:
    return round(correct / answered * 100) if answered else 0


async def build_progress(session: AsyncSession, user: User) -> ProgressOut:
    today = await session.scalar(select(cast(func.timezone(TIMEZONE, func.now()), Date)))
    assert today is not None

    # Only graded answers count: practice answers are graded when checked, test-mode
    # answers when the attempt is submitted.
    day = cast(func.timezone(TIMEZONE, AttemptAnswer.answered_at), Date)
    graded = AttemptAnswer.is_correct.is_not(None)
    mine = Attempt.user_id == user.id

    daily_rows = (
        await session.execute(
            select(
                day,
                func.count(),
                func.count().filter(AttemptAnswer.is_correct.is_(True)),
            )
            .select_from(AttemptAnswer)
            .join(Attempt, Attempt.id == AttemptAnswer.attempt_id)
            .where(mine, graded)
            .group_by(day)
        )
    ).all()
    per_day = {d: (n, c) for d, n, c in daily_rows}
    answered = sum(n for n, _ in per_day.values())
    correct = sum(c for _, c in per_day.values())
    current_streak, best_streak = streaks(per_day.keys(), today)

    week = [
        DayActivity(day=d, answered=per_day.get(d, (0, 0))[0])
        for d in (today - timedelta(days=i) for i in range(6, -1, -1))
    ]
    last_week = sum(per_day.get(today - timedelta(days=i), (0, 0))[0] for i in range(7, 14))

    subject_rows = (
        await session.execute(
            select(
                Subject.name, func.count(), func.count().filter(AttemptAnswer.is_correct.is_(True))
            )
            .select_from(AttemptAnswer)
            .join(Attempt, Attempt.id == AttemptAnswer.attempt_id)
            .join(Question, Question.id == AttemptAnswer.question_id)
            .join(Subject, Subject.id == Question.subject_id)
            .where(mine, graded)
            .group_by(Subject.id, Subject.name, Subject.sort)
            .order_by(Subject.sort, Subject.name)
        )
    ).all()
    subjects = [
        SubjectAccuracy(name=name, answered=n, correct=c, percent=_percent(c, n))
        for name, n, c in subject_rows
    ]

    topic_rows = (
        await session.execute(
            select(
                Topic.id,
                Topic.name,
                Subject.name,
                func.count(),
                func.count().filter(AttemptAnswer.is_correct.is_(True)),
            )
            .select_from(AttemptAnswer)
            .join(Attempt, Attempt.id == AttemptAnswer.attempt_id)
            .join(Question, Question.id == AttemptAnswer.question_id)
            .join(Topic, Topic.id == Question.topic_id)
            .join(Subject, Subject.id == Topic.subject_id)
            .where(mine, graded)
            .group_by(Topic.id, Topic.name, Subject.name)
            .having(func.count() >= WEAK_TOPIC_MIN_ANSWERS)
        )
    ).all()
    topics = sorted(
        (
            TopicAccuracy(
                topic_id=str(tid),
                topic=topic,
                subject=subject,
                answered=n,
                correct=c,
                percent=_percent(c, n),
            )
            for tid, topic, subject, n, c in topic_rows
        ),
        key=lambda t: (t.percent, -t.answered, t.topic),
    )
    weak_topics = [t for t in topics if t.percent < 80][:WEAK_TOPIC_LIMIT]

    finished = (
        Attempt.user_id == user.id,
        Attempt.status.in_(("submitted", "expired")),
        Attempt.total > 0,
    )
    mocks_completed = (
        await session.scalar(
            select(func.count()).select_from(Attempt).where(*finished, Attempt.type == "mock")
        )
        or 0
    )
    recent = (
        await session.scalars(
            select(Attempt)
            .where(*finished, Attempt.submitted_at.is_not(None))
            .order_by(Attempt.submitted_at.desc())
            .limit(TREND_POINTS)
        )
    ).all()
    trend = [
        TrendPoint(
            attempt_id=str(a.id),
            title=a.title,
            type=a.type,
            percent=_percent(a.correct or 0, a.total),
            submitted_at=(a.submitted_at.isoformat() if a.submitted_at else ""),
        )
        for a in reversed(recent)
    ]

    target = None
    if user.target_exam_id is not None:
        exam = await session.get(Exam, user.target_exam_id)
        if exam is not None:
            days_left = (user.target_exam_date - today).days if user.target_exam_date else None
            target = TargetExam(
                name=exam.name,
                slug=exam.slug,
                date=user.target_exam_date,
                days_left=None if days_left is None else max(days_left, 0),
            )

    return ProgressOut(
        today=today,
        answered=answered,
        correct=correct,
        accuracy=_percent(correct, answered) if answered else None,
        answered_today=per_day.get(today, (0, 0))[0],
        daily_goal=user.daily_goal,
        streak_days=current_streak,
        best_streak=best_streak,
        answered_this_week=sum(d.answered for d in week),
        answered_last_week=last_week,
        mocks_completed=mocks_completed,
        target=target,
        week=week,
        subjects=subjects,
        weak_topics=weak_topics,
        trend=trend,
    )
