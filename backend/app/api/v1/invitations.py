"""Invitation endpoints: creation (per draft), review, claim, rotate, revoke.

Offchain only: claiming an invitation never touches onchain acceptance state
and never produces a transaction hash. Raw tokens are returned exactly once
(creation/rotation); lookups hash the supplied token; review responses carry
no-store and no-referrer headers; the access log redacts token segments.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_optional_session, require_csrf
from app.auth.ratelimit import (
    INVITATION_CLAIM_LIMIT,
    INVITATION_REVIEW_LIMIT,
    limiter,
)
from app.database.session import get_db_session
from app.models import AgreementDraft, AgreementDraftTenant, AuthSession, Invitation
from app.schemas.invitations import (
    InvitationClaimResponse,
    InvitationCreatedResponse,
    InvitationCreateRequest,
    InvitationReviewResponse,
    InvitationRevokeResponse,
)
from app.services import invitations as invitation_service
from app.services.audit import record_audit_event
from app.services.invitations import InvitationError, InvitationState, invitation_state

router = APIRouter(tags=["invitations"])


def _apply_privacy_headers(response: Response) -> None:
    # The URL carries the secret: never cache, never leak via referrer.
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"


def _get_draft(db: Session, draft_id: str) -> AgreementDraft:
    draft = db.get(AgreementDraft, draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="draft not found")
    return draft


@router.post(
    "/agreement-drafts/{draft_id}/invitations",
    response_model=InvitationCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invitation(
    draft_id: str,
    body: InvitationCreateRequest,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> InvitationCreatedResponse:
    draft = _get_draft(db, draft_id)
    try:
        created = invitation_service.create_invitation(
            db,
            draft=draft,
            caller_wallet=session.wallet_address,
            expected_wallet=body.expected_wallet,
            role=body.role,
        )
    except InvitationError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from None
    record_audit_event(
        db,
        event_type="invitation.created",
        actor_wallet=session.wallet_address,
        target_type="invitation",
        target_id=created.invitation_id,
        metadata={"draft_id": draft_id, "role": created.role},
    )
    db.commit()
    # The raw token appears exactly once, here. It is never logged or stored.
    return InvitationCreatedResponse(
        invitation_id=created.invitation_id,
        invitation_token=created.raw_token,
        expected_wallet=created.expected_wallet,
        role=created.role,
        expires_at=created.expires_at,
    )


@router.get("/invitations/{raw_token}", response_model=InvitationReviewResponse)
def review_invitation(
    raw_token: str,
    request: Request,
    response: Response,
    session: AuthSession | None = Depends(get_optional_session),
    db: Session = Depends(get_db_session),
) -> InvitationReviewResponse:
    _apply_privacy_headers(response)
    limiter.enforce("invitation-review", request, *INVITATION_REVIEW_LIMIT)

    invitation = invitation_service.find_by_raw_token(db, raw_token)
    if invitation is None:
        # One uniform response for unknown/garbage tokens: no enumeration.
        response.status_code = status.HTTP_404_NOT_FOUND
        return InvitationReviewResponse(status="invalid")

    state = invitation_state(invitation)
    if state is not InvitationState.ACTIVE:
        status_name = {
            InvitationState.EXPIRED: "expired",
            InvitationState.REVOKED: "revoked",
            InvitationState.ROTATED: "rotated",
            InvitationState.USED: "already_claimed",
        }[state]
        return InvitationReviewResponse(status=status_name)

    draft_id = invitation.agreement_key.removeprefix("draft:")
    draft = db.get(AgreementDraft, draft_id)
    if draft is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return InvitationReviewResponse(status="invalid")

    if session is None:
        # Minimal safe review state before any wallet is connected.
        return InvitationReviewResponse(
            status="valid_disconnected",
            role=invitation.role,
            property_alias=draft.property_alias,
            note="Connect and authenticate the invited wallet to see participant details.",
        )

    if session.wallet_address != invitation.wallet_address:
        return InvitationReviewResponse(
            status="wrong_wallet",
            note="This invitation was issued to a different wallet.",
        )

    required_amount: str | None = None
    if invitation.role == invitation_service.ROLE_TENANT:
        tenant = (
            db.query(AgreementDraftTenant)
            .filter(
                AgreementDraftTenant.draft_id == draft.id,
                AgreementDraftTenant.wallet_address == invitation.wallet_address,
            )
            .one_or_none()
        )
        if tenant is not None:
            required_amount = str(tenant.required_amount_wei)

    return InvitationReviewResponse(
        status="valid_wallet_matched",
        role=invitation.role,
        property_alias=draft.property_alias,
        draft_id=draft.id,
        expected_wallet=invitation.wallet_address,
        required_amount_wei=required_amount,
    )


@router.post("/invitations/{raw_token}/claim", response_model=InvitationClaimResponse)
def claim_invitation(
    raw_token: str,
    request: Request,
    response: Response,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> InvitationClaimResponse:
    _apply_privacy_headers(response)
    limiter.enforce(
        "invitation-claim", request, *INVITATION_CLAIM_LIMIT, wallet=session.wallet_address
    )

    invitation = invitation_service.find_by_raw_token(db, raw_token)
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invitation not usable")
    try:
        invitation_service.claim_invitation(db, invitation, session.wallet_address)
    except InvitationError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from None
    record_audit_event(
        db,
        event_type="invitation.claimed",
        actor_wallet=session.wallet_address,
        target_type="invitation",
        target_id=invitation.id,
        metadata={"agreement_key": invitation.agreement_key, "role": invitation.role},
    )
    db.commit()
    # Offchain join only — no onchain acceptance, no transaction hash.
    return InvitationClaimResponse()


@router.post("/invitations/{invitation_id}/rotate", response_model=InvitationCreatedResponse)
def rotate_invitation(
    invitation_id: str,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> InvitationCreatedResponse:
    invitation = db.get(Invitation, invitation_id)
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invitation not found")
    try:
        created = invitation_service.rotate_invitation(db, invitation, session.wallet_address)
    except InvitationError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from None
    record_audit_event(
        db,
        event_type="invitation.rotated",
        actor_wallet=session.wallet_address,
        target_type="invitation",
        target_id=invitation.id,
        metadata={"replacement_id": created.invitation_id},
    )
    db.commit()
    return InvitationCreatedResponse(
        invitation_id=created.invitation_id,
        invitation_token=created.raw_token,
        expected_wallet=created.expected_wallet,
        role=created.role,
        expires_at=created.expires_at,
    )


@router.post("/invitations/{invitation_id}/revoke", response_model=InvitationRevokeResponse)
def revoke_invitation(
    invitation_id: str,
    session: AuthSession = Depends(require_csrf),
    db: Session = Depends(get_db_session),
) -> InvitationRevokeResponse:
    invitation = db.get(Invitation, invitation_id)
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invitation not found")
    try:
        performed = invitation_service.revoke_invitation(db, invitation, session.wallet_address)
    except InvitationError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from None
    if performed:
        record_audit_event(
            db,
            event_type="invitation.revoked",
            actor_wallet=session.wallet_address,
            target_type="invitation",
            target_id=invitation.id,
        )
    db.commit()
    return InvitationRevokeResponse(revoked=True)
