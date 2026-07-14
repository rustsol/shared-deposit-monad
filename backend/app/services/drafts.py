"""Agreement-draft lifecycle: create/edit/delete, prepare-onchain, and
verified onchain registration.

Drafts are MySQL-authoritative only until the agreement exists onchain.
confirm-onchain verifies the real Monad Testnet receipt and the
AgreementCreated event, cross-checks every participant and amount against a
direct contract read, and only then binds the draft to the chain identity.
The creator wallet always comes from the authenticated session — never from
request JSON.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.auth.service import utcnow
from app.blockchain.service import ChainService
from app.canonical import CanonicalTerms, canonicalize_terms, terms_hash
from app.config import Settings
from app.models import AgreementDraft, AgreementDraftTenant, AgreementIndex, AgreementMetadata

INDIVIDUAL_RULE = "DEDUCT_FROM_LIABLE_TENANT_FIRST"
SHARED_RULE = "PROPORTIONAL_TO_REMAINING_BALANCE_AFTER_INDIVIDUAL_DEDUCTIONS"

STATUS_DRAFT = "DRAFT"
STATUS_CONFIRMED = "CONFIRMED"


class DraftError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class TenantInput:
    wallet: str
    required_amount_wei: str
    display_label: str | None


@dataclass(frozen=True)
class DraftInput:
    property_alias: str
    private_address: str | None
    recipient: str
    lease_start: int
    lease_end: int
    funding_deadline: int
    claim_deadline: int
    settlement_deadline: int
    tenants: list[TenantInput]


def _build_canonical_terms(settings: Settings, creator: str, data: DraftInput) -> CanonicalTerms:
    """Validates all contract rules through the closed canonical schema and
    returns the canonical terms object. Raises DraftError with the exact
    validation reason on failure."""
    if data.funding_deadline <= int(utcnow().timestamp()):
        raise DraftError(422, "funding deadline must be in the future")
    if data.lease_start > data.lease_end:
        raise DraftError(422, "lease start must not be after lease end")
    if data.funding_deadline > data.lease_end:
        raise DraftError(422, "funding deadline must be on or before the lease end")
    if data.claim_deadline <= data.lease_end:
        raise DraftError(422, "claim deadline must be after the lease end")
    if data.settlement_deadline <= data.claim_deadline:
        raise DraftError(422, "settlement deadline must be after the claim deadline")

    payload = {
        "schemaVersion": "1.0",
        "chainId": settings.chain_id,
        "currency": "MON",
        "creator": creator,
        "recipient": data.recipient,
        "propertyAlias": data.property_alias,
        "leaseStart": data.lease_start,
        "leaseEnd": data.lease_end,
        "fundingDeadline": data.funding_deadline,
        "claimDeadline": data.claim_deadline,
        "settlementDeadline": data.settlement_deadline,
        "tenantContributions": [
            {"wallet": tenant.wallet, "requiredAmountWei": tenant.required_amount_wei}
            for tenant in data.tenants
        ],
        "approvalRule": {
            "type": "STRICT_MAJORITY",
            "requiredApprovals": len(data.tenants) // 2 + 1,
        },
        "individualDeductionRule": INDIVIDUAL_RULE,
        "sharedDeductionRule": SHARED_RULE,
        "evidenceRequired": True,
    }
    try:
        return CanonicalTerms.model_validate(payload)
    except ValueError as error:
        raise DraftError(422, f"invalid agreement terms: {error}") from None


def create_draft(
    db: Session, settings: Settings, creator: str, data: DraftInput, contract_address: str
) -> AgreementDraft:
    terms = _build_canonical_terms(settings, creator, data)
    now = utcnow()
    draft = AgreementDraft(
        id=str(uuid.uuid4()),
        creator_address=creator,
        recipient_address=data.recipient.lower(),
        property_alias=data.property_alias,
        private_address=data.private_address,
        terms_json=terms.model_dump(mode="json"),
        terms_hash=terms_hash(terms),
        chain_id=settings.chain_id,
        contract_address=contract_address.lower(),
        agreement_id_onchain=None,
        creation_tx_hash=None,
        creation_block_number=None,
        status=STATUS_DRAFT,
        created_at=now,
        updated_at=now,
    )
    db.add(draft)
    db.flush()
    for index, tenant in enumerate(data.tenants):
        db.add(
            AgreementDraftTenant(
                draft_id=draft.id,
                tenant_index=index,
                wallet_address=tenant.wallet.lower(),
                display_label=tenant.display_label,
                required_amount_wei=int(tenant.required_amount_wei),  # exact integer, no float
            )
        )
    return draft


def require_owned_draft(db: Session, draft_id: str, wallet: str) -> AgreementDraft:
    draft = db.get(AgreementDraft, draft_id)
    if draft is None:
        raise DraftError(404, "draft not found")
    if draft.creator_address != wallet:
        raise DraftError(403, "only the draft creator may access this draft")
    return draft


def require_mutable_draft(db: Session, draft_id: str, wallet: str) -> AgreementDraft:
    draft = require_owned_draft(db, draft_id, wallet)
    if draft.status == STATUS_CONFIRMED:
        raise DraftError(409, "a confirmed onchain draft is immutable")
    return draft


def draft_tenants(db: Session, draft_id: str) -> list[AgreementDraftTenant]:
    return (
        db.query(AgreementDraftTenant)
        .filter(AgreementDraftTenant.draft_id == draft_id)
        .order_by(AgreementDraftTenant.tenant_index)
        .all()
    )


def replace_draft_contents(
    db: Session, settings: Settings, draft: AgreementDraft, data: DraftInput
) -> AgreementDraft:
    terms = _build_canonical_terms(settings, draft.creator_address, data)
    draft.recipient_address = data.recipient.lower()
    draft.property_alias = data.property_alias
    draft.private_address = data.private_address
    draft.terms_json = terms.model_dump(mode="json")
    draft.terms_hash = terms_hash(terms)
    draft.updated_at = utcnow()
    db.query(AgreementDraftTenant).filter(AgreementDraftTenant.draft_id == draft.id).delete()
    for index, tenant in enumerate(data.tenants):
        db.add(
            AgreementDraftTenant(
                draft_id=draft.id,
                tenant_index=index,
                wallet_address=tenant.wallet.lower(),
                display_label=tenant.display_label,
                required_amount_wei=int(tenant.required_amount_wei),
            )
        )
    return draft


def prepare_onchain(
    db: Session, settings: Settings, draft: AgreementDraft, contract_address: str | None
) -> dict[str, Any]:
    """Exact contract-call material. Integer arguments travel as decimal
    strings; the browser independently re-serializes and re-hashes the
    canonical terms and must reproduce `termsHash` before creating."""
    if contract_address is None:
        raise DraftError(409, "no verified contract deployment is configured")
    terms = CanonicalTerms.model_validate(draft.terms_json)
    tenants = draft_tenants(db, draft.id)
    return {
        "draftId": draft.id,
        "chainId": settings.chain_id,
        "contractAddress": contract_address,
        "canonicalTerms": terms.model_dump(mode="json"),
        "canonicalText": canonicalize_terms(terms),
        "termsHash": terms_hash(terms),
        "arguments": {
            "recipient": draft.recipient_address,
            "termsHash": terms_hash(terms),
            "leaseStart": str(terms.leaseStart),
            "leaseEnd": str(terms.leaseEnd),
            "fundingDeadline": str(terms.fundingDeadline),
            "claimDeadline": str(terms.claimDeadline),
            "settlementDeadline": str(terms.settlementDeadline),
            "tenantAddresses": [tenant.wallet_address for tenant in tenants],
            "requiredAmounts": [str(int(tenant.required_amount_wei)) for tenant in tenants],
        },
        "summary": {
            "propertyAlias": draft.property_alias,
            "tenantCount": len(tenants),
            "requiredApprovals": len(tenants) // 2 + 1,
            "totalRequiredWei": str(sum(int(tenant.required_amount_wei) for tenant in tenants)),
        },
    }


def confirm_onchain(
    db: Session,
    settings: Settings,
    chain: ChainService,
    draft: AgreementDraft,
    tx_hash: str,
) -> dict[str, Any]:
    """Verifies the real transaction end-to-end and registers the agreement.
    Idempotent for the same draft+transaction; rejects everything else."""
    if draft.status == STATUS_CONFIRMED:
        if draft.creation_tx_hash == tx_hash.lower():
            return _registration_result(draft)
        raise DraftError(409, "draft is already confirmed with a different transaction")

    conflicting = (
        db.query(AgreementDraft)
        .filter(
            AgreementDraft.creation_tx_hash == tx_hash.lower(),
            AgreementDraft.id != draft.id,
        )
        .one_or_none()
    )
    if conflicting is not None:
        raise DraftError(409, "this transaction is already registered to another draft")

    if chain.contract_address is None:
        raise DraftError(409, "no verified contract deployment is configured")
    if chain.chain_id() != settings.chain_id:
        raise DraftError(502, "RPC chain id mismatch")

    try:
        receipt = chain.get_receipt(tx_hash)
    except Exception:  # noqa: BLE001 - unknown/pending transactions
        raise DraftError(404, "transaction not found or not yet mined") from None
    if receipt.get("status") != 1:
        raise DraftError(409, "transaction reverted onchain")
    to_address = str(receipt.get("to") or "").lower()
    if to_address != chain.contract_address.lower():
        raise DraftError(409, "transaction did not target the verified escrow contract")

    event = chain.decode_agreement_created(receipt)
    if event is None:
        raise DraftError(409, "transaction contains no AgreementCreated event")
    if event["creator"] != draft.creator_address:
        raise DraftError(403, "the onchain creator does not match the draft creator")
    if event["termsHash"] != draft.terms_hash:
        raise DraftError(409, "the onchain terms hash does not match the draft")
    if event["recipient"] != draft.recipient_address:
        raise DraftError(409, "the onchain recipient does not match the draft")

    # Cross-check the full participant set against a DIRECT contract read.
    agreement_id = int(event["agreementId"])
    onchain_tenants = chain.read_tenants(agreement_id)
    tenants = draft_tenants(db, draft.id)
    if onchain_tenants != [tenant.wallet_address for tenant in tenants]:
        raise DraftError(409, "the onchain tenant list does not match the draft")
    for tenant in tenants:
        record = chain.read_tenant(agreement_id, tenant.wallet_address)
        if record["requiredAmount"] != str(int(tenant.required_amount_wei)):
            raise DraftError(409, "an onchain required contribution does not match the draft")

    agreement = chain.read_agreement(agreement_id)
    now = utcnow()
    block = chain.get_block(int(receipt["blockNumber"]))

    draft.status = STATUS_CONFIRMED
    draft.agreement_id_onchain = Decimal(agreement_id)
    draft.creation_tx_hash = tx_hash.lower()
    draft.creation_block_number = int(receipt["blockNumber"])
    draft.updated_at = now

    key = (settings.chain_id, chain.contract_address.lower(), agreement_id)
    if db.get(AgreementIndex, key) is None:
        db.add(
            AgreementIndex(
                chain_id=settings.chain_id,
                contract_address=chain.contract_address.lower(),
                agreement_id=agreement_id,
                creator_address=draft.creator_address,
                recipient_address=draft.recipient_address,
                terms_hash=draft.terms_hash,
                status_cache=agreement["statusName"],
                last_synced_block=int(receipt["blockNumber"]),
                created_tx_hash=tx_hash.lower(),
                created_at_chain=_block_datetime(block),
                updated_at=now,
            )
        )
    if db.get(AgreementMetadata, key) is None:
        db.add(
            AgreementMetadata(
                chain_id=settings.chain_id,
                contract_address=chain.contract_address.lower(),
                agreement_id=agreement_id,
                property_alias=draft.property_alias,
                private_address=draft.private_address,
                terms_json=draft.terms_json,
                is_shareable=False,
                created_at=now,
            )
        )
    return _registration_result(draft)


def _block_datetime(block: Any) -> Any:
    from datetime import UTC, datetime

    return datetime.fromtimestamp(int(block["timestamp"]), tz=UTC).replace(tzinfo=None)


def _registration_result(draft: AgreementDraft) -> dict[str, Any]:
    return {
        "draftId": draft.id,
        "status": draft.status,
        "chainId": draft.chain_id,
        "contractAddress": draft.contract_address,
        "agreementId": str(draft.agreement_id_onchain) if draft.agreement_id_onchain else None,
        "creationTxHash": draft.creation_tx_hash,
        "creationBlockNumber": draft.creation_block_number,
    }
