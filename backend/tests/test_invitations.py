"""Invitation lifecycle: creation, review, claim, rotation, revocation -
including concurrency, access control, and offchain-only semantics."""

from __future__ import annotations

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.auth.ratelimit import limiter
from app.auth.service import sha256_hex
from app.main import app
from app.models import AgreementDraft, Invitation
from tests.auth_helpers import clear_auth_tables, create_draft, login, make_client
from tests.fixtures.wallets import WALLET_A, WALLET_B, WALLET_C

ORIGIN = "http://localhost:5173"


@pytest.fixture
def client(test_db_engine: Engine) -> Iterator[TestClient]:
    limiter.reset()
    yield make_client(test_db_engine)
    app.dependency_overrides.clear()
    clear_auth_tables(test_db_engine)
    limiter.reset()


@pytest.fixture
def draft_id(test_db_engine: Engine) -> str:
    # Creator A; tenants A and C; recipient B.
    return create_draft(
        test_db_engine,
        creator=WALLET_A,
        recipient=WALLET_B,
        tenants=[(WALLET_A, "1000000000000000000"), (WALLET_C, "2000000000000000001")],
    )


def create_invitation(
    client: TestClient, draft_id: str, csrf: str, expected_wallet: str, role: str
) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/agreement-drafts/{draft_id}/invitations",
        json={"expected_wallet": expected_wallet, "role": role},
        headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
    )
    assert response.status_code == 201, response.text
    return dict(response.json())


class TestCreation:
    def test_authorized_creation_returns_token_once(
        self, client: TestClient, test_db_engine: Engine, draft_id: str
    ) -> None:
        csrf = login(client, WALLET_A)["csrf_token"]
        body = create_invitation(client, draft_id, csrf, WALLET_C, "TENANT")
        raw_token = body["invitation_token"]
        assert len(raw_token) >= 43  # 32 bytes urlsafe → 256 bits
        assert "shown only once" in body["warning"]
        with Session(bind=test_db_engine) as db:
            row = db.query(Invitation).one()
            assert row.token_hash == sha256_hex(raw_token)
            assert raw_token not in row.token_hash
            assert row.wallet_address == WALLET_C
            assert row.expires_at > datetime.now(UTC).replace(tzinfo=None)

    def test_recipient_role_invitation(self, client: TestClient, draft_id: str) -> None:
        csrf = login(client, WALLET_A)["csrf_token"]
        body = create_invitation(client, draft_id, csrf, WALLET_B, "RECIPIENT")
        assert body["role"] == "RECIPIENT"

    def test_only_draft_creator_may_create(self, client: TestClient, draft_id: str) -> None:
        csrf = login(client, WALLET_C)["csrf_token"]  # a tenant, but not creator
        response = client.post(
            f"/api/v1/agreement-drafts/{draft_id}/invitations",
            json={"expected_wallet": WALLET_C, "role": "TENANT"},
            headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
        )
        assert response.status_code == 403

    def test_expected_wallet_must_hold_the_participant_slot(
        self, client: TestClient, draft_id: str
    ) -> None:
        csrf = login(client, WALLET_A)["csrf_token"]
        # B is the recipient, not a tenant; unrelated wallet is neither.
        for wallet, role in [(WALLET_B, "TENANT"), ("0x" + "77" * 20, "RECIPIENT")]:
            response = client.post(
                f"/api/v1/agreement-drafts/{draft_id}/invitations",
                json={"expected_wallet": wallet, "role": role},
                headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
            )
            assert response.status_code == 422, (wallet, role)

    def test_duplicate_active_invitation_rejected(self, client: TestClient, draft_id: str) -> None:
        csrf = login(client, WALLET_A)["csrf_token"]
        create_invitation(client, draft_id, csrf, WALLET_C, "TENANT")
        response = client.post(
            f"/api/v1/agreement-drafts/{draft_id}/invitations",
            json={"expected_wallet": WALLET_C, "role": "TENANT"},
            headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
        )
        assert response.status_code == 409  # policy: rotate instead

    def test_unauthenticated_or_missing_csrf_rejected(
        self, client: TestClient, draft_id: str
    ) -> None:
        response = client.post(
            f"/api/v1/agreement-drafts/{draft_id}/invitations",
            json={"expected_wallet": WALLET_C, "role": "TENANT"},
        )
        assert response.status_code == 401
        login(client, WALLET_A)
        response = client.post(
            f"/api/v1/agreement-drafts/{draft_id}/invitations",
            json={"expected_wallet": WALLET_C, "role": "TENANT"},
        )
        assert response.status_code == 403  # authenticated but no CSRF


