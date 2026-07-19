"""contract_transactions - every application-originated contract write.

A row is created the moment the wallet returns a transaction hash and is the
durable record of that action (frontend sessionStorage is only a temporary
recovery backup). A row NEVER claims success on its own: success states are
set exclusively from a fetched receipt, and VERIFIED additionally requires
the decoded transaction to match the stored metadata and the agreement cache
to have been refreshed from a direct contract read.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import JSON, BigInteger, SmallInteger, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.types import (
    AddressChar,
    Hash66Char,
    UnsignedBigInt,
    UtcDateTime,
    WeiDecimal,
)

# Lifecycle: SUBMITTED -> BROADCAST_CONFIRMED -> PENDING -> MINED_SUCCESS ->
# VERIFIED, with MINED_REVERTED / NOT_FOUND / STATE_MISMATCH as the honest
# failure terminals.
TX_STATUS_SUBMITTED = "SUBMITTED"  # wallet returned a hash; not yet seen via RPC
TX_STATUS_BROADCAST_CONFIRMED = "BROADCAST_CONFIRMED"  # RPC knows the tx; unmined
TX_STATUS_PENDING = "PENDING"  # in a block per the node, receipt not yet readable
TX_STATUS_MINED_SUCCESS = "MINED_SUCCESS"  # receipt status 1
TX_STATUS_MINED_REVERTED = "MINED_REVERTED"  # receipt status 0 (terminal)
TX_STATUS_NOT_FOUND = "NOT_FOUND"  # never observed within the retry window
TX_STATUS_VERIFIED = "VERIFIED"  # receipt success + metadata match + cache refreshed
TX_STATUS_STATE_MISMATCH = "STATE_MISMATCH"  # onchain facts contradict the record

TERMINAL_STATUSES = {TX_STATUS_MINED_REVERTED, TX_STATUS_VERIFIED, TX_STATUS_STATE_MISMATCH}
UNRESOLVED_STATUSES = {
    TX_STATUS_SUBMITTED,
    TX_STATUS_BROADCAST_CONFIRMED,
    TX_STATUS_PENDING,
    TX_STATUS_MINED_SUCCESS,  # success seen, verification/cache refresh outstanding
}


class ContractTransaction(Base):
    __tablename__ = "contract_transactions"
    __table_args__ = (
        # One row per onchain transaction - recording is idempotent.
        UniqueConstraint("chain_id", "tx_hash"),
        {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    chain_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    contract_address: Mapped[str] = mapped_column(AddressChar, nullable=False)
    # NULL only for createAgreement before its receipt names the new id.
    agreement_id: Mapped[Decimal | None] = mapped_column(WeiDecimal, nullable=True, index=True)
    claim_id: Mapped[Decimal | None] = mapped_column(WeiDecimal, nullable=True)
    wallet_address: Mapped[str] = mapped_column(AddressChar, nullable=False, index=True)
    function_name: Mapped[str] = mapped_column(String(64), nullable=False)
    tx_hash: Mapped[str] = mapped_column(Hash66Char, nullable=False)
    value_wei: Mapped[Decimal] = mapped_column(WeiDecimal, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    submitted_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    first_observed_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    mined_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    block_number: Mapped[int | None] = mapped_column(UnsignedBigInt, nullable=True)
    block_hash: Mapped[str | None] = mapped_column(Hash66Char, nullable=True)
    # Raw receipt status (1 success / 0 reverted); NULL until a receipt exists.
    receipt_status: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    decoded_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Events decoded from THIS transaction's receipt only (real ABI decode).
    decoded_events_json: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
