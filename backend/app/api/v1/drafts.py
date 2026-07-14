"""Agreement-draft routes: CRUD, prepare-onchain, confirm-onchain, dashboard,
and participant-scoped agreement metadata.

The creator is always the authenticated session wallet. Confirmed drafts are
immutable and undeletable. All financial values are decimal wei strings.
"""

from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import require_csrf, require_session
from app.blockchain.deployment import load_deployment_metadata
from app.blockchain.service import get_chain_service
from app.config import get_settings
from app.database.session import get_db_session
from app.models import (
    AgreementDraft,
    AgreementDraftTenant,
    AgreementIndex,
    AgreementMetadata,
    AuthSession,
    Invitation,
)
from app.schemas.drafts import (
    AgreementMetadataResponse,
    ConfirmOnchainRequest,
    DashboardAgreement,
    DashboardResponse,
    DraftRequest,
    DraftResponse,
    DraftTenantResponse,
)
from app.services import drafts as draft_service
from app.services.audit import record_audit_event
from app.services.drafts import DraftError, DraftInput, TenantInput
from app.services.invitations import invitation_state

router = APIRouter(tags=["drafts"])


def _to_input(body: DraftRequest) -> DraftInput:
    return DraftInput(
        property_alias=body.property_alias,
        private_address=body.private_address,
        recipient=body.recipient,
        lease_start=body.lease_start,
        lease_end=body.lease_end,
        funding_deadline=body.funding_deadline,
        claim_deadline=body.claim_deadline,
        settlement_deadline=body.settlement_deadline,
        tenants=[
            TenantInput(
                wallet=tenant.wallet,
                required_amount_wei=tenant.required_amount_wei,
                display_label=tenant.display_label,
            )
            for tenant in body.tenants
        ],
    )


def _draft_response(db: Session, draft: AgreementDraft) -> DraftResponse:
    tenants = draft_service.draft_tenants(db, draft.id)
    return DraftResponse(
        id=draft.id,
        status=draft.status,
        property_alias=draft.property_alias,
        private_address=draft.private_address,
        recipient=draft.recipient_address,
        creator=draft.creator_address,
        terms_hash=draft.terms_hash,
        terms_json=dict(draft.terms_json),
        chain_id=draft.chain_id,
        contract_address=draft.contract_address,
        agreement_id_onchain=(
            str(int(draft.agreement_id_onchain)) if draft.agreement_id_onchain is not None else None
        ),
        creation_tx_hash=draft.creation_tx_hash,
        creation_block_number=draft.creation_block_number,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
        tenants=[
            DraftTenantResponse(
                tenant_index=tenant.tenant_index,
                wallet=tenant.wallet_address,
                required_amount_wei=str(int(tenant.required_amount_wei)),
                display_label=tenant.display_label,
            )
            for tenant in tenants
        ],
    )


def _contract_address() -> str | None:
    metadata = load_deployment_metadata()
    return metadata.contract_address if metadata else None


@router.post("/agreement-drafts", response_model=DraftResponse, status_code=201)
def create_draft(
    body: DraftRequest,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> DraftResponse:
    settings = get_settings()
    contract = _contract_address()
    if contract is None:
        raise HTTPException(409, "no verified contract deployment is configured")
    try:
        # The creator comes exclusively from the authenticated session.
        draft = draft_service.create_draft(
            db, settings, session.wallet_address, _to_input(body), contract
        )
    except DraftError as error:
        raise HTTPException(error.status_code, error.detail) from None
    record_audit_event(
        db,
        event_type="draft.created",
        actor_wallet=session.wallet_address,
        target_type="draft",
        target_id=draft.id,
    )
    db.commit()
    return _draft_response(db, draft)


@router.get("/agreement-drafts", response_model=list[DraftResponse])
def list_drafts(
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_db_session),
) -> list[DraftResponse]:
    drafts = (
        db.query(AgreementDraft)
        .filter(AgreementDraft.creator_address == session.wallet_address)
        .order_by(AgreementDraft.created_at.desc())
        .all()
    )
    return [_draft_response(db, draft) for draft in drafts]


@router.get("/agreement-drafts/{draft_id}", response_model=DraftResponse)
def get_draft(
    draft_id: str,
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_db_session),
) -> DraftResponse:
    try:
        draft = draft_service.require_owned_draft(db, draft_id, session.wallet_address)
    except DraftError as error:
        raise HTTPException(error.status_code, error.detail) from None
    return _draft_response(db, draft)


