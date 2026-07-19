"""Invitation lifecycle for pre-onchain agreement drafts.

An invitation only grants the expected authenticated wallet offchain access
to its private draft/review context. It NEVER performs or records onchain
acceptance - that happens later through a real wallet transaction. Raw tokens
exist once, in the creation/rotation response; the database stores hashes.

States: active → used (claimed once) | revoked | rotated (revoked_at +
superseded_by set) | expired (by timestamp).
"""

import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.auth.service import sha256_hex, utcnow
from app.database.session import execute_rowcount
from app.models import AgreementDraft, AgreementDraftTenant, Invitation

INVITATION_TTL_SECONDS = 72 * 3600  # short explicit expiry: 3 days

ROLE_TENANT = "TENANT"
ROLE_RECIPIENT = "RECIPIENT"


def draft_agreement_key(draft_id: str) -> str:
    """agreement_key encoding for pre-onchain drafts (docs use chain/contract/id
    for onchain agreements; drafts use this documented prefix form)."""
    return f"draft:{draft_id}"


class InvitationState(StrEnum):
    ACTIVE = "active"
    USED = "used"
    REVOKED = "revoked"
    ROTATED = "rotated"
    EXPIRED = "expired"


def invitation_state(invitation: Invitation) -> InvitationState:
    if invitation.revoked_at is not None:
        return (
            InvitationState.ROTATED
            if invitation.superseded_by is not None
            else InvitationState.REVOKED
        )
    if invitation.used_at is not None:
        return InvitationState.USED
    if invitation.expires_at <= utcnow():
        return InvitationState.EXPIRED
    return InvitationState.ACTIVE


@dataclass(frozen=True)
class CreatedInvitation:
    invitation_id: str
    raw_token: str
    expected_wallet: str
    role: str
    expires_at: datetime


class InvitationError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _validate_participant(
    db: Session, draft: AgreementDraft, expected_wallet: str, role: str
) -> None:
    """The expected wallet must hold the named participant slot in the draft."""
    if role == ROLE_RECIPIENT:
        if expected_wallet != draft.recipient_address:
            raise InvitationError(422, "expected wallet is not the draft recipient")
        return
    if role == ROLE_TENANT:
        tenant = (
            db.query(AgreementDraftTenant)
            .filter(
                AgreementDraftTenant.draft_id == draft.id,
                AgreementDraftTenant.wallet_address == expected_wallet,
            )
            .one_or_none()
        )
        if tenant is None:
            raise InvitationError(422, "expected wallet is not a tenant of this draft")
        return
    raise InvitationError(422, "role must be TENANT or RECIPIENT")


def _active_invitation(
    db: Session, agreement_key: str, expected_wallet: str, role: str
) -> Invitation | None:
    now = utcnow()
    return (
        db.query(Invitation)
        .filter(
            Invitation.agreement_key == agreement_key,
            Invitation.wallet_address == expected_wallet,
            Invitation.role == role,
            Invitation.revoked_at.is_(None),
            Invitation.used_at.is_(None),
            Invitation.expires_at > now,
        )
        .one_or_none()
    )


def create_invitation(
    db: Session,
    *,
    draft: AgreementDraft,
    caller_wallet: str,
    expected_wallet: str,
    role: str,
) -> CreatedInvitation:
    """Creates one invitation for one documented participant slot. Policy for
    duplicates: creating while an active invitation exists for the same
    draft/wallet/role is rejected (409) - rotation is the explicit way to
    replace a live token, so two usable tokens never coexist."""
    if draft.creator_address != caller_wallet:
        raise InvitationError(403, "only the draft creator can manage invitations")
    expected = expected_wallet.lower()
    _validate_participant(db, draft, expected, role)

    key = draft_agreement_key(draft.id)
    if _active_invitation(db, key, expected, role) is not None:
        raise InvitationError(
            409, "an active invitation already exists for this participant; rotate it instead"
        )

    now = utcnow()
    raw_token = secrets.token_urlsafe(32)  # 256 bits, URL-safe
    invitation = Invitation(
        id=str(uuid.uuid4()),
        agreement_key=key,
        role=role,
        wallet_address=expected,
        token_hash=sha256_hex(raw_token),
        expires_at=now + timedelta(seconds=INVITATION_TTL_SECONDS),
        used_at=None,
        revoked_at=None,
        superseded_by=None,
        created_by=caller_wallet,
        created_at=now,
    )
    db.add(invitation)
    return CreatedInvitation(
        invitation_id=invitation.id,
        raw_token=raw_token,
        expected_wallet=expected,
        role=role,
        expires_at=invitation.expires_at,
    )


