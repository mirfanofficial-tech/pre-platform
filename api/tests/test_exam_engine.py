import uuid
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.attempts.models import Attempt, MockTest
from tests.helpers import World, correct_option, seed_world, signup, wrong_option

# ---- helpers ----------------------------------------------------------------


async def start_mock(client: httpx.AsyncClient, world: World) -> dict:  # type: ignore[type-arg]
    r = await client.post(f"/api/v1/mock-tests/{world.mock_id}/attempts")
    assert r.status_code == 200, r.text
    return r.json()  # type: ignore[no-any-return]


def answer(question_id: uuid.UUID, option_id: uuid.UUID, **extra: object) -> dict[str, object]:
    return {"question_id": str(question_id), "selected_option_id": str(option_id), **extra}


async def put_answers(
    client: httpx.AsyncClient, attempt_id: str, *items: dict[str, object]
) -> httpx.Response:
    return await client.put(f"/api/v1/attempts/{attempt_id}/answers", json={"answers": list(items)})


# ---- starting a mock test ---------------------------------------------------


async def test_listing_and_starting_need_a_login(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    assert (await client.get("/api/v1/mock-tests")).status_code == 401
    assert (await client.post(f"/api/v1/mock-tests/{world.mock_id}/attempts")).status_code == 401


async def test_unverified_email_cannot_start_a_mock(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db, verified=False)
    r = await client.post(f"/api/v1/mock-tests/{world.mock_id}/attempts")
    assert r.status_code == 403 and r.json()["code"] == "email_not_verified"


async def test_mock_test_list_shows_counts_and_last_attempt(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    listing = (await client.get("/api/v1/mock-tests", params={"exam": "lat"})).json()
    assert len(listing) == 1
    assert listing[0]["total_questions"] == 6 and listing[0]["last_attempt"] is None

    await start_mock(client, world)
    again = (await client.get("/api/v1/mock-tests")).json()
    assert again[0]["last_attempt"]["status"] == "in_progress"
    assert (await client.get("/api/v1/mock-tests", params={"exam": "nope"})).json() == []


async def test_started_attempt_has_a_deadline_and_no_answers(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db, duration_sec=900)
    await signup(client, db)
    r = await client.post(f"/api/v1/mock-tests/{world.mock_id}/attempts")
    body = r.json()

    assert body["type"] == "mock" and body["mode"] == "test" and body["status"] == "in_progress"
    assert body["total"] == 6 and len(body["questions"]) == 6
    started = datetime.fromisoformat(body["started_at"])
    deadline = datetime.fromisoformat(body["deadline_at"])
    assert deadline - started == timedelta(seconds=900)
    assert abs(datetime.fromisoformat(body["server_now"]) - started) < timedelta(seconds=5)

    assert [q["position"] for q in body["questions"]] == [1, 2, 3, 4, 5, 6]
    assert body["questions"][0]["section"] == "English"
    # Nothing in the payload may reveal the answer.
    assert "is_correct" not in r.text and "explanation" not in r.text and "Because" not in r.text
    assert all(set(o) == {"id", "position", "text"} for o in body["questions"][0]["options"])


async def test_starting_again_resumes_the_same_attempt(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    first = await start_mock(client, world)
    second = await start_mock(client, world)
    assert first["id"] == second["id"]
    assert len((await db.scalars(select(Attempt))).all()) == 1


async def test_attempts_are_private_to_their_owner(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    await signup(other_client, db, email="bilal@example.com")
    attempt = await start_mock(client, world)

    for method, path in [
        ("GET", f"/api/v1/attempts/{attempt['id']}"),
        ("POST", f"/api/v1/attempts/{attempt['id']}/submit"),
        ("GET", f"/api/v1/attempts/{attempt['id']}/result"),
        ("GET", f"/api/v1/attempts/{attempt['id']}/review"),
    ]:
        r = await other_client.request(method, path)
        assert r.status_code == 404, (method, path)
    q = world.questions[0]
    r = await put_answers(other_client, attempt["id"], answer(q.id, correct_option(q).id))
    assert r.status_code == 404


# ---- saving answers ---------------------------------------------------------


async def test_answers_are_saved_and_restored(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    q0, q1 = world.questions[0], world.questions[1]

    r = await put_answers(
        client,
        attempt["id"],
        answer(q0.id, correct_option(q0).id),
        {"question_id": str(q1.id), "marked_for_review": True},
    )
    assert r.status_code == 200 and r.json()["saved"] == 2

    state = (await client.get(f"/api/v1/attempts/{attempt['id']}")).json()
    saved = {a["question_id"]: a for a in state["answers"]}
    assert saved[str(q0.id)]["selected_option_id"] == str(correct_option(q0).id)
    assert saved[str(q1.id)]["marked_for_review"] is True
    assert saved[str(q1.id)]["selected_option_id"] is None
    assert "is_correct" not in str(state)

    # change an answer, keep its flag; then clear it
    await put_answers(client, attempt["id"], answer(q0.id, wrong_option(q0).id))
    await put_answers(client, attempt["id"], {"question_id": str(q0.id), "clear": True})
    state = (await client.get(f"/api/v1/attempts/{attempt['id']}")).json()
    assert {a["question_id"]: a for a in state["answers"]}[str(q0.id)]["selected_option_id"] is None


async def test_invalid_answers_are_rejected(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    q0, q1 = world.questions[0], world.questions[1]

    stranger = await put_answers(client, attempt["id"], answer(uuid.uuid4(), uuid.uuid4()))
    assert stranger.status_code == 422 and stranger.json()["code"] == "unknown_question"

    crossed = await put_answers(client, attempt["id"], answer(q0.id, correct_option(q1).id))
    assert crossed.status_code == 422 and crossed.json()["code"] == "unknown_option"

    empty = await client.put(f"/api/v1/attempts/{attempt['id']}/answers", json={"answers": []})
    assert empty.status_code == 422


# ---- the timer --------------------------------------------------------------


async def test_answers_after_the_deadline_close_and_grade_the_attempt(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    q0, q1 = world.questions[0], world.questions[1]
    await put_answers(client, attempt["id"], answer(q0.id, correct_option(q0).id))

    await db.execute(update(Attempt).values(deadline_at=datetime.now(UTC) - timedelta(seconds=60)))
    await db.commit()

    late = await put_answers(client, attempt["id"], answer(q1.id, correct_option(q1).id))
    assert late.status_code == 409 and late.json()["code"] == "attempt_closed"

    result = (await client.get(f"/api/v1/attempts/{attempt['id']}/result")).json()
    assert result["status"] == "expired"
    assert result["correct"] == 1 and result["skipped"] == 5  # the late answer did not count


async def test_a_few_seconds_of_grace_are_allowed(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    await db.execute(update(Attempt).values(deadline_at=datetime.now(UTC) - timedelta(seconds=4)))
    await db.commit()
    q = world.questions[0]
    r = await put_answers(client, attempt["id"], answer(q.id, correct_option(q).id))
    assert r.status_code == 200


async def test_an_expired_attempt_is_graded_when_it_is_next_opened(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    q = world.questions[0]
    await put_answers(client, attempt["id"], answer(q.id, correct_option(q).id))
    await db.execute(update(Attempt).values(deadline_at=datetime.now(UTC) - timedelta(minutes=5)))
    await db.commit()

    state = (await client.get(f"/api/v1/attempts/{attempt['id']}")).json()
    assert state["status"] == "expired" and state["questions"] == []  # nothing left to answer

    # starting the mock again creates a fresh attempt rather than resurrecting the old one
    fresh = await start_mock(client, world)
    assert fresh["id"] != attempt["id"] and fresh["status"] == "in_progress"


# ---- submitting and results -------------------------------------------------


async def test_submit_grades_the_attempt(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    qs = world.questions
    await put_answers(
        client,
        attempt["id"],
        answer(qs[0].id, correct_option(qs[0]).id),  # English, right
        answer(qs[1].id, correct_option(qs[1]).id),  # Maths, right
        answer(qs[2].id, wrong_option(qs[2]).id),  # English, wrong
    )  # qs[3..5] unanswered

    r = await client.post(f"/api/v1/attempts/{attempt['id']}/submit")
    assert r.status_code == 200
    result = r.json()
    assert result["status"] == "submitted"
    assert (result["correct"], result["incorrect"], result["skipped"]) == (2, 1, 3)
    assert result["score"] == 2 and result["max_score"] == 6 and result["percent"] == 33
    assert result["time_spent_sec"] >= 0

    sections = {s["name"]: (s["correct"], s["total"]) for s in result["sections"]}
    assert sections == {"English": (1, 3), "Mathematics": (1, 3)}


async def test_submit_is_idempotent_and_final(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    q = world.questions[0]
    await put_answers(client, attempt["id"], answer(q.id, correct_option(q).id))

    first = (await client.post(f"/api/v1/attempts/{attempt['id']}/submit")).json()
    second = (await client.post(f"/api/v1/attempts/{attempt['id']}/submit")).json()
    assert first == second

    late = await put_answers(client, attempt["id"], answer(q.id, wrong_option(q).id))
    assert late.status_code == 409 and late.json()["code"] == "attempt_closed"
    assert (await client.get(f"/api/v1/attempts/{attempt['id']}/result")).json() == first


async def test_results_and_review_are_locked_until_submission(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    for path in ("result", "review"):
        r = await client.get(f"/api/v1/attempts/{attempt['id']}/{path}")
        assert r.status_code == 409 and r.json()["code"] == "attempt_in_progress"


async def test_review_reveals_answers_only_after_submission(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    q0, q1 = world.questions[0], world.questions[1]
    await put_answers(
        client,
        attempt["id"],
        answer(q0.id, correct_option(q0).id),
        answer(q1.id, wrong_option(q1).id, marked_for_review=True),
    )
    await client.post(f"/api/v1/attempts/{attempt['id']}/submit")

    review = (await client.get(f"/api/v1/attempts/{attempt['id']}/review")).json()
    assert [item["position"] for item in review] == [1, 2, 3, 4, 5, 6]
    assert review[0]["is_correct"] is True and review[0]["explanation"] == "Because 0."
    assert review[0]["correct_option_id"] == str(correct_option(q0).id)
    assert review[1]["is_correct"] is False and review[1]["marked_for_review"] is True
    assert review[2]["is_correct"] is None and review[2]["selected_option_id"] is None
    assert sum(o["is_correct"] for o in review[0]["options"]) == 1

    # a finished attempt no longer serves questions
    state = (await client.get(f"/api/v1/attempts/{attempt['id']}")).json()
    assert state["questions"] == []


async def test_my_attempts_lists_history(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    q = world.questions[0]
    await put_answers(client, attempt["id"], answer(q.id, correct_option(q).id))
    await client.post(f"/api/v1/attempts/{attempt['id']}/submit")
    await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": 2})

    everything = (await client.get("/api/v1/me/attempts")).json()
    assert len(everything) == 2
    mocks = (await client.get("/api/v1/me/attempts", params={"type": "mock"})).json()
    assert [a["title"] for a in mocks] == ["LAT Full Mock Test 10"]
    assert mocks[0]["percent"] == 17 and mocks[0]["score"] == 1


async def test_negative_and_empty_edge_cases(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await signup(client, db)
    await db.execute(text("DELETE FROM mock_test_questions"))
    await db.commit()
    r = await client.post(f"/api/v1/mock-tests/{world.mock_id}/attempts")
    assert r.status_code == 409 and r.json()["code"] == "empty_mock_test"

    await db.execute(update(MockTest).values(status="draft"))
    await db.commit()
    assert (await client.post(f"/api/v1/mock-tests/{world.mock_id}/attempts")).status_code == 404
    assert (await client.post(f"/api/v1/mock-tests/{uuid.uuid4()}/attempts")).status_code == 404


# ---- practice mode ----------------------------------------------------------


async def test_practice_set_picks_published_questions(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db, verified=False)  # practice does not need a verified email
    r = await client.post(
        "/api/v1/practice/sets",
        json={"exam": "lat", "subject_id": str(world.maths.id), "count": 10},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["type"] == "practice" and body["deadline_at"] is None
    assert body["total"] == 3 and {q["section"] for q in body["questions"]} == {"Mathematics"}
    assert "is_correct" not in r.text


async def test_practice_set_rejects_empty_or_unknown_selections(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    await db.execute(text("UPDATE questions SET status = 'draft'"))
    await db.commit()
    empty = await client.post("/api/v1/practice/sets", json={"exam": "lat"})
    assert empty.status_code == 422 and empty.json()["code"] == "no_questions"
    assert (await client.post("/api/v1/practice/sets", json={"exam": "zzz"})).status_code == 404
    bad = await client.post(
        "/api/v1/practice/sets", json={"exam": "lat", "subject_id": str(uuid.uuid4())}
    )
    assert bad.status_code == 422 and bad.json()["code"] == "unknown_subject"
    assert world.exam.slug == "lat"


async def test_practice_check_gives_instant_feedback_once(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    created = (await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": 6})).json()
    by_id = {str(q.id): q for q in world.questions}
    first = created["questions"][0]
    q = by_id[first["id"]]
    base = f"/api/v1/attempts/{created['id']}/questions/{first['id']}/check"

    wrong = await client.post(base, json={"option_id": str(wrong_option(q).id)})
    assert wrong.status_code == 200
    assert wrong.json()["correct"] is False
    assert wrong.json()["correct_option_id"] == str(correct_option(q).id)
    assert wrong.json()["explanation"].startswith("Because")

    again = await client.post(base, json={"option_id": str(correct_option(q).id)})
    assert again.status_code == 409 and again.json()["code"] == "already_answered"

    second = by_id[created["questions"][1]["id"]]
    ok = await client.post(
        f"/api/v1/attempts/{created['id']}/questions/{second.id}/check",
        json={"option_id": str(correct_option(second).id)},
    )
    assert ok.json()["correct"] is True

    result = (await client.post(f"/api/v1/attempts/{created['id']}/submit")).json()
    assert (result["correct"], result["incorrect"], result["skipped"]) == (1, 1, 4)


async def test_practice_check_rejects_bad_input(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    created = (await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": 2})).json()
    q = next(x for x in world.questions if str(x.id) == created["questions"][0]["id"])
    other = next(x for x in world.questions if x.id != q.id)
    base = f"/api/v1/attempts/{created['id']}/questions"

    crossed = await client.post(
        f"{base}/{q.id}/check", json={"option_id": str(correct_option(other).id)}
    )
    assert crossed.status_code == 422 and crossed.json()["code"] == "unknown_option"
    alien = await client.post(
        f"{base}/{uuid.uuid4()}/check", json={"option_id": str(correct_option(q).id)}
    )
    assert alien.status_code == 422 and alien.json()["code"] == "unknown_question"


async def test_modes_do_not_mix(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await signup(client, db)

    # practice mode: bulk saving of selections is refused (use the check endpoint)
    practice = (await client.post("/api/v1/practice/sets", json={"exam": "lat"})).json()
    q = next(x for x in world.questions if str(x.id) == practice["questions"][0]["id"])
    r = await put_answers(client, practice["id"], answer(q.id, correct_option(q).id))
    assert r.status_code == 422 and r.json()["code"] == "use_check_endpoint"
    flag = await put_answers(
        client, practice["id"], {"question_id": str(q.id), "marked_for_review": True}
    )
    assert flag.status_code == 200  # flags are fine

    # test mode: no instant feedback
    timed = (
        await client.post("/api/v1/practice/sets", json={"exam": "lat", "mode": "test"})
    ).json()
    q2 = next(x for x in world.questions if str(x.id) == timed["questions"][0]["id"])
    peek = await client.post(
        f"/api/v1/attempts/{timed['id']}/questions/{q2.id}/check",
        json={"option_id": str(correct_option(q2).id)},
    )
    assert peek.status_code == 409 and peek.json()["code"] == "feedback_disabled"
    assert (
        await put_answers(client, timed["id"], answer(q2.id, correct_option(q2).id))
    ).status_code == 200


# ---- bookmarks and reports --------------------------------------------------


async def test_bookmarks(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await signup(client, db)
    q = world.questions[0]

    assert (await client.put(f"/api/v1/me/bookmarks/{q.id}")).status_code == 204
    assert (await client.put(f"/api/v1/me/bookmarks/{q.id}")).status_code == 204  # idempotent
    listing = await client.get("/api/v1/me/bookmarks")
    assert len(listing.json()) == 1 and listing.json()[0]["section"] == "English"
    assert "is_correct" not in listing.text and "Because" not in listing.text

    assert (await client.delete(f"/api/v1/me/bookmarks/{q.id}")).status_code == 204
    assert (await client.delete(f"/api/v1/me/bookmarks/{q.id}")).status_code == 204
    assert (await client.get("/api/v1/me/bookmarks")).json() == []

    assert (await client.put(f"/api/v1/me/bookmarks/{uuid.uuid4()}")).status_code == 404
    await db.execute(update(type(q)).where(type(q).id == q.id).values(status="draft"))
    await db.commit()
    assert (await client.put(f"/api/v1/me/bookmarks/{q.id}")).status_code == 404


async def test_bookmarks_are_per_user(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    await signup(other_client, db, email="bilal@example.com")
    await client.put(f"/api/v1/me/bookmarks/{world.questions[0].id}")
    assert (await other_client.get("/api/v1/me/bookmarks")).json() == []


async def test_reporting_a_question(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await signup(client, db)
    q = world.questions[0]

    r = await client.post(
        f"/api/v1/questions/{q.id}/report", json={"reason": "wrong_answer", "note": "B is wrong"}
    )
    assert r.status_code == 201 and r.json()["status"] == "open"
    await client.post(f"/api/v1/questions/{q.id}/report", json={"reason": "typo"})
    await db.refresh(q)
    assert q.reported_count == 2

    bad = await client.post(f"/api/v1/questions/{q.id}/report", json={"reason": "spam"})
    assert bad.status_code == 422
    assert (
        await client.post(f"/api/v1/questions/{uuid.uuid4()}/report", json={"reason": "typo"})
    ).status_code == 404


# ---- the database backs up the rules ---------------------------------------


async def test_only_one_open_attempt_per_mock_is_possible(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    import pytest
    from sqlalchemy.exc import IntegrityError

    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    existing = await db.get(Attempt, uuid.UUID(attempt["id"]))
    assert existing is not None
    db.add(
        Attempt(
            user_id=existing.user_id,
            type="mock",
            mode="test",
            title="dup",
            exam_id=existing.exam_id,
            mock_test_id=existing.mock_test_id,
            total=1,
        )
    )
    with pytest.raises(IntegrityError):
        await db.commit()
    await db.rollback()


async def test_every_in_progress_payload_hides_answers(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)
    attempt = await start_mock(client, world)
    practice = (await client.post("/api/v1/practice/sets", json={"exam": "lat"})).json()
    secret_words = ("is_correct", "correct_option", "explanation", "Because")
    for path in (f"/api/v1/attempts/{attempt['id']}", f"/api/v1/attempts/{practice['id']}"):
        body = (await client.get(path)).text
        assert not any(w in body for w in secret_words), path


async def test_practice_feedback_survives_a_reload_but_test_mode_never_leaks(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await signup(client, db)

    practice = (await client.post("/api/v1/practice/sets", json={"exam": "lat", "count": 3})).json()
    q = next(x for x in world.questions if str(x.id) == practice["questions"][0]["id"])
    await client.post(
        f"/api/v1/attempts/{practice['id']}/questions/{q.id}/check",
        json={"option_id": str(wrong_option(q).id)},
    )
    state = (await client.get(f"/api/v1/attempts/{practice['id']}")).json()
    feedback = state["answers"][0]["feedback"]
    assert feedback["correct"] is False
    assert feedback["correct_option_id"] == str(correct_option(q).id)
    assert feedback["explanation"].startswith("Because")

    timed = (
        await client.post("/api/v1/practice/sets", json={"exam": "lat", "mode": "test"})
    ).json()
    t = next(x for x in world.questions if str(x.id) == timed["questions"][0]["id"])
    await put_answers(client, timed["id"], answer(t.id, correct_option(t).id))
    body = (await client.get(f"/api/v1/attempts/{timed['id']}")).json()
    assert body["answers"][0]["feedback"] is None
    assert "explanation" not in str(body) and "Because" not in str(body)
