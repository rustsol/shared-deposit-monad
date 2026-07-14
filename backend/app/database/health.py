"""Readiness checks: real MySQL connectivity, selected database, and Alembic
migration state. Failures never leak URLs, credentials, SQL, or stack traces."""

from dataclasses import dataclass
from pathlib import Path

from alembic.config import Config as AlembicConfig
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, text

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


@dataclass(frozen=True)
class ReadinessResult:
    ready: bool
    database_reachable: bool
    database_selected: bool
    migration_current: bool
    current_revision: str | None
    head_revision: str | None
    detail: str


def expected_head_revision() -> str | None:
    """The migration head according to the committed Alembic scripts."""
    config = AlembicConfig(str(_BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(_BACKEND_DIR / "alembic"))
    script = ScriptDirectory.from_config(config)
    return script.get_current_head()


def check_readiness(engine: Engine, expected_database: str) -> ReadinessResult:
    """Performs live checks. Safe failure messages only."""
    current_revision: str | None = None
    head = expected_head_revision()
    try:
        with engine.connect() as connection:
            if connection.execute(text("SELECT 1")).scalar() != 1:
                return _not_ready("database check query failed", head)
            selected = connection.execute(text("SELECT DATABASE()")).scalar()
            if selected != expected_database:
                return _not_ready("configured database is not selected", head)
            try:
                current_revision = connection.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar()
            except Exception:  # noqa: BLE001 - table missing means unmigrated
                return ReadinessResult(
                    ready=False,
                    database_reachable=True,
                    database_selected=True,
                    migration_current=False,
                    current_revision=None,
                    head_revision=head,
                    detail="migration state unavailable (alembic_version missing)",
                )
    except Exception:  # noqa: BLE001 - connectivity failure; details stay internal
        return _not_ready("database unreachable", head)

    migration_current = head is not None and current_revision == head
    return ReadinessResult(
        ready=migration_current,
        database_reachable=True,
        database_selected=True,
        migration_current=migration_current,
        current_revision=current_revision,
        head_revision=head,
        detail="ready" if migration_current else "migrations are not at head",
    )


def _not_ready(detail: str, head: str | None) -> ReadinessResult:
    return ReadinessResult(
        ready=False,
        database_reachable=detail != "database unreachable",
        database_selected=False,
        migration_current=False,
        current_revision=None,
        head_revision=head,
        detail=detail,
    )
