"""Canonical agreement terms: deterministic JSON and its Keccak-256 hash.

Implements docs/02 §4.1 exactly:

- UTF-8, recursively sorted keys, compact separators (no insignificant
  whitespace), ``ensure_ascii=False``;
- wallet addresses normalized to lowercase hex;
- timestamps as integer Unix seconds;
- amounts as decimal wei strings — floats are rejected outright;
- tenant list in the exact submitted order (which is the onchain order);
- schema version, chain ID, currency, and rules included;
- hash = Ethereum Keccak-256 (eth-hash/pycryptodome backend), NOT NIST
  SHA3-256, over the canonical UTF-8 bytes; returned 0x-prefixed.

The schema is closed: unknown fields are rejected so browser and backend can
never silently hash different objects.
"""

import json
import re

from eth_utils.crypto import keccak
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
_WEI_RE = re.compile(r"^(0|[1-9][0-9]*)$")

SCHEMA_VERSION = "1.0"


class TenantContribution(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    wallet: str
    requiredAmountWei: str

    @field_validator("wallet")
    @classmethod
    def _wallet(cls, value: str) -> str:
        if not _ADDRESS_RE.match(value):
            raise ValueError("wallet must be a 0x-prefixed 20-byte hex address")
        return value.lower()

    @field_validator("requiredAmountWei")
    @classmethod
    def _amount(cls, value: str) -> str:
        # Strict decimal string: no sign, no exponent, no leading zeros, no float.
        if not _WEI_RE.match(value):
            raise ValueError("requiredAmountWei must be a nonnegative decimal integer string")
        if int(value) <= 0:
            raise ValueError("requiredAmountWei must be greater than zero")
        return value


class ApprovalRule(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    type: str
    requiredApprovals: int

    @field_validator("type")
    @classmethod
    def _type(cls, value: str) -> str:
        if value != "STRICT_MAJORITY":
            raise ValueError("approvalRule.type must be STRICT_MAJORITY")
        return value


class CanonicalTerms(BaseModel):
    """The closed canonical terms schema (docs/01 §6). ``strict=True`` rejects
    floats supplied where integers are required; ``extra='forbid'`` rejects
    unknown fields."""

    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: str
    chainId: int
    currency: str
    creator: str
    recipient: str
    propertyAlias: str
    leaseStart: int
    leaseEnd: int
    fundingDeadline: int
    claimDeadline: int
    settlementDeadline: int
    tenantContributions: list[TenantContribution] = Field(min_length=2, max_length=8)
    approvalRule: ApprovalRule
    individualDeductionRule: str
    sharedDeductionRule: str
    evidenceRequired: bool

    @field_validator("schemaVersion")
    @classmethod
    def _schema_version(cls, value: str) -> str:
        if value != SCHEMA_VERSION:
            raise ValueError(f"schemaVersion must be {SCHEMA_VERSION}")
        return value

    @field_validator("creator", "recipient")
    @classmethod
    def _addresses(cls, value: str) -> str:
        if not _ADDRESS_RE.match(value):
            raise ValueError("must be a 0x-prefixed 20-byte hex address")
        return value.lower()

    @field_validator(
        "chainId",
        "leaseStart",
        "leaseEnd",
        "fundingDeadline",
        "claimDeadline",
        "settlementDeadline",
    )
    @classmethod
    def _nonnegative(cls, value: int) -> int:
        if value < 0:
            raise ValueError("timestamps and chain ID must be nonnegative integers")
        return value

    @model_validator(mode="after")
    def _consistency(self) -> "CanonicalTerms":
        wallets = [t.wallet for t in self.tenantContributions]
        if len(set(wallets)) != len(wallets):
            raise ValueError("duplicate tenant wallets are not permitted")
        if self.recipient in wallets:
            raise ValueError("the recipient cannot be a tenant")
        if self.creator not in wallets:
            raise ValueError("the creator must be one of the tenants")
        expected = len(wallets) // 2 + 1
        if self.approvalRule.requiredApprovals != expected:
            raise ValueError(
                f"approvalRule.requiredApprovals must be {expected} for "
                f"{len(wallets)} tenants (strict majority)"
            )
        return self


def canonicalize_terms(terms: CanonicalTerms) -> str:
    """The exact canonical JSON text whose UTF-8 bytes are hashed."""
    payload = terms.model_dump(mode="json")
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def terms_hash(terms: CanonicalTerms) -> str:
    """0x-prefixed Keccak-256 of the canonical UTF-8 JSON."""
    return "0x" + keccak(text=canonicalize_terms(terms)).hex()
