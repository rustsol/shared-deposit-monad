"""Authentication service: nonces, signature verification, sessions.

Raw nonces, session tokens, and CSRF values exist only in transit — the
database stores SHA-256 hashes exclusively, and nothing here logs a raw
value. Nonce consumption and session creation happen in one transaction with
an atomic single-statement guard, so two concurrent verifications of the same
nonce can never both succeed.
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from eth_account import Account
from eth_account.messages import encode_defunct
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.auth.messages import build_signin_message, domain_from_origin, extract_nonce
from app.config import Settings
from app.database.session import execute_rowcount
from app.models import AuthNonce, AuthSession, WalletProfile

_SIGNATURE_HEX_LENGTH = 132  # 0x + 65 bytes


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class IssuedNonce:
    message: str
    expires_at: datetime


@dataclass(frozen=True)
class IssuedSession:
    session_id: str
    wallet_address: str
    raw_token: str
    raw_csrf_token: str
    expires_at: datetime


class AuthenticationFailed(Exception):
    """Single generic failure type: callers map it to one uniform 401 so the
    API cannot be used to enumerate wallets, nonces, or failure specifics."""

    def __init__(self, reason_category: str) -> None:
        # A short internal category safe for audit metadata (never detailed).
        super().__init__(reason_category)
        self.reason_category = reason_category


def issue_nonce(db: Session, settings: Settings, wallet_address: str) -> IssuedNonce:
    """Creates a one-time nonce and returns the exact message to sign. The raw
    nonce leaves this function only inside that message."""
    wallet = wallet_address.lower()
    raw_nonce = secrets.token_hex(32)  # 256 bits, alphanumeric per EIP-4361
    issued_at = utcnow()
    expires_at = issued_at + timedelta(seconds=settings.auth_nonce_ttl_seconds)

    message = build_signin_message(
        domain=domain_from_origin(settings.frontend_origin),
        uri=settings.frontend_origin,
        address=wallet,
        chain_id=settings.chain_id,
        nonce=raw_nonce,
        issued_at=issued_at,
        expiration_time=expires_at,
    )

    db.add(
        AuthNonce(
            wallet_address=wallet,
            nonce_hash=sha256_hex(raw_nonce),
            message=message,
            expires_at=expires_at,
            used_at=None,
            created_at=issued_at,
        )
    )
    db.commit()
    return IssuedNonce(message=message, expires_at=expires_at)


def verify_and_create_session(
    db: Session, settings: Settings, wallet_address: str, message: str, signature: str
) -> IssuedSession:
    """Full verification per docs/02 §5.2 + EIP-4361. One transaction: atomic
    nonce consumption, then session creation, then a single commit."""
    wallet = wallet_address.lower()

    if len(signature) != _SIGNATURE_HEX_LENGTH or not signature.startswith("0x"):
        raise AuthenticationFailed("malformed_signature")
    try:
        bytes.fromhex(signature[2:])
    except ValueError:
        raise AuthenticationFailed("malformed_signature") from None

    raw_nonce = extract_nonce(message)
    if raw_nonce is None:
        raise AuthenticationFailed("malformed_message")

    nonce_row = (
        db.query(AuthNonce).filter(AuthNonce.nonce_hash == sha256_hex(raw_nonce)).one_or_none()
    )
    if nonce_row is None:
        raise AuthenticationFailed("unknown_nonce")
    # Byte-for-byte equality with the issued challenge: any mutation of the
    # domain, URI, chain, address, timestamps, or statement fails here.
    if nonce_row.message != message:
        raise AuthenticationFailed("message_mismatch")
    if nonce_row.wallet_address != wallet:
        raise AuthenticationFailed("wallet_mismatch")

    # Defense in depth: re-validate the challenge against CURRENT settings, so
    # a message issued under different configuration cannot authenticate.
    domain = domain_from_origin(settings.frontend_origin)
    if not message.startswith(f"{domain} wants you to sign in"):
        raise AuthenticationFailed("domain_mismatch")
    if f"\nURI: {settings.frontend_origin}\n" not in message:
        raise AuthenticationFailed("uri_mismatch")
    if f"\nChain ID: {settings.chain_id}\n" not in message:
        raise AuthenticationFailed("chain_mismatch")

    try:
        recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
    except Exception:  # noqa: BLE001 - any recovery failure is one category
        raise AuthenticationFailed("signature_invalid") from None
    if recovered.lower() != wallet:
        raise AuthenticationFailed("signer_mismatch")

    now = utcnow()
    # Atomic one-time consumption: a single guarded UPDATE. Under concurrent
    # replay exactly one statement reports rowcount == 1.
    consumed = execute_rowcount(
        db,
        update(AuthNonce)
        .where(
            AuthNonce.id == nonce_row.id,
            AuthNonce.used_at.is_(None),
            AuthNonce.expires_at > now,
        )
        .values(used_at=now),
    )
    if consumed != 1:
        db.rollback()
        raise AuthenticationFailed("nonce_expired_or_used")

    raw_token = secrets.token_hex(32)  # 256 bits
    raw_csrf = secrets.token_hex(32)  # 256 bits, session-bound
    expires_at = now + timedelta(seconds=settings.session_ttl_seconds)
    session_id = str(uuid.uuid4())

    db.add(
        AuthSession(
            id=session_id,
            wallet_address=wallet,
            token_hash=sha256_hex(raw_token),
            csrf_token_hash=sha256_hex(raw_csrf),
            expires_at=expires_at,
            revoked_at=None,
            created_at=now,
            last_seen_at=now,
        )
    )

    # First valid session creates the wallet profile; re-authentication never
    # duplicates it and never overwrites private metadata.
    profile = db.get(WalletProfile, wallet)
    if profile is None:
        db.add(WalletProfile(address=wallet, display_name=None, created_at=now, updated_at=now))

    db.commit()
    # Multiple concurrent sessions per wallet are permitted (one per device);
    # each is individually revocable. This is the documented session policy.
    return IssuedSession(
        session_id=session_id,
        wallet_address=wallet,
        raw_token=raw_token,
        raw_csrf_token=raw_csrf,
        expires_at=expires_at,
    )


def find_active_session(db: Session, raw_token: str) -> AuthSession | None:
    """Looks up a live session by token hash. Expired/revoked return None."""
    now = utcnow()
    session = (
        db.query(AuthSession).filter(AuthSession.token_hash == sha256_hex(raw_token)).one_or_none()
    )
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        return None
    return session


def revoke_session(db: Session, session: AuthSession) -> None:
    session.revoked_at = utcnow()
    db.commit()
