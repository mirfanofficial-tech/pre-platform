from datetime import date, timedelta

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.progress.service import streaks
from tests.helpers import correct_option, seed_world, signup, wrong_option

TODAY = date(2026, 10, 30)


def days_ago(*offsets: int) -> list[date]:
    return [TODAY - timedelta(days=n) for n in offsets]


# ---- streak rules -----------------------------------------------------------


def test_no_activity_means_no_streak() -> None:
    assert streaks([], TODAY) == (0, 0)


def test_streak_counts_consecutive_days_ending_today() -> None:
    assert streaks(days_ago(0, 1, 2), TODAY) == (3, 3)


def test_streak_survives_until_the_end_of_tomorrow() -> None:
    # Studied up to yesterday, nothing yet today: the run is still alive.
    assert streaks(days_ago(1, 2, 3), TODAY) == (3, 3)


def test_streak_breaks_after_a_missed_day() -> None:
    assert streaks(days_ago(2, 3, 4), TODAY) == (0, 3)


def test_best_streak_can_be_older_than_the_current_one() -> None:
    assert streaks(days_ago(0, 1, 5, 6, 7, 8), TODAY) == (2, 4)


def test_duplicate_days_are_ignored() -> None:
    assert streaks(days_ago(0, 0, 1), TODAY) == (2, 2)


# ---- endpoint -----------------------------------------------------------------


async def test_progress_needs_a_login(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/me/progress")).status_code == 401


async def test_new_student_has_empty_progress(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await seed_world(db)
    await signup(client, db)
    body = (await client.get("/api/v1/me/progress")).json()

    assert body["answered"] == 0 and body["accuracy"] is None
    assert body["streak_days"] == 0 and body["mocks_completed"] == 0
    assert body["daily_goal"] == 50 and body["target"] is None
    assert len(body["week"]) == 7 and all(d["answered"] == 0 for d in body["week"])
    assert body["week"][-1]["day"] == body["today"]
    assert body["subjects"] == [] and body["weak_topics"] == [] and body["trend"] == []


async def test_progress_reflects_a_submitted_mock(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = (await client.post(f"/api/v1/mock-tests/{world.mock_id}/attempts")).json()

    # q0, q2, q4 are English/Grammar; q1 is Mathematics/Algebra.
    q = world.questions
    picks = [
        (q[0], correct_option(q[0])),
        (q[2], correct_option(q[2])),
        (q[4], wrong_option(q[4])),
        (q[1], correct_option(q[1])),
    ]
    saved = await client.put(
        f"/api/v1/attempts/{attempt['id']}/answers",
        json={
            "answers": [
                {"question_id": str(question.id), "selected_option_id": str(option.id)}
                for question, option in picks
            ]
        },
    )
    assert saved.status_code == 200

    # Test-mode answers are not graded yet, so they do not count.
    assert (await client.get("/api/v1/me/progress")).json()["answered"] == 0

    assert (await client.post(f"/api/v1/attempts/{attempt['id']}/submit")).status_code == 200
    body = (await client.get("/api/v1/me/progress")).json()

    assert body["answered"] == 4 and body["correct"] == 3 and body["accuracy"] == 75
    assert body["answered_today"] == 4 and body["answered_this_week"] == 4
    assert body["answered_last_week"] == 0
    assert body["streak_days"] == 1 and body["best_streak"] == 1
    assert body["mocks_completed"] == 1
    assert body["week"][-1]["answered"] == 4

    assert body["subjects"] == [
        {"name": "English", "answered": 3, "correct": 2, "percent": 67},
        {"name": "Mathematics", "answered": 1, "correct": 1, "percent": 100},
    ]
    # Algebra has only one answer, below the minimum for a weak-topic call.
    assert [(t["topic"], t["percent"]) for t in body["weak_topics"]] == [("Grammar", 67)]
    assert len(body["trend"]) == 1 and body["trend"][0]["percent"] == 50  # 3 of 6 questions


async def test_practice_answers_count_straight_away(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    state = (await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": 2})).json()
    question = next(x for x in world.questions if str(x.id) == state["questions"][0]["id"])
    checked = await client.post(
        f"/api/v1/attempts/{state['id']}/questions/{question.id}/check",
        json={"option_id": str(correct_option(question).id)},
    )
    assert checked.status_code == 200

    body = (await client.get("/api/v1/me/progress")).json()
    assert body["answered"] == 1 and body["correct"] == 1 and body["accuracy"] == 100
    assert body["mocks_completed"] == 0


async def test_progress_is_private_to_each_student(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    await signup(other_client, db, email="bilal@example.com")
    state = (await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": 1})).json()
    question = next(x for x in world.questions if str(x.id) == state["questions"][0]["id"])
    await client.post(
        f"/api/v1/attempts/{state['id']}/questions/{question.id}/check",
        json={"option_id": str(correct_option(question).id)},
    )

    assert (await client.get("/api/v1/me/progress")).json()["answered"] == 1
    assert (await other_client.get("/api/v1/me/progress")).json()["answered"] == 0
