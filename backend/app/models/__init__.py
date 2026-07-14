"""SQLAlchemy models for all 15 documented tables (docs/02 §5.4).

Authoritative-data boundary: models here hold authentication, private
metadata, drafts, invitations, and audit records. The *_index, chain_events,
and chain_sync_state tables are event-derived caches of onchain state — the
SharedDepositEscrow contract remains the only financial authority.
"""

from app.models.agreements import (
    AgreementDraft,
    AgreementDraftTenant,
    AgreementIndex,
    AgreementMetadata,
)
from app.models.audit import AuditLog
from app.models.auth import AuthNonce, AuthSession
from app.models.chain import ChainEvent, ChainSyncState
from app.models.claims import ClaimDraft, ClaimIndex
from app.models.evidence import EvidenceFile, EvidenceManifest
from app.models.invitations import Invitation
from app.models.wallet import WalletProfile

__all__ = [
    "AgreementDraft",
    "AgreementDraftTenant",
    "AgreementIndex",
    "AgreementMetadata",
    "AuditLog",
    "AuthNonce",
    "AuthSession",
    "ChainEvent",
    "ChainSyncState",
    "ClaimDraft",
    "ClaimIndex",
    "EvidenceFile",
    "EvidenceManifest",
    "Invitation",
    "WalletProfile",
]
