"""AUTOMATED LOCAL INTEGRATION TEST - local Hardhat node only.

Runs the full lifecycle (deploy → create → accept → fund → ACTIVE) against a
LOCAL Hardhat test node through the real backend ChainService and the real
compiled artifact. Local accounts are Hardhat's well-known developer keys -
they exist on every Hardhat node, hold no real value, and are NEVER the Monad
Testnet deployment. Nothing here contacts Monad, and nothing from this test
may be presented as testnet activity.

Skipped unless HARDHAT_INTEGRATION=1 (start a node first:
``cd contracts && npx hardhat node``). Not run in CI by default.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest
from eth_utils.crypto import keccak
from web3 import Web3

from app.blockchain.service import ChainService, load_escrow_abi

pytestmark = pytest.mark.skipif(
    os.environ.get("HARDHAT_INTEGRATION") != "1",
    reason="local Hardhat integration test (set HARDHAT_INTEGRATION=1 and run `npx hardhat node`)",
)

LOCAL_RPC = "http://127.0.0.1:8545"
# Hardhat's published default developer keys (local test chain only).
HARDHAT_KEYS = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
]

_ARTIFACT = (
    Path(__file__).resolve().parent.parent
    / "app"
    / "blockchain"
    / "generated"
    / "shared_deposit_escrow.json"
)


def test_full_local_lifecycle_to_active() -> None:
    web3 = Web3(Web3.HTTPProvider(LOCAL_RPC, request_kwargs={"timeout": 10}))
    assert web3.is_connected(), "start a local node first: cd contracts && npx hardhat node"

    accounts = [web3.eth.account.from_key(key) for key in HARDHAT_KEYS]
    creator, tenant_b, recipient, _ = accounts

    def send(tx: dict[str, Any], signer: Any) -> Any:
        tx.setdefault("nonce", web3.eth.get_transaction_count(signer.address))
        tx.setdefault("gas", 5_000_000)
        tx.setdefault("gasPrice", web3.eth.gas_price)
        tx.setdefault("chainId", web3.eth.chain_id)
        signed = signer.sign_transaction(tx)
        tx_hash = web3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
        assert receipt["status"] == 1, "local transaction reverted"
        return receipt

    # Deploy the REAL compiled artifact to the LOCAL node (test-only deploy).
    artifact = json.loads(_ARTIFACT.read_text(encoding="utf-8"))
    factory = web3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
    receipt = send(factory.constructor().build_transaction({"from": creator.address}), creator)
    address = receipt["contractAddress"]
    assert address and web3.eth.get_code(address) != b""

    service = ChainService(LOCAL_RPC, address)
    assert service.is_reachable()
    contract = web3.eth.contract(address=address, abi=load_escrow_abi())

    now = web3.eth.get_block("latest")["timestamp"]
    terms_hash = keccak(text="local-integration-terms")
    tenants = [creator.address, tenant_b.address]
    amounts = [10**18, 2 * 10**18]

    create_receipt = send(
        contract.functions.createAgreement(
            recipient.address,
            terms_hash,
            now + 100,
            now + 10_000,
            now + 5_000,
            now + 20_000,
            now + 30_000,
            tenants,
            amounts,
        ).build_transaction({"from": creator.address}),
        creator,
    )

    # The backend service decodes the event and reads state directly.
    event = service.decode_agreement_created(create_receipt)
    assert event is not None
    agreement_id = event["agreementId"]
    assert event["creator"] == creator.address.lower()
    assert event["totalRequired"] == str(sum(amounts))

    agreement = service.read_agreement(agreement_id)
    assert agreement["statusName"] == "FUNDING"
    assert service.read_tenants(agreement_id) == [t.lower() for t in tenants]

    # Accept and fund everything.
    for signer in (creator, tenant_b):
        send(
            contract.functions.acceptAsTenant(agreement_id, terms_hash).build_transaction(
                {"from": signer.address}
            ),
            signer,
        )
    send(
        contract.functions.acceptAsRecipient(agreement_id, terms_hash).build_transaction(
            {"from": recipient.address}
        ),
        recipient,
    )
    for signer, amount in zip((creator, tenant_b), amounts, strict=True):
        send(
            contract.functions.deposit(agreement_id).build_transaction(
                {"from": signer.address, "value": amount}
            ),
            signer,
        )

    # Financial truth comes from the contract: the agreement is ACTIVE and
    # every read matches the exact deposited amounts.
    final = service.read_agreement(agreement_id)
    assert final["statusName"] == "ACTIVE"
    assert final["totalFunded"] == str(sum(amounts))
    for wallet, amount in zip(tenants, amounts, strict=True):
        record = service.read_tenant(agreement_id, wallet)
        assert record["fundedAmount"] == str(amount)
        assert record["accepted"] is True
        assert service.read_remaining_contribution(agreement_id, wallet) == "0"
