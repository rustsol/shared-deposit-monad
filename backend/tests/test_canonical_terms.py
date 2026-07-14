"""Canonical agreement terms hashing — golden vectors and mutation tests.

The golden vector's expected hash was independently reproduced with viem's
keccak256 in the frontend toolchain, proving a browser implementation can
reproduce backend output byte-for-byte.
"""

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.canonical import CanonicalTerms, canonicalize_terms, terms_hash

VECTOR_PATH = Path(__file__).parent / "fixtures" / "canonical_terms_vector.json"


def load_vector() -> dict[str, Any]:
    with VECTOR_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def vector_input() -> dict[str, Any]:
    return copy.deepcopy(load_vector()["input"])


def test_golden_vector_canonical_text_and_hash() -> None:
    vector = load_vector()
    terms = CanonicalTerms.model_validate(vector["input"])
    assert canonicalize_terms(terms) == vector["canonical"]
    assert terms_hash(terms) == vector["keccak256"]


def test_dictionary_insertion_order_is_irrelevant() -> None:
    data = vector_input()
    reordered = dict(reversed(list(data.items())))
    assert terms_hash(CanonicalTerms.model_validate(reordered)) == terms_hash(
        CanonicalTerms.model_validate(data)
    )


def test_source_json_whitespace_is_irrelevant() -> None:
    data = vector_input()
    spaced = json.loads(json.dumps(data, indent=4))
    assert terms_hash(CanonicalTerms.model_validate(spaced)) == load_vector()["keccak256"]


def test_tenant_order_changes_the_hash() -> None:
    data = vector_input()
    swapped = copy.deepcopy(data)
    swapped["tenantContributions"].reverse()
    assert terms_hash(CanonicalTerms.model_validate(swapped)) != terms_hash(
        CanonicalTerms.model_validate(data)
    )


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d["tenantContributions"][0].update(requiredAmountWei="1500000000000000001"),
        lambda d: d.update(leaseEnd=d["leaseEnd"] + 1),
        lambda d: d["tenantContributions"][1].update(
            wallet="0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD4"
        ),
        lambda d: d.update(propertyAlias=d["propertyAlias"] + "!"),
    ],
)
def test_any_semantic_mutation_changes_the_hash(mutate: Any) -> None:
    data = vector_input()
    baseline = terms_hash(CanonicalTerms.model_validate(vector_input()))
    mutate(data)
    assert terms_hash(CanonicalTerms.model_validate(data)) != baseline


def test_address_case_is_normalized_deterministically() -> None:
    data = vector_input()
    lowered = copy.deepcopy(data)
    lowered["creator"] = lowered["creator"].lower()
    lowered["tenantContributions"][0]["wallet"] = lowered["tenantContributions"][0][
        "wallet"
    ].lower()
    assert terms_hash(CanonicalTerms.model_validate(lowered)) == terms_hash(
        CanonicalTerms.model_validate(data)
    )


def test_unicode_is_deterministic_and_utf8_encoded() -> None:
    data = vector_input()
    first = terms_hash(CanonicalTerms.model_validate(copy.deepcopy(data)))
    second = terms_hash(CanonicalTerms.model_validate(copy.deepcopy(data)))
    assert first == second
    # ensure_ascii=False: the Ü is hashed as raw UTF-8, not as an \u escape.
    assert "Ü" in canonicalize_terms(CanonicalTerms.model_validate(data))


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d.update(chainId=10143.0),  # float chain id
        lambda d: d.update(leaseStart=1767225600.5),  # float timestamp
        lambda d: d["tenantContributions"][0].update(requiredAmountWei=1.5),  # float wei
        lambda d: d.update(leaseStart=-1),  # negative timestamp
        lambda d: d["tenantContributions"][0].update(requiredAmountWei="-5"),  # negative wei
        lambda d: d["tenantContributions"][0].update(requiredAmountWei="007"),  # leading zeros
        lambda d: d["tenantContributions"][0].update(requiredAmountWei="0"),  # zero amount
        lambda d: d.update(surprise="extra"),  # closed schema
        lambda d: d["approvalRule"].update(bonus=1),  # closed nested schema
        lambda d: d.update(schemaVersion="2.0"),  # unsupported version
        lambda d: d.update(recipient=d["tenantContributions"][0]["wallet"]),  # role clash
        lambda d: d.update(creator="0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE5"),  # non-tenant
        lambda d: d["approvalRule"].update(requiredApprovals=3),  # wrong threshold for 2
    ],
)
def test_invalid_terms_are_rejected(mutate: Any) -> None:
    data = vector_input()
    mutate(data)
    with pytest.raises(ValidationError):
        CanonicalTerms.model_validate(data)


def test_duplicate_tenants_are_rejected() -> None:
    data = vector_input()
    data["tenantContributions"][1]["wallet"] = data["tenantContributions"][0]["wallet"]
    with pytest.raises(ValidationError):
        CanonicalTerms.model_validate(data)
