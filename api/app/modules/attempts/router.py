import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status

from app.modules.attempts import service
from app.modules.attempts.schemas import (
    AnswersIn,
    AnswersSaved,
    AttemptResult,
    AttemptState,
    AttemptSummary,
    CheckIn,
    CheckOut,
    MockTestOut,
    PracticeSetIn,
    ReviewItem,
)
from app.modules.users.deps import CurrentUser, SessionDep

router = APIRouter(prefix="/api/v1", tags=["exam engine"])


@router.get("/mock-tests", response_model=list[MockTestOut])
async def list_mock_tests(
    user: CurrentUser, session: SessionDep, exam: Annotated[str | None, Query(max_length=64)] = None
) -> list[MockTestOut]:
    return await service.list_mock_tests(session, user, exam)


@router.post("/mock-tests/{mock_id}/attempts", response_model=AttemptState)
async def start_mock(mock_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> AttemptState:
    """Start a timed attempt, or resume the one already in progress."""
    return await service.start_mock(session, user, mock_id)


@router.post("/practice/sets", response_model=AttemptState, status_code=status.HTTP_201_CREATED)
async def start_practice(
    data: PracticeSetIn, user: CurrentUser, session: SessionDep
) -> AttemptState:
    return await service.start_practice(session, user, data)


@router.get("/attempts/{attempt_id}", response_model=AttemptState)
async def get_attempt(
    attempt_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> AttemptState:
    attempt = await service.get_owned_attempt(session, user, attempt_id)
    return await service.build_state(session, attempt)


@router.put("/attempts/{attempt_id}/answers", response_model=AnswersSaved)
async def save_answers(
    attempt_id: uuid.UUID, data: AnswersIn, user: CurrentUser, session: SessionDep
) -> AnswersSaved:
    attempt = await service.get_owned_attempt(session, user, attempt_id)
    saved = await service.save_answers(session, attempt, data.answers)
    return AnswersSaved(saved=saved, server_now=service.now())


@router.post("/attempts/{attempt_id}/questions/{question_id}/check", response_model=CheckOut)
async def check_answer(
    attempt_id: uuid.UUID,
    question_id: uuid.UUID,
    data: CheckIn,
    user: CurrentUser,
    session: SessionDep,
) -> CheckOut:
    """Practice mode only: record one answer and get the verdict and explanation."""
    attempt = await service.get_owned_attempt(session, user, attempt_id)
    return await service.check_answer(session, user, attempt, question_id, data.option_id)


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptResult)
async def submit_attempt(
    attempt_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> AttemptResult:
    attempt = await service.get_owned_attempt(session, user, attempt_id)
    return await service.submit(session, attempt)


@router.get("/attempts/{attempt_id}/result", response_model=AttemptResult)
async def get_result(
    attempt_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> AttemptResult:
    attempt = await service.get_owned_attempt(session, user, attempt_id)
    return await service.build_result(session, attempt)


@router.get("/attempts/{attempt_id}/review", response_model=list[ReviewItem])
async def get_review(
    attempt_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> list[ReviewItem]:
    attempt = await service.get_owned_attempt(session, user, attempt_id)
    return await service.build_review(session, attempt)


@router.get("/me/attempts", response_model=list[AttemptSummary])
async def my_attempts(
    user: CurrentUser,
    session: SessionDep,
    type: Annotated[Literal["practice", "mock"] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[AttemptSummary]:
    return await service.list_attempts(session, user, type, limit)
