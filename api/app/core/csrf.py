from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.errors import problem

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Server-to-server callbacks authenticate with signatures instead of cookies.
EXEMPT_PREFIXES = ("/api/v1/billing/webhooks/",)


class CsrfMiddleware(BaseHTTPMiddleware):
    """Require a custom header on state-changing API calls.

    Browsers cannot attach custom headers to cross-site requests without a CORS
    preflight, and our CORS policy only allows the web origin, so a forged
    cross-site form or fetch cannot carry the header. Combined with
    SameSite=Lax session cookies this blocks CSRF.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if (
            request.method in UNSAFE_METHODS
            and path.startswith("/api/")
            and not path.startswith(EXEMPT_PREFIXES)
            and not request.headers.get("x-csrf")
        ):
            return problem(403, "Missing CSRF header", code="csrf_failed")
        return await call_next(request)
