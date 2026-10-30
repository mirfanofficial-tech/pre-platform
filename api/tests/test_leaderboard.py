from datetime import timedelta

import httpx
import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.attempts.models import AttemptAnswer
from app.modules.progress import leaderboard
from app.modules.progress.leaderboard import public_name
from tests.helpers import World, correct_option, seed_world, signup, wrong_option


def test_public_name_shows_first_name_and_last_initial() -> None:
    assert public_name("Ana Khan") == "Ana K."
    assert public_name("Muhammad Bilal Ahmed") == "Muhammad A."
    assert public_name("Sana") == "Sana"
    assert public_name("  ") == "Student"


async def answer(client: httpx.AsyncClient, world: World, right: int, wrong: int = 0) -> None:
    """Answer `right` + `wrong` practice questions."""
    state = (
        await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": right + wrong})
    ).json()
    by_id = {str(q.id): q for q in world.questions}
    for i, item in enumerate(state["questions"]):
        q = by_id[item["id"]]
        option = correct_option(q) if i < right else wrong_option(q)
        r = await client.post(
            f"/api/v1/attempts/{state['id']}/questions/{q.id}/check",
            json={"option_id": str(option.id)},
        )
        assert r.status_code == 200


async def opt_in(client: httpx.AsyncClient, value: bool = True) -> None:
    r = await client.patch("/api/v1/me", json={"leaderboard_opt_in": value})
    assert r.status_code == 200 and r.json()["leaderboard_opt_in"] is value


async def test_needs_a_login(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/leaderboard")).status_code == 401


async def test_students_are_hidden_until_they_opt_in(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    await signup(other_client, db, email="bilal@example.com")
    assert (await client.get("/api/v1/me")).json()["leaderboard_opt_in"] is False
    await answer(client, world, right=3)

    body = (await other_client.get("/api/v1/leaderboard")).json()
    assert body["entries"] == [] and body["opted_in"] is False

    await opt_in(client)
    body = (await other_client.get("/api/v1/leaderboard")).json()
    assert [e["name"] for e in body["entries"]] == ["Ana K."]
    assert body["me"] is None

    await opt_in(client, False)
    assert (await other_client.get("/api/v1/leaderboard")).json()["entries"] == []


async def test_ranks_by_correct_answers_then_accuracy(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    await signup(other_client, db, email="bilal@example.com")
    await answer(client, world, right=3)  # 3 correct, 100%
    await answer(other_client, world, right=3, wrong=2)  # 3 correct, 60%
    await opt_in(client)
    await opt_in(other_client)

    body = (await client.get("/api/v1/leaderboard")).json()
    assert [(e["rank"], e["correct"], e["percent"], e["is_me"]) for e in body["entries"]] == [
        (1, 3, 100, True),
        (2, 3, 60, False),
    ]
    assert body["me"]["rank"] == 1 and body["opted_in"] is True


async def test_responses_expose_no_personal_details(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    await answer(client, world, right=1)
    await opt_in(client)
    text = (await client.get("/api/v1/leaderboard")).text
    assert "example.com" not in text and "Khan" not in text and "user_id" not in text


async def test_week_only_counts_recent_answers(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await signup(client, db)
    await answer(client, world, right=2)
    await opt_in(client)
    await db.execute(
        update(AttemptAnswer).values(answered_at=AttemptAnswer.answered_at - timedelta(days=10))
    )
    await db.commit()

    assert (await client.get("/api/v1/leaderboard", params={"period": "week"})).json()[
        "entries"
    ] == []
    allt = (await client.get("/api/v1/leaderboard", params={"period": "all"})).json()
    assert [e["correct"] for e in allt["entries"]] == [2]
    assert (await client.get("/api/v1/leaderboard", params={"period": "year"})).status_code == 422


async def test_you_still_see_your_rank_when_outside_the_top(
    client: httpx.AsyncClient,
    other_client: httpx.AsyncClient,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(leaderboard, "TOP", 1)
    world = await seed_world(db)
    await signup(client, db)
    await signup(other_client, db, email="bilal@example.com")
    await answer(client, world, right=1)
    await answer(other_client, world, right=4)
    await opt_in(client)
    await opt_in(other_client)

    body = (await client.get("/api/v1/leaderboard")).json()
    assert len(body["entries"]) == 1 and body["entries"][0]["is_me"] is False
    assert body["me"]["rank"] == 2 and body["me"]["is_me"] is True
