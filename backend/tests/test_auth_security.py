"""Cross-cutting security: log redaction, audit-row safety, schema shape."""

from __future__ import annotations

import logging
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.auth.messages import extract_nonce
from app.auth.ratelimit import limiter
from app.database.base import Base
from app.main import app
from app.middleware import redact_path
from app.models import AuditLog
from tests.auth_helpers import (
    clear_auth_tables,
    create_draft,
    login,
    make_client,
    request_nonce,
)
from tests.fixtures.wallets import KEY_FOR, WALLET_A, WALLET_B, WALLET_C, sign_message

ORIGIN = "http://localhost:5173"


@pytest.fixture
def client(test_db_engine: Engine) -> Iterator[TestClient]:
    limiter.reset()
    yield make_client(test_db_engine)
    app.dependency_overrides.clear()
    clear_auth_tables(test_db_engine)
    limiter.reset()


def test_access_log_redacts_invitation_tokens(
    client: TestClient, test_db_engine: Engine, caplog: pytest.LogCaptureFixture
) -> None:
    draft_id = create_draft(test_db_engine, WALLET_A, WALLET_B, [(WALLET_A, "1"), (WALLET_C, "1")])
    csrf = login(client, WALLET_A)["csrf_token"]
    response = client.post(
        f"/api/v1/agreement-drafts/{draft_id}/invitations",
        json={"expected_wallet": WALLET_C, "role": "TENANT"},
        headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
    )
    raw_token = response.json()["invitation_token"]

    with caplog.at_level(logging.INFO, logger="app.access"):
        client.get(f"/api/v1/invitations/{raw_token}")
        client.post(
            f"/api/v1/invitations/{raw_token}/claim",
            headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
        )
    assert raw_token not in caplog.text
    assert "[redacted]" in caplog.text


def test_redact_path_helper() -> None:
    assert (
        redact_path("/api/v1/invitations/SoMe-Secret_Token123") == "/api/v1/invitations/[redacted]"
    )
    assert redact_path("/api/v1/invitations/tok/claim") == "/api/v1/invitations/[redacted]/claim"
    assert redact_path("/api/v1/health") == "/api/v1/health"


def test_no_sensitive_values_in_any_captured_logs(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.DEBUG):
        message = request_nonce(client, WALLET_A)
        raw_nonce = extract_nonce(message)
        signature = sign_message(message, KEY_FOR[WALLET_A])
        client.post(
            "/api/v1/auth/verify",
            json={"address": WALLET_A, "message": message, "signature": signature},
        )
        raw_cookie = client.cookies.get("shared_deposit_session")
        csrf = client.get("/api/v1/auth/me").json()["csrf_token"]
        client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf, "Origin": ORIGIN})

    assert raw_nonce is not None and raw_nonce not in caplog.text
    assert signature not in caplog.text
    assert raw_cookie is not None and raw_cookie not in caplog.text
    assert csrf not in caplog.text


def test_audit_rows_contain_no_secret_material(client: TestClient, test_db_engine: Engine) -> None:
    draft_id = create_draft(test_db_engine, WALLET_A, WALLET_B, [(WALLET_A, "1"), (WALLET_C, "1")])
    message = request_nonce(client, WALLET_A)
    raw_nonce = extract_nonce(message)
    signature = sign_message(message, KEY_FOR[WALLET_A])
    client.post(
        "/api/v1/auth/verify",
        json={"address": WALLET_A, "message": message, "signature": signature},
    )
    raw_cookie = client.cookies.get("shared_deposit_session")
    csrf = client.get("/api/v1/auth/me").json()["csrf_token"]
    response = client.post(
        f"/api/v1/agreement-drafts/{draft_id}/invitations",
        json={"expected_wallet": WALLET_C, "role": "TENANT"},
        headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
    )
    raw_invitation = response.json()["invitation_token"]
    # A failed authentication also writes a safe audit row.
    client.post(
        "/api/v1/auth/verify",
        json={"address": WALLET_A, "message": message, "signature": signature},
    )

    with Session(bind=test_db_engine) as db:
        rows = db.query(AuditLog).all()
        assert rows, "expected audit rows"
        event_types = {row.event_type for row in rows}
        assert "auth.nonce_issued" in event_types
        assert "auth.succeeded" in event_types
        assert "auth.failed" in event_types
        assert "invitation.created" in event_types
        blob = " ".join(f"{row.event_type} {row.target_id} {row.metadata_json}" for row in rows)
        for secret in (raw_nonce, signature, raw_cookie, csrf, raw_invitation):
            assert secret is not None
            assert secret not in blob


def test_schema_still_has_no_raw_secret_columns() -> None:
    forbidden = {"password", "private_key", "seed_phrase", "mnemonic", "raw_token"}
    for table in Base.metadata.tables.values():
        for column in table.columns:
            assert column.name not in forbidden
            if "token" in column.name or "nonce" in column.name:
                assert column.name.endswith("_hash") or column.name in {
                    "superseded_by",
                }, f"{table.name}.{column.name}"


def test_error_responses_never_leak_internals(client: TestClient) -> None:
    login(client, WALLET_A)
    responses = [
        client.post(
            "/api/v1/auth/verify", json={"address": WALLET_A, "message": "x", "signature": "0x00"}
        ),
        client.get("/api/v1/invitations/unknown-token"),
        client.post("/api/v1/auth/logout"),  # missing CSRF
    ]
    for response in responses:
        text = response.text.lower()
        for needle in ("traceback", "mysql", "select ", "sqlalchemy", "password"):
            assert needle not in text
