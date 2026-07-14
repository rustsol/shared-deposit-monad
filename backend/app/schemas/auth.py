"""Request/response schemas for authentication and invitations. Responses
never carry raw session tokens, token hashes, nonce hashes, or database URLs;
the CSRF token is the only deliberately returned security value (it is
session-bound and useless without the HttpOnly cookie)."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import AddressStr


class NonceRequest(BaseModel):
    address: AddressStr


class NonceResponse(BaseModel):
    message: str
    expires_at: datetime


class VerifyRequest(BaseModel):
    address: AddressStr
    message: str = Field(min_length=1, max_length=4096)
    signature: str = Field(min_length=2, max_length=200)


class SessionResponse(BaseModel):
    authenticated: bool
    wallet_address: str | None = None
    display_name: str | None = None
    session_expires_at: datetime | None = None
    csrf_token: str | None = None


class LogoutResponse(BaseModel):
    logged_out: bool
