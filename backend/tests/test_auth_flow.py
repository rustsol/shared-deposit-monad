"""Wallet-signature authentication: nonces, verification, sessions, logout.

Signatures come from clearly-marked deterministic TEST-ONLY keys in
tests/fixtures/wallets.py; they are never application data.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.auth.messages import build_signin_message, extract_nonce
from app.auth.ratelimit import limiter
from app.auth.service import sha256_hex
from app.main import app
from app.models import AuthNonce, AuthSession, WalletProfile
from tests.auth_helpers import clear_auth_tables, login, make_client, request_nonce
from tests.fixtures.wallets import (
    KEY_FOR,
    TEST_KEY_B,
    WALLET_A,
    WALLET_B,
    sign_message,
)

GOLDEN_MESSAGE = (
    "localhost:5173 wants you to sign in with your Ethereum account:\n"
    "0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1\n"
    "\n"
    "Sign in to Shared Deposit. This signature verifies wallet ownership only. "
    "It is not a blockchain transaction and does not move funds or grant any "
    "contract permission.\n"
    "\n"
    "URI: http://localhost:5173\n"
    "Version: 1\n"
    "Chain ID: 10143\n"
    "Nonce: 5f2e1a9c8b7d6e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f\n"
    "Issued At: 2026-07-14T10:00:00.000Z\n"
    "Expiration Time: 2026-07-14T10:10:00.000Z"
)


@pytest.fixture
def client(test_db_engine: Engine) -> Iterator[TestClient]:
    limiter.reset()
    yield make_client(test_db_engine)
    app.dependency_overrides.clear()
    clear_auth_tables(test_db_engine)
    limiter.reset()


class TestSignInMessage:
    def test_golden_message_fixture_is_reproducible(self) -> None:
        """Fixed inputs produce this exact EIP-4361 text; viem's
        createSiweMessage can later reproduce it byte-for-byte in the browser."""
        message = build_signin_message(
            domain="localhost:5173",
            uri="http://localhost:5173",
            address=WALLET_A,
            chain_id=10143,
            nonce="5f2e1a9c8b7d6e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f",
            issued_at=datetime(2026, 7, 14, 10, 0, 0),
            expiration_time=datetime(2026, 7, 14, 10, 10, 0),
        )
        assert message == GOLDEN_MESSAGE

    def test_message_contains_all_required_bindings(self, client: TestClient) -> None:
        message = request_nonce(client, WALLET_A)
        assert message.startswith("localhost:5173 wants you to sign in")
        assert "URI: http://localhost:5173" in message
        assert "Version: 1" in message
        assert "Chain ID: 10143" in message
        assert re.search(r"Nonce: [0-9a-f]{64}", message)  # 256 bits
        assert "Issued At: " in message
        assert "Expiration Time: " in message
        assert "Sign in to Shared Deposit" in message
        # Identity only — no transaction language.
        assert "approve" not in message.lower()
        assert "transfer" not in message.lower()


class TestNonces:
    def test_nonce_stored_as_hash_only_with_expiry(
        self, client: TestClient, test_db_engine: Engine
    ) -> None:
        message = request_nonce(client, WALLET_A)
        raw_nonce = extract_nonce(message)
        assert raw_nonce is not None
        with Session(bind=test_db_engine) as db:
            row = db.query(AuthNonce).one()
            assert row.nonce_hash == sha256_hex(raw_nonce)
            assert raw_nonce not in (row.nonce_hash or "")
            assert row.used_at is None
            assert row.wallet_address == WALLET_A
            assert row.expires_at > row.created_at
            delta = row.expires_at - row.created_at
            assert 590 <= delta.total_seconds() <= 610  # documented 10 minutes

    def test_generated_nonces_differ(self, client: TestClient) -> None:
        nonces = {extract_nonce(request_nonce(client, WALLET_A)) for _ in range(5)}
        assert len(nonces) == 5

    def test_invalid_wallet_rejected(self, client: TestClient) -> None:
        response = client.post("/api/v1/auth/nonce", json={"address": "0x1234"})
        assert response.status_code == 422

    def test_nonce_rate_limit(self, client: TestClient) -> None:
        for _ in range(10):
            assert client.post("/api/v1/auth/nonce", json={"address": WALLET_A}).status_code == 200
        blocked = client.post("/api/v1/auth/nonce", json={"address": WALLET_A})
        assert blocked.status_code == 429
        assert "retry-after" in {k.lower() for k in blocked.headers}


class TestVerification:
    def test_valid_signature_creates_session_and_profile(
        self, client: TestClient, test_db_engine: Engine
    ) -> None:
        body = login(client, WALLET_A)
        assert body["authenticated"] is True
        assert body["wallet_address"] == WALLET_A
        assert body["csrf_token"]
        with Session(bind=test_db_engine) as db:
            session_row = db.query(AuthSession).one()
            assert session_row.wallet_address == WALLET_A
            assert len(session_row.token_hash) == 64
            profile = db.get(WalletProfile, WALLET_A)
            assert profile is not None

    def test_raw_session_token_not_in_json_and_not_stored(
        self, client: TestClient, test_db_engine: Engine
    ) -> None:
        message = request_nonce(client, WALLET_A)
        signature = sign_message(message, KEY_FOR[WALLET_A])
        response = client.post(
            "/api/v1/auth/verify",
            json={"address": WALLET_A, "message": message, "signature": signature},
        )
        raw_cookie = response.cookies.get("shared_deposit_session")
        assert raw_cookie
        assert raw_cookie not in response.text  # token only in the cookie
        with Session(bind=test_db_engine) as db:
            row = db.query(AuthSession).one()
            assert row.token_hash == sha256_hex(raw_cookie)
            assert raw_cookie != row.token_hash

    def test_session_cookie_flags_local(self, client: TestClient) -> None:
        message = request_nonce(client, WALLET_A)
        signature = sign_message(message, KEY_FOR[WALLET_A])
        response = client.post(
            "/api/v1/auth/verify",
            json={"address": WALLET_A, "message": message, "signature": signature},
        )
        cookie_header = response.headers["set-cookie"]
        assert "HttpOnly" in cookie_header
        assert "SameSite=lax" in cookie_header
        assert "Path=/" in cookie_header
        assert "Max-Age=" in cookie_header
        assert "Secure" not in cookie_header  # local HTTP development only

    def test_production_cookie_requires_secure(self) -> None:
        from fastapi import Response

        from app.api.v1.auth import _set_session_cookie
        from app.config import Settings

        settings = Settings(  # type: ignore[call-arg]
            _env_file=None,
            DATABASE_URL="mysql+pymysql://appuser:strongpass@db.internal:3306/shared_deposit",
            APP_ENV="production",
            SESSION_SECRET="x" * 32,
            FRONTEND_ORIGIN="https://app.example.com",
        )
        response = Response()
        _set_session_cookie(response, settings, "value", 60)
        assert "Secure" in response.headers["set-cookie"]

    @pytest.mark.parametrize(
        "mutation",
        ["wrong_signer", "modified_message", "wrong_wallet", "malformed_signature"],
    )
    def test_invalid_authentication_attempts_fail(
        self, client: TestClient, test_db_engine: Engine, mutation: str
    ) -> None:
        message = request_nonce(client, WALLET_A)
        address, sent_message = WALLET_A, message
        if mutation == "wrong_signer":
            signature = sign_message(message, TEST_KEY_B)
        elif mutation == "modified_message":
            signature = sign_message(message, KEY_FOR[WALLET_A])
            sent_message = message.replace("Chain ID: 10143", "Chain ID: 1")
        elif mutation == "wrong_wallet":
            signature = sign_message(message, KEY_FOR[WALLET_A])
            address = WALLET_B
        else:
            signature = "0xnot-a-signature"

        response = client.post(
            "/api/v1/auth/verify",
            json={"address": address, "message": sent_message, "signature": signature},
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "authentication failed"  # uniform
        with Session(bind=test_db_engine) as db:
            assert db.query(AuthSession).count() == 0  # no session on failure
            nonce = db.query(AuthNonce).one()
            assert nonce.used_at is None  # consumed only on success

    def test_challenge_for_other_domain_or_chain_fails(
        self, client: TestClient, test_db_engine: Engine
    ) -> None:
        # Forge a full, correctly signed message for another domain and chain:
        # it has no matching stored challenge, so verification must fail.
        from datetime import UTC as _UTC

        now = datetime.now(_UTC).replace(tzinfo=None)
        forged = build_signin_message(
            domain="evil.example.com",
            uri="https://evil.example.com",
            address=WALLET_A,
            chain_id=1,
            nonce="ab" * 32,
            issued_at=now,
            expiration_time=now + timedelta(minutes=10),
        )
        response = client.post(
            "/api/v1/auth/verify",
            json={
                "address": WALLET_A,
                "message": forged,
                "signature": sign_message(forged, KEY_FOR[WALLET_A]),
            },
        )
        assert response.status_code == 401

    def test_expired_nonce_rejected(self, client: TestClient, test_db_engine: Engine) -> None:
        message = request_nonce(client, WALLET_A)
        with Session(bind=test_db_engine) as db:
            db.query(AuthNonce).update(
                {"expires_at": datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)}
            )
            db.commit()
        response = client.post(
            "/api/v1/auth/verify",
            json={
                "address": WALLET_A,
                "message": message,
                "signature": sign_message(message, KEY_FOR[WALLET_A]),
            },
        )
        assert response.status_code == 401

    def test_replay_rejected(self, client: TestClient) -> None:
        message = request_nonce(client, WALLET_A)
        signature = sign_message(message, KEY_FOR[WALLET_A])
        payload = {"address": WALLET_A, "message": message, "signature": signature}
        assert client.post("/api/v1/auth/verify", json=payload).status_code == 200
        assert client.post("/api/v1/auth/verify", json=payload).status_code == 401

    def test_concurrent_replay_yields_exactly_one_session(
        self, client: TestClient, test_db_engine: Engine
    ) -> None:
        message = request_nonce(client, WALLET_A)
        signature = sign_message(message, KEY_FOR[WALLET_A])
        payload = {"address": WALLET_A, "message": message, "signature": signature}

        def attempt() -> int:
            return client.post("/api/v1/auth/verify", json=payload).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: attempt(), range(2)))
        assert sorted(results) == [200, 401]
        with Session(bind=test_db_engine) as db:
            assert db.query(AuthSession).count() == 1


class TestSessions:
    def test_me_reports_session_and_rotates_csrf(self, client: TestClient) -> None:
        first_csrf = login(client, WALLET_A)["csrf_token"]
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 200
        body = response.json()
        assert body["authenticated"] is True
        assert body["wallet_address"] == WALLET_A
        assert body["csrf_token"] and body["csrf_token"] != first_csrf

    def test_me_without_session(self, client: TestClient) -> None:
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 200
        assert response.json()["authenticated"] is False

    def test_invalid_and_expired_and_revoked_sessions_rejected(
        self, client: TestClient, test_db_engine: Engine
    ) -> None:
        login(client, WALLET_A)
        # Invalid cookie value.
        client.cookies.set("shared_deposit_session", "ff" * 32)
        assert client.get("/api/v1/auth/me").json()["authenticated"] is False
        client.cookies.clear()
        # Expired session.
        login(client, WALLET_A)
        with Session(bind=test_db_engine) as db:
            db.query(AuthSession).update(
                {"expires_at": datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)}
            )
            db.commit()
        assert client.get("/api/v1/auth/me").json()["authenticated"] is False
        client.cookies.clear()
        # Revoked session.
        body = login(client, WALLET_A)
        response = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": body["csrf_token"]})
        assert response.status_code == 200
        assert client.get("/api/v1/auth/me").json()["authenticated"] is False

    def test_logout_clears_cookie_and_requires_session(self, client: TestClient) -> None:
        body = login(client, WALLET_A)
        response = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": body["csrf_token"]})
        assert response.json() == {"logged_out": True}
        assert 'shared_deposit_session=""' in response.headers["set-cookie"]
        # Without a session, logout is a 401 (auth precedes CSRF).
        assert client.post("/api/v1/auth/logout").status_code == 401

    def test_multiple_sessions_policy_and_profile_not_duplicated(
        self, client: TestClient, test_db_engine: Engine
    ) -> None:
        login(client, WALLET_A)
        login(client, WALLET_A)  # documented policy: one session per device
        with Session(bind=test_db_engine) as db:
            assert db.query(AuthSession).count() == 2
            assert db.query(WalletProfile).filter(WalletProfile.address == WALLET_A).count() == 1

    def test_verify_rate_limit(self, client: TestClient) -> None:
        for _ in range(10):
            client.post(
                "/api/v1/auth/verify",
                json={"address": WALLET_A, "message": "Nonce: " + "ab" * 32, "signature": "0x"},
            )
        blocked = client.post(
            "/api/v1/auth/verify",
            json={"address": WALLET_A, "message": "x", "signature": "0x"},
        )
        assert blocked.status_code == 429
