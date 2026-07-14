"""Health and readiness endpoint behavior with real database checks."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine

import app.database.health as health_module
from app.database.health import check_readiness, expected_head_revision
from app.main import app
from tests.conftest import (
    drop_test_database,
    ensure_test_database,
    get_test_database_url,
)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def test_health_reports_process_facts_only(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert set(body) == {"status", "app_version", "environment", "chain_id"}
    text = response.text.lower()
    assert "mysql" not in text
    assert "password" not in text


def test_readiness_ready_when_database_migrated(client: TestClient) -> None:
    # The local/CI application database is created and migrated before tests.
    response = client.get("/api/v1/readiness")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ready"] is True
    assert body["migration_current"] is True
    assert body["current_revision"] == body["head_revision"]
    assert body["head_revision"] == expected_head_revision()


def test_readiness_endpoint_never_leaks_secrets(client: TestClient) -> None:
    response = client.get("/api/v1/readiness")
    text = response.text.lower()
    for needle in ("mysql+pymysql", "password", "traceback", "select "):
        assert needle not in text


def test_not_ready_when_mysql_unreachable() -> None:
    engine = create_engine(
        "mysql+pymysql://root:@203.0.113.1:3306/nope",
        connect_args={"connect_timeout": 2},
        pool_pre_ping=True,
    )
    result = check_readiness(engine, "nope")
    assert result.ready is False
    assert result.database_reachable is False
    assert "unreachable" in result.detail
    # No URL, credential, or SQL text in the safe detail.
    assert "mysql" not in result.detail.lower() or result.detail == "database unreachable"
    engine.dispose()


def test_not_ready_when_database_missing() -> None:
    missing_url = get_test_database_url().replace(
        "shared_deposit_test", "shared_deposit_missing_test"
    )
    drop_test_database(missing_url)
    engine = create_engine(missing_url, connect_args={"connect_timeout": 2})
    result = check_readiness(engine, "shared_deposit_missing_test")
    assert result.ready is False
    engine.dispose()


def test_not_ready_when_unmigrated(tmp_path: object) -> None:
    empty_url = get_test_database_url().replace("shared_deposit_test", "shared_deposit_empty_test")
    ensure_test_database(empty_url)
    engine = create_engine(empty_url)
    try:
        result = check_readiness(engine, "shared_deposit_empty_test")
        assert result.ready is False
        assert result.database_reachable is True
        assert result.migration_current is False
        assert result.current_revision is None
    finally:
        engine.dispose()
        drop_test_database(empty_url)


def test_not_ready_when_migrations_behind(
    test_db_engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    from urllib.parse import urlsplit

    database_name = urlsplit(get_test_database_url()).path.lstrip("/").split("?")[0]
    # Simulate a repository with a newer head than the database revision.
    monkeypatch.setattr(health_module, "expected_head_revision", lambda: "ffffffffffff")
    result = health_module.check_readiness(test_db_engine, database_name)
    assert result.ready is False
    assert result.migration_current is False
    assert result.head_revision == "ffffffffffff"