class TestReview:
    def test_review_states(self, client: TestClient, test_db_engine: Engine, draft_id: str) -> None:
        csrf = login(client, WALLET_A)["csrf_token"]
        raw_token = create_invitation(client, draft_id, csrf, WALLET_C, "TENANT")[
            "invitation_token"
        ]
        # Log out to review anonymously.
        client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf, "Origin": ORIGIN})

        anonymous = client.get(f"/api/v1/invitations/{raw_token}")
        assert anonymous.status_code == 200
        body = anonymous.json()
        assert body["status"] == "valid_disconnected"
        assert body["property_alias"] == "Test draft alias"
        assert body["draft_id"] is None  # participant detail withheld
        assert raw_token not in anonymous.text
        assert anonymous.headers["Referrer-Policy"] == "no-referrer"
        assert anonymous.headers["Cache-Control"] == "no-store"

        # Wrong wallet sees no private details.
        login(client, WALLET_B)
        wrong = client.get(f"/api/v1/invitations/{raw_token}").json()
        assert wrong["status"] == "wrong_wallet"
        assert wrong["property_alias"] is None

        # Correct wallet sees participant-specific details.
        matched_client = make_client(test_db_engine)
        login(matched_client, WALLET_C)
        matched = matched_client.get(f"/api/v1/invitations/{raw_token}").json()
        assert matched["status"] == "valid_wallet_matched"
        assert matched["draft_id"] == draft_id
        assert matched["required_amount_wei"] == "2000000000000000001"

    def test_unknown_token_is_uniform_and_unenumerable(self, client: TestClient) -> None:
        response = client.get("/api/v1/invitations/definitely-not-a-token")
        assert response.status_code == 404
        assert response.json()["status"] == "invalid"

    def test_expired_revoked_rotated_used_states(
        self, client: TestClient, test_db_engine: Engine, draft_id: str
    ) -> None:
        csrf = login(client, WALLET_A)["csrf_token"]
        raw_token = create_invitation(client, draft_id, csrf, WALLET_C, "TENANT")[
            "invitation_token"
        ]
        with Session(bind=test_db_engine) as db:
            invitation = db.query(Invitation).one()
            invitation_id = invitation.id
            # Expired.
            invitation.expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
            db.commit()
        assert client.get(f"/api/v1/invitations/{raw_token}").json()["status"] == "expired"

        # Rotate (restores a live replacement, old shows "rotated").
        with Session(bind=test_db_engine) as db:
            db.query(Invitation).update(
                {"expires_at": datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1)}
            )
            db.commit()
        rotated = client.post(
            f"/api/v1/invitations/{invitation_id}/rotate",
            headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
        )
        assert rotated.status_code == 200
        new_token = rotated.json()["invitation_token"]
        assert client.get(f"/api/v1/invitations/{raw_token}").json()["status"] == "rotated"

        # Claim the replacement with the right wallet → used.
        claim_client = make_client(test_db_engine)
        claim_csrf = login(claim_client, WALLET_C)["csrf_token"]
        assert (
            claim_client.post(
                f"/api/v1/invitations/{new_token}/claim",
                headers={"X-CSRF-Token": claim_csrf, "Origin": ORIGIN},
            ).status_code
            == 200
        )
        assert client.get(f"/api/v1/invitations/{new_token}").json()["status"] == "already_claimed"

        # Plain revocation (new invitation) → revoked.
        third = create_invitation(client, draft_id, csrf, WALLET_B, "RECIPIENT")
        assert (
            client.post(
                f"/api/v1/invitations/{third['invitation_id']}/revoke",
                headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
            ).status_code
            == 200
        )
        assert (
            client.get(f"/api/v1/invitations/{third['invitation_token']}").json()["status"]
            == "revoked"
        )

    def test_review_rate_limit(self, client: TestClient) -> None:
        for _ in range(30):
            client.get("/api/v1/invitations/some-token")
        assert client.get("/api/v1/invitations/some-token").status_code == 429


