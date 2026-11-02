import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.attempts.models import MockTest
from app.modules.users.models import AuditLog
from tests.helpers import World, seed_world, signup
from tests.test_admin import API, create, move, set_role, staff


def exam_body(**over: object) -> dict[str, object]:
    data: dict[str, object] = {
        "slug": "mdcat",
        "name": "MDCAT",
        "full_name": "Medical and Dental College Admission Test",
        "category": "Medical",
        "description": "Medical entry test practice.",
        "access": "mixed",
        "status": "draft",
        "sort": 5,
    }
    data.update(over)
    return data


async def publish(client: httpx.AsyncClient, world: World, text: str, **over: object) -> str:
    """Create a question and publish it (the caller must be an admin)."""
    q = await create(client, world, text=text, options=[text + " A", text + " B"], **over)
    assert (await move(client, q["id"], "published")).status_code == 200
    return str(q["id"])


async def mock_with(
    client: httpx.AsyncClient, world: World, ids: list[str] | None = None, **over: object
) -> dict:  # type: ignore[type-arg]
    body = {"exam": "lat", "title": "Paper A", "duration_minutes": 30, **over}
    r = await client.post(f"{API}/mock-tests", json=body)
    assert r.status_code == 201, r.text
    mock = r.json()
    if ids is not None:
        done = await client.put(
            f"{API}/mock-tests/{mock['id']}/questions", json={"question_ids": ids}
        )
        assert done.status_code == 200, done.text
        mock = done.json()
    return mock  # type: ignore[no-any-return]


# ---- permissions ----


async def test_who_can_edit_structure_and_mock_tests(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db, role="editor")
    assert (await client.get(f"{API}/exams")).status_code == 200
    assert (await client.get(f"{API}/exams/lat/structure")).status_code == 200
    assert (await client.post(f"{API}/exams", json=exam_body())).status_code == 403
    sub = await client.post(f"{API}/exams/lat/subjects", json={"name": "Law"})
    assert sub.status_code == 403
    topic = await client.post(f"{API}/subjects/{world.english.id}/topics", json={"name": "X"})
    assert topic.status_code == 403
    assert (await client.get(f"{API}/mock-tests")).status_code == 403

    await set_role(db, "ana@example.com", "reviewer")
    assert (await client.post(f"{API}/exams", json=exam_body())).status_code == 403
    ok = await client.post(f"{API}/subjects/{world.english.id}/topics", json={"name": "Spelling"})
    assert ok.status_code == 201
    assert (await client.get(f"{API}/mock-tests")).status_code == 200


# ---- exams ----


