import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.attempts.models import MockTest
from app.modules.catalog.models import Exam, Question, QuestionOption, Subject, Topic


def make_question(exam: Exam, subject: Subject, topic: Topic, status: str, n: int) -> Question:
    return Question(
        exam_id=exam.id,
        subject_id=subject.id,
        topic_id=topic.id,
        text=f"Question {n}?",
        status=status,
        content_hash=f"hash{n}",
        options=[
            QuestionOption(position=1, text="A", is_correct=True),
            QuestionOption(position=2, text="B", is_correct=False),
        ],
    )


async def seed(db: AsyncSession) -> None:
    lat = Exam(slug="lat", name="LAT", full_name="Law Admission Test", category="Law", sort=1)
    mdcat = Exam(slug="mdcat", name="MDCAT", full_name="Medical Test", category="Medical", sort=2)
    old = Exam(slug="old", name="Old", full_name="Old Exam", category="Law", status="archived")
    db.add_all([lat, mdcat, old])
    await db.flush()

    english = Subject(exam_id=lat.id, name="English", sort=1)
    maths = Subject(exam_id=lat.id, name="Mathematics", sort=2)
    essay = Subject(exam_id=lat.id, name="Essay Writing", kind="written", sort=3)
    db.add_all([english, maths, essay])
    await db.flush()
    grammar = Topic(subject_id=english.id, name="Grammar")
    algebra = Topic(subject_id=maths.id, name="Algebra")
    db.add_all([grammar, algebra])
    await db.flush()

    db.add_all(
        [
            make_question(lat, english, grammar, "published", 1),
            make_question(lat, english, grammar, "published", 2),
            make_question(lat, english, grammar, "draft", 3),
            make_question(lat, maths, algebra, "published", 4),
            make_question(lat, maths, algebra, "archived", 5),
        ]
    )
    await db.commit()


async def test_exam_list_counts_only_published_questions(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed(db)
    r = await client.get("/api/v1/exams")
    assert r.status_code == 200
    exams = r.json()
    assert [e["slug"] for e in exams] == ["lat", "mdcat"]  # archived exam hidden, sorted
    lat = exams[0]
    assert lat["subject_count"] == 3 and lat["question_count"] == 3
    assert exams[1]["question_count"] == 0


async def test_exam_detail_lists_subjects_with_counts(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed(db)
    r = await client.get("/api/v1/exams/lat")
    assert r.status_code == 200
    body = r.json()
    assert [s["name"] for s in body["subjects"]] == ["English", "Mathematics", "Essay Writing"]
    assert [s["question_count"] for s in body["subjects"]] == [2, 1, 0]
    assert body["subjects"][2]["kind"] == "written"


async def test_exam_detail_404s(client: httpx.AsyncClient, db: AsyncSession) -> None:
    await seed(db)
    assert (await client.get("/api/v1/exams/nope")).status_code == 404
    assert (await client.get("/api/v1/exams/old")).status_code == 404  # archived


async def test_answers_are_never_exposed_by_the_catalogue(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed(db)
    text = (await client.get("/api/v1/exams/lat")).text + (await client.get("/api/v1/exams")).text
    assert "is_correct" not in text and "explanation" not in text


async def test_exam_list_counts_only_published_mock_tests(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    await seed(db)
    lat = await db.scalar(select(Exam).where(Exam.slug == "lat"))
    assert lat is not None
    db.add_all(
        [
            MockTest(exam_id=lat.id, title="Live", duration_sec=600, status="published"),
            MockTest(exam_id=lat.id, title="Hidden", duration_sec=600, status="draft"),
        ]
    )
    await db.commit()

    exams = {e["slug"]: e for e in (await client.get("/api/v1/exams")).json()}
    assert exams["lat"]["mock_test_count"] == 1
    assert exams["mdcat"]["mock_test_count"] == 0
    assert (await client.get("/api/v1/exams/lat")).json()["mock_test_count"] == 1
