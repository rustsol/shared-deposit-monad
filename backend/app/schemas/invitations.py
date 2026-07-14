"""Invitation request/response schemas. Raw tokens appear only in the
creation/rotation responses (exactly once); reviews never echo the token."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import AddressStr


class InvitationCreateRequest(BaseModel):
    expected_wallet: AddressStr
    role: str = Field(pattern="^(TENANT|RECIPIENT)$")


class InvitationCreatedResponse(BaseModel):
    invitation_id: str
    invitation_token: str
    expected_wallet: str
    role: str
    expires_at: datetime
    warning: str = (
        "This invitation token is shown only once and cannot be retrieved again. "
        "Share it privately with the expected wallet holder."
    )


class InvitationReviewResponse(BaseModel):
    status: str  # valid_disconnected | valid_wallet_matched | wrong_wallet |
    # expired | revoked | rotated | already_claimed | invalid
    role: str | None = None
    property_alias: str | None = None
    draft_id: str | None = None
    expected_wallet: str | None = None
    required_amount_wei: str | None = None
    note: str | None = None


class InvitationClaimResponse(BaseModel):
    status: str = "invitation_joined_offchain"
    note: str = (
        "This grants offchain access to the draft only. Accepting the agreement "
        "onchain still requires a real wallet transaction later."
    )


class InvitationRevokeResponse(BaseModel):
    revoked: bool
