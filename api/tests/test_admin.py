import httpx
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.models import Payment, Subscription
from app.modules.catalog.models import Question
from app.modules.users.models import AuditLog, User
from app.scripts.seed import seed_plans
from tests.helpers import World, seed_world, signup

API = "/api/v1/admin"


async def set_role(db: AsyncSession, email: str, role: str) -> None:
    await db.execute(update(User).where(User.email == email).values(role=role))
    await db.commit()


async def staff(
    client: httpx.AsyncClient, db: AsyncSession, email: str = "ana@example.com", role: str = "admin"
) -> None:
    await signup(client, db, email=email)
    await set_role(db, email, role)


def body(world: World, **over: object) -> dict[str, object]:
    data: dict[str, object] = {
        "exam": "lat",
        "subject_id": str(world.english.id),
        "topic_name": "Tenses",
        "text": "Which sentence is grammatically correct?",
        "options": ["He go home", "He goes home", "He going home", "He gone home"],
        "correct_index": 1,
        "explanation": "Third person singular takes -s.",
        "difficulty": "easy",
    }
    data.update(over)
    return data


async def create(client: httpx.AsyncClient, world: World, **over: object) -> dict:  # type: ignore[type-arg]
    r = await client.post(f"{API}/questions", json=body(world, **over))
    assert r.status_code == 201, r.text
    return r.json()  # type: ignore[no-any-return]


async def move(client: httpx.AsyncClient, qid: str, to: str) -> httpx.Response:
    return await client.post(f"{API}/questions/{qid}/transition", json={"to": to})


# ---- who may do what ----


async def test_admin_endpoints_need_a_login(client: httpx.AsyncClient) -> None:
    for path in ("/stats", "/questions", "/students", "/payments", "/reports", "/audit"):
        assert (await client.get(API + path)).status_code == 401, path


