"""Agreement drafts: CRUD, prepare-onchain, verified confirm-onchain (with a
mocked chain service — CI never contacts Monad Testnet), dashboard, and
public config. The mock mirrors the real ChainService interface; runtime uses
the real RPC service."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine

import app.api.v1.drafts as drafts_module
from app.auth.ratelimit import limiter
from app.canonical import CanonicalTerms, terms_hash
from app.main import app
from tests.auth_helpers import clear_auth_tables, login, make_client
from tests.fixtures.wallets import WALLET_A, WALLET_B, WALLET_C

ORIGIN = "http://localhost:5173"
CONTRACT = "0x5720c3f77c66527b59f9f63cd3631a3019400910"
TX = "0x" + "ab" * 32


def draft_body(**overrides: Any) -> dict[str, Any]:
    now = int(datetime.now(UTC).timestamp())
    body: dict[str, Any] = {
        "property_alias": "Indiranagar apartment",
        "private_address": None,
        "recipient": WALLET_B,
        "lease_start": now + 200,
        "funding_deadline": now + 1000,
        "lease_end": now + 10_000,
        "claim_deadline": now + 20_000,
        "settlement_deadline": now + 30_000,
        "tenants": [
            {"wallet": WALLET_A, "required_amount_wei": "1000000000000000000"},
            {"wallet": WALLET_C, "required_amount_wei": "2000000000000000001"},
        ],
    }
    body.update(overrides)
    return body


@pytest.fixture
def client(test_db_engine: Engine) -> Iterator[TestClient]:
    limiter.reset()
    yield make_client(test_db_engine)
    app.dependency_overrides.clear()
    clear_auth_tables(test_db_engine)
    limiter.reset()


@pytest.fixture
def creator(client: TestClient) -> dict[str, str]:
    body = login(client, WALLET_A)
    return {"X-CSRF-Token": body["csrf_token"], "Origin": ORIGIN}


class FakeChain:
    """Mirror of ChainService used only under tests (mock allowed here)."""

    def __init__(self, draft: dict[str, Any]) -> None:
        self.contract_address = CONTRACT
        self._draft = draft
        self.receipt_status = 1
        self.receipt_to = CONTRACT
        self.event_creator = WALLET_A
        self.event_terms_hash: str | None = None
        self.agreement_id = 1

    def chain_id(self) -> int:
        return 10143

    def get_receipt(self, tx_hash: str) -> dict[str, Any]:
        return {"status": self.receipt_status, "to": self.receipt_to, "blockNumber": 4711}

    def get_block(self, number: int) -> dict[str, Any]:
        return {"timestamp": int(datetime.now(UTC).timestamp())}

    def decode_agreement_created(self, receipt: dict[str, Any]) -> dict[str, Any] | None:
        terms = CanonicalTerms.model_validate(
            {
                "schemaVersion": "1.0",
                "chainId": 10143,
                "currency": "MON",
                "creator": WALLET_A,
                "recipient": self._draft["recipient"],
                "propertyAlias": self._draft["property_alias"],
                "leaseStart": self._draft["lease_start"],
                "leaseEnd": self._draft["lease_end"],
                "fundingDeadline": self._draft["funding_deadline"],
                "claimDeadline": self._draft["claim_deadline"],
                "settlementDeadline": self._draft["settlement_deadline"],
                "tenantContributions": [
                    {"wallet": t["wallet"], "requiredAmountWei": t["required_amount_wei"]}
                    for t in self._draft["tenants"]
                ],
                "approvalRule": {"type": "STRICT_MAJORITY", "requiredApprovals": 2},
                "individualDeductionRule": "DEDUCT_FROM_LIABLE_TENANT_FIRST",
                "sharedDeductionRule": (
                    "PROPORTIONAL_TO_REMAINING_BALANCE_AFTER_INDIVIDUAL_DEDUCTIONS"
                ),
                "evidenceRequired": True,
            }
        )
        return {
            "agreementId": self.agreement_id,
            "creator": self.event_creator,
            "recipient": self._draft["recipient"].lower(),
            "termsHash": self.event_terms_hash or terms_hash(terms),
            "totalRequired": "3000000000000000001",
        }

    def read_tenants(self, agreement_id: int) -> list[str]:
        return [t["wallet"].lower() for t in self._draft["tenants"]]

    def read_tenant(self, agreement_id: int, wallet: str) -> dict[str, Any]:
        for t in self._draft["tenants"]:
            if t["wallet"].lower() == wallet.lower():
                return {"requiredAmount": t["required_amount_wei"], "fundedAmount": "0"}
        raise AssertionError("unknown tenant")

    def read_agreement(self, agreement_id: int) -> dict[str, Any]:
        return {
            "statusName": "FUNDING",
            "totalRequired": "3000000000000000001",
            "totalFunded": "0",
        }


class TestDraftCrud:
    def test_create_and_get_draft(self, client: TestClient, creator: dict[str, str]) -> None:
        response = client.post("/api/v1/agreement-drafts", json=draft_body(), headers=creator)
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["creator"] == WALLET_A  # forced from session
        assert body["status"] == "DRAFT"
        assert body["terms_hash"].startswith("0x")
        assert body["tenants"][1]["required_amount_wei"] == "2000000000000000001"
        got = client.get(f"/api/v1/agreement-drafts/{body['id']}")
        assert got.status_code == 200

    def test_creator_field_in_json_is_ignored(
        self, client: TestClient, creator: dict[str, str]
    ) -> None:
        payload = draft_body()
        payload["creator"] = WALLET_B  # extra field: must not become the creator
        response = client.post("/api/v1/agreement-drafts", json=payload, headers=creator)
        assert response.status_code == 201
        assert response.json()["creator"] == WALLET_A

    @pytest.mark.parametrize(
        "mutate, expected",
        [
            (lambda b: b.update(recipient=WALLET_A), 422),  # recipient is a tenant
            (
                lambda b: b["tenants"].append({"wallet": WALLET_A, "required_amount_wei": "1"}),
                422,
            ),  # duplicate tenant
            (lambda b: b.update(tenants=b["tenants"][:1]), 422),  # too few tenants
            (lambda b: b["tenants"][0].update(required_amount_wei="0"), 422),  # zero amount
            (lambda b: b["tenants"][0].update(required_amount_wei="1.5"), 422),  # float wei
            (lambda b: b.update(claim_deadline=b["lease_end"]), 422),  # bad timeline
            (lambda b: b.update(funding_deadline=1), 422),  # past deadline
        ],
    )
    def test_invalid_drafts_rejected(
        self, client: TestClient, creator: dict[str, str], mutate: Any, expected: int
    ) -> None:
        body = draft_body()
        mutate(body)
        response = client.post("/api/v1/agreement-drafts", json=body, headers=creator)
        assert response.status_code == expected, response.text

    def test_only_creator_can_read_update_delete(
        self, client: TestClient, test_db_engine: Engine, creator: dict[str, str]
    ) -> None:
        draft_id = client.post(
            "/api/v1/agreement-drafts", json=draft_body(), headers=creator
        ).json()["id"]
        other = make_client(test_db_engine)
        other_headers = {
            "X-CSRF-Token": login(other, WALLET_B)["csrf_token"],
            "Origin": ORIGIN,
        }
        assert other.get(f"/api/v1/agreement-drafts/{draft_id}").status_code == 403
        assert (
            other.patch(
                f"/api/v1/agreement-drafts/{draft_id}", json=draft_body(), headers=other_headers
            ).status_code
            == 403
        )
        assert (
            other.delete(f"/api/v1/agreement-drafts/{draft_id}", headers=other_headers).status_code
            == 403
        )


class TestPrepareAndConfirm:
    def _create(self, client: TestClient, headers: dict[str, str]) -> tuple[str, dict[str, Any]]:
        body = draft_body()
        draft = client.post("/api/v1/agreement-drafts", json=body, headers=headers).json()
        return draft["id"], body

    def test_prepare_returns_exact_arguments_and_hash(
        self, client: TestClient, creator: dict[str, str]
    ) -> None:
        draft_id, _ = self._create(client, creator)
        response = client.post(
            f"/api/v1/agreement-drafts/{draft_id}/prepare-onchain", headers=creator
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["contractAddress"] == CONTRACT
        args = body["arguments"]
        assert args["tenantAddresses"] == [WALLET_A, WALLET_C]
        assert args["requiredAmounts"] == ["1000000000000000000", "2000000000000000001"]
        # The hash is reproducible from the canonical text (browser parity).
        terms = CanonicalTerms.model_validate(body["canonicalTerms"])
        assert terms_hash(terms) == body["termsHash"]
        assert "txHash" not in body and "agreementId" not in body

    def test_confirm_success_and_idempotency(
        self,
        client: TestClient,
        creator: dict[str, str],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        draft_id, body = self._create(client, creator)
        fake = FakeChain(body)
        monkeypatch.setattr(drafts_module, "get_chain_service", lambda: fake)

        response = client.post(
            f"/api/v1/agreement-drafts/{draft_id}/confirm-onchain",
            json={"tx_hash": TX},
            headers=creator,
        )
        assert response.status_code == 200, response.text
        confirmed = response.json()
        assert confirmed["status"] == "CONFIRMED"
        assert confirmed["agreementId"] == "1"
        assert confirmed["creationTxHash"] == TX

        # Idempotent for the same transaction.
        again = client.post(
            f"/api/v1/agreement-drafts/{draft_id}/confirm-onchain",
            json={"tx_hash": TX},
            headers=creator,
        )
        assert again.status_code == 200
        # Confirmed draft is immutable and undeletable.
        assert (
            client.patch(
                f"/api/v1/agreement-drafts/{draft_id}", json=draft_body(), headers=creator
            ).status_code
            == 409
        )
        assert (
            client.delete(f"/api/v1/agreement-drafts/{draft_id}", headers=creator).status_code
            == 409
        )

    @pytest.mark.parametrize(
        "corrupt, expected",
        [
            (lambda f: setattr(f, "receipt_status", 0), 409),  # reverted
            (lambda f: setattr(f, "receipt_to", "0x" + "99" * 20), 409),  # wrong target
            (lambda f: setattr(f, "event_creator", WALLET_B), 403),  # wrong creator
            (lambda f: setattr(f, "event_terms_hash", "0x" + "11" * 32), 409),  # wrong hash
        ],
    )
    def test_confirm_rejects_invalid_transactions(
        self,
        client: TestClient,
        creator: dict[str, str],
        monkeypatch: pytest.MonkeyPatch,
        corrupt: Any,
        expected: int,
    ) -> None:
        draft_id, body = self._create(client, creator)
        fake = FakeChain(body)
        corrupt(fake)
        monkeypatch.setattr(drafts_module, "get_chain_service", lambda: fake)
        response = client.post(
            f"/api/v1/agreement-drafts/{draft_id}/confirm-onchain",
            json={"tx_hash": TX},
            headers=creator,
        )
        assert response.status_code == expected, response.text

    def test_transaction_cannot_register_two_drafts(
        self,
        client: TestClient,
        creator: dict[str, str],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        first_id, body = self._create(client, creator)
        fake = FakeChain(body)
        monkeypatch.setattr(drafts_module, "get_chain_service", lambda: fake)
        assert (
            client.post(
                f"/api/v1/agreement-drafts/{first_id}/confirm-onchain",
                json={"tx_hash": TX},
                headers=creator,
            ).status_code
            == 200
        )
        second = client.post(
            "/api/v1/agreement-drafts",
            json=draft_body(property_alias="Second draft"),
            headers=creator,
        ).json()["id"]
        response = client.post(
            f"/api/v1/agreement-drafts/{second}/confirm-onchain",
            json={"tx_hash": TX},
            headers=creator,
        )
        assert response.status_code == 409


class TestDashboardAndConfig:
    def test_dashboard_honest_empty_state(
        self, client: TestClient, creator: dict[str, str]
    ) -> None:
        response = client.get("/api/v1/dashboard")
        assert response.status_code == 200
        body = response.json()
        assert body["drafts"] == []
        assert body["agreements"] == []
        assert body["pending_invitations"] == 0

    def test_dashboard_shows_real_records_only(
        self,
        client: TestClient,
        creator: dict[str, str],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        body = draft_body()
        draft = client.post("/api/v1/agreement-drafts", json=body, headers=creator).json()
        fake = FakeChain(body)
        monkeypatch.setattr(drafts_module, "get_chain_service", lambda: fake)
        client.post(
            f"/api/v1/agreement-drafts/{draft['id']}/confirm-onchain",
            json={"tx_hash": TX},
            headers=creator,
        )
        dashboard = client.get("/api/v1/dashboard").json()
        assert len(dashboard["agreements"]) == 1
        entry = dashboard["agreements"][0]
        assert entry["agreement_id"] == "1"
        assert entry["status_name"] == "FUNDING"  # from the (mocked) direct read
        assert entry["role"] == "CREATOR_TENANT"
        # No invented metrics anywhere in the payload.
        assert "total_value_protected" not in str(dashboard)

    def test_public_config_reports_verified_deployment(self, client: TestClient) -> None:
        response = client.get("/api/v1/config/public")
        assert response.status_code == 200
        body = response.json()
        assert body["chain_id"] == 10143
        assert body["deployment_status"] == "verified"
        assert body["contract_address"] == CONTRACT
        assert body["native_currency_symbol"] == "MON"
        text = response.text.lower()
        for needle in ("private", "secret", "password", "mysql"):
            assert needle not in text

    def test_public_config_honest_when_deployment_missing(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import app.api.v1.system as system_module

        monkeypatch.setattr(system_module, "load_deployment_metadata", lambda: None)
        body = client.get("/api/v1/config/public").json()
        assert body["deployment_status"] == "missing"
        assert body["contract_address"] is None


def _unused(engine: Engine) -> None:  # keep fixture import used
    assert engine is not None


EXPIRY = datetime.now(UTC) + timedelta(days=1)
