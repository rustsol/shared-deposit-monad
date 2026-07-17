"""Transaction persistence + receipt verification tests.

The fixture is the REAL captured public data of agreement #2's eight
transactions (transactions, receipts with logs, block timestamps), so the
verifier is exercised against the exact bytes production sees. No test here
ever contacts Monad Testnet, and the fake chain records every call it
receives so we can prove no block-range scanning occurs.
"""

from __future__ import annotations

import json
import os
from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models import AgreementIndex, ContractTransaction
from app.services.transactions import (
    TxError,
    TxSubmission,
    record_submitted,
    refresh_agreement_cache,
    verify_transaction,
)
from tests.conftest import make_test_settings

FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__), "fixtures", "agreement2_transactions.json"
)

CHAIN_ID = 10143
CONTRACT = "0x5720c3f77c66527b59f9f63cd3631a3019400910"

TX_CREATE = "0xf54617005559c16d9b60056bb21a47e2260b2a9f495918f39be053b63ad10ae7"
TX_ACCEPT_CREATOR = "0xa89a17324c61561511d56f1b77f8846c6bd2c8d2018686460f77582d0adb4664"
TX_DEPOSIT_CREATOR = "0x672046f685ad2031d557da57ff49e7642d267e4c24c5f8aafdaa77b5579d5936"
TX_ACCEPT_RECIPIENT = "0xb2e8f1d88361b5f4e4eb7b6a5026373bb71503dfa1b4a78eb419c6d986c2d7f2"

CREATOR = "0x7ab3adf1c8fc4746333e104b6a793f6782d7ba23"
RECIPIENT = "0x2e35125f5d6552281e663254083bd2b6713977df"

ACTIVE_AGREEMENT = {
    "creator": CREATOR,
    "recipient": RECIPIENT,
    "termsHash": "0x50538023c20451ae06c8a87ba1b193aa1e46fded2effba313287a51095a7b995",
    "totalRequired": "1500000000000000000",
    "totalFunded": "1500000000000000000",
    "status": 2,
    "statusName": "ACTIVE",
}


def _hex_int(value: Any) -> int:
    return int(str(value), 16)


class FakeTxChain:
    """Hash-addressed fake over the captured fixture. It deliberately has no
    get_logs / block-range surface at all."""

    def __init__(self) -> None:
        with open(FIXTURE_PATH, encoding="utf-8") as handle:
            self.fixture: dict[str, Any] = json.load(handle)
        self.agreement: dict[str, Any] = dict(ACTIVE_AGREEMENT)
        self.unknown_hashes: set[str] = set()
        self.unmined_hashes: set[str] = set()
        self.receiptless_hashes: set[str] = set()
        self.forced_receipt_status: dict[str, int] = {}
        self.read_agreement_error: Exception | None = None
        self.calls: list[str] = []

    def get_transaction_facts(self, tx_hash: str) -> dict[str, Any] | None:
        self.calls.append("get_transaction_facts")
        entry = self.fixture.get(tx_hash)
        if entry is None or tx_hash in self.unknown_hashes:
            return None
        tx = entry["transaction"]
        unmined = tx_hash in self.unmined_hashes
        return {
            "hash": tx["hash"],
            "from": str(tx["from"]).lower(),
            "to": str(tx["to"]).lower(),
            "input": tx["input"],
            "value": str(_hex_int(tx["value"])),
            "nonce": _hex_int(tx["nonce"]),
            "blockNumber": None if unmined else _hex_int(tx["blockNumber"]),
        }

    def get_receipt_facts(self, tx_hash: str) -> dict[str, Any] | None:
        self.calls.append("get_receipt_facts")
        entry = self.fixture.get(tx_hash)
        if entry is None or tx_hash in self.receiptless_hashes:
            return None
        receipt = entry["receipt"]
        return {
            "status": self.forced_receipt_status.get(tx_hash, _hex_int(receipt["status"])),
            "blockNumber": _hex_int(receipt["blockNumber"]),
            "blockHash": receipt["blockHash"],
            "to": str(receipt["to"]).lower(),
            "from": str(receipt["from"]).lower(),
            "logs": list(receipt["logs"]),
        }

    def get_block_header(self, block_number: int) -> dict[str, Any]:
        self.calls.append("get_block_header")
        for entry in self.fixture.values():
            if _hex_int(entry["receipt"]["blockNumber"]) == block_number:
                return {
                    "hash": entry["receipt"]["blockHash"],
                    "timestamp": _hex_int(entry["blockTimestamp"]),
                }
        return {"hash": f"0x{block_number:064x}", "timestamp": 1_752_000_000}

    def read_agreement(self, agreement_id: int) -> dict[str, Any]:
        self.calls.append("read_agreement")
        if self.read_agreement_error is not None:
            raise self.read_agreement_error
        assert agreement_id == 2
        return dict(self.agreement)