async def test_exam_lifecycle(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await seed_world(db)
    await staff(client, db)

    created = await client.post(f"{API}/exams", json=exam_body())
    assert created.status_code == 201 and created.json()["subject_count"] == 0
    assert (await client.post(f"{API}/exams", json=exam_body())).json()["code"] == "slug_taken"
    assert (await client.post(f"{API}/exams", json=exam_body(slug="Bad Slug!"))).status_code == 422

    # Drafts are not visible to students until published.
    assert [e["slug"] for e in (await client.get("/api/v1/exams")).json()] == ["lat"]
    edited = await client.put(
        f"{API}/exams/mdcat", json=exam_body(status="published", name="MDCAT 2027")
    )
    assert edited.status_code == 200 and edited.json()["name"] == "MDCAT 2027"
    assert {e["slug"] for e in (await client.get("/api/v1/exams")).json()} == {"lat", "mdcat"}

    locked = await client.put(f"{API}/exams/mdcat", json=exam_body(slug="mdcat-2"))
    assert locked.status_code == 422 and locked.json()["code"] == "slug_locked"
    assert (await client.put(f"{API}/exams/nope", json=exam_body(slug="nope"))).status_code == 404
    assert {e["slug"] for e in (await client.get(f"{API}/exams")).json()} == {"lat", "mdcat"}


# ---- subjects and topics ----


async def test_subject_rules(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await staff(client, db)

    new = await client.post(f"{API}/exams/lat/subjects", json={"name": "Law", "sort": 9})
    assert new.status_code == 201 and new.json()["question_count"] == 0
    dup = await client.post(f"{API}/exams/lat/subjects", json={"name": "Law"})
    assert dup.status_code == 409 and dup.json()["code"] == "name_taken"

    sid = new.json()["id"]
    assert (
        await client.put(f"{API}/subjects/{sid}", json={"name": "Legal Studies"})
    ).status_code == 204
    clash = await client.put(f"{API}/subjects/{sid}", json={"name": "English"})
    assert clash.status_code == 409

    # Subjects that hold questions keep their type and cannot be deleted.
    kind = await client.put(
        f"{API}/subjects/{world.english.id}", json={"name": "English", "kind": "written"}
    )
    assert kind.status_code == 409 and kind.json()["code"] == "in_use"
    assert (await client.delete(f"{API}/subjects/{world.english.id}")).status_code == 409
    assert (await client.delete(f"{API}/subjects/{sid}")).status_code == 204
    assert (await client.delete(f"{API}/subjects/{sid}")).status_code == 404


async def test_topics_and_structure_counts(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await staff(client, db)

    added = await client.post(f"{API}/subjects/{world.english.id}/topics", json={"name": "Idioms"})
    assert added.status_code == 201
    dup = await client.post(f"{API}/subjects/{world.english.id}/topics", json={"name": "Idioms"})
    assert dup.status_code == 409

    structure = (await client.get(f"{API}/exams/lat/structure")).json()
    assert structure["exam"]["question_count"] == 6 and structure["exam"]["mock_count"] == 1
    english = next(s for s in structure["subjects"] if s["name"] == "English")
    topics = {t["name"]: t["question_count"] for t in english["topics"]}
    assert topics == {"Grammar": 3, "Idioms": 0}  # three of the six questions are Grammar
    grammar = next(t for t in english["topics"] if t["name"] == "Grammar")

    assert (
        await client.put(f"{API}/topics/{added.json()['id']}", json={"name": "Phrases"})
    ).status_code == 204
    assert (
        await client.put(f"{API}/topics/{added.json()['id']}", json={"name": "Grammar"})
    ).status_code == 409
    used = await client.delete(f"{API}/topics/{grammar['id']}")
    assert used.status_code == 409 and used.json()["code"] == "in_use"
    assert (await client.delete(f"{API}/topics/{added.json()['id']}")).status_code == 204


# ---- mock tests ----


async def test_building_and_publishing_a_mock_test(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db)
    await signup(other_client, db, email="bilal@example.com")
    q = [str(x.id) for x in world.questions]

    mock = await mock_with(client, world, access="premium", marks_per_question=2)
    assert mock["status"] == "draft" and mock["question_count"] == 0
    assert mock["duration_minutes"] == 30 and mock["access"] == "premium"
    # Not visible to students while a draft.
    assert [m["title"] for m in (await other_client.get("/api/v1/mock-tests")).json()] == [
        "LAT Full Mock Test 10"
    ]

    empty = await client.put(f"{API}/mock-tests/{mock['id']}/status", json={"status": "published"})
    assert empty.status_code == 409 and empty.json()["code"] == "empty_mock_test"

    order = [q[3], q[0], q[5]]
    built = await client.put(
        f"{API}/mock-tests/{mock['id']}/questions", json={"question_ids": order}
    )
    assert [r["question_id"] for r in built.json()["questions"]] == order
    assert [r["position"] for r in built.json()["questions"]] == [1, 2, 3]

    reordered = await client.put(
        f"{API}/mock-tests/{mock['id']}/questions", json={"question_ids": [q[5], q[3]]}
    )
    assert [r["question_id"] for r in reordered.json()["questions"]] == [q[5], q[3]]

    live = await client.put(f"{API}/mock-tests/{mock['id']}/status", json={"status": "published"})
    assert live.json()["status"] == "published"
    listing = {m["title"]: m for m in (await other_client.get("/api/v1/mock-tests")).json()}
    assert listing["Paper A"]["total_questions"] == 2 and listing["Paper A"]["access"] == "premium"

    # A published paper cannot be emptied.
    blocked = await client.put(
        f"{API}/mock-tests/{mock['id']}/questions", json={"question_ids": []}
    )
    assert blocked.status_code == 409


async def test_only_published_questions_of_the_same_exam_can_be_added(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db)
    draft = (await create(client, world))["id"]  # a draft: not usable
    await client.post(f"{API}/exams", json=exam_body(status="published"))
    subject = (await client.post(f"{API}/exams/mdcat/subjects", json={"name": "Biology"})).json()
    other = await client.post(
        f"{API}/questions",
        json={
            "exam": "mdcat",
            "subject_id": subject["id"],
            "text": "Which organelle makes energy?",
            "options": ["Nucleus", "Mitochondrion"],
            "correct_index": 1,
        },
    )
    await move(client, other.json()["id"], "published")

    mock = await mock_with(client, world)
    for bad in (draft, other.json()["id"], "00000000-0000-0000-0000-000000000000"):
        r = await client.put(
            f"{API}/mock-tests/{mock['id']}/questions", json={"question_ids": [bad]}
        )
        assert r.status_code == 422 and r.json()["code"] == "invalid_questions", bad
    twice = str(world.questions[0].id)
    dup = await client.put(
        f"{API}/mock-tests/{mock['id']}/questions", json={"question_ids": [twice, twice]}
    )
    assert dup.status_code == 422
    too_many = await client.put(
        f"{API}/mock-tests/{mock['id']}/questions",
        json={"question_ids": [str(world.questions[0].id)] * 301},
    )
    assert too_many.status_code == 422


async def test_publishing_checks_that_every_question_is_still_published(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db)
    ids = [str(q.id) for q in world.questions[:2]]
    mock = await mock_with(client, world, ids)

    await move(client, ids[0], "archived")
    r = await client.put(f"{API}/mock-tests/{mock['id']}/status", json={"status": "published"})
    assert r.status_code == 409 and r.json()["code"] == "unpublished_questions"
    detail = (await client.get(f"{API}/mock-tests/{mock['id']}")).json()
    assert [row["status"] for row in detail["questions"]] == ["archived", "published"]


async def test_edit_details_and_delete_rules(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db)
    await signup(other_client, db, email="bilal@example.com")

    mock = await mock_with(client, world, [str(world.questions[0].id)])
    edited = await client.put(
        f"{API}/mock-tests/{mock['id']}",
        json={"exam": "lat", "title": "Paper B", "duration_minutes": 45, "kind": "sectional"},
    )
    assert edited.json()["title"] == "Paper B" and edited.json()["duration_minutes"] == 45
    moved = await client.put(
        f"{API}/mock-tests/{mock['id']}",
        json={"exam": "other", "title": "x", "duration_minutes": 5},
    )
    assert moved.status_code == 422 and moved.json()["code"] == "exam_locked"
    bad = await client.put(
        f"{API}/mock-tests/{mock['id']}",
        json={"exam": "lat", "title": "x", "duration_minutes": 0},
    )
    assert bad.status_code == 422

    assert (await client.delete(f"{API}/mock-tests/{mock['id']}")).status_code == 204
    assert (await client.get(f"{API}/mock-tests/{mock['id']}")).status_code == 404

    # A paper students have taken can only be archived.
    seeded = await db.scalar(select(MockTest.id).where(MockTest.title == "LAT Full Mock Test 10"))
    started = await other_client.post(f"/api/v1/mock-tests/{seeded}/attempts")
    assert started.status_code == 200
    kept = await client.delete(f"{API}/mock-tests/{seeded}")
    assert kept.status_code == 409 and kept.json()["code"] == "has_attempts"
    listing = {m["title"]: m for m in (await client.get(f"{API}/mock-tests")).json()}
    assert listing["LAT Full Mock Test 10"]["attempts"] == 1
    archived = await client.put(f"{API}/mock-tests/{seeded}/status", json={"status": "archived"})
    assert archived.json()["status"] == "archived"


async def test_a_built_mock_test_runs_in_the_order_set(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db)
    await signup(other_client, db, email="bilal@example.com")
    ids = [str(world.questions[i].id) for i in (4, 1, 2)]
    mock = await mock_with(client, world, ids)
    await client.put(f"{API}/mock-tests/{mock['id']}/status", json={"status": "published"})

    attempt = (await other_client.post(f"/api/v1/mock-tests/{mock['id']}/attempts")).json()
    assert [q["id"] for q in attempt["questions"]] == ids
    assert attempt["total"] == 3
    started = attempt["deadline_at"] > attempt["started_at"]
    assert started


async def test_structure_and_mock_edits_are_audited(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db)
    await client.post(f"{API}/exams", json=exam_body())
    await client.post(f"{API}/exams/lat/subjects", json={"name": "Law"})
    mock = await mock_with(client, world, [str(world.questions[0].id)])
    await client.put(f"{API}/mock-tests/{mock['id']}/status", json={"status": "published"})

    actions = set(await db.scalars(select(AuditLog.action)))
    assert {
        "exam.create",
        "subject.create",
        "mock.create",
        "mock.questions",
        "mock.published",
    } <= actions
