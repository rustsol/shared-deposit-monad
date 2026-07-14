"""Draft, dashboard, and agreement-metadata schemas. Wei values are decimal
strings end to end; the creator is never accepted from the client."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.common import AddressStr, WeiStr


class DraftTenantInput(BaseModel):
    wallet: AddressStr
    required_amount_wei: WeiStr
    display_label: str | None = Field(default=None, max_length=80)


class DraftRequest(BaseModel):
    property_alias: str = Field(min_length=1, max_length=160)
    private_address: str | None = Field(default=None, max_length=2000)
    recipient: AddressStr
    lease_start: int = Field(ge=0)
    lease_end: int = Field(ge=0)
    funding_deadline: int = Field(ge=0)
    claim_deadline: int = Field(ge=0)
    settlement_deadline: int = Field(ge=0)
    tenants: list[DraftTenantInput] = Field(min_length=2, max_length=8)


class DraftTenantResponse(BaseModel):
    tenant_index: int
    wallet: str
    required_amount_wei: str
    display_label: str | None


class DraftResponse(BaseModel):
    id: str
    status: str
    property_alias: str
    private_address: str | None
    recipient: str
    creator: str
    terms_hash: str
    terms_json: dict[str, Any]
    chain_id: int
    contract_address: str
    agreement_id_onchain: str | None
    creation_tx_hash: str | None
    creation_block_number: int | None
    created_at: datetime
    updated_at: datetime
    tenants: list[DraftTenantResponse]


class ConfirmOnchainRequest(BaseModel):
    tx_hash: str = Field(pattern=r"^0x[0-9a-fA-F]{64}$")


class DashboardAgreement(BaseModel):
    chain_id: int
    contract_address: str
    agreement_id: str
    property_alias: str | None
    role: str
    status_name: str
    total_required_wei: str
    total_funded_wei: str


class DashboardResponse(BaseModel):
    drafts: list[DraftResponse]
    pending_invitations: int
    agreements: list[DashboardAgreement]


class AgreementMetadataResponse(BaseModel):
    chain_id: int
    contract_address: str
    agreement_id: str
    property_alias: str | None
    terms_json: dict[str, Any] | None
    creation_tx_hash: str | None
    creator: str | None
    recipient: str | None