@router.patch("/agreement-drafts/{draft_id}", response_model=DraftResponse)
def update_draft(
    draft_id: str,
    body: DraftRequest,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> DraftResponse:
    settings = get_settings()
    try:
        draft = draft_service.require_mutable_draft(db, draft_id, session.wallet_address)
        draft = draft_service.replace_draft_contents(db, settings, draft, _to_input(body))
    except DraftError as error:
        raise HTTPException(error.status_code, error.detail) from None
    db.commit()
    return _draft_response(db, draft)


@router.delete("/agreement-drafts/{draft_id}", status_code=204)
def delete_draft(
    draft_id: str,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> None:
    try:
        draft = draft_service.require_mutable_draft(db, draft_id, session.wallet_address)
    except DraftError as error:
        raise HTTPException(error.status_code, error.detail) from None
    db.query(AgreementDraftTenant).filter(AgreementDraftTenant.draft_id == draft.id).delete()
    db.delete(draft)
    record_audit_event(
        db,
        event_type="draft.deleted",
        actor_wallet=session.wallet_address,
        target_type="draft",
        target_id=draft_id,
    )
    db.commit()


@router.post("/agreement-drafts/{draft_id}/prepare-onchain")
def prepare_onchain(
    draft_id: str,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    settings = get_settings()
    try:
        draft = draft_service.require_mutable_draft(db, draft_id, session.wallet_address)
        return draft_service.prepare_onchain(db, settings, draft, _contract_address())
    except DraftError as error:
        raise HTTPException(error.status_code, error.detail) from None


@router.post("/agreement-drafts/{draft_id}/confirm-onchain")
def confirm_onchain(
    draft_id: str,
    body: ConfirmOnchainRequest,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    settings = get_settings()
    try:
        draft = draft_service.require_owned_draft(db, draft_id, session.wallet_address)
        result = draft_service.confirm_onchain(
            db, settings, get_chain_service(), draft, body.tx_hash
        )
    except DraftError as error:
        db.rollback()
        raise HTTPException(error.status_code, error.detail) from None
    record_audit_event(
        db,
        event_type="draft.confirmed_onchain",
        actor_wallet=session.wallet_address,
        target_type="draft",
        target_id=draft.id,
        metadata={"agreement_id": result["agreementId"], "tx_hash": result["creationTxHash"]},
    )
    db.commit()
    return result


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_db_session),
) -> DashboardResponse:
    wallet = session.wallet_address
    drafts = (
        db.query(AgreementDraft)
        .filter(
            AgreementDraft.creator_address == wallet,
            AgreementDraft.status == draft_service.STATUS_DRAFT,
        )
        .order_by(AgreementDraft.created_at.desc())
        .all()
    )
    invitations = db.query(Invitation).filter(Invitation.wallet_address == wallet).all()
    pending_invitations = sum(
        1 for invitation in invitations if invitation_state(invitation).value == "active"
    )

    # Verified agreements in which this wallet participates. Status comes from
    # a DIRECT contract read, never from the cache column.
    agreements: list[DashboardAgreement] = []
    chain = get_chain_service()
    rows = db.query(AgreementIndex).order_by(AgreementIndex.agreement_id).all()
    for row in rows:
        metadata_key = (row.chain_id, row.contract_address, row.agreement_id)
        metadata = db.get(AgreementMetadata, metadata_key)
        tenant_wallets: list[str] = []
        if metadata is not None:
            tenant_wallets = [
                str(entry.get("wallet", "")).lower()
                for entry in metadata.terms_json.get("tenantContributions", [])
            ]
        if wallet == row.creator_address:
            role = "CREATOR_TENANT"
        elif wallet == row.recipient_address:
            role = "RECIPIENT"
        elif wallet in tenant_wallets:
            role = "TENANT"
        else:
            continue
        try:
            onchain = chain.read_agreement(int(row.agreement_id))
            status_name = str(onchain["statusName"])
            total_required = str(onchain["totalRequired"])
            total_funded = str(onchain["totalFunded"])
        except Exception:  # noqa: BLE001 - RPC unavailable: honest degraded state
            status_name = "RPC_UNAVAILABLE"
            total_required = "0"
            total_funded = "0"
        agreements.append(
            DashboardAgreement(
                chain_id=row.chain_id,
                contract_address=row.contract_address,
                agreement_id=str(int(row.agreement_id)),
                property_alias=metadata.property_alias if metadata else None,
                role=role,
                status_name=status_name,
                total_required_wei=total_required,
                total_funded_wei=total_funded,
            )
        )

    return DashboardResponse(
        drafts=[_draft_response(db, draft) for draft in drafts],
        pending_invitations=pending_invitations,
        agreements=agreements,
    )


@router.get(
    "/agreements/{chain_id}/{contract_address}/{agreement_id}/metadata",
    response_model=AgreementMetadataResponse,
)
def agreement_metadata(
    chain_id: int,
    contract_address: str,
    agreement_id: int,
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_db_session),
) -> AgreementMetadataResponse:
    """Private offchain metadata (alias, terms JSON) for participants only.
    All financial state comes from direct contract reads in the browser."""
    key = (chain_id, contract_address.lower(), Decimal(agreement_id))
    index = db.get(AgreementIndex, key)
    metadata = db.get(AgreementMetadata, key)
    wallet = session.wallet_address
    participant = False
    if index is not None:
        participant = wallet in (index.creator_address, index.recipient_address)
    if not participant and metadata is not None:
        tenant_wallets = [
            str(entry.get("wallet", "")).lower()
            for entry in metadata.terms_json.get("tenantContributions", [])
        ]
        participant = wallet in tenant_wallets
    if index is None or not participant:
        raise HTTPException(404, "agreement metadata not available")
    return AgreementMetadataResponse(
        chain_id=chain_id,
        contract_address=contract_address.lower(),
        agreement_id=str(agreement_id),
        property_alias=metadata.property_alias if metadata else None,
        terms_json=dict(metadata.terms_json) if metadata else None,
        creation_tx_hash=index.created_tx_hash,
        creator=index.creator_address,
        recipient=index.recipient_address,
    )
