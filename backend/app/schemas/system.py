"""Health and readiness response schemas. These never carry database URLs,
credentials, SQL text, or exception details."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    app_version: str
    environment: str
    chain_id: int


class ReadinessResponse(BaseModel):
    ready: bool
    database_reachable: bool
    database_selected: bool
    migration_current: bool
    current_revision: str | None
    head_revision: str | None
    detail: str
