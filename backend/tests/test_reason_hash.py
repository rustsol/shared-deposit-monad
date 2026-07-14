"""Claim-reason normalization and Keccak-256 hashing."""

import hashlib

import pytest

from app.canonical import normalize_reason, reason_hash

# Well-known digests of the ASCII string "abc":
KECCAK_ABC = "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"
SHA3_256_ABC = "0x" + hashlib.sha3_256(b"abc").hexdigest()


def test_uses_ethereum_keccak_not_nist_sha3() -> None:
    assert reason_hash("abc") == KECCAK_ABC
    assert reason_hash("abc") != SHA3_256_ABC
    assert KECCAK_ABC != SHA3_256_ABC  # the two primitives genuinely differ


def test_determinism() -> None:
    reason = "Broken kitchen cabinet door — replacement required"
    assert reason_hash(reason) == reason_hash(reason)


def test_empty_and_whitespace_only_rejected() -> None:
    for value in ["", "   ", "\r\n", "\t \n"]:
        with pytest.raises(ValueError, match="empty"):
            reason_hash(value)


def test_outer_whitespace_trimmed_inner_preserved() -> None:
    assert reason_hash("  water damage  ") == reason_hash("water damage")
    # Internal whitespace is meaningful and preserved.
    assert reason_hash("water  damage") != reason_hash("water damage")


def test_crlf_normalized_to_lf() -> None:
    assert reason_hash("line one\r\nline two") == reason_hash("line one\nline two")


def test_unicode_nfc_normalization() -> None:
    composed = "café damage"  # e-acute as one precomposed code point
    decomposed = "café damage"  # e + combining acute accent
    assert composed != decomposed  # genuinely different code-point sequences
    assert normalize_reason(composed) == normalize_reason(decomposed)
    assert reason_hash(composed) == reason_hash(decomposed)


def test_similar_but_distinct_reasons_differ() -> None:
    assert reason_hash("broken window") != reason_hash("broken windows")
    assert reason_hash("Broken window") != reason_hash("broken window")
