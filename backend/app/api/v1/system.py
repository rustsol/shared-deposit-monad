"""System endpoints: health, readiness, and verified public configuration.

Health reports process facts only. Readiness performs live MySQL/migration
checks always, and live RPC + contract checks outside the test environment
(CI must never contact Monad Testnet; the response says explicitly whether
the RPC checks ran). /config/public returns only verified public values -
the contract address appears exclusively after a verified real deployment;
before that, deploymentStatus is honestly "missing".
"""

from typing import Any

from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.blockchain.deployment import load_deployment_metadata
from app.blockchain.service import get_chain_service
from app.config import get_settings
from app.database.engine import get_engine
from app.database.health import check_readiness
from app.schemas.system import HealthResponse, ReadinessResponse

router = APIRouter(tags=["system"])

_LOCAL_ENVS = {"development", "test"}


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        app_version=settings.app_version,
        environment=settings.app_env,
        chain_id=settings.chain_id,
    )


class ExtendedReadinessResponse(ReadinessResponse):
    rpc_checked: bool = False
    rpc_reachable: bool | None = None
    rpc_chain_id_correct: bool | None = None
    deployment_status: str = "missing"
    contract_code_present: bool | None = None


@router.get("/readiness", response_model=ExtendedReadinessResponse)
def readiness(response: Response) -> ExtendedReadinessResponse:
    settings = get_settings()
    database = check_readiness(get_engine(), settings.database_name)

    metadata = load_deployment_metadata()
    deployment_status = "verified" if metadata else "missing"

    rpc_checked = False
    rpc_reachable: bool | None = None
    rpc_chain_ok: bool | None = None
    code_present: bool | None = None
    chain_ready = True
    # CI and automated tests must never contact Monad Testnet.
    if settings.app_env != "test":
        rpc_checked = True
        service = get_chain_service()
        rpc_reachable = service.is_reachable()
        if rpc_reachable:
            try:
                rpc_chain_ok = service.chain_id() == settings.chain_id
            except Exception:  # noqa: BLE001
                rpc_chain_ok = False
        else:
            rpc_chain_ok = False
        if metadata and rpc_reachable and rpc_chain_ok:
            try:
                code_present = service.get_code(metadata.contract_address) not in ("0x", "")
            except Exception:  # noqa: BLE001
                code_present = False
        chain_ready = bool(rpc_reachable and rpc_chain_ok) and (
            metadata is None or bool(code_present)
        )

    ready = database.ready and chain_ready
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    detail = database.detail
    if database.ready and not chain_ready:
        detail = (
            "deployment_required: no verified contract deployment"
            if metadata is None
            else "chain checks failed"
        )

    return ExtendedReadinessResponse(
        ready=ready,
        database_reachable=database.database_reachable,
        database_selected=database.database_selected,
        migration_current=database.migration_current,
        current_revision=database.current_revision,
        head_revision=database.head_revision,
        detail=detail,
        rpc_checked=rpc_checked,
        rpc_reachable=rpc_reachable,
        rpc_chain_id_correct=rpc_chain_ok,
        deployment_status=deployment_status,
        contract_code_present=code_present,
    )


class PublicConfigResponse(BaseModel):
    environment: str
    network_name: str
    chain_id: int
    rpc_url: str
    native_currency_symbol: str
    native_currency_decimals: int
    primary_explorer_url: str
    secondary_explorer_url: str
    deployment_status: str
    contract_address: str | None = None
    deployment_tx_hash: str | None = None
    deployment_block: int | None = None
    runtime_bytecode_verified: bool | None = None
    source_verification: dict[str, Any] | None = None
    explorers: dict[str, Any] | None = None
    app_version: str
    git_commit_sha: str


@router.get("/config/public", response_model=PublicConfigResponse)
def public_config() -> PublicConfigResponse:
    settings = get_settings()
    metadata = load_deployment_metadata()
    return PublicConfigResponse(
        environment=settings.app_env,
        network_name=settings.chain_name,
        chain_id=settings.chain_id,
        rpc_url=settings.rpc_url,
        native_currency_symbol="MON",
        native_currency_decimals=18,
        primary_explorer_url="https://testnet.monadvision.com",
        secondary_explorer_url="https://testnet.monadscan.com",
        deployment_status="verified" if metadata else "missing",
        contract_address=metadata.contract_address if metadata else None,
        deployment_tx_hash=metadata.deployment_tx_hash if metadata else None,
        deployment_block=metadata.deployment_block if metadata else None,
        runtime_bytecode_verified=True if metadata else None,
        source_verification=metadata.source_verification if metadata else None,
        explorers=metadata.explorers if metadata else None,
        app_version=settings.app_version,
        git_commit_sha=settings.git_commit_sha,
    )
