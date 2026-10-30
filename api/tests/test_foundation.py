import httpx
from fastapi import FastAPI

from app.core.errors import AppError


async def test_healthz(client: httpx.AsyncClient) -> None:
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_readyz_checks_database(client: httpx.AsyncClient) -> None:
    r = await client.get("/readyz")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ready"


async def test_unknown_route_uses_problem_format(client: httpx.AsyncClient) -> None:
    r = await client.get("/nope")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.json() == {
        "type": "about:blank",
        "title": "Not found",
        "status": 404,
        "code": "not_found",
    }


async def test_validation_errors_list_fields(app: FastAPI, client: httpx.AsyncClient) -> None:
    @app.get("/_t/validate")
    async def validate(n: int) -> dict[str, int]:
        return {"n": n}

    r = await client.get("/_t/validate", params={"n": "abc"})
    body = r.json()
    assert r.status_code == 422
    assert body["code"] == "validation_error"
    assert body["errors"][0]["field"] == "n"


async def test_app_error_is_rendered(app: FastAPI, client: httpx.AsyncClient) -> None:
    @app.get("/_t/limit")
    async def limit() -> None:
        raise AppError(429, "limit_reached", "Monthly limit reached", "Upgrade to continue")

    r = await client.get("/_t/limit")
    assert r.status_code == 429
    assert r.json()["code"] == "limit_reached"
    assert r.json()["detail"] == "Upgrade to continue"


async def test_unhandled_error_does_not_leak(app: FastAPI, client: httpx.AsyncClient) -> None:
    @app.get("/_t/boom")
    async def boom() -> None:
        raise RuntimeError("secret internal detail")

    r = await client.get("/_t/boom")
    assert r.status_code == 500
    assert "secret" not in r.text


async def test_request_id_is_returned_and_reused(client: httpx.AsyncClient) -> None:
    r = await client.get("/healthz")
    assert len(r.headers["x-request-id"]) >= 8
    r2 = await client.get("/healthz", headers={"X-Request-ID": "abcdef123456"})
    assert r2.headers["x-request-id"] == "abcdef123456"


async def test_cors_allows_web_origin_only(client: httpx.AsyncClient) -> None:
    ok = await client.get("/healthz", headers={"Origin": "http://localhost:3001"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3001"
    bad = await client.get("/healthz", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
