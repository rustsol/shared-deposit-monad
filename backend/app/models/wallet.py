"""wallet_profiles - wallet identity plus optional private display metadata.

The wallet address is the identity key. There is deliberately no password,
private-key, or seed-phrase column: authentication is wallet-signature based
and the backend never holds key material.
"""

from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.types import AddressChar, UtcDateTime


class WalletProfile(Base):
    __tablename__ = "wallet_profiles"
    __table_args__ = {"mysql_charset": "utf8mb4", "mysql_engine": "InnoDB"}

    # Lowercase-normalized in the application layer; ascii_bin keeps equality exact.
    address: Mapped[str] = mapped_column(AddressChar, primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False)
