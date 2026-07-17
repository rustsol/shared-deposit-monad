"""Transaction API tests: recording authorization, idempotency, reload
recovery listing, agreement timeline gating, and stale-cache refresh.

The fake chain is injected via the module's _chain hook; APP_ENV=test keeps
everything offline.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

import app.api.v1.transactions as tx_api
from app.auth.ratelimit import limiter
from app.main import app
from app.models import AgreementIndex, AgreementMetadata
from tests.auth_helpers import clear_auth_tables, login, make_client
from tests.fixtures.wallets import WALLET_A, WALLET_B, WALLET_C
from tests.test_transactions import (
    ACTIVE_AGREEMENT,
    CHAIN_ID,
    CONTRACT,
    TX_ACCEPT_CREATOR,
    TX_CREATE,
    FakeTxChain,
)


@pytest.fixture
def chain(monkeypatch: pytest.MonkeyPatch) -> FakeTxChain:
    fake = FakeTxChain()
    monkeypatch.setattr(tx_api, "_chain", lambda: fake)
    return fake


@pytest.fixture
def client(test_db_engine: Engine, chain: FakeTxChain) -> Iterator[TestClient]:
    limiter.reset()
    yield make_client(test_db_engine)
    app.dependency_overrides.clear()
    clear_auth_tables(test_db_engine)
    limiter.reset()


def seed_agreement(engine: Engine, status: str = "FUNDING") -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    with Session(bind=engine) as db:
        db.add(
            AgreementIndex(
                chain_id=CHAIN_ID,
                contract_address=CONTRACT,
                agreement_id=Decimal(2),
                creator_address=WALLET_A,
                recipient_address=WALLET_B,
                terms_hash=str(ACTIVE_AGREEMENT["termsHash"]),
                status_cache=status,
                last_synced_block=45074511,
                created_tx_hash=TX_CREATE,
                created_at_chain=now,
                updated_at=now,
            )
        )
        db.add(
            AgreementMetadata(
                chain_id=CHAIN_ID,
                contract_address=CONTRACT,
                agreement_id=Decimal(2),
                property_alias="Tx API test",
                private_address=None,
                terms_json={"tenantContributions": [{"wallet": WALLET_A}]},
                is_shareable=False,
                created_at=now,
            )
        )
        db.commit()


ORIGIN = "http://localhost:5173"


def login_headers(client: TestClient, wallet: str) -> dict[str, str]:
    body = login(client, wallet)
    return {"X-CSRF-Token": body["csrf_token"], "Origin": ORIGIN}


def record_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "chain_id": CHAIN_ID,
        "contract_address": CONTRACT,
        "tx_hash": TX_ACCEPT_CREATOR,
        "function_name": "acceptAsTenant",
        "agreement_id": "2",
        "value_wei": "0",
    }
    body.update(overrides)
    return body


def test_recording_requires_authentication(client: TestClient) -> None:
    assert client.post("/api/v1/transactions", json=record_body()).status_code == 401


def test_recording_validates_chain_and_contract(client: TestClient) -> None:
    headers = login_headers(client, WALLET_A)

    def post(body: dict[str, Any]) -> Any:
        return client.post("/api/v1/transactions", json=body, headers=headers)

    assert post(record_body(chain_id=1)).status_code == 409
    assert post(record_body(contract_address="0x" + "12" * 20)).status_code == 409
    assert post(record_body(function_name="mintTokens")).status_code == 422
    assert post(record_body(agreement_id=None)).status_code == 422


def test_foreign_transaction_cannot_be_attached(client: TestClient) -> None:
    """WALLET_A records a hash whose real onchain sender is the creator
    wallet — verification flags it instead of attaching it."""
    headers = login_headers(client, WALLET_A)
    response = client.post("/api/v1/transactions", json=record_body(), headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "STATE_MISMATCH"
    assert "sender" in (body["decoded_error"] or "")


def test_duplicate_recording_is_idempotent_and_wallet_bound(client: TestClient) -> None:
    headers = login_headers(client, WALLET_A)
    first = client.post("/api/v1/transactions", json=record_body(), headers=headers)
    assert first.status_code == 201
    again = client.post("/api/v1/transactions", json=record_body(), headers=headers)
    assert again.status_code == 201
    assert again.json()["tx_hash"] == first.json()["tx_hash"]

    # Another wallet cannot register or read the same hash.
    other_headers = login_headers(client, WALLET_B)
    response = client.post("/api/v1/transactions", json=record_body(), headers=other_headers)
    assert response.status_code == 409
    assert client.get(f"/api/v1/transactions/{CHAIN_ID}/{TX_ACCEPT_CREATOR}").status_code == 404


def test_reload_recovery_lists_unresolved_transactions(
    client: TestClient, chain: FakeTxChain
) -> None:
    chain.unknown_hashes.add(TX_ACCEPT_CREATOR)
    headers = login_headers(client, WALLET_A)
    client.post("/api/v1/transactions", json=record_body(), headers=headers)
    listing = client.get("/api/v1/transactions?unresolved=true")
    assert listing.status_code == 200
    rows = listing.json()
    assert len(rows) == 1
    assert rows[0]["tx_hash"] == TX_ACCEPT_CREATOR
    assert rows[0]["status"] == "SUBMITTED"

    # Retry endpoint picks it up once the network knows the hash. The real
    # sender is the creator wallet, so the honest terminal here is
    # STATE_MISMATCH — what matters is that verification re-ran.
    chain.unknown_hashes.clear()
    retried = client.post(
        f"/api/v1/transactions/{CHAIN_ID}/{TX_ACCEPT_CREATOR}/verify", headers=headers
    )
    assert retried.status_code == 200
    assert retried.json()["status"] == "STATE_MISMATCH"


def test_agreement_transactions_are_participant_gated(
    client: TestClient, test_db_engine: Engine, chain: FakeTxChain
) -> None:
    seed_agreement(test_db_engine)
    chain.unknown_hashes.add(TX_ACCEPT_CREATOR)
    headers = login_headers(client, WALLET_A)
    client.post("/api/v1/transactions", json=record_body(), headers=headers)

    listing = client.get(f"/api/v1/agreements/{CHAIN_ID}/{CONTRACT}/2/transactions")
    assert listing.status_code == 200
    body = listing.json()
    assert body["status_cache"] == "FUNDING"
    assert [tx["tx_hash"] for tx in body["transactions"]] == [TX_ACCEPT_CREATOR]
    assert body["transactions"][0]["explorer_tx_url"].endswith(TX_ACCEPT_CREATOR)

    login(client, WALLET_C)  # not a participant
    assert client.get(f"/api/v1/agreements/{CHAIN_ID}/{CONTRACT}/2/transactions").status_code == 404


def test_refresh_cache_updates_stale_status_from_direct_read(
    client: TestClient, test_db_engine: Engine, chain: FakeTxChain
) -> None:
    seed_agreement(test_db_engine, status="FUNDING")
    headers = login_headers(client, WALLET_A)
    response = client.post(
        f"/api/v1/agreements/{CHAIN_ID}/{CONTRACT}/2/refresh-cache", headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status_cache_before"] == "FUNDING"
    assert body["status_cache_after"] == "ACTIVE"
    assert body["onchain_status"] == "ACTIVE"
    assert body["total_funded_wei"] == "1500000000000000000"

    with Session(bind=test_db_engine) as db:
        row = db.get(AgreementIndex, (CHAIN_ID, CONTRACT, Decimal(2)))
        assert row is not None and row.status_cache == "ACTIVE"


def test_refresh_cache_is_participant_gated_and_fails_closed(
    client: TestClient, test_db_engine: Engine, chain: FakeTxChain
) -> None:
    seed_agreement(test_db_engine, status="FUNDING")
    headers_c = login_headers(client, WALLET_C)
    assert (
        client.post(
            f"/api/v1/agreements/{CHAIN_ID}/{CONTRACT}/2/refresh-cache", headers=headers_c
        ).status_code
        == 404
    )

    chain.read_agreement_error = ConnectionError("rpc down")
    headers_a = login_headers(client, WALLET_A)
    response = client.post(
        f"/api/v1/agreements/{CHAIN_ID}/{CONTRACT}/2/refresh-cache", headers=headers_a
    )
    assert response.status_code == 502
    with Session(bind=test_db_engine) as db:
        row = db.get(AgreementIndex, (CHAIN_ID, CONTRACT, Decimal(2)))
        assert row is not None and row.status_cache == "FUNDING"  # unchanged
