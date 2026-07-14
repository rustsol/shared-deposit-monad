"""FastAPI dependencies: session extraction, CSRF, and origin enforcement.

Authentication is never taken from a caller-supplied header alone: identity
comes exclusively from the HttpOnly session cookie whose hash matches a live
database session. CSRF uses a session-bound double-submit header compared in
constant time via hashing.
"""

import hmac

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.service import find_active_session, sha256_hex
from app.config import get_settings
from app.database.session import get_db_session
from app.models import AuthSession

CSRF_HEADER = "X-CSRF-Token"


def get_optional_session(
    request: Request, db: Session = Depends(get_db_session)
) -> AuthSession | None:
    """The current live session, or None. Never raises for anonymous callers."""
    raw_token = request.cookies.get(get_settings().session_cookie_name)
    if not raw_token:
        return None
    return find_active_session(db, raw_token)


def require_session(
    session: AuthSession | None = Depends(get_optional_session),
) -> AuthSession:
    """401 unless a live (unexpired, unrevoked) session cookie is presented."""
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="authentication required"
        )
    return session


def enforce_origin(request: Request) -> None:
    """State-changing requests must not come from an unapproved origin. A
    present Origin header must equal the configured frontend origin exactly;
    absent Origin (non-browser clients) still requires the CSRF token."""
    origin = request.headers.get("origin")
    if origin is not None and origin.rstrip("/") != get_settings().frontend_origin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="origin not allowed")


def require_csrf(
    request: Request,
    session: AuthSession = Depends(require_session),
    _origin: None = Depends(enforce_origin),
) -> AuthSession:
    """Session + CSRF + origin gate for every cookie-authenticated mutation.
    The session cookie itself is never accepted as a CSRF value: the header
    must hash to the separate csrf_token_hash bound to this session."""
    header_value = request.headers.get(CSRF_HEADER)
    if not header_value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="missing CSRF token")
    if not hmac.compare_digest(sha256_hex(header_value), session.csrf_token_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid CSRF token")
    return session
