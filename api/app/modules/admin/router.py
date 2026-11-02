import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.modules.admin import people, questions
from app.modules.admin.schemas import (
    AdminPaymentPage,
    AdminStats,
    AuditRow,
    GrantIn,
    ImportResult,
    QuestionAdminOut,
    QuestionIn,
    QuestionPage,
    ReportResolve,
    ReportRow,
    StudentPage,
    StudentPatch,
    TransitionIn,
)
from app.modules.users.deps import SessionDep, require_role
from app.modules.users.models import User

# Editors write, reviewers approve, admins run everything (users, money, audit).
Staff = Annotated[User, Depends(require_role("editor", "reviewer", "admin"))]
Reviewer = Annotated[User, Depends(require_role("reviewer", "admin"))]
Admin = Annotated[User, Depends(require_role("admin"))]

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

Page = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]


# ---- overview ----


@router.get("/stats", response_model=AdminStats)
async def get_stats(_: Staff, session: SessionDep) -> AdminStats:
    return await people.stats(session)


@router.get("/audit", response_model=list[AuditRow])
async def get_audit(_: Admin, session: SessionDep) -> list[AuditRow]:
    return await people.list_audit(session)


# ---- questions ----


@router.get("/questions", response_model=QuestionPage)
async def list_questions(
    _: Staff,
    session: SessionDep,
    exam: str | None = None,
    subject_id: uuid.UUID | None = None,
    status: Annotated[str | None, Query(pattern="^(draft|in_review|published|archived)$")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    page: Page = 1,
    page_size: PageSize = 20,
) -> QuestionPage:
    return await questions.list_questions(
        session,
        exam=exam,
        subject_id=subject_id,
        status=status,
        search=q,
        page=page,
        page_size=page_size,
    )


@router.post("/questions", response_model=QuestionAdminOut, status_code=status.HTTP_201_CREATED)
async def create_question(data: QuestionIn, user: Staff, session: SessionDep) -> QuestionAdminOut:
    return await questions.create_question(session, user, data)


@router.post("/questions/import", response_model=ImportResult)
async def import_questions(
    request: Request,
    user: Staff,
    session: SessionDep,
    exam: Annotated[str, Query(min_length=1, max_length=64)],
    dry_run: bool = True,
) -> ImportResult:
    """Body is the raw CSV text (Content-Type: text/csv). Imports as drafts."""
    return await questions.import_csv(session, user, exam, await request.body(), dry_run)


@router.get("/questions/{question_id}", response_model=QuestionAdminOut)
async def get_question(question_id: uuid.UUID, _: Staff, session: SessionDep) -> QuestionAdminOut:
    return await questions.get_question(session, question_id)


@router.put("/questions/{question_id}", response_model=QuestionAdminOut)
async def update_question(
    question_id: uuid.UUID, data: QuestionIn, user: Staff, session: SessionDep
) -> QuestionAdminOut:
    return await questions.update_question(session, user, question_id, data)


@router.post("/questions/{question_id}/transition", response_model=QuestionAdminOut)
async def transition_question(
    question_id: uuid.UUID, data: TransitionIn, user: Staff, session: SessionDep
) -> QuestionAdminOut:
    return await questions.transition(session, user, question_id, data.to)


# ---- reports ----


@router.get("/reports", response_model=list[ReportRow])
async def list_reports(
    _: Reviewer,
    session: SessionDep,
    status: Annotated[str, Query(pattern="^(open|resolved|dismissed)$")] = "open",
) -> list[ReportRow]:
    return await people.list_reports(session, status)


@router.post("/reports/{report_id}/resolve", status_code=204)
async def resolve_report(
    report_id: uuid.UUID, data: ReportResolve, user: Reviewer, session: SessionDep
) -> Response:
    await people.resolve_report(session, user, report_id, data.status)
    return Response(status_code=204)


# ---- students and money (admin only) ----


@router.get("/students", response_model=StudentPage)
async def list_students(
    _: Admin,
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    role: Annotated[str | None, Query(pattern="^(student|editor|reviewer|admin)$")] = None,
    page: Page = 1,
    page_size: PageSize = 20,
) -> StudentPage:
    return await people.list_students(session, search=q, role=role, page=page, page_size=page_size)


@router.patch("/students/{student_id}", status_code=204)
async def patch_student(
    student_id: uuid.UUID, data: StudentPatch, user: Admin, session: SessionDep
) -> Response:
    await people.patch_student(session, user, student_id, data)
    return Response(status_code=204)


@router.post("/students/{student_id}/premium", status_code=204)
async def grant_premium(
    student_id: uuid.UUID, data: GrantIn, user: Admin, session: SessionDep
) -> Response:
    await people.grant_premium(session, user, student_id, data)
    return Response(status_code=204)


@router.delete("/students/{student_id}/premium", status_code=204)
async def revoke_premium(student_id: uuid.UUID, user: Admin, session: SessionDep) -> Response:
    await people.revoke_premium(session, user, student_id)
    return Response(status_code=204)


@router.get("/payments", response_model=AdminPaymentPage)
async def list_payments(
    _: Admin,
    session: SessionDep,
    status: Annotated[str | None, Query(pattern="^(pending|paid|failed|refunded)$")] = None,
    page: Page = 1,
    page_size: PageSize = 20,
) -> AdminPaymentPage:
    return await people.list_payments(session, status=status, page=page, page_size=page_size)


@router.post("/payments/{payment_id}/refund", status_code=204)
async def refund_payment(payment_id: uuid.UUID, user: Admin, session: SessionDep) -> Response:
    await people.refund_payment(session, user, payment_id)
    return Response(status_code=204)
