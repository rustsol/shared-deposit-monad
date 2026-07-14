"""Shared validation types for addresses, bytes32 hashes, and wei amounts.

Wei is always a decimal string at API boundaries (never a float, never a
JavaScript-unsafe number); addresses normalize deterministically to lowercase;
bytes32 hashes require the exact 0x + 64 hex form.
"""

import re
from typing import Annotated

from pydantic import AfterValidator

_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
_BYTES32_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")
_WEI_RE = re.compile(r"^(0|[1-9][0-9]*)$")


def _validate_address(value: str) -> str:
    if not _ADDRESS_RE.match(value):
        raise ValueError("must be a 0x-prefixed 20-byte hex address")
    return value.lower()


def _validate_bytes32(value: str) -> str:
    if not _BYTES32_RE.match(value):
        raise ValueError("must be a 0x-prefixed 32-byte hex value")
    return value.lower()


def _validate_wei(value: str) -> str:
    if not _WEI_RE.match(value):
        raise ValueError("must be a nonnegative decimal integer string")
    return value


AddressStr = Annotated[str, AfterValidator(_validate_address)]
Bytes32Str = Annotated[str, AfterValidator(_validate_bytes32)]
WeiStr = Annotated[str, AfterValidator(_validate_wei)]
