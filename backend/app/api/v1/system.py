"""System endpoints: process-level health and real readiness checks.

Health reports process facts only. Readiness performs live MySQL and
migration-state checks during the request and returns 503 when the backend
must not receive traffic. Neither endpoint claims anything about contract
deployment, RPC connectivity, or indexer state — those checks arrive with the
features themselves in later phases.
"""

from fastapi import APIRouter, Response, status

from app.config import get_settings
from app.database.engine import get_engine
from app.database.health import check_readiness
from app.schemas.system import HealthResponse, ReadinessResponse

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        app_version=settings.app_version,
        environment=settings.app_env,
        chain_id=settings.chain_id,
    )


@router.get("/readiness", response_model=ReadinessResponse)
def readiness(response: Response) -> ReadinessResponse:
    settings = get_settings()
    result = check_readiness(get_engine(), settings.database_name)
    if not result.ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(
        ready=result.ready,
        database_reachable=result.database_reachable,
        database_selected=result.database_selected,
        migration_current=result.migration_current,
        current_revision=result.current_revision,
        head_revision=result.head_revision,
        detail=result.detail,
    )
