"""Engine factory. No connection is opened at import time; engines connect
lazily on first use and are created only when explicitly requested."""

from sqlalchemy import Engine, create_engine

from app.config import Settings, get_settings

# The local WAMP MySQL server ships with a blank sql_mode, which silently
# clamps out-of-range numbers and truncates overlong strings. Financial data
# must never be silently altered, so every application connection enforces
# strict semantics itself instead of relying on (or changing) server defaults.
STRICT_SQL_MODE = (
    "STRICT_TRANS_TABLES,STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO"
)
STRICT_CONNECT_ARGS = {"init_command": f"SET SESSION sql_mode='{STRICT_SQL_MODE}'"}

_engine: Engine | None = None


def create_app_engine(settings: Settings) -> Engine:
    """Creates a new engine from validated settings. Does not connect."""
    return create_engine(
        settings.database_url.get_secret_value(),
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_timeout=30,
        pool_size=5,
        max_overflow=10,
        connect_args=dict(STRICT_CONNECT_ARGS),
        # Never echo SQL by default: statements may embed user metadata.
        echo=False,
    )


def get_engine() -> Engine:
    """Process-wide engine, created on first use (never at import)."""
    global _engine
    if _engine is None:
        _engine = create_app_engine(get_settings())
    return _engine


def dispose_engine() -> None:
    """Disposes the process engine (used by tests and shutdown)."""
    global _engine
    if _engine is not None:
        _engine.dispose()
        _engine = None
