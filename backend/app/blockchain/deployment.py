"""Verified public deployment metadata loader.

The single source for the escrow contract address is
``contracts/deployments/monad-testnet.json`` — written only by the deployment
script after a real receipt, bytecode verification, and source verification.
No placeholder addresses exist anywhere; when the file is absent the
application reports deployment status ``missing`` instead of inventing one.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_DEFAULT_METADATA_PATH = _BACKEND_DIR.parent / "contracts" / "deployments" / "monad-testnet.json"


@dataclass(frozen=True)
class DeploymentMetadata:
    contract_name: str
    chain_id: int
    contract_address: str
    deployment_tx_hash: str
    deployment_block: int
    deployer_address: str
    runtime_bytecode_hash: str
    source_verification: dict[str, Any]
    explorers: dict[str, Any]


@lru_cache(maxsize=1)
def load_deployment_metadata() -> DeploymentMetadata | None:
    """The verified deployment record, or None when nothing is deployed."""
    if not _DEFAULT_METADATA_PATH.exists():
        return None
    raw = json.loads(_DEFAULT_METADATA_PATH.read_text(encoding="utf-8"))
    return DeploymentMetadata(
        contract_name=str(raw["contractName"]),
        chain_id=int(raw["chainId"]),
        contract_address=str(raw["contractAddress"]),
        deployment_tx_hash=str(raw["deploymentTransactionHash"]),
        deployment_block=int(raw["deploymentBlockNumber"]),
        deployer_address=str(raw["deploymentWalletAddress"]),
        runtime_bytecode_hash=str(raw["runtimeBytecodeHash"]),
        source_verification=dict(raw.get("sourceVerification", {})),
        explorers=dict(raw.get("explorers", {})),
    )


def clear_deployment_cache() -> None:
    """Test hook."""
    load_deployment_metadata.cache_clear()
