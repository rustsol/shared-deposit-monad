"""Shared helpers for authentication and invitation tests: a TestClient bound
to the guarded *_test database, login flows using test-only wallets, and
draft fixtures."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from app.database.session import get_db_session
from app.main import app
from app.models import AgreementDraft, AgreementDraftTenant
from tests.fixtures.wallets import KEY_FOR, sign_message

AUTH_TABLES = [
    "contract_transactions",
    "agreement_metadata",
    "agreement_index",
    "audit_log",
    "auth_nonces",
    "auth_sessions",
    "invitations",
    "agreement_draft_tenants",
    "agreement_drafts",
    "wallet_profiles",
]


def make_client(engine: Engine) -> TestClient:
    """TestClient whose request sessions are bound to the test database."""

    def _test_db_session() -> Iterator[Session]:
        session = Session(bind=engine, expire_on_commit=False, autoflush=False)
        try:
            yield session
            session.rollback()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = _test_db_session
    return TestClient(app)


def clear_auth_tables(engine: Engine) -> None:
    with engine.connect() as connection:
        database = connection.execute(text("SELECT DATABASE()")).scalar() or ""
        if not database.endswith("_test"):  # hard guard
            raise RuntimeError(f"refusing to clear tables in {database!r}")
        connection.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        for table in AUTH_TABLES:
            connection.execute(text(f"DELETE FROM `{table}`"))
        connection.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        connection.commit()


def request_nonce(client: TestClient, wallet: str) -> str:
    response = client.post("/api/v1/auth/nonce", json={"address": wallet})
    assert response.status_code == 200, response.text
    return str(response.json()["message"])


def login(client: TestClient, wallet: str) -> dict[str, Any]:
    """Full nonce → sign → verify flow with the wallet's test key. Returns the
    verify response body (contains the CSRF token); the session cookie is
    stored on the client automatically."""
    message = request_nonce(client, wallet)
    signature = sign_message(message, KEY_FOR[wallet])
    response = client.post(
        "/api/v1/auth/verify",
        json={"address": wallet, "message": message, "signature": signature},
    )
    assert response.status_code == 200, response.text
    return dict(response.json())


def create_draft(
    engine: Engine, creator: str, recipient: str, tenants: list[tuple[str, str]]
) -> str:
    """Inserts a pre-onchain draft directly (draft CRUD APIs are a later
    phase). tenants: list of (wallet, required_amount_wei)."""
    now = datetime.now(UTC).replace(tzinfo=None)
    draft_id = str(uuid.uuid4())
    with Session(bind=engine) as db:
        db.add(
            AgreementDraft(
                id=draft_id,
                creator_address=creator,
                recipient_address=recipient,
                property_alias="Test draft alias",
                private_address=None,
                terms_json={"schemaVersion": "1.0"},
                terms_hash="0x" + uuid.uuid4().hex + uuid.uuid4().hex,
                chain_id=10143,
                contract_address="0x" + "cc" * 20,
                agreement_id_onchain=None,
                creation_tx_hash=None,
                creation_block_number=None,
                status="DRAFT",
                created_at=now,
                updated_at=now,
            )
        )
        for index, (wallet, amount) in enumerate(tenants):
            db.add(
                AgreementDraftTenant(
                    draft_id=draft_id,
                    tenant_index=index,
                    wallet_address=wallet,
                    display_label=None,
                    required_amount_wei=Decimal(amount),
                )
            )
        db.commit()
    return draft_id
