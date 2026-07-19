"""Direct Monad Testnet RPC access (read-only).

This package never signs or broadcasts transactions and never holds key
material. It is the application's source of financial truth: every balance,
acceptance flag, and status shown to users is read from the contract here -
MySQL supplies only private metadata and caches.
"""

from app.blockchain.deployment import DeploymentMetadata, load_deployment_metadata
from app.blockchain.service import ChainService, get_chain_service

__all__ = [
    "ChainService",
    "DeploymentMetadata",
    "get_chain_service",
    "load_deployment_metadata",
]
