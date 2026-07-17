"""Transaction persistence API.

Every application-originated contract write is recorded here the moment the
wallet returns a hash, then verified by receipt and finished with a direct
contract-state refresh. Access rules: a transaction row belongs to the
authenticated wallet that recorded it; agreement-level listings are gated to
agreement participants; nothing here ever signs or broadcasts.

MVP limitation (documented in docs/BUILD_LOG.md and the agreement page):
transactions made OUTSIDE this application update current agreement state
through direct contract reads on page load, but they do not appear
automatically in the stored activity timeline.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.drafts import _participant_index
from app.auth.dependencies import require_csrf, require_session
from app.blockchain.deployment import load_deployment_metadata
from app.blockchain.service import get_chain_service
from app.config import get_settings
from app.database.session import get_db_session
from app.models import AuthSession, ContractTransaction
from app.models.transactions import UNRESOLVED_STATUSES
from app.services.audit import record_audit_event
from app.services.transactions import (
    TxChainReader,
    TxError,
    TxSubmission,
    record_submitted,
    refresh_agreement_cache,
    verify_transaction,
)

router = APIRouter(tags=["transactions"])


class TransactionRecordRequest(BaseModel):
    chain_id: int
    contract_address: str
    tx_hash: str = Field(min_length=66, max_length=66)
    function_name: str = Field(max_length=64)
    agreement_id: str | None = None
    claim_id: str | None = None
    value_wei: str = Field(default="0", max_length=40)


class TransactionRecord(BaseModel):
    chain_id: int
    contract_address: str
    tx_hash: str
    wallet_address: str
    function_name: str
    agreement_id: str | None
    claim_id: str | None
    value_wei: str
    status: str
    submitted_at: datetime
    first_observed_at: datetime | None
    mined_at: datetime | None
    block_number: int | None
    block_hash: str | None
    receipt_status: int | None
    decoded_error: str | None
    decoded_events: list[dict[str, Any]] | None
    explorer_tx_url: str


def _to_record(row: ContractTransaction) -> TransactionRecord:
    settings = get_settings()
    return TransactionRecord(
        chain_id=row.chain_id,
        contract_address=row.contract_address,
        tx_hash=row.tx_hash,
        wallet_address=row.wallet_address,
        function_name=row.function_name,
        agreement_id=str(int(row.agreement_id)) if row.agreement_id is not None else None,
        claim_id=str(int(row.claim_id)) if row.claim_id is not None else None,
        value_wei=str(int(row.value_wei)),
        status=row.status,
        submitted_at=row.submitted_at,
        first_observed_at=row.first_observed_at,
        mined_at=row.mined_at,
        block_number=int(row.block_number) if row.block_number is not None else None,
        block_hash=row.block_hash,
        receipt_status=row.receipt_status,
        decoded_error=row.decoded_error,
        decoded_events=row.decoded_events_json,
        explorer_tx_url=f"{settings.explorer_tx_base}{row.tx_hash}",
    )


def _chain() -> TxChainReader:
    return get_chain_service()


def _verified_contract() -> str:
    metadata = load_deployment_metadata()
    if metadata is None:
        raise HTTPException(409, "no verified contract deployment is configured")
    return metadata.contract_address.lower()


def _parse_optional_id(value: str | None, label: str) -> int | None:
    if value is None:
        return None
    try:
        parsed = int(value)
    except ValueError:
        raise HTTPException(422, f"{label} must be a decimal integer string") from None
    if parsed < 1:
        raise HTTPException(422, f"{label} must be positive")
    return parsed


@router.post("/transactions", response_model=TransactionRecord, status_code=201)
def record_transaction(
    body: TransactionRecordRequest,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> TransactionRecord:
    """Records a wallet-returned hash (idempotent per chain+hash) and runs
    one immediate verification attempt."""
    settings = get_settings()
    contract = _verified_contract()
    submission = TxSubmission(
        chain_id=body.chain_id,
        contract_address=body.contract_address,
        tx_hash=body.tx_hash,
        function_name=body.function_name,
        agreement_id=_parse_optional_id(body.agreement_id, "agreement_id"),
        claim_id=_parse_optional_id(body.claim_id, "claim_id"),
        value_wei=body.value_wei,
    )
    try:
        row = record_submitted(db, settings, contract, session.wallet_address, submission)
    except TxError as error:
        raise HTTPException(error.status_code, error.detail) from None
    db.flush()
    verify_transaction(db, settings, _chain(), row)
    record_audit_event(
        db,
        event_type="transaction.recorded",
        actor_wallet=session.wallet_address,
        target_type="transaction",
        target_id=row.tx_hash,
        metadata={"function": row.function_name, "status": row.status},
    )
    db.commit()
    return _to_record(row)


def _owned_row(db: Session, chain_id: int, tx_hash: str, wallet: str) -> ContractTransaction:
    row = (
        db.query(ContractTransaction)
        .filter(
            ContractTransaction.chain_id == chain_id,
            ContractTransaction.tx_hash == tx_hash.lower(),
        )
        .one_or_none()
    )
    if row is None or row.wallet_address != wallet:
        raise HTTPException(404, "transaction not found")
    return row


@router.get("/transactions", response_model=list[TransactionRecord])
def list_my_transactions(
    unresolved: bool = Query(default=False),
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_db_session),
) -> list[TransactionRecord]:
    """The session wallet's recorded transactions (reload recovery source)."""
    query = db.query(ContractTransaction).filter(
        ContractTransaction.wallet_address == session.wallet_address
    )
    if unresolved:
        query = query.filter(ContractTransaction.status.in_(sorted(UNRESOLVED_STATUSES)))
    rows = query.order_by(ContractTransaction.submitted_at.desc()).limit(50).all()
    return [_to_record(row) for row in rows]


