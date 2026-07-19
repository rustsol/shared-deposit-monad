"""evidence_manifests and evidence_files - metadata records only.

File content lives on content-addressed disk storage (backend/storage/
evidence), never in the database: there are deliberately no BLOB columns.
Content-addressed files are immutable - a path derived from a SHA-256 is
never overwritten (enforced by the storage layer in a later phase).
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.types import (
    AddressChar,
    Hash64Char,
    Hash66Char,
    UnsignedBigInt,
    UtcDateTime,
    UuidChar,
)


class EvidenceManifest(Base):
    __tablename__ = "evidence_manifests"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"}

    id: Mapped[str] = mapped_column(UuidChar, primary_key=True)
    # The recipient wallet that uploaded the evidence.
    owner_address: Mapped[str] = mapped_column(AddressChar, nullable=False, index=True)
    manifest_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    # Keccak-256 of the canonical manifest (bytes32 hex) - the onchain evidenceHash.
    manifest_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False, unique=True)
    total_size_bytes: Mapped[int] = mapped_column(UnsignedBigInt, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)


class EvidenceFile(Base):
    __tablename__ = "evidence_files"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    manifest_id: Mapped[str] = mapped_column(
        UuidChar,
        ForeignKey("evidence_manifests.id"),
        nullable=False,
        index=True,
    )
    # SHA-256 hex (64 chars, no prefix) - the content address of the file bytes.
    sha256: Mapped[str] = mapped_column(Hash64Char, nullable=False, index=True)
    # Sanitized display name only; the storage path is hash-derived.
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(UnsignedBigInt, nullable=False)
    storage_relative_path: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
