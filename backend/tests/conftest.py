"""Shared test fixtures.

Tests run against a REAL MySQL database (never SQLite, never in-memory).
The dedicated test database name MUST end in ``_test`` — every destructive
operation is guarded by that rule, and ``shared_deposit`` itself is never
dropped or truncated by the test suite.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from urllib.parse import unquote, urlsplit

import pymysql
import pytest
from alembic.config import Config as AlembicConfig
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session

from alembic import command

# Defaults for local WAMP development; CI overrides via environment variables.
# APP_ENV=test disables live Monad RPC checks in readiness: automated tests
# must never contact Monad Testnet.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault(
    "DATABASE_URL", "mysql+pymysql://root:@127.0.0.1:3306/shared_deposit?charset=utf8mb4"
)
os.environ.setdefault(
    "TEST_DATABASE_URL",
    "mysql+pymysql://root:@127.0.0.1:3306/shared_deposit_test?charset=utf8mb4",
)

from app.config import Settings  # noqa: E402
from app.database.engine import STRICT_CONNECT_ARGS  # noqa: E402

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def assert_test_database_name(name: str) -> None:
    """Hard guard: destructive test operations only ever touch *_test databases."""
    if not name.endswith("_test"):
        raise RuntimeError(
            f"refusing to run destructive test setup against database {name!r}: "
            "the name must end with _test"
        )


def get_test_database_url() -> str:
    url = os.environ["TEST_DATABASE_URL"]
    name = urlsplit(url).path.lstrip("/").split("?")[0]
    assert_test_database_name(name)
    return url


def derive_test_db_url(tag: str) -> str:
    """A sibling *_test database URL derived from TEST_DATABASE_URL, safe in
    every environment regardless of the configured test-database name."""
    url = get_test_database_url()
    parsed = urlsplit(url)
    name = parsed.path.lstrip("/").split("?")[0]
    new_name = name.removesuffix("_test") + f"_{tag}_test"
    assert_test_database_name(new_name)
    return url.replace(f"/{name}", f"/{new_name}", 1)


def make_test_settings(**overrides: str) -> Settings:
    """Settings isolated from backend/.env, pointing at the test database."""
    values = {
        "DATABASE_URL": get_test_database_url(),
        "APP_ENV": "test",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def _server_connection(url: str) -> pymysql.connections.Connection[pymysql.cursors.Cursor]:
    parsed = urlsplit(url)
    return pymysql.connect(
        host=parsed.hostname or "127.0.0.1",
        port=parsed.port or 3306,
        user=unquote(parsed.username or "root"),
        password=unquote(parsed.password or ""),
        charset="utf8mb4",
    )


def ensure_test_database(url: str) -> None:
    name = urlsplit(url).path.lstrip("/").split("?")[0]
    assert_test_database_name(name)
    connection = _server_connection(url)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{name}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        connection.commit()
    finally:
        connection.close()


def drop_test_database(url: str) -> None:
    """Drops a *_test database. The guard makes this impossible to point at
    shared_deposit or any non-test schema."""
    name = urlsplit(url).path.lstrip("/").split("?")[0]
    assert_test_database_name(name)
    connection = _server_connection(url)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"DROP DATABASE IF EXISTS `{name}`")
        connection.commit()
    finally:
        connection.close()


def alembic_config_for(url: str) -> AlembicConfig:
    config = AlembicConfig(os.path.join(BACKEND_DIR, "alembic.ini"))
    config.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.fixture(scope="session")
def test_db_engine() -> Iterator[Engine]:
    """Session engine bound to the guarded *_test database, migrated to head
    from a clean slate."""
    url = get_test_database_url()
    ensure_test_database(url)
    # Deterministic start: rebuild the guarded test schema from scratch.
    drop_test_database(url)
    ensure_test_database(url)
    command.upgrade(alembic_config_for(url), "head")
    engine = create_engine(url, pool_pre_ping=True, connect_args=dict(STRICT_CONNECT_ARGS))
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(test_db_engine: Engine) -> Iterator[Session]:
    """One transaction-per-test session; everything rolls back afterwards."""
    connection = test_db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def clean_tables(test_db_engine: Engine) -> Iterator[Engine]:
    """For tests that must commit for real (constraint tests): truncates the
    touched tables afterwards — guarded, test database only."""
    yield test_db_engine
    with test_db_engine.connect() as connection:
        assert_test_database_name(connection.execute(text("SELECT DATABASE()")).scalar() or "")
        connection.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        for table in [
            "agreement_draft_tenants",
            "agreement_drafts",
            "agreement_metadata",
            "agreement_index",
            "audit_log",
            "auth_nonces",
            "auth_sessions",
            "chain_events",
            "chain_sync_state",
            "claim_drafts",
            "claim_index",
            "evidence_files",
            "evidence_manifests",
            "invitations",
            "wallet_profiles",
        ]:
            connection.execute(text(f"DELETE FROM `{table}`"))
        connection.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        connection.commit()
