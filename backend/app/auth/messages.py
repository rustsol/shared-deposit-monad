"""EIP-4361 (Sign-In with Ethereum) message construction and parsing.

docs/02 §5.2 defines the required message contents (domain, URI, address,
chain ID, nonce, issued time, expiry) but not an exact text format, so this
implementation uses EIP-4361 verbatim — the same format viem's
``createSiweMessage`` produces — so the browser can reproduce the message
byte-for-byte later. Timestamps use the JavaScript ``Date.toISOString()``
millisecond form for exact cross-implementation equality. The address is
rendered EIP-55 checksummed as EIP-4361 requires; storage and comparison use
the application's lowercase normalization.

Signing this message proves wallet ownership only: it is not a transaction,
moves no funds, and grants no contract permission — and the statement says so.
"""

import re
from datetime import datetime

from eth_utils.address import to_checksum_address

SIGNIN_STATEMENT = (
    "Sign in to Shared Deposit. This signature verifies wallet ownership only. "
    "It is not a blockchain transaction and does not move funds or grant any "
    "contract permission."
)

_NONCE_LINE_RE = re.compile(r"^Nonce: ([A-Za-z0-9]{8,96})$", re.MULTILINE)


def iso8601_millis(value: datetime) -> str:
    """UTC timestamp in the exact JavaScript Date.toISOString() form."""
    return value.strftime("%Y-%m-%dT%H:%M:%S") + f".{value.microsecond // 1000:03d}Z"


def build_signin_message(
    *,
    domain: str,
    uri: str,
    address: str,
    chain_id: int,
    nonce: str,
    issued_at: datetime,
    expiration_time: datetime,
) -> str:
    """The exact EIP-4361 message text the wallet signs."""
    checksummed = to_checksum_address(address)
    return (
        f"{domain} wants you to sign in with your Ethereum account:\n"
        f"{checksummed}\n"
        f"\n"
        f"{SIGNIN_STATEMENT}\n"
        f"\n"
        f"URI: {uri}\n"
        f"Version: 1\n"
        f"Chain ID: {chain_id}\n"
        f"Nonce: {nonce}\n"
        f"Issued At: {iso8601_millis(issued_at)}\n"
        f"Expiration Time: {iso8601_millis(expiration_time)}"
    )


def extract_nonce(message: str) -> str | None:
    """The nonce embedded in a submitted sign-in message, if well-formed."""
    match = _NONCE_LINE_RE.search(message)
    return match.group(1) if match else None


def domain_from_origin(origin: str) -> str:
    """EIP-4361 domain (authority) from the configured frontend origin."""
    return origin.split("://", 1)[-1]