async def test_students_are_refused_everywhere(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await seed_world(db)
    await signup(client, db)
    for path in ("/stats", "/questions", "/students", "/payments", "/reports", "/audit"):
        assert (await client.get(API + path)).status_code == 403, path
    assert (await client.post(f"{API}/questions/import?exam=lat", content="x")).status_code == 403


async def test_editors_cannot_see_students_money_or_audit(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_world(db)
    await staff(client, db, role="editor")
    assert (await client.get(f"{API}/questions")).status_code == 200
    assert (await client.get(f"{API}/stats")).status_code == 200
    for path in ("/students", "/payments", "/audit", "/reports"):
        assert (await client.get(API + path)).status_code == 403, path


# ---- creating and editing questions ----


async def test_create_question_makes_a_draft_with_a_topic_and_an_audit_row(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db, role="editor")
    q = await create(client, world)
    assert q["status"] == "draft" and q["topic"] == "Tenses" and q["created_by"] == "Ana Khan"
    assert [o["is_correct"] for o in q["options"]] == [False, True, False, False]
    # Drafts are invisible to students.
    published = await db.scalar(
        select(func.count()).select_from(Question).where(Question.status == "published")
    )
    assert published == 6
    audit = await db.scalar(select(AuditLog).where(AuditLog.action == "question.create"))
    assert audit is not None and audit.entity_id == q["id"]


async def test_question_validation(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await staff(client, db, role="editor")
    url = f"{API}/questions"
    assert (await client.post(url, json=body(world, correct_index=4))).status_code == 422
    assert (await client.post(url, json=body(world, options=["Yes", "yes"]))).status_code == 422
    assert (await client.post(url, json=body(world, options=["Only one"]))).status_code == 422
    assert (await client.post(url, json=body(world, text="  "))).status_code == 422
    other = await client.post(url, json=body(world, exam="nope"))
    assert other.status_code == 404
    bad_subject = await client.post(
        url, json=body(world, subject_id="00000000-0000-0000-0000-000000000000")
    )
    assert bad_subject.status_code == 422 and bad_subject.json()["code"] == "unknown_subject"


async def test_duplicates_are_refused(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await staff(client, db, role="editor")
    await create(client, world)
    again = await client.post(
        f"{API}/questions", json=body(world, text="  WHICH sentence is  grammatically correct? ")
    )
    assert again.status_code == 409 and again.json()["code"] == "duplicate_question"


async def test_editing_replaces_options_and_a_published_edit_bumps_the_version(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db, role="editor")
    q = await create(client, world)
    edited = await client.put(
        f"{API}/questions/{q['id']}",
        json=body(world, options=["A", "B", "C"], correct_index=2, text="New wording?"),
    )
    assert edited.status_code == 200
    assert [(o["position"], o["text"], o["is_correct"]) for o in edited.json()["options"]] == [
        (1, "A", False),
        (2, "B", False),
        (3, "C", True),
    ]
    assert edited.json()["version"] == 1

    await staff(other_client, db, email="rev@example.com", role="reviewer")
    assert (await move(client, q["id"], "in_review")).status_code == 200
    assert (await move(other_client, q["id"], "published")).status_code == 200

    # Editors can no longer change it; reviewers can, and the version goes up.
    blocked = await client.put(f"{API}/questions/{q['id']}", json=body(world, text="Sneaky edit?"))
    assert blocked.status_code == 403
    fixed = await other_client.put(
        f"{API}/questions/{q['id']}", json=body(world, text="Typo fixed?")
    )
    assert fixed.status_code == 200 and fixed.json()["version"] == 2


async def test_list_filters_and_pagination(client: httpx.AsyncClient, db: AsyncSession) -> None:
    world = await seed_world(db)
    await staff(client, db, role="editor")
    await create(client, world)
    page = (await client.get(f"{API}/questions", params={"status": "draft"})).json()
    assert page["total"] == 1 and page["items"][0]["subject"] == "English"
    everything = (await client.get(f"{API}/questions", params={"page_size": 4})).json()
    assert everything["total"] == 7 and len(everything["items"]) == 4
    found = (await client.get(f"{API}/questions", params={"q": "grammatically"})).json()
    assert found["total"] == 1
    maths = (
        await client.get(f"{API}/questions", params={"subject_id": str(world.maths.id)})
    ).json()
    assert maths["total"] == 3
    assert (await client.get(f"{API}/questions", params={"status": "bogus"})).status_code == 422


# ---- the review workflow ----


async def test_review_workflow_and_the_two_person_rule(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db, role="editor")
    await staff(other_client, db, email="rev@example.com", role="reviewer")
    q = await create(client, world)

    assert (await move(client, q["id"], "draft")).status_code == 409  # already a draft
    assert (await move(client, q["id"], "published")).status_code == 403  # admins only
    assert (await move(client, q["id"], "in_review")).json()["status"] == "in_review"
    assert (await move(client, q["id"], "published")).status_code == 403  # editors cannot approve

    # A reviewer cannot approve their own question; another reviewer can.
    await set_role(db, "ana@example.com", "reviewer")
    own = await move(client, q["id"], "published")
    assert own.status_code == 403 and own.json()["code"] == "two_person_rule"
    approved = await move(other_client, q["id"], "published")
    assert approved.status_code == 200
    assert approved.json()["reviewed_by"] == "Ana Khan" and approved.json()["published_at"]

    count = (await client.get("/api/v1/exams/lat")).json()["question_count"]
    assert count == 7  # the new question is now live for students


async def test_reviewers_can_send_back_and_archive_and_only_admins_restore(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db, role="editor")
    await staff(other_client, db, email="rev@example.com", role="reviewer")
    q = await create(client, world)
    await move(client, q["id"], "in_review")
    assert (await move(other_client, q["id"], "draft")).json()["status"] == "draft"
    assert (await move(other_client, q["id"], "archived")).json()["status"] == "archived"
    assert (await move(other_client, q["id"], "draft")).status_code == 403
    await set_role(db, "rev@example.com", "admin")
    assert (await move(other_client, q["id"], "draft")).json()["status"] == "draft"


# ---- CSV import ----

HEADER = (
    "subject,topic,difficulty,question,option_a,option_b,option_c,option_d,correct,explanation\n"
)


async def post_csv(client: httpx.AsyncClient, text: str, dry_run: bool = False) -> httpx.Response:
    return await client.post(
        f"{API}/questions/import",
        params={"exam": "lat", "dry_run": str(dry_run).lower()},
        content=text.encode(),
        headers={"Content-Type": "text/csv"},
    )


async def test_import_creates_drafts_and_skips_duplicates(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_world(db)
    await staff(client, db, role="editor")
    csv_text = (
        HEADER
        + "English,Tenses,easy,Pick the verb,go,goes,going,gone,B,Because s\n"
        + "Mathematics,Algebra,hard,Solve 2x=4,1,2,3,4,b,Divide by two\n"
        + "English,Tenses,easy,Pick the verb,go,goes,going,gone,B,again\n"
    )
    dry = (await post_csv(client, csv_text, dry_run=True)).json()
    assert dry == {"dry_run": True, "total": 3, "created": 2, "duplicates": 1, "errors": []}
    assert await db.scalar(select(func.count()).select_from(Question)) == 6  # nothing saved yet

    done = (await post_csv(client, csv_text)).json()
    assert done["created"] == 2 and done["duplicates"] == 1 and done["errors"] == []
    imported = (await client.get(f"{API}/questions", params={"status": "draft"})).json()
    assert imported["total"] == 2
    detail = (await client.get(f"{API}/questions/{imported['items'][0]['id']}")).json()
    assert sum(o["is_correct"] for o in detail["options"]) == 1

    again = (await post_csv(client, csv_text)).json()
    assert again["created"] == 0 and again["duplicates"] == 3  # all already in the bank


async def test_one_bad_row_rejects_the_whole_file_with_row_numbers(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_world(db)
    await staff(client, db, role="editor")
    csv_text = (
        HEADER
        + "English,,easy,Good one,a,b,c,d,A,\n"
        + "Astrology,,easy,Bad subject,a,b,c,d,A,\n"
        + "English,,easy,Bad answer,a,b,,,D,\n"
        + "English,,extreme,Bad level,a,b,c,d,A,\n"
        + "English,,easy,One option,a,,,,A,\n"
    )
    result = (await post_csv(client, csv_text)).json()
    assert result["created"] == 0
    assert [e["row"] for e in result["errors"]] == [3, 4, 5, 6]
    assert "Unknown subject" in result["errors"][0]["message"]
    assert await db.scalar(select(func.count()).select_from(Question)) == 6


async def test_import_limits(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await seed_world(db)
    await staff(client, db, role="editor")
    assert (await post_csv(client, HEADER)).status_code == 422
    many = HEADER + "".join(f"English,,easy,Q{i},a,b,c,d,A,\n" for i in range(1001))
    assert (await post_csv(client, many)).json()["code"] == "too_many_rows"
    assert (await post_csv(client, "x" * 2_100_000)).status_code == 413
    nope = await client.post(f"{API}/questions/import", params={"exam": "zzz"}, content=HEADER)
    assert nope.status_code == 404


# ---- students ----


async def test_student_list_search_and_plan_column(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await staff(client, db)
    await signup(other_client, db, email="bilal@example.com")
    listing = (await client.get(f"{API}/students")).json()
    assert listing["total"] == 2
    found = (await client.get(f"{API}/students", params={"q": "bilal"})).json()
    assert [(s["email"], s["plan"], s["role"]) for s in found["items"]] == [
        ("bilal@example.com", "Free", "student")
    ]
    assert (await client.get(f"{API}/students", params={"role": "admin"})).json()["total"] == 1


async def test_suspending_locks_the_student_out_straight_away(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await staff(client, db)
    await signup(other_client, db, email="bilal@example.com")
    bilal = await db.scalar(select(User).where(User.email == "bilal@example.com"))
    assert bilal is not None
    assert (await other_client.get("/api/v1/me")).status_code == 200

    r = await client.patch(f"{API}/students/{bilal.id}", json={"status": "suspended"})
    assert r.status_code == 204
    assert (await other_client.get("/api/v1/me")).status_code == 401
    await client.patch(f"{API}/students/{bilal.id}", json={"status": "active"})
    assert (await other_client.get("/api/v1/me")).status_code == 200


async def test_admins_cannot_change_their_own_role_or_status(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await staff(client, db)
    me = (await client.get("/api/v1/me")).json()
    r = await client.patch(f"{API}/students/{me['id']}", json={"role": "student"})
    assert r.status_code == 409 and r.json()["code"] == "own_account"


async def test_manual_premium_grant_and_revoke(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await staff(client, db)
    await signup(other_client, db, email="bilal@example.com")
    bilal = await db.scalar(select(User).where(User.email == "bilal@example.com"))
    assert bilal is not None

    assert (await client.delete(f"{API}/students/{bilal.id}/premium")).status_code == 409
    granted = await client.post(
        f"{API}/students/{bilal.id}/premium", json={"plan_code": "premium_monthly", "days": 10}
    )
    assert granted.status_code == 204
    sub = (await other_client.get("/api/v1/me/subscription")).json()
    assert sub["premium"] is True and sub["limits"] == {}
    assert (await client.get(f"{API}/students", params={"q": "bilal"})).json()["items"][0][
        "plan"
    ] == "Premium Monthly"

    assert (await client.delete(f"{API}/students/{bilal.id}/premium")).status_code == 204
    assert (await other_client.get("/api/v1/me/subscription")).json()["premium"] is False
    free_plan = await client.post(f"{API}/students/{bilal.id}/premium", json={"plan_code": "free"})
    assert free_plan.status_code == 404


# ---- payments and refunds ----


async def pay(client: httpx.AsyncClient, outcome: str = "success") -> None:
    checkout = (
        await client.post("/api/v1/billing/checkout", json={"plan_code": "premium_monthly"})
    ).json()
    done = await client.post(
        "/api/v1/billing/test-gateway/complete",
        json={"ref": checkout["fields"]["ref"], "outcome": outcome},
    )
    assert done.status_code == 200


async def test_refund_ends_premium_and_cannot_repeat(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await staff(client, db)
    await signup(other_client, db, email="bilal@example.com")
    await pay(other_client)
    assert (await other_client.get("/api/v1/me/subscription")).json()["premium"] is True

    listing = (await client.get(f"{API}/payments", params={"status": "paid"})).json()
    assert listing["total"] == 1 and listing["items"][0]["email"] == "bilal@example.com"
    payment_id = listing["items"][0]["id"]

    assert (await client.post(f"{API}/payments/{payment_id}/refund")).status_code == 204
    assert (await other_client.get("/api/v1/me/subscription")).json()["premium"] is False
    status = await db.scalar(select(Payment.status))
    assert status == "refunded"
    assert await db.scalar(select(Subscription.status)) == "cancelled"
    again = await client.post(f"{API}/payments/{payment_id}/refund")
    assert again.status_code == 409 and again.json()["code"] == "not_refundable"


async def test_failed_payments_cannot_be_refunded(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed_plans(db)
    await staff(client, db)
    await signup(other_client, db, email="bilal@example.com")
    await pay(other_client, outcome="failure")
    payment_id = (await client.get(f"{API}/payments")).json()["items"][0]["id"]
    assert (await client.post(f"{API}/payments/{payment_id}/refund")).status_code == 409


# ---- reports, stats, audit ----


async def test_reported_questions_can_be_resolved(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await staff(client, db, role="reviewer")
    await signup(other_client, db, email="bilal@example.com")
    r = await other_client.post(
        f"/api/v1/questions/{world.questions[0].id}/report",
        json={"reason": "wrong_answer", "note": "B looks wrong"},
    )
    assert r.status_code == 201

    open_reports = (await client.get(f"{API}/reports")).json()
    assert len(open_reports) == 1 and open_reports[0]["reporter"] == "Ana Khan"
    assert open_reports[0]["note"] == "B looks wrong"
    done = await client.post(
        f"{API}/reports/{open_reports[0]['id']}/resolve", json={"status": "resolved"}
    )
    assert done.status_code == 204
    assert (await client.get(f"{API}/reports")).json() == []
    assert len((await client.get(f"{API}/reports", params={"status": "resolved"})).json()) == 1


async def test_stats_reflect_the_data(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await seed_plans(db)
    await staff(client, db)
    await signup(other_client, db, email="bilal@example.com")
    await pay(other_client)
    await create(client, world)

    stats = (await client.get(f"{API}/stats")).json()
    assert stats["students"] == 1  # the admin is not counted as a student
    assert stats["premium_now"] == 1
    assert stats["revenue_total_paisa"] == 120000 == stats["revenue_this_month_paisa"]
    assert {s["name"]: s["value"] for s in stats["questions_by_status"]} == {
        "draft": 1,
        "published": 6,
    }
    assert stats["questions_by_exam"] == [{"name": "LAT", "value": 6}]
    assert stats["pending_reviews"] == 0 and stats["open_reports"] == 0
    assert len(stats["signups"]) == 8 and sum(w["signups"] for w in stats["signups"]) == 2


async def test_admin_actions_are_written_to_the_audit_log(
    client: httpx.AsyncClient, other_client: httpx.AsyncClient, db: AsyncSession
) -> None:
    world = await seed_world(db)
    await seed_plans(db)
    await staff(client, db)
    await signup(other_client, db, email="bilal@example.com")
    bilal = await db.scalar(select(User).where(User.email == "bilal@example.com"))
    assert bilal is not None
    q = await create(client, world)
    await move(client, q["id"], "in_review")
    await client.patch(f"{API}/students/{bilal.id}", json={"role": "editor"})

    log = (await client.get(f"{API}/audit")).json()
    actions = [row["action"] for row in log]
    assert actions[:3] == ["user.update", "question.in_review", "question.create"]
    assert all(row["actor"] == "Ana Khan" for row in log)
