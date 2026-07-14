"""invitations — private invitation-link lifecycle (MySQL-authoritative).

Only the SHA-256 hash of the invitation token is stored; raw tokens and raw
invitation URLs never touch the database. The schema supports the approved
protections: expiry, one-time acceptance (`used_at`), and rotation/revocation
(`revoked_at`, a documented schema addition backing the approved
invitation-token protections in docs/02 §6.4).
"""

from datetime import datetime

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.types import AddressChar, Hash64Char, UtcDateTime, UuidChar


class Invitation(Base):
    __tablename__ = "invitations"
    __table_args__ = (
        Index("ix_invitations_expiry", "expires_at"),
        {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"},
    )

    id: Mapped[str] = mapped_column(UuidChar, primary_key=True)
    # chain/contract/agreement encoded key (docs/02 §5.4).
    agreement_key: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    # TENANT or RECIPIENT
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    wallet_address: Mapped[str] = mapped_column(AddressChar, nullable=False)
    # SHA-256 hex of the raw token (>= 256-bit CSPRNG, generated in a later phase).
    token_hash: Mapped[str] = mapped_column(Hash64Char, nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    # View/join audit — not onchain acceptance; one-time-use state.
    used_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    # Rotation/revocation support per the approved token protections.
    revoked_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    created_by: Mapped[str] = mapped_column(AddressChar, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
