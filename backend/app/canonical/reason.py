"""Claim-reason normalization and hashing (docs/02 §4.2).

Normalization — exactly the documented steps, nothing more (user meaning is
never rewritten):

1. Unicode NFC normalization;
2. CRLF converted to LF;
3. leading/trailing whitespace trimmed;
4. internal words, punctuation, and internal whitespace preserved;
5. UTF-8 encoding;
6. Ethereum Keccak-256.

The readable text stays private in MySQL; only the hash goes onchain.
"""

import unicodedata

from eth_utils.crypto import keccak


def normalize_reason(reason: str) -> str:
    normalized = unicodedata.normalize("NFC", reason)
    normalized = normalized.replace("\r\n", "\n")
    normalized = normalized.strip()
    if not normalized:
        raise ValueError("claim reason must not be empty after normalization")
    return normalized


def reason_hash(reason: str) -> str:
    """0x-prefixed Keccak-256 of the normalized UTF-8 reason text."""
    return "0x" + keccak(text=normalize_reason(reason)).hex()
