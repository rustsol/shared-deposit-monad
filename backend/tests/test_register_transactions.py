"""Agreement #2 backfill: registering the eight known, receipt-verified
transactions produces a complete VERIFIED timeline and an ACTIVE cache.

Runs entirely on the captured real fixture - no live RPC. The same
`register_known_transaction` path is what the operator CLI executes against
Monad Testnet.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models import ContractTransaction
from app.services.transactions import TxError, register_known_transaction
from tests.conftest import make_test_settings
from tests.test_transactions import (
    CONTRACT,
    FIXTURE_PATH,
    FakeTxChain,
    seed_index,
)

EXPECTED_SEQUENCE = [
    ("createAgreement", "0x7ab3adf1c8fc4746333e104b6a793f6782d7ba23"),
    ("acceptAsTenant", "0x7ab3adf1c8fc4746333e104b6a793f6782d7ba23"),
    ("deposit", "0x7ab3adf1c8fc4746333e104b6a793f6782d7ba23"),
    ("acceptAsTenant", "0x1428b64596f79f387ed67af63075107d556cd792"),
    ("deposit", "0x1428b64596f79f387ed67af63075107d556cd792"),
    ("acceptAsTenant", "0xefd303ec5965d17613dbfb7e684f1dfbbb7a2a6c"),
    ("deposit", "0xefd303ec5965d17613dbfb7e684f1dfbbb7a2a6c"),
    ("acceptAsRecipient", "0x2e35125f5d6552281e663254083bd2b6713977df"),
]


def fixture_hashes() -> list[str]:
    with open(FIXTURE_PATH, encoding="utf-8") as handle:
        fixture: dict[str, Any] = json.load(handle)
    return sorted(
        fixture.keys(),
        key=lambda h: int(str(fixture[h]["receipt"]["blockNumber"]), 16),
    )


def test_agreement2_backfill_reaches_active_cache(db_session: Session) -> None:
    settings = make_test_settings()
    chain = FakeTxChain()
    index = seed_index(db_session, status="FUNDING")

    for tx_hash in fixture_hashes():
        row = register_known_transaction(db_session, settings, chain, CONTRACT, tx_hash)
        assert row.status == "VERIFIED", f"{tx_hash} ended {row.status}"
        assert row.receipt_status == 1

    rows = (
        db_session.query(ContractTransaction)
        .filter(ContractTransaction.agreement_id == Decimal(2))
        .order_by(ContractTransaction.block_number, ContractTransaction.tx_hash)
        .all()
    )
    assert [(r.function_name, r.wallet_address) for r in rows] == EXPECTED_SEQUENCE
    # Deposits carry the exact deposited value.
    deposits = [r for r in rows if r.function_name == "deposit"]
    assert all(str(int(r.value_wei)) == "500000000000000000" for r in deposits)
    # The wallet is always the true onchain sender - never an operator guess.
    assert all(r.decoded_events_json for r in rows)
    # The cache followed the DIRECT contract read to ACTIVE.
    assert index.status_cache == "ACTIVE"


def test_backfill_is_idempotent(db_session: Session) -> None:
    settings = make_test_settings()
    chain = FakeTxChain()
    seed_index(db_session, status="FUNDING")
    hashes = fixture_hashes()
    for tx_hash in hashes + hashes:  # register everything twice
        register_known_transaction(db_session, settings, chain, CONTRACT, tx_hash)
    count = db_session.query(ContractTransaction).count()
    assert count == len(hashes)


def test_register_rejects_foreign_and_unknown_hashes(db_session: Session) -> None:
    settings = make_test_settings()
    chain = FakeTxChain()
    unknown = "0x" + "99" * 32
    with pytest.raises(TxError):
        register_known_transaction(db_session, settings, chain, CONTRACT, unknown)

    # A real transaction that targets a different contract must be refused.
    other_contract = "0x" + "12" * 20
    with pytest.raises(TxError):
        register_known_transaction(db_session, settings, chain, other_contract, fixture_hashes()[0])
    assert db_session.query(ContractTransaction).count() == 0
