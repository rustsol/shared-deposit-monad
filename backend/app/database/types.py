"""Shared MySQL column types enforcing the documented data rules.

- Wei amounts: DECIMAL(65,0), handled as ``decimal.Decimal`` in Python and as
  decimal strings at API boundaries. FLOAT/DOUBLE are never used for money.
- Wallet addresses: CHAR(42) with ascii_bin collation so equality and
  uniqueness are byte-exact; normalization to lowercase happens in the
  application layer, never via a case-insensitive collation.
- 32-byte hashes (0x + 64 hex): CHAR(66) ascii_bin.
- SHA-256 / token hashes (64 hex, no prefix): CHAR(64) ascii_bin.
- UUID primary keys: CHAR(36) ascii_bin.
"""

from sqlalchemy.dialects.mysql import BIGINT, CHAR, DATETIME, DECIMAL

WeiDecimal = DECIMAL(precision=65, scale=0, unsigned=True)

AddressChar = CHAR(42, charset="ascii", collation="ascii_bin")
Hash66Char = CHAR(66, charset="ascii", collation="ascii_bin")
Hash64Char = CHAR(64, charset="ascii", collation="ascii_bin")
UuidChar = CHAR(36, charset="ascii", collation="ascii_bin")

UnsignedBigInt = BIGINT(unsigned=True)

# All timestamps are UTC; DATETIME(6) per the technical design.
UtcDateTime = DATETIME(fsp=6)