class TestClaim:
    def _issued(self, client: TestClient, test_db_engine: Engine, draft_id: str) -> str:
        csrf = login(client, WALLET_A)["csrf_token"]
        token = create_invitation(client, draft_id, csrf, WALLET_C, "TENANT")["invitation_token"]
        client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf, "Origin": ORIGIN})
        return token

    def test_correct_wallet_claims_once_offchain_only(
        self, client: TestClient, test_db_engine: Engine, draft_id: str
    ) -> None:
        raw_token = self._issued(client, test_db_engine, draft_id)
        csrf = login(client, WALLET_C)["csrf_token"]
        response = client.post(
            f"/api/v1/invitations/{raw_token}/claim",
            headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "invitation_joined_offchain"
        assert "onchain" in body["note"]  # explicitly not onchain acceptance
        assert "0x" not in body.get("status", "")  # no fabricated tx hash anywhere
        with Session(bind=test_db_engine) as db:
            invitation = db.query(Invitation).one()
            assert invitation.used_at is not None
            draft = db.get(AgreementDraft, draft_id)
            assert draft is not None
            assert draft.status == "DRAFT"  # nothing onchain-ish changed

        # Second claim rejected.
        again = client.post(
            f"/api/v1/invitations/{raw_token}/claim",
            headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
        )
        assert again.status_code == 409

    def test_wrong_wallet_unauthenticated_and_csrf_failures(
        self, client: TestClient, test_db_engine: Engine, draft_id: str
    ) -> None:
        raw_token = self._issued(client, test_db_engine, draft_id)
        # Unauthenticated.
        assert client.post(f"/api/v1/invitations/{raw_token}/claim").status_code == 401
        # Wrong wallet.
        csrf = login(client, WALLET_B)["csrf_token"]
        assert (
            client.post(
                f"/api/v1/invitations/{raw_token}/claim",
                headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
            ).status_code
            == 403
        )
        # Right wallet, wrong origin.
        other = make_client(test_db_engine)
        c_csrf = login(other, WALLET_C)["csrf_token"]
        assert (
            other.post(
                f"/api/v1/invitations/{raw_token}/claim",
                headers={"X-CSRF-Token": c_csrf, "Origin": "https://evil.example.com"},
            ).status_code
            == 403
        )

    def test_concurrent_double_claim_single_success(
        self, client: TestClient, test_db_engine: Engine, draft_id: str
    ) -> None:
        raw_token = self._issued(client, test_db_engine, draft_id)
        csrf = login(client, WALLET_C)["csrf_token"]

        def attempt() -> int:
            return client.post(
                f"/api/v1/invitations/{raw_token}/claim",
                headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
            ).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = sorted(pool.map(lambda _: attempt(), range(2)))
        assert results[0] == 200
        assert results[1] in (409, 429) and results[1] != 200


class TestRotationAndRevocation:
    def test_rotation_swaps_exactly_one_active_token(
        self, client: TestClient, test_db_engine: Engine, draft_id: str
    ) -> None:
        csrf = login(client, WALLET_A)["csrf_token"]
        created = create_invitation(client, draft_id, csrf, WALLET_C, "TENANT")
        old_token = created["invitation_token"]
        response = client.post(
            f"/api/v1/invitations/{created['invitation_id']}/rotate",
            headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
        )
        assert response.status_code == 200
        body = response.json()
        new_token = body["invitation_token"]
        assert new_token != old_token
        assert old_token not in response.text  # old raw token never returned

        # Old token immediately unusable; new token reviewable.
        assert client.get(f"/api/v1/invitations/{old_token}").json()["status"] == "rotated"
        assert client.get(f"/api/v1/invitations/{new_token}").json()["status"] in {
            "valid_disconnected",
            "wrong_wallet",  # creator A is logged in, invitation targets C
        }
        with Session(bind=test_db_engine) as db:
            active = (
                db.query(Invitation)
                .filter(Invitation.revoked_at.is_(None), Invitation.used_at.is_(None))
                .all()
            )
            assert len(active) == 1  # never two active tokens
            assert active[0].token_hash == sha256_hex(new_token)

    def test_unauthorized_rotation_and_revocation_rejected(
        self, client: TestClient, test_db_engine: Engine, draft_id: str
    ) -> None:
        csrf = login(client, WALLET_A)["csrf_token"]
        created = create_invitation(client, draft_id, csrf, WALLET_C, "TENANT")
        other = make_client(test_db_engine)
        other_csrf = login(other, WALLET_B)["csrf_token"]
        for action in ("rotate", "revoke"):
            response = other.post(
                f"/api/v1/invitations/{created['invitation_id']}/{action}",
                headers={"X-CSRF-Token": other_csrf, "Origin": ORIGIN},
            )
            assert response.status_code == 403, action

    def test_used_invitation_cannot_be_rotated_back_to_life(
        self, client: TestClient, test_db_engine: Engine, draft_id: str
    ) -> None:
        csrf = login(client, WALLET_A)["csrf_token"]
        created = create_invitation(client, draft_id, csrf, WALLET_C, "TENANT")
        claimer = make_client(test_db_engine)
        claim_csrf = login(claimer, WALLET_C)["csrf_token"]
        claimer.post(
            f"/api/v1/invitations/{created['invitation_token']}/claim",
            headers={"X-CSRF-Token": claim_csrf, "Origin": ORIGIN},
        )
        response = client.post(
            f"/api/v1/invitations/{created['invitation_id']}/rotate",
            headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
        )
        assert response.status_code == 409

    def test_concurrent_rotation_single_replacement(
        self, client: TestClient, test_db_engine: Engine, draft_id: str
    ) -> None:
        csrf = login(client, WALLET_A)["csrf_token"]
        created = create_invitation(client, draft_id, csrf, WALLET_C, "TENANT")

        def attempt() -> int:
            return client.post(
                f"/api/v1/invitations/{created['invitation_id']}/rotate",
                headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
            ).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = sorted(pool.map(lambda _: attempt(), range(2)))
        assert results[0] == 200 and results[1] != 200
        with Session(bind=test_db_engine) as db:
            active = (
                db.query(Invitation)
                .filter(Invitation.revoked_at.is_(None), Invitation.used_at.is_(None))
                .count()
            )
            assert active == 1

    def test_revocation_is_idempotent_and_permanent(
        self, client: TestClient, test_db_engine: Engine, draft_id: str
    ) -> None:
        csrf = login(client, WALLET_A)["csrf_token"]
        created = create_invitation(client, draft_id, csrf, WALLET_C, "TENANT")
        for _ in range(2):  # idempotent
            response = client.post(
                f"/api/v1/invitations/{created['invitation_id']}/revoke",
                headers={"X-CSRF-Token": csrf, "Origin": ORIGIN},
            )
            assert response.status_code == 200
            assert response.json() == {"revoked": True}
            assert created["invitation_token"] not in response.text
        with Session(bind=test_db_engine) as db:
            invitation = db.query(Invitation).one()
            assert invitation.revoked_at is not None
        # Revoked token can never be claimed.
        claimer = make_client(test_db_engine)
        claim_csrf = login(claimer, WALLET_C)["csrf_token"]
        assert (
            claimer.post(
                f"/api/v1/invitations/{created['invitation_token']}/claim",
                headers={"X-CSRF-Token": claim_csrf, "Origin": ORIGIN},
            ).status_code
            == 409
        )
