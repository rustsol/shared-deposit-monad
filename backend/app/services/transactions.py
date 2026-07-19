"""Transaction persistence and receipt verification.

This is NOT an indexer: nothing here scans block ranges or discovers
transactions. The only chain lookups are by a transaction hash the
application already holds (plus one direct agreement read after a success),
so the work per transaction is constant.

Trust rules:
- A wallet-returned hash proves nothing; a row starts as SUBMITTED.
- Success states come exclusively from a fetched receipt.
- A recorded transaction must actually belong to the authenticated wallet
  and target the verified contract with the claimed function/agreement -
  any contradiction is STATE_MISMATCH, never silently accepted.
- After a successful receipt the agreement cache is refreshed from a DIRECT
  contract read (the submitted function alone never determines status:
  acceptAsRecipient, for example, may also activate the agreement).
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.blockchain.events import EventDecoder, decode_function_input, decode_receipt_events
from app.config import Settings
from app.models import AgreementIndex, ContractTransaction
from app.models.transactions import (
    TERMINAL_STATUSES,
    TX_STATUS_BROADCAST_CONFIRMED,
    TX_STATUS_MINED_REVERTED,
    TX_STATUS_MINED_SUCCESS,
    TX_STATUS_NOT_FOUND,
    TX_STATUS_PENDING,
    TX_STATUS_STATE_MISMATCH,
    TX_STATUS_SUBMITTED,
    TX_STATUS_VERIFIED,
)

# Every write the contract exposes today plus the planned claim/settlement
# actions - the exact ABI function names, so one service covers them all.
ALLOWED_FUNCTIONS = {
    "createAgreement",
    "acceptAsTenant",
    "acceptAsRecipient",
    "deposit",
    "withdrawFundingBeforeActivation",
    "cancelExpiredFunding",
    "withdrawCancelledFunding",
    "submitClaim",
    "voteClaim",
    "withdrawPendingClaim",
    "finalizePendingClaim",
    "finalizeAgreement",
    "withdrawTenantRefund",
    "withdrawRecipientPayout",
}


class TxChainReader(Protocol):
    """Hash-addressed, read-only chain surface (satisfied by ChainService)."""

    def get_transaction_facts(self, tx_hash: str) -> dict[str, Any] | None: ...

    def get_receipt_facts(self, tx_hash: str) -> dict[str, Any] | None: ...

    def get_block_header(self, block_number: int) -> dict[str, Any]: ...

    def read_agreement(self, agreement_id: int) -> dict[str, Any]: ...


class TxError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class TxSubmission:
    chain_id: int
    contract_address: str
    tx_hash: str
    function_name: str
    agreement_id: int | None
    claim_id: int | None
    value_wei: str


_decoder: EventDecoder | None = None


def _event_decoder() -> EventDecoder:
    global _decoder
    if _decoder is None:
        _decoder = EventDecoder()
    return _decoder


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def record_submitted(
    db: Session,
    settings: Settings,
    verified_contract: str,
    wallet: str,
    submission: TxSubmission,
) -> ContractTransaction:
    """Persists a wallet-returned hash as SUBMITTED (idempotently). The
    caller commits."""
    if submission.chain_id != settings.chain_id:
        raise TxError(409, f"transactions must target chain {settings.chain_id}")
    if submission.contract_address.lower() != verified_contract.lower():
        raise TxError(409, "transactions must target the verified escrow contract")
    if submission.function_name not in ALLOWED_FUNCTIONS:
        raise TxError(422, "unknown contract function")
    if submission.function_name != "createAgreement" and submission.agreement_id is None:
        raise TxError(422, "agreement_id is required for this function")
    tx_hash = submission.tx_hash.lower()
    if len(tx_hash) != 66 or not tx_hash.startswith("0x"):
        raise TxError(422, "malformed transaction hash")

    existing = (
        db.query(ContractTransaction)
        .filter(
            ContractTransaction.chain_id == submission.chain_id,
            ContractTransaction.tx_hash == tx_hash,
        )
        .one_or_none()
    )
    if existing is not None:
        if existing.wallet_address != wallet:
            # Never let one user attach another wallet's transaction.
            raise TxError(409, "this transaction is registered to another wallet")
        return existing

    now = _utcnow()
    row = ContractTransaction(
        chain_id=submission.chain_id,
        contract_address=verified_contract.lower(),
        agreement_id=(
            Decimal(submission.agreement_id) if submission.agreement_id is not None else None
        ),
        claim_id=Decimal(submission.claim_id) if submission.claim_id is not None else None,
        wallet_address=wallet,
        function_name=submission.function_name,
        tx_hash=tx_hash,
        value_wei=Decimal(submission.value_wei),
        status=TX_STATUS_SUBMITTED,
        submitted_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    return row


def _mismatch(row: ContractTransaction, reason: str) -> None:
    row.status = TX_STATUS_STATE_MISMATCH
    row.decoded_error = reason
    row.updated_at = _utcnow()


def _validate_transaction_facts(row: ContractTransaction, tx: dict[str, Any]) -> bool:
    """The observed transaction must match the stored record exactly."""
    if str(tx.get("from", "")).lower() != row.wallet_address:
        _mismatch(row, "onchain sender does not match the recording wallet")
        return False
    if str(tx.get("to") or "").lower() != row.contract_address:
        _mismatch(row, "transaction does not target the verified escrow contract")
        return False
    call = decode_function_input(str(tx.get("input", "0x")))
    if call is None or call.function_name != row.function_name:
        _mismatch(row, "transaction input does not match the recorded function")
        return False
    if row.agreement_id is not None and call.agreement_id != int(row.agreement_id):
        _mismatch(row, "transaction input does not match the recorded agreement")
        return False
    if str(tx.get("value", "0")) != str(int(row.value_wei)):
        _mismatch(row, "transaction value does not match the recorded amount")
        return False
    return True


def verify_transaction(
    db: Session,
    settings: Settings,
    chain: TxChainReader,
    row: ContractTransaction,
) -> ContractTransaction:
    """One verification pass: transaction by hash, receipt by hash, then a
    direct agreement read. Never fabricates success; the caller commits."""
    if row.status in TERMINAL_STATUSES:
        return row
    now = _utcnow()

    tx = chain.get_transaction_facts(row.tx_hash)
    if tx is None:
        age = (now - row.submitted_at).total_seconds()
        if age > settings.tx_not_found_seconds:
            row.status = TX_STATUS_NOT_FOUND
            row.decoded_error = (
                "transaction was never observed on the network within "
                f"{settings.tx_not_found_seconds}s"
            )
        row.updated_at = now
        return row

    if row.first_observed_at is None:
        row.first_observed_at = now
    if not _validate_transaction_facts(row, tx):
        return row

    if tx.get("blockNumber") is None:
        row.status = TX_STATUS_BROADCAST_CONFIRMED
        row.updated_at = now
        return row

    receipt = chain.get_receipt_facts(row.tx_hash)
    if receipt is None:
        row.status = TX_STATUS_PENDING
        row.updated_at = now
        return row

    row.block_number = int(receipt["blockNumber"])
    row.block_hash = str(receipt["blockHash"]).lower()
    row.receipt_status = int(receipt["status"])
    header = chain.get_block_header(int(receipt["blockNumber"]))
    row.mined_at = datetime.fromtimestamp(int(header["timestamp"]), tz=UTC).replace(tzinfo=None)

    if int(receipt["status"]) != 1:
        row.status = TX_STATUS_MINED_REVERTED
        row.decoded_error = row.decoded_error or "transaction reverted onchain"
        row.updated_at = now
        return row

    decoded = decode_receipt_events(
        _event_decoder(), list(receipt.get("logs", [])), row.contract_address
    )
    row.decoded_events_json = decoded
    row.status = TX_STATUS_MINED_SUCCESS

    # createAgreement learns its agreement id from its own receipt event.
    if row.agreement_id is None:
        for event in decoded:
            agreement_id = event["payload"].get("agreementId")
            if event["event_name"] == "AgreementCreated" and agreement_id is not None:
                row.agreement_id = Decimal(str(agreement_id))
                break

    if row.agreement_id is not None:
        try:
            refresh_agreement_cache(
                db,
                settings,
                chain,
                row.contract_address,
                int(row.agreement_id),
                synced_block=int(receipt["blockNumber"]),
            )
            row.status = TX_STATUS_VERIFIED
        except Exception:  # noqa: BLE001, S110 - RPC hiccup: stay MINED_SUCCESS, retry later
            pass
    row.updated_at = now
    return row


def register_known_transaction(
    db: Session,
    settings: Settings,
    chain: TxChainReader,
    verified_contract: str,
    tx_hash: str,
) -> ContractTransaction:
    """Operator path for KNOWN transaction hashes (e.g. the audited
    agreement #2 history): the wallet is taken from the onchain sender -
    never guessed - and the row goes through the exact same verification as
    a user-recorded transaction. Idempotent per (chain, hash); the caller
    commits."""
    tx_hash = tx_hash.lower()
    existing = (
        db.query(ContractTransaction)
        .filter(
            ContractTransaction.chain_id == settings.chain_id,
            ContractTransaction.tx_hash == tx_hash,
        )
        .one_or_none()
    )
    if existing is not None:
        return verify_transaction(db, settings, chain, existing)

    facts = chain.get_transaction_facts(tx_hash)
    if facts is None:
        raise TxError(404, f"transaction {tx_hash} is not known to the network")
    if str(facts.get("to") or "").lower() != verified_contract.lower():
        raise TxError(409, f"transaction {tx_hash} does not target the verified contract")
    call = decode_function_input(str(facts.get("input", "0x")))
    if call is None or call.function_name not in ALLOWED_FUNCTIONS:
        raise TxError(422, f"transaction {tx_hash} is not a recognized contract call")

    now = _utcnow()
    row = ContractTransaction(
        chain_id=settings.chain_id,
        contract_address=verified_contract.lower(),
        agreement_id=Decimal(call.agreement_id) if call.agreement_id is not None else None,
        claim_id=Decimal(call.claim_id) if call.claim_id is not None else None,
        wallet_address=str(facts["from"]).lower(),
        function_name=call.function_name,
        tx_hash=tx_hash,
        value_wei=Decimal(str(facts.get("value", "0"))),
        status=TX_STATUS_SUBMITTED,
        submitted_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return verify_transaction(db, settings, chain, row)


def refresh_agreement_cache(
    db: Session,
    settings: Settings,
    chain: TxChainReader,
    contract_address: str,
    agreement_id: int,
    synced_block: int | None = None,
) -> dict[str, Any]:
    """Refreshes agreement_index.status_cache from a DIRECT contract read.
    Returns the full onchain snapshot. The caller commits."""
    onchain = chain.read_agreement(agreement_id)
    key = (settings.chain_id, contract_address.lower(), Decimal(agreement_id))
    row = db.get(AgreementIndex, key)
    if row is not None:
        row.status_cache = str(onchain["statusName"])
        if synced_block is not None:
            row.last_synced_block = max(int(row.last_synced_block), synced_block)
        row.updated_at = _utcnow()
    return onchain