@router.get("/transactions/{chain_id}/{tx_hash}", response_model=TransactionRecord)
def transaction_status(
    chain_id: int,
    tx_hash: str,
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_db_session),
) -> TransactionRecord:
    return _to_record(_owned_row(db, chain_id, tx_hash, session.wallet_address))


@router.post("/transactions/{chain_id}/{tx_hash}/verify", response_model=TransactionRecord)
def reverify_transaction(
    chain_id: int,
    tx_hash: str,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> TransactionRecord:
    """Retry receipt verification for one stored hash (no scanning)."""
    row = _owned_row(db, chain_id, tx_hash, session.wallet_address)
    verify_transaction(db, get_settings(), _chain(), row)
    db.commit()
    return _to_record(row)


class AgreementTransactionsResponse(BaseModel):
    chain_id: int
    contract_address: str
    agreement_id: str
    status_cache: str
    transactions: list[TransactionRecord]


@router.get(
    "/agreements/{chain_id}/{contract_address}/{agreement_id}/transactions",
    response_model=AgreementTransactionsResponse,
)
def agreement_transactions(
    chain_id: int,
    contract_address: str,
    agreement_id: int,
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_db_session),
) -> AgreementTransactionsResponse:
    """Stored application transactions for one agreement (participants only).
    This is the activity-timeline source: verified receipts, no inference."""
    index, _ = _participant_index(
        db, chain_id, contract_address, agreement_id, session.wallet_address
    )
    rows = (
        db.query(ContractTransaction)
        .filter(
            ContractTransaction.chain_id == chain_id,
            ContractTransaction.contract_address == contract_address.lower(),
            ContractTransaction.agreement_id == Decimal(agreement_id),
        )
        .order_by(ContractTransaction.submitted_at)
        .all()
    )
    return AgreementTransactionsResponse(
        chain_id=chain_id,
        contract_address=contract_address.lower(),
        agreement_id=str(agreement_id),
        status_cache=index.status_cache,
        transactions=[_to_record(row) for row in rows],
    )


class RefreshCacheResponse(BaseModel):
    agreement_id: str
    status_cache_before: str
    status_cache_after: str
    onchain_status: str
    total_funded_wei: str
    total_required_wei: str


@router.post(
    "/agreements/{chain_id}/{contract_address}/{agreement_id}/refresh-cache",
    response_model=RefreshCacheResponse,
)
def refresh_agreement_cache_endpoint(
    chain_id: int,
    contract_address: str,
    agreement_id: int,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> RefreshCacheResponse:
    """Safe stale-cache repair: participants trigger a DIRECT contract read
    and the cache column is updated from that read alone."""
    settings = get_settings()
    if chain_id != settings.chain_id:
        raise HTTPException(409, f"only chain {settings.chain_id} is supported")
    index, _ = _participant_index(
        db, chain_id, contract_address, agreement_id, session.wallet_address
    )
    before = index.status_cache
    try:
        onchain = refresh_agreement_cache(db, settings, _chain(), contract_address, agreement_id)
    except Exception:  # noqa: BLE001 - RPC unavailable: keep cache, report clearly
        raise HTTPException(502, "direct contract read failed; cache left unchanged") from None
    db.commit()
    return RefreshCacheResponse(
        agreement_id=str(agreement_id),
        status_cache_before=before,
        status_cache_after=index.status_cache,
        onchain_status=str(onchain["statusName"]),
        total_funded_wei=str(onchain["totalFunded"]),
        total_required_wei=str(onchain["totalRequired"]),
    )