@pytest.fixture
def chain() -> FakeTxChain:
    return FakeTxChain()


@pytest.fixture
def settings() -> Any:
    return make_test_settings()


def submission(
    tx_hash: str,
    function_name: str,
    agreement_id: int | None = 2,
    value_wei: str = "0",
) -> TxSubmission:
    return TxSubmission(
        chain_id=CHAIN_ID,
        contract_address=CONTRACT,
        tx_hash=tx_hash,
        function_name=function_name,
        agreement_id=agreement_id,
        claim_id=None,
        value_wei=value_wei,
    )


def seed_index(db: Session, status: str = "FUNDING") -> AgreementIndex:
    from datetime import UTC, datetime

    now = datetime.now(UTC).replace(tzinfo=None)
    row = AgreementIndex(
        chain_id=CHAIN_ID,
        contract_address=CONTRACT,
        agreement_id=Decimal(2),
        creator_address=CREATOR,
        recipient_address=RECIPIENT,
        terms_hash=str(ACTIVE_AGREEMENT["termsHash"]),
        status_cache=status,
        last_synced_block=45074511,
        created_tx_hash=TX_CREATE,
        created_at_chain=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row


# ------------------------------------------------------------- recording


def test_wallet_hash_is_saved_as_submitted_not_success(
    db_session: Session, settings: Any, chain: FakeTxChain
) -> None:
    chain.unknown_hashes.add(TX_ACCEPT_CREATOR)
    row = record_submitted(
        db_session, settings, CONTRACT, CREATOR, submission(TX_ACCEPT_CREATOR, "acceptAsTenant")
    )
    db_session.flush()
    verify_transaction(db_session, settings, chain, row)
    # A wallet-returned hash alone never counts as success.
    assert row.status == "SUBMITTED"
    assert row.receipt_status is None


def test_duplicate_hash_is_idempotent_for_same_wallet(
    db_session: Session, settings: Any, chain: FakeTxChain
) -> None:
    first = record_submitted(
        db_session, settings, CONTRACT, CREATOR, submission(TX_ACCEPT_CREATOR, "acceptAsTenant")
    )
    db_session.flush()
    second = record_submitted(
        db_session, settings, CONTRACT, CREATOR, submission(TX_ACCEPT_CREATOR, "acceptAsTenant")
    )
    assert second is first
    count = (
        db_session.query(ContractTransaction)
        .filter(ContractTransaction.tx_hash == TX_ACCEPT_CREATOR)
        .count()
    )
    assert count == 1


def test_duplicate_hash_from_other_wallet_is_rejected(
    db_session: Session, settings: Any
) -> None:
    record_submitted(
        db_session, settings, CONTRACT, CREATOR, submission(TX_ACCEPT_CREATOR, "acceptAsTenant")
    )
    db_session.flush()
    with pytest.raises(TxError) as error:
        record_submitted(
            db_session,
            settings,
            CONTRACT,
            RECIPIENT,
            submission(TX_ACCEPT_CREATOR, "acceptAsTenant"),
        )
    assert error.value.status_code == 409


def test_wrong_chain_contract_and_function_are_rejected(
    db_session: Session, settings: Any
) -> None:
    bad_chain = TxSubmission(
        chain_id=1,
        contract_address=CONTRACT,
        tx_hash=TX_ACCEPT_CREATOR,
        function_name="acceptAsTenant",
        agreement_id=2,
        claim_id=None,
        value_wei="0",
    )
    with pytest.raises(TxError):
        record_submitted(db_session, settings, CONTRACT, CREATOR, bad_chain)
    with pytest.raises(TxError):
        record_submitted(
            db_session,
            settings,
            CONTRACT,
            CREATOR,
            TxSubmission(
                chain_id=CHAIN_ID,
                contract_address="0x" + "12" * 20,
                tx_hash=TX_ACCEPT_CREATOR,
                function_name="acceptAsTenant",
                agreement_id=2,
                claim_id=None,
                value_wei="0",
            ),
        )
    with pytest.raises(TxError):
        record_submitted(
            db_session, settings, CONTRACT, CREATOR, submission(TX_ACCEPT_CREATOR, "mintTokens")
        )


# ------------------------------------------------------------- verification


def test_mined_success_verifies_and_refreshes_cache(
    db_session: Session, settings: Any, chain: FakeTxChain
) -> None:
    index = seed_index(db_session, status="FUNDING")
    chain.agreement = dict(ACTIVE_AGREEMENT)
    row = record_submitted(
        db_session, settings, CONTRACT, CREATOR, submission(TX_ACCEPT_CREATOR, "acceptAsTenant")
    )
    db_session.flush()
    verify_transaction(db_session, settings, chain, row)

    assert row.status == "VERIFIED"
    assert row.receipt_status == 1
    assert row.block_number == 45074554
    assert row.mined_at is not None
    assert row.first_observed_at is not None
    events = row.decoded_events_json or []
    assert [e["event_name"] for e in events] == ["TenantAccepted"]
    assert events[0]["payload"]["tenant"] == CREATOR
    # Cache refreshed from the DIRECT read, not from the function name.
    assert index.status_cache == "ACTIVE"


def test_recipient_acceptance_activates_cache_via_direct_read(
    db_session: Session, settings: Any, chain: FakeTxChain
) -> None:
    """acceptAsRecipient also activated the agreement — the cache must come
    from the direct read (ACTIVE), never from the submitted function alone."""
    index = seed_index(db_session, status="FUNDING")
    row = record_submitted(
        db_session,
        settings,
        CONTRACT,
        RECIPIENT,
        submission(TX_ACCEPT_RECIPIENT, "acceptAsRecipient"),
    )
    db_session.flush()
    verify_transaction(db_session, settings, chain, row)

    assert row.status == "VERIFIED"
    names = [e["event_name"] for e in (row.decoded_events_json or [])]
    assert names == ["RecipientAccepted", "AgreementActivated"]
    assert index.status_cache == "ACTIVE"


def test_create_agreement_learns_its_id_from_the_receipt(
    db_session: Session, settings: Any, chain: FakeTxChain
) -> None:
    row = record_submitted(
        db_session,
        settings,
        CONTRACT,
        CREATOR,
        submission(TX_CREATE, "createAgreement", agreement_id=None),
    )
    db_session.flush()
    verify_transaction(db_session, settings, chain, row)
    assert row.agreement_id is not None and int(row.agreement_id) == 2
    assert row.status in {"VERIFIED", "MINED_SUCCESS"}


def test_pending_and_broadcast_states(
    db_session: Session, settings: Any, chain: FakeTxChain
) -> None:
    chain.unmined_hashes.add(TX_DEPOSIT_CREATOR)
    row = record_submitted(
        db_session,
        settings,
        CONTRACT,
        CREATOR,
        submission(TX_DEPOSIT_CREATOR, "deposit", value_wei="500000000000000000"),
    )
    db_session.flush()
    verify_transaction(db_session, settings, chain, row)
    assert row.status == "BROADCAST_CONFIRMED"

    chain.unmined_hashes.clear()
    chain.receiptless_hashes.add(TX_DEPOSIT_CREATOR)
    verify_transaction(db_session, settings, chain, row)
    assert row.status == "PENDING"

    chain.receiptless_hashes.clear()
    seed_index(db_session)
    verify_transaction(db_session, settings, chain, row)
    assert row.status == "VERIFIED"
    events = row.decoded_events_json or []
    assert events[0]["event_name"] == "DepositAdded"
    assert events[0]["payload"]["amount"] == "500000000000000000"


def test_mined_revert_is_terminal_and_never_verified(
    db_session: Session, settings: Any, chain: FakeTxChain
) -> None:
    chain.forced_receipt_status[TX_ACCEPT_CREATOR] = 0
    row = record_submitted(
        db_session, settings, CONTRACT, CREATOR, submission(TX_ACCEPT_CREATOR, "acceptAsTenant")
    )
    db_session.flush()
    verify_transaction(db_session, settings, chain, row)
    assert row.status == "MINED_REVERTED"
    assert row.receipt_status == 0
    # Re-verification never resurrects a reverted transaction.
    chain.forced_receipt_status.clear()
    verify_transaction(db_session, settings, chain, row)
    assert row.status == "MINED_REVERTED"


def test_not_found_after_window(db_session: Session, settings: Any, chain: FakeTxChain) -> None:
    chain.unknown_hashes.add(TX_ACCEPT_CREATOR)
    row = record_submitted(
        db_session, settings, CONTRACT, CREATOR, submission(TX_ACCEPT_CREATOR, "acceptAsTenant")
    )
    db_session.flush()
    verify_transaction(db_session, settings, chain, row)
    assert row.status == "SUBMITTED"  # still within the propagation window

    row.submitted_at = row.submitted_at - timedelta(seconds=settings.tx_not_found_seconds + 5)
    verify_transaction(db_session, settings, chain, row)
    assert row.status == "NOT_FOUND"
    assert row.decoded_error is not None


def test_foreign_senders_transaction_is_flagged_not_attached(
    db_session: Session, settings: Any, chain: FakeTxChain
) -> None:
    """A user recording someone else's transaction hash can never claim it:
    verification compares the onchain sender to the recording wallet."""
    row = record_submitted(
        db_session,
        settings,
        CONTRACT,
        RECIPIENT,  # recipient tries to claim the creator's transaction
        submission(TX_ACCEPT_CREATOR, "acceptAsTenant"),
    )
    db_session.flush()
    verify_transaction(db_session, settings, chain, row)
    assert row.status == "STATE_MISMATCH"
    assert "sender" in (row.decoded_error or "")


def test_metadata_mismatches_are_flagged(
    db_session: Session, settings: Any, chain: FakeTxChain
) -> None:
    # Wrong function name for the real calldata.
    row = record_submitted(
        db_session, settings, CONTRACT, CREATOR, submission(TX_ACCEPT_CREATOR, "deposit")
    )
    db_session.flush()
    verify_transaction(db_session, settings, chain, row)
    assert row.status == "STATE_MISMATCH"

    # Wrong agreement id for the real calldata.
    row2 = record_submitted(
        db_session,
        settings,
        CONTRACT,
        CREATOR,
        submission(TX_DEPOSIT_CREATOR, "deposit", agreement_id=3, value_wei="500000000000000000"),
    )
    db_session.flush()
    verify_transaction(db_session, settings, chain, row2)
    assert row2.status == "STATE_MISMATCH"

    # Wrong value for the real calldata.
    row3 = record_submitted(
        db_session,
        settings,
        CONTRACT,
        CREATOR,
        submission(TX_ACCEPT_RECIPIENT, "acceptAsRecipient", value_wei="1"),
    )
    db_session.flush()
    # (sender also differs here, which is flagged first — record the creator's
    # own deposit with a wrong value to isolate the value check)
    row3.wallet_address = RECIPIENT
    verify_transaction(db_session, settings, chain, row3)
    assert row3.status == "STATE_MISMATCH"


def test_stale_cache_refresh_uses_direct_read(
    db_session: Session, settings: Any, chain: FakeTxChain
) -> None:
    index = seed_index(db_session, status="FUNDING")
    onchain = refresh_agreement_cache(db_session, settings, chain, CONTRACT, 2)
    assert onchain["statusName"] == "ACTIVE"
    assert index.status_cache == "ACTIVE"


def test_verification_makes_no_range_queries(
    db_session: Session, settings: Any, chain: FakeTxChain
) -> None:
    """The whole flow is hash-addressed: the fake chain exposes no get_logs
    surface and records every call — nothing may scan block ranges."""
    seed_index(db_session)
    row = record_submitted(
        db_session, settings, CONTRACT, CREATOR, submission(TX_ACCEPT_CREATOR, "acceptAsTenant")
    )
    db_session.flush()
    verify_transaction(db_session, settings, chain, row)
    assert not hasattr(chain, "get_logs")
    assert set(chain.calls) <= {
        "get_transaction_facts",
        "get_receipt_facts",
        "get_block_header",
        "read_agreement",
    }
