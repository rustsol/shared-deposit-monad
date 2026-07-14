"""Authentication endpoints (docs/02 §6.2): nonce, verify, logout, me.

Identity is proven exclusively by an EIP-4361 wallet signature; a session
lives in an HttpOnly cookie (never JSON); mutations require the session-bound
CSRF header. Failures are uniform 401s so the API cannot enumerate wallets or
distinguish nonce states.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_optional_session, require_csrf
from app.auth.ratelimit import NONCE_LIMIT, VERIFY_LIMIT, limiter
from app.auth.service import (
    AuthenticationFailed,
    issue_nonce,
    revoke_session,
    sha256_hex,
    verify_and_create_session,
)
from app.config import Settings, get_settings
from app.database.session import get_db_session
from app.models import AuthSession, WalletProfile
from app.schemas.auth import (
    LogoutResponse,
    NonceRequest,
    NonceResponse,
    SessionResponse,
    VerifyRequest,
)
from app.services.audit import record_audit_event

router = APIRouter(prefix="/auth", tags=["auth"])

_LOCAL_ENVS = {"development", "test"}


def _set_session_cookie(
    response: Response, settings: Settings, raw_token: str, max_age: int
) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=raw_token,
        max_age=max_age,
        path="/",
        httponly=True,
        samesite="lax",
        # Secure=false is permitted only for local HTTP development.
        secure=settings.app_env not in _LOCAL_ENVS,
    )


@router.post("/nonce", response_model=NonceResponse)
def create_nonce(
    body: NonceRequest,
    request: Request,
    db: Session = Depends(get_db_session),
) -> NonceResponse:
    limiter.enforce("auth-nonce", request, *NONCE_LIMIT, wallet=body.address)
    settings = get_settings()
    issued = issue_nonce(db, settings, body.address)
    record_audit_event(
        db,
        event_type="auth.nonce_issued",
        actor_wallet=body.address,
        target_type="wallet",
        target_id=body.address,
    )
    db.commit()
    # The raw nonce appears only inside this message, exactly once.
    return NonceResponse(message=issued.message, expires_at=issued.expires_at)


@router.post("/verify", response_model=SessionResponse)
def verify_signature(
    body: VerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db_session),
) -> SessionResponse:
    limiter.enforce("auth-verify", request, *VERIFY_LIMIT, wallet=body.address)
    settings = get_settings()
    try:
        issued = verify_and_create_session(db, settings, body.address, body.message, body.signature)
    except AuthenticationFailed as failure:
        # Safe generic category only — never the signature, message, or nonce.
        record_audit_event(
            db,
            event_type="auth.failed",
            target_type="wallet",
            target_id=body.address,
            metadata={"category": failure.reason_category},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="authentication failed"
        ) from None

    record_audit_event(
        db,
        event_type="auth.succeeded",
        actor_wallet=issued.wallet_address,
        target_type="session",
        target_id=issued.session_id,
    )
    db.commit()
    _set_session_cookie(response, settings, issued.raw_token, settings.session_ttl_seconds)
    return SessionResponse(
        authenticated=True,
        wallet_address=issued.wallet_address,
        session_expires_at=issued.expires_at,
        csrf_token=issued.raw_csrf_token,
    )


@router.get("/me", response_model=SessionResponse)
def current_session(
    session: AuthSession | None = Depends(get_optional_session),
    db: Session = Depends(get_db_session),
) -> SessionResponse:
    if session is None:
        return SessionResponse(authenticated=False)
    profile = db.get(WalletProfile, session.wallet_address)
    # Only the CSRF hash is stored, so a reloaded page cannot recover the old
    # raw value. Policy (documented): /me rotates the session-bound CSRF token
    # and returns the fresh value — exactly one CSRF value is active per
    # session at any time, and it is useless without the HttpOnly cookie,
    # which JavaScript cannot read and other origins cannot use.
    raw_csrf = secrets.token_hex(32)
    session.csrf_token_hash = sha256_hex(raw_csrf)
    db.commit()
    return SessionResponse(
        authenticated=True,
        wallet_address=session.wallet_address,
        display_name=profile.display_name if profile else None,
        session_expires_at=session.expires_at,
        csrf_token=raw_csrf,
    )


@router.post("/logout", response_model=LogoutResponse)
def logout(
    response: Response,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> LogoutResponse:
    revoke_session(db, session)
    record_audit_event(
        db,
        event_type="auth.session_revoked",
        actor_wallet=session.wallet_address,
        target_type="session",
        target_id=session.id,
    )
    db.commit()
    settings = get_settings()
    response.delete_cookie(key=settings.session_cookie_name, path="/")
    return LogoutResponse(logged_out=True)
