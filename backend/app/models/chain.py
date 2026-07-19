"""chain_events and chain_sync_state - the finalized-event cache foundation.

Rows in chain_events exist only for events observed in FINALIZED blocks
(docs/02 §7.2): the worker (a later phase) never writes speculative rows, so
the presence of a row asserts a finalized onchain event, nothing more. The
unique event identity (chain, contract, tx, log index) makes reprocessing
idempotent. chain_sync_state stores one checkpoint per chain and contract,
advanced only after event rows commit.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import JSON, BigInteger, String, UniqueConstraint
from sqlalchemy.dialects.mysql import INTEGER
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.types import (
    AddressChar,
    Hash66Char,
    UnsignedBigInt,
    UtcDateTime,
    WeiDecimal,
)


class ChainEvent(Base):
    __tablename__ = "chain_events"
    __table_args__ = (
        # Exact event identity - duplicate reprocessing cannot create rows.
        UniqueConstraint("chain_id", "contract_address", "tx_hash", "log_index"),
        {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    chain_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    contract_address: Mapped[str] = mapped_column(AddressChar, nullable=False)
    tx_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False)
    log_index: Mapped[int] = mapped_column(INTEGER(unsigned=True), nullable=False)
    block_number: Mapped[int] = mapped_column(UnsignedBigInt, nullable=False, index=True)
    # Finality audit: the finalized block hash observed when indexing.
    block_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False)
    event_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    agreement_id: Mapped[Decimal | None] = mapped_column(WeiDecimal, nullable=True, index=True)
    claim_id: Mapped[Decimal | None] = mapped_column(WeiDecimal, nullable=True, index=True)
    # Decoded event values; wei values stored as strings inside the JSON.
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    block_timestamp: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)


class ChainSyncState(Base):
    __tablename__ = "chain_sync_state"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"}

    chain_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    contract_address: Mapped[str] = mapped_column(AddressChar, primary_key=True)
    # Last finalized block whose events are fully committed. The worker (later
    # phase) advances this only after the event rows commit in the same
    # transaction boundary.
    last_finalized_block: Mapped[int] = mapped_column(UnsignedBigInt, nullable=False)
    last_synced_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
