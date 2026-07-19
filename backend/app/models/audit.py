"""audit_log - append-oriented record of private application actions only
(login, draft creation, invitation creation, evidence access, sync repair).

Never a replacement for contract events, and never a home for secrets: no raw
tokens, no nonces, no keys, no full request bodies - only safe metadata.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.types import AddressChar, UtcDateTime


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_wallet: Mapped[str | None] = mapped_column(AddressChar, nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(180), nullable=True)
    # Safe, non-secret metadata only.
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False, index=True)
