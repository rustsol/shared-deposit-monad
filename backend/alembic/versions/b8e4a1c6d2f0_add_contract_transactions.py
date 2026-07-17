"""add contract transactions

Revision ID: b8e4a1c6d2f0
Revises: 14c616e7b68c
Create Date: 2026-07-17 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import mysql

from alembic import op

revision: str = "b8e4a1c6d2f0"
down_revision: str | None = "14c616e7b68c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ADDRESS = mysql.CHAR(charset="ascii", collation="ascii_bin", length=42)
_HASH66 = mysql.CHAR(charset="ascii", collation="ascii_bin", length=66)
_WEI = mysql.DECIMAL(precision=65, scale=0, unsigned=True)


def upgrade() -> None:
    op.create_table(
        "contract_transactions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("chain_id", sa.BigInteger(), nullable=False),
        sa.Column("contract_address", _ADDRESS, nullable=False),
        sa.Column("agreement_id", _WEI, nullable=True),
        sa.Column("claim_id", _WEI, nullable=True),
        sa.Column("wallet_address", _ADDRESS, nullable=False),
        sa.Column("function_name", sa.String(length=64), nullable=False),
        sa.Column("tx_hash", _HASH66, nullable=False),
        sa.Column("value_wei", _WEI, nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("submitted_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("first_observed_at", mysql.DATETIME(fsp=6), nullable=True),
        sa.Column("mined_at", mysql.DATETIME(fsp=6), nullable=True),
        sa.Column("block_number", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("block_hash", _HASH66, nullable=True),
        sa.Column("receipt_status", sa.SmallInteger(), nullable=True),
        sa.Column("decoded_error", sa.Text(), nullable=True),
        sa.Column("decoded_events_json", sa.JSON(), nullable=True),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("updated_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chain_id", "tx_hash"),
        mysql_charset="utf8mb4",
        mysql_engine="InnoDB",
    )
    op.create_index(
        op.f("ix_contract_transactions_agreement_id"),
        "contract_transactions",
        ["agreement_id"],
    )
    op.create_index(
        op.f("ix_contract_transactions_wallet_address"),
        "contract_transactions",
        ["wallet_address"],
    )
    op.create_index(op.f("ix_contract_transactions_status"), "contract_transactions", ["status"])


def downgrade() -> None:
    op.drop_index(op.f("ix_contract_transactions_status"), table_name="contract_transactions")
    op.drop_index(
        op.f("ix_contract_transactions_wallet_address"), table_name="contract_transactions"
    )
    op.drop_index(op.f("ix_contract_transactions_agreement_id"), table_name="contract_transactions")
    op.drop_table("contract_transactions")
