"""Read-only Monad RPC service built on web3.py.

Every method reads directly from the chain. Wei values leave this module as
decimal strings (never floats, never JavaScript-unsafe numbers). Nothing here
can sign or broadcast a transaction, and no MySQL value is ever consulted for
financial state.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from web3 import Web3
from web3.types import BlockData, TxData, TxReceipt

from app.config import get_settings

_GENERATED_ARTIFACT = Path(__file__).resolve().parent / "generated" / "shared_deposit_escrow.json"

# Field order mirrors the Solidity structs exactly (docs/02 §3.4/§3.5).
_AGREEMENT_FIELDS = [
    "creator",
    "recipient",
    "termsHash",
    "leaseStart",
    "leaseEnd",
    "fundingDeadline",
    "claimDeadline",
    "settlementDeadline",
    "tenantCount",
    "requiredApprovals",
    "claimCount",
    "unresolvedClaimCount",
    "totalRequired",
    "totalFunded",
    "totalCancelledFundingWithdrawn",
    "totalOpenClaimAmount",
    "totalApprovedClaims",
    "sharedApprovedClaims",
    "recipientAccepted",
    "recipientPayoutWithdrawn",
    "status",
]
_TENANT_FIELDS = [
    "requiredAmount",
    "fundedAmount",
    "openIndividualClaimAmount",
    "approvedIndividualClaims",
    "refundAmount",
    "cancelledFundingWithdrawnAmount",
    "index",
    "exists",
    "accepted",
    "cancelledFundingWithdrawn",
    "refundWithdrawn",
]
_WEI_FIELDS = {
    "totalRequired",
    "totalFunded",
    "totalCancelledFundingWithdrawn",
    "totalOpenClaimAmount",
    "totalApprovedClaims",
    "sharedApprovedClaims",
    "requiredAmount",
    "fundedAmount",
    "openIndividualClaimAmount",
    "approvedIndividualClaims",
    "refundAmount",
    "cancelledFundingWithdrawnAmount",
}

AGREEMENT_STATUS_NAMES = ["NONE", "FUNDING", "ACTIVE", "FINALIZED", "CANCELLED"]


@lru_cache(maxsize=1)
def load_escrow_abi() -> list[dict[str, Any]]:
    """The real compiled ABI from the generated artifact (never hand-written)."""
    artifact = json.loads(_GENERATED_ARTIFACT.read_text(encoding="utf-8"))
    return list(artifact["abi"])


def _normalize(fields: list[str], values: tuple[Any, ...]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name, value in zip(fields, values, strict=True):
        if name in _WEI_FIELDS:
            result[name] = str(value)  # exact decimal string
        elif isinstance(value, bytes):
            result[name] = "0x" + value.hex()
        else:
            result[name] = value
    return result


class ChainService:
    """One instance per process; the HTTP provider is created lazily."""

    def __init__(self, rpc_url: str, contract_address: str | None) -> None:
        self._rpc_url = rpc_url
        self._contract_address = contract_address
        self._web3: Web3 | None = None

    @property
    def web3(self) -> Web3:
        if self._web3 is None:
            self._web3 = Web3(Web3.HTTPProvider(self._rpc_url, request_kwargs={"timeout": 15}))
        return self._web3

    @property
    def contract_address(self) -> str | None:
        return self._contract_address

    # ---------------------------------------------------------------- RPC facts

    def is_reachable(self) -> bool:
        try:
            self.web3.eth.chain_id  # noqa: B018 - simple reachability probe
        except Exception:  # noqa: BLE001
            return False
        return True

    def chain_id(self) -> int:
        return int(self.web3.eth.chain_id)

    def get_transaction(self, tx_hash: str) -> TxData:
        return self.web3.eth.get_transaction(tx_hash)  # type: ignore[arg-type]

    def get_receipt(self, tx_hash: str) -> TxReceipt:
        return self.web3.eth.get_transaction_receipt(tx_hash)  # type: ignore[arg-type]

    def get_block(self, block_number: int) -> BlockData:
        return self.web3.eth.get_block(block_number)

    def get_code(self, address: str) -> str:
        return "0x" + bytes(self.web3.eth.get_code(Web3.to_checksum_address(address))).hex()

    def get_block_header(self, block_number: int) -> dict[str, Any]:
        """Hash and timestamp only — enough to timestamp a mined receipt."""
        block = self.web3.eth.get_block(block_number)
        return {
            "hash": "0x" + bytes(block["hash"]).hex(),
            "timestamp": int(block["timestamp"]),
        }

    def get_transaction_facts(self, tx_hash: str) -> dict[str, Any] | None:
        """Normalized public facts of one transaction, or None while the node
        does not know the hash. Never raises for an unknown hash."""
        try:
            tx = self.web3.eth.get_transaction(tx_hash)  # type: ignore[arg-type]
        except Exception:  # noqa: BLE001 - unknown/pending hashes raise in web3
            return None
        block_number = tx.get("blockNumber")
        return {
            "hash": "0x" + bytes(tx["hash"]).hex(),
            "from": str(tx["from"]).lower(),
            "to": str(tx["to"]).lower() if tx.get("to") else None,
            "input": "0x" + bytes(tx["input"]).hex(),
            "value": str(int(tx["value"])),
            "nonce": int(tx["nonce"]),
            "blockNumber": int(block_number) if block_number is not None else None,
        }

    def get_receipt_facts(self, tx_hash: str) -> dict[str, Any] | None:
        """Normalized receipt facts, or None while no receipt exists."""
        try:
            receipt = self.web3.eth.get_transaction_receipt(tx_hash)  # type: ignore[arg-type]
        except Exception:  # noqa: BLE001 - receipt not available yet
            return None
        return {
            "status": int(receipt["status"]),
            "blockNumber": int(receipt["blockNumber"]),
            "blockHash": "0x" + bytes(receipt["blockHash"]).hex(),
            "to": str(receipt["to"]).lower() if receipt.get("to") else None,
            "from": str(receipt["from"]).lower(),
            "logs": [dict(log) for log in receipt["logs"]],
        }

    # ------------------------------------------------------------ contract reads

    def _contract(self) -> Any:
        if not self._contract_address:
            raise RuntimeError("no verified contract deployment is configured")
        return self.web3.eth.contract(
            address=Web3.to_checksum_address(self._contract_address), abi=load_escrow_abi()
        )

    def read_agreement(self, agreement_id: int) -> dict[str, Any]:
        values = self._contract().functions.getAgreement(agreement_id).call()
        agreement = _normalize(_AGREEMENT_FIELDS, tuple(values))
        agreement["creator"] = str(agreement["creator"]).lower()
        agreement["recipient"] = str(agreement["recipient"]).lower()
        agreement["statusName"] = AGREEMENT_STATUS_NAMES[int(agreement["status"])]
        return agreement

    def read_tenants(self, agreement_id: int) -> list[str]:
        values = self._contract().functions.getAgreementTenants(agreement_id).call()
        return [str(address).lower() for address in values]

    def read_tenant(self, agreement_id: int, wallet: str) -> dict[str, Any]:
        values = (
            self._contract()
            .functions.getTenant(agreement_id, Web3.to_checksum_address(wallet))
            .call()
        )
        return _normalize(_TENANT_FIELDS, tuple(values))

    def read_remaining_contribution(self, agreement_id: int, wallet: str) -> str:
        value = (
            self._contract()
            .functions.getRemainingContribution(agreement_id, Web3.to_checksum_address(wallet))
            .call()
        )
        return str(value)

    # ----------------------------------------------------------- verifications

    def decode_agreement_created(self, receipt: TxReceipt) -> dict[str, Any] | None:
        """Decodes the AgreementCreated event from a receipt, requiring it to
        originate from the configured contract."""
        events = self._contract().events.AgreementCreated().process_receipt(receipt)
        for event in events:
            if str(event["address"]).lower() == str(self._contract_address).lower():
                args = event["args"]
                return {
                    "agreementId": int(args["agreementId"]),
                    "creator": str(args["creator"]).lower(),
                    "recipient": str(args["recipient"]).lower(),
                    "termsHash": "0x" + bytes(args["termsHash"]).hex(),
                    "totalRequired": str(args["totalRequired"]),
                }
        return None


def get_chain_service() -> ChainService:
    """Process-wide service bound to current settings and verified deployment."""
    global _service
    if _service is None:
        from app.blockchain.deployment import load_deployment_metadata

        settings = get_settings()
        metadata = load_deployment_metadata()
        address = settings.escrow_contract_address or (
            metadata.contract_address if metadata else None
        )
        _service = ChainService(settings.rpc_url, address or None)
    return _service


_service: ChainService | None = None


def reset_chain_service() -> None:
    """Test hook."""
    global _service
    _service = None
