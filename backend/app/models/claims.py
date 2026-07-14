"""claim_drafts (pre-chain, MySQL-authoritative) and claim_index (cache only).

claim_index mirrors the immutable onchain Claim structure and claim events
exactly per the approved columns in docs/02 §5.4. It must never override a
direct contract read — hence `status_cache`.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.dialects.mysql import SMALLINT
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.types import (
    AddressChar,
    Hash66Char,
    UnsignedBigInt,
    UtcDateTime,
    UuidChar,
    WeiDecimal,
)


class ClaimDraft(Base):
    __tablename__ = "claim_drafts"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"}

    id: Mapped[str] = mapped_column(UuidChar, primary_key=True)
    agreement_key: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    recipient_address: Mapped[str] = mapped_column(AddressChar, nullable=False)
    # SHARED or INDIVIDUAL
    claim_type: Mapped[str] = mapped_column(String(16), nullable=False)
    liable_tenant: Mapped[str | None] = mapped_column(AddressChar, nullable=True)
    amount_wei: Mapped[Decimal] = mapped_column(WeiDecimal, nullable=False)
    # Private readable reason; only its Keccak hash goes onchain.
    reason_text: Mapped[str] = mapped_column(Text, nullable=False)
    reason_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False)
    evidence_manifest_id: Mapped[str] = mapped_column(
        UuidChar,
        ForeignKey("evidence_manifests.id"),
        nullable=False,
    )
    # Copied so the submitted request stays immutable even if drafts evolve.
    evidence_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False)
    tx_hash: Mapped[str | None] = mapped_column(Hash66Char, nullable=True)
    claim_id_onchain: Mapped[Decimal | None] = mapped_column(WeiDecimal, nullable=True)
    # DRAFT, TX_SUBMITTED, CONFIRMED, FAILED
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)


class ClaimIndex(Base):
    """Event-derived cache only — never authoritative for claim state."""

    __tablename__ = "claim_index"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"}

    chain_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    contract_address: Mapped[str] = mapped_column(AddressChar, primary_key=True)
    agreement_id: Mapped[Decimal] = mapped_column(WeiDecimal, primary_key=True)
    claim_id: Mapped[Decimal] = mapped_column(WeiDecimal, primary_key=True)
    claim_type: Mapped[str] = mapped_column(String(16), nullable=False)
    liable_tenant: Mapped[str | None] = mapped_column(AddressChar, nullable=True)
    amount_wei: Mapped[Decimal] = mapped_column(WeiDecimal, nullable=False)
    reason_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False)
    evidence_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False)
    yes_votes: Mapped[int] = mapped_column(SMALLINT(unsigned=True), nullable=False)
    no_votes: Mapped[int] = mapped_column(SMALLINT(unsigned=True), nullable=False)
    # PENDING, APPROVED, REJECTED, WITHDRAWN — reconciled cache of contract state.
    status_cache: Mapped[str] = mapped_column(String(16), nullable=False)
    submitted_tx_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False)
    submitted_block: Mapped[int] = mapped_column(UnsignedBigInt, nullable=False)
    resolved_tx_hash: Mapped[str | None] = mapped_column(Hash66Char, nullable=True)
    resolved_block: Mapped[int | None] = mapped_column(UnsignedBigInt, nullable=True)
    last_synced_block: Mapped[int] = mapped_column(UnsignedBigInt, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