def find_by_raw_token(db: Session, raw_token: str) -> Invitation | None:
    return db.query(Invitation).filter(Invitation.token_hash == sha256_hex(raw_token)).one_or_none()


def claim_invitation(db: Session, invitation: Invitation, wallet: str) -> None:
    """Marks the invitation used exactly once (offchain join only). The
    single guarded UPDATE makes concurrent claims mutually exclusive."""
    if invitation.wallet_address != wallet:
        raise InvitationError(403, "this invitation is for a different wallet")
    state = invitation_state(invitation)
    if state is not InvitationState.ACTIVE:
        raise InvitationError(409, f"invitation is not claimable (state: {state.value})")
    now = utcnow()
    claimed = execute_rowcount(
        db,
        update(Invitation)
        .where(
            Invitation.id == invitation.id,
            Invitation.used_at.is_(None),
            Invitation.revoked_at.is_(None),
            Invitation.expires_at > now,
        )
        .values(used_at=now),
    )
    if claimed != 1:
        db.rollback()
        raise InvitationError(409, "invitation is no longer claimable")


def rotate_invitation(db: Session, invitation: Invitation, caller_wallet: str) -> CreatedInvitation:
    """Atomically revokes the old token and issues exactly one replacement.
    The guarded UPDATE means concurrent rotations produce one winner, so two
    active tokens can never coexist. A used invitation cannot be rotated back
    to life (guard requires used_at IS NULL)."""
    if invitation.created_by != caller_wallet:
        raise InvitationError(403, "only the draft creator can manage invitations")

    now = utcnow()
    replacement_id = str(uuid.uuid4())
    superseded = execute_rowcount(
        db,
        update(Invitation)
        .where(
            Invitation.id == invitation.id,
            Invitation.revoked_at.is_(None),
            Invitation.used_at.is_(None),
        )
        .values(revoked_at=now, superseded_by=replacement_id),
    )
    if superseded != 1:
        db.rollback()
        raise InvitationError(409, "invitation can no longer be rotated")

    raw_token = secrets.token_urlsafe(32)
    db.add(
        Invitation(
            id=replacement_id,
            agreement_key=invitation.agreement_key,
            role=invitation.role,
            wallet_address=invitation.wallet_address,
            token_hash=sha256_hex(raw_token),
            expires_at=now + timedelta(seconds=INVITATION_TTL_SECONDS),
            used_at=None,
            revoked_at=None,
            superseded_by=None,
            created_by=caller_wallet,
            created_at=now,
        )
    )
    return CreatedInvitation(
        invitation_id=replacement_id,
        raw_token=raw_token,
        expected_wallet=invitation.wallet_address,
        role=invitation.role,
        expires_at=now + timedelta(seconds=INVITATION_TTL_SECONDS),
    )


def revoke_invitation(db: Session, invitation: Invitation, caller_wallet: str) -> bool:
    """Revokes by internal ID (no raw token needed). Idempotent: revoking an
    already-revoked invitation reports success without changing anything.
    Returns True when this call performed the revocation."""
    if invitation.created_by != caller_wallet:
        raise InvitationError(403, "only the draft creator can manage invitations")
    if invitation.revoked_at is not None:
        return False
    now = utcnow()
    revoked = execute_rowcount(
        db,
        update(Invitation)
        .where(Invitation.id == invitation.id, Invitation.revoked_at.is_(None))
        .values(revoked_at=now),
    )
    return revoked == 1
