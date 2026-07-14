"""auth_nonces and auth_sessions — wallet-signature authentication state.

Only SHA-256 hashes of nonces and session tokens are stored; raw values never
touch the database. Both tables carry expiries and consumption/revocation
state for one-time-use and logout semantics.
"""

from datetime import datetime

from sqlalchemy import BigInteger, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.types import AddressChar, Hash64Char, UtcDateTime, UuidChar


class AuthNonce(Base):
    __tablename__ = "auth_nonces"
    __table_args__ = (
        # Cleanup path: expired nonces per wallet.
        Index("ix_auth_nonces_wallet_expiry", "wallet_address", "expires_at"),
        {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    wallet_address: Mapped[str] = mapped_column(AddressChar, nullable=False, index=True)
    # SHA-256 hex of the raw nonce; the raw nonce is never stored.
    nonce_hash: Mapped[str] = mapped_column(Hash64Char, nullable=False, unique=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False, index=True)
    # One-time use: set exactly once when the nonce is consumed.
    used_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        Index("ix_auth_sessions_wallet_expiry", "wallet_address", "expires_at"),
        {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"},
    )

    id: Mapped[str] = mapped_column(UuidChar, primary_key=True)
    wallet_address: Mapped[str] = mapped_column(AddressChar, nullable=False, index=True)
    # SHA-256 hex of the opaque session token; the raw cookie value is never stored.
    token_hash: Mapped[str] = mapped_column(Hash64Char, nullable=False, unique=True)
    # SHA-256 hex of the session-bound CSRF token (double-submit design); the
    # raw CSRF value is returned to the client once per issue and never stored.
    csrf_token_hash: Mapped[str] = mapped_column(Hash64Char, nullable=False, server_default="")
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
