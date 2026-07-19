"""Access logging with mandatory redaction.

The invitation review/claim routes carry a secret token in the path, so this
middleware - the only request logger in the application - replaces that path
segment with ``[redacted]`` before anything is written. Cookies, Authorization
headers, CSRF headers, and request bodies are never logged at all.

Deployment note (see backend/README.md): a hosted reverse proxy keeps its own
access log and MUST apply the same redaction to /api/v1/invitations/* paths
and strip Cookie headers from logs; this middleware only covers the app.
"""

import logging
import re
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

access_logger = logging.getLogger("app.access")

_INVITATION_PATH_RE = re.compile(r"(/api/v1/invitations/)[^/\s]+")


def redact_path(path: str) -> str:
    return _INVITATION_PATH_RE.sub(r"\1[redacted]", path)


async def access_log_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    access_logger.info(
        "%s %s -> %s", request.method, redact_path(request.url.path), response.status_code
    )
    return response
