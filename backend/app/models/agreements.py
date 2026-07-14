"""Agreement drafts (pre-chain, MySQL-authoritative) and the event-derived
agreement cache plus private metadata.

agreement_drafts / agreement_draft_tenants are authoritative ONLY until the
agreement exists onchain. agreement_index is a cache reconciled from finalized
chain events and direct contract reads — it can never mark an agreement
funded, active, finalized, or withdrawn on its own; `status_cache` is named
for exactly that reason. agreement_metadata holds private offchain labels.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    ForeignKey,
    ForeignKeyConstraint,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
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


class AgreementDraft(Base):
    __tablename__ = "agreement_drafts"
    __table_args__ = (
        UniqueConstraint("terms_hash"),
        {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"},
    )

    id: Mapped[str] = mapped_column(UuidChar, primary_key=True)
    creator_address: Mapped[str] = mapped_column(AddressChar, nullable=False, index=True)
    recipient_address: Mapped[str] = mapped_column(AddressChar, nullable=False)
    property_alias: Mapped[str] = mapped_column(String(160), nullable=False)
    # Private; plain text in the local MVP with access control (docs/02 §5.4).
    private_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    terms_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False)
    chain_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    contract_address: Mapped[str] = mapped_column(AddressChar, nullable=False)
    agreement_id_onchain: Mapped[Decimal | None] = mapped_column(WeiDecimal, nullable=True)
    creation_tx_hash: Mapped[str | None] = mapped_column(Hash66Char, nullable=True)
    creation_block_number: Mapped[int | None] = mapped_column(UnsignedBigInt, nullable=True)
    # DRAFT, TX_SUBMITTED, CONFIRMED, FAILED
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)


class AgreementDraftTenant(Base):
    __tablename__ = "agreement_draft_tenants"
    __table_args__ = (
        UniqueConstraint("draft_id", "wallet_address"),
        {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    draft_id: Mapped[str] = mapped_column(
        UuidChar,
        ForeignKey("agreement_drafts.id", ondelete="CASCADE"),
        nullable=False,
    )
    tenant_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    wallet_address: Mapped[str] = mapped_column(AddressChar, nullable=False)
    display_label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    required_amount_wei: Mapped[Decimal] = mapped_column(WeiDecimal, nullable=False)


class AgreementIndex(Base):
    """Event-derived cache only — never authoritative for financial state."""

    __tablename__ = "agreement_index"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"}

    chain_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    contract_address: Mapped[str] = mapped_column(AddressChar, primary_key=True)
    agreement_id: Mapped[Decimal] = mapped_column(WeiDecimal, primary_key=True)
    creator_address: Mapped[str] = mapped_column(AddressChar, nullable=False, index=True)
    recipient_address: Mapped[str] = mapped_column(AddressChar, nullable=False, index=True)
    terms_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False)
    # Cache of contract status, reconciled by the worker; direct reads win.
    status_cache: Mapped[str] = mapped_column(String(32), nullable=False)
    last_synced_block: Mapped[int] = mapped_column(UnsignedBigInt, nullable=False)
    created_tx_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False)
    created_at_chain: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)


class AgreementMetadata(Base):
    """Private offchain metadata for an onchain agreement."""

    __tablename__ = "agreement_metadata"
    __table_args__ = (
        ForeignKeyConstraint(
            ["chain_id", "contract_address", "agreement_id"],
            [
                "agreement_index.chain_id",
                "agreement_index.contract_address",
                "agreement_index.agreement_id",
            ],
        ),
        {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"},
    )

    chain_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    contract_address: Mapped[str] = mapped_column(AddressChar, primary_key=True)
    agreement_id: Mapped[Decimal] = mapped_column(WeiDecimal, primary_key=True)
    property_alias: Mapped[str] = mapped_column(String(160), nullable=False)
    private_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The exact accepted canonical object.
    terms_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    is_shareable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
