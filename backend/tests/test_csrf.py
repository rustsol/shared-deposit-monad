"""CSRF and origin enforcement for cookie-authenticated mutations."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from app.auth.ratelimit import limiter
from app.main import app
from tests.auth_helpers import clear_auth_tables, login, make_client
from tests.fixtures.wallets import WALLET_A, WALLET_B

ORIGIN = "http://localhost:5173"


@pytest.fixture
def client(test_db_engine: Engine) -> Iterator[TestClient]:
    limiter.reset()
    yield make_client(test_db_engine)
    app.dependency_overrides.clear()
    clear_auth_tables(test_db_engine)
    limiter.reset()


def test_valid_csrf_with_approved_origin_succeeds(client: TestClient) -> None:
    csrf = login(client, WALLET_A)["csrf_token"]
    response = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf, "Origin": ORIGIN})
    assert response.status_code == 200


def test_missing_and_invalid_csrf_rejected(client: TestClient) -> None:
    login(client, WALLET_A)
    assert client.post("/api/v1/auth/logout").status_code == 403  # missing
    assert (
        client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "aa" * 32}).status_code == 403
    )  # invalid


def test_csrf_from_another_session_rejected(client: TestClient, test_db_engine: Engine) -> None:
    other_client = make_client(test_db_engine)
    other_csrf = login(other_client, WALLET_B)["csrf_token"]
    login(client, WALLET_A)
    response = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": other_csrf})
    assert response.status_code == 403  # bound to the other wallet's session


def test_session_cookie_is_not_a_valid_csrf_token(client: TestClient) -> None:
    login(client, WALLET_A)
    raw_cookie = client.cookies.get("shared_deposit_session")
    assert raw_cookie
    response = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": raw_cookie})
    assert response.status_code == 403


def test_wrong_origin_rejected_even_with_valid_csrf(client: TestClient) -> None:
    csrf = login(client, WALLET_A)["csrf_token"]
    for origin in ("https://evil.example.com", "http://localhost:5174"):
        response = client.post(
            "/api/v1/auth/logout", headers={"X-CSRF-Token": csrf, "Origin": origin}
        )
        assert response.status_code == 403, origin


def test_read_only_get_requires_no_csrf(client: TestClient) -> None:
    login(client, WALLET_A)
    response = client.get("/api/v1/auth/me")  # no CSRF header
    assert response.status_code == 200
    assert response.json()["authenticated"] is True
