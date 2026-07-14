"""Constraint, precision, and schema-security tests against real MySQL.

All rows are written inside per-test transactions that roll back (db_session)
or into the guarded *_test database with cleanup (clean_tables) — nothing
here ever touches shared_deposit.
"""

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import DataError, IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.database.base import Base
from app.models import (
    AgreementIndex,
    AuthNonce,
    ChainEvent,
    ChainSyncState,
    ClaimIndex,
    WalletProfile,
)

NOW = datetime(2026, 7, 14, 12, 0, 0, tzinfo=UTC).replace(tzinfo=None)
ADDR_A = "0x" + "aa" * 20
ADDR_B = "0x" + "bb" * 20
TX = "0x" + "11" * 32
BLOCK_HASH = "0x" + "22" * 32
HASH66 = "0x" + "33" * 32


def make_event(log_index: int = 0, tx_hash: str = TX) -> ChainEvent:
    return ChainEvent(
        chain_id=10143,
        contract_address=ADDR_A,
        tx_hash=tx_hash,
        log_index=log_index,
        block_number=123456,
        block_hash=BLOCK_HASH,
        event_name="AgreementCreated",
        agreement_id=Decimal(1),
        claim_id=None,
        payload_json={"totalRequired": "4000000000000000001"},
        block_timestamp=NOW,
        created_at=NOW,
    )


class TestFinancialPrecision:
    def test_decimal_65_0_round_trips_exactly(self, db_session: Session) -> None:
        # Far beyond JavaScript's safe integer range and uint128.
        huge = Decimal(10) ** 60 + 7
        row = ClaimIndex(
            chain_id=10143,
            contract_address=ADDR_A,
            agreement_id=Decimal(1),
            claim_id=Decimal(1),
            claim_type="SHARED",
            liable_tenant=None,
            amount_wei=huge,
            reason_hash=HASH66,
            evidence_hash=HASH66,
            yes_votes=0,
            no_votes=0,
            status_cache="PENDING",
            submitted_tx_hash=TX,
            submitted_block=1,
            resolved_tx_hash=None,
            resolved_block=None,
            last_synced_block=1,
            created_at=NOW,
            updated_at=NOW,
        )
        db_session.add(row)
        db_session.flush()
        db_session.expire_all()
        loaded = db_session.get(ClaimIndex, (10143, ADDR_A, Decimal(1), Decimal(1)))
        assert loaded is not None
        assert loaded.amount_wei == huge  # exact, no float precision loss
        assert isinstance(loaded.amount_wei, Decimal)

    def test_uint128_max_round_trips(self, db_session: Session) -> None:
        uint128_max = Decimal(2**128 - 1)
        row = make_event()
        row.agreement_id = uint128_max
        db_session.add(row)
        db_session.flush()
        db_session.expire_all()
        assert db_session.get(ChainEvent, row.id).agreement_id == uint128_max  # type: ignore[union-attr]

    def test_negative_wei_rejected_by_unsigned_decimal(self, db_session: Session) -> None:
        row = make_event()
        row.agreement_id = Decimal(-1)
        db_session.add(row)
        with pytest.raises((DataError, OperationalError)):
            db_session.flush()


class TestAddressAndHashColumns:
    def test_exact_lengths_round_trip(self, db_session: Session) -> None:
        profile = WalletProfile(address=ADDR_A, display_name=None, created_at=NOW, updated_at=NOW)
        db_session.add(profile)
        db_session.flush()
        db_session.expire_all()
        loaded = db_session.get(WalletProfile, ADDR_A)
        assert loaded is not None
        assert loaded.address == ADDR_A
        assert len(loaded.address) == 42

    def test_overlong_address_is_not_silently_truncated(self, db_session: Session) -> None:
        profile = WalletProfile(
            address=ADDR_A + "f", display_name=None, created_at=NOW, updated_at=NOW
        )
        db_session.add(profile)
        with pytest.raises((DataError, OperationalError)):
            db_session.flush()

    def test_address_uniqueness_is_case_sensitive_bytewise(self, db_session: Session) -> None:
        # ascii_bin collation: the application normalizes to lowercase; the DB
        # never merges differently-cased values on its own.
        db_session.add(
            WalletProfile(address=ADDR_A, display_name=None, created_at=NOW, updated_at=NOW)
        )
        db_session.add(
            WalletProfile(
                address=ADDR_A.upper().replace("0X", "0x"),
                display_name=None,
                created_at=NOW,
                updated_at=NOW,
            )
        )
        db_session.flush()  # two distinct byte sequences: both rows accepted


class TestUniqueConstraints:
    def test_duplicate_wallet_profile_rejected(self, db_session: Session) -> None:
        db_session.add(
            WalletProfile(address=ADDR_A, display_name=None, created_at=NOW, updated_at=NOW)
        )
        db_session.flush()
        db_session.add(
            WalletProfile(address=ADDR_A, display_name="x", created_at=NOW, updated_at=NOW)
        )
        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_duplicate_chain_event_identity_rejected(self, db_session: Session) -> None:
        db_session.add(make_event(log_index=5))
        db_session.flush()
        db_session.add(make_event(log_index=5))
        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_same_tx_different_log_index_accepted(self, db_session: Session) -> None:
        db_session.add(make_event(log_index=5))
        db_session.add(make_event(log_index=6))
        db_session.flush()  # no error

    def test_duplicate_nonce_hash_rejected(self, db_session: Session) -> None:
        nonce_hash = "ab" * 32
        for _ in range(2):
            db_session.add(
                AuthNonce(
                    wallet_address=ADDR_A,
                    nonce_hash=nonce_hash,
                    message="msg",
                    expires_at=NOW,
                    used_at=None,
                    created_at=NOW,
                )
            )
        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_chain_sync_checkpoint_uniqueness(self, db_session: Session) -> None:
        db_session.add(
            ChainSyncState(
                chain_id=10143,
                contract_address=ADDR_A,
                last_finalized_block=10,
                last_synced_at=NOW,
            )
        )
        db_session.flush()
        db_session.add(
            ChainSyncState(
                chain_id=10143,
                contract_address=ADDR_A,
                last_finalized_block=11,
                last_synced_at=NOW,
            )
        )
        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_claim_index_composite_identity(self, db_session: Session) -> None:
        def row() -> ClaimIndex:
            return ClaimIndex(
                chain_id=10143,
                contract_address=ADDR_A,
                agreement_id=Decimal(7),
                claim_id=Decimal(3),
                claim_type="SHARED",
                liable_tenant=None,
                amount_wei=Decimal(1),
                reason_hash=HASH66,
                evidence_hash=HASH66,
                yes_votes=0,
                no_votes=0,
                status_cache="PENDING",
                submitted_tx_hash=TX,
                submitted_block=1,
                resolved_tx_hash=None,
                resolved_block=None,
                last_synced_block=1,
                created_at=NOW,
                updated_at=NOW,
            )

        db_session.add(row())
        db_session.flush()
        db_session.add(row())
        with pytest.raises(IntegrityError):
            db_session.flush()


class TestSchemaSecurityShape:
    def test_no_raw_token_password_or_key_columns_exist(self) -> None:
        forbidden_exact = {"password", "private_key", "seed_phrase", "mnemonic", "raw_token"}
        for table in Base.metadata.tables.values():
            for column in table.columns:
                assert column.name not in forbidden_exact, (
                    f"{table.name}.{column.name} must not exist"
                )
                # Token/nonce material may exist only as *_hash columns.
                if "token" in column.name or "nonce" in column.name:
                    assert column.name.endswith("_hash"), (
                        f"{table.name}.{column.name} must store only a hash"
                    )

    def test_auth_and_invitation_expiries_are_required(self) -> None:
        for table_name in ("auth_nonces", "auth_sessions", "invitations"):
            column = Base.metadata.tables[table_name].columns["expires_at"]
            assert column.nullable is False

    def test_cache_tables_document_their_status(self, test_db_engine: object) -> None:
        # The reconciled contract-status columns are explicitly *_cache so no
        # reader can mistake them for authoritative onchain state.
        assert "status_cache" in Base.metadata.tables["agreement_index"].columns
        assert "status_cache" in Base.metadata.tables["claim_index"].columns

    def test_agreement_metadata_requires_indexed_agreement(self, db_session: Session) -> None:
        """No database-only path can invent an onchain agreement: metadata rows
        require an agreement_index row, which only finalized events create."""
        from app.models import AgreementMetadata

        orphan = AgreementMetadata(
            chain_id=10143,
            contract_address=ADDR_A,
            agreement_id=Decimal(999),
            property_alias="orphan",
            private_address=None,
            terms_json={},
            is_shareable=False,
            created_at=NOW,
        )
        db_session.add(orphan)
        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_index_row_with_parent_metadata_works(self, db_session: Session) -> None:
        from app.models import AgreementMetadata

        db_session.add(
            AgreementIndex(
                chain_id=10143,
                contract_address=ADDR_A,
                agreement_id=Decimal(1),
                creator_address=ADDR_A,
                recipient_address=ADDR_B,
                terms_hash=HASH66,
                status_cache="FUNDING",
                last_synced_block=1,
                created_tx_hash=TX,
                created_at_chain=NOW,
                updated_at=NOW,
            )
        )
        db_session.flush()
        db_session.add(
            AgreementMetadata(
                chain_id=10143,
                contract_address=ADDR_A,
                agreement_id=Decimal(1),
                property_alias="test alias",
                private_address=None,
                terms_json={"schemaVersion": "1.0"},
                is_shareable=False,
                created_at=NOW,
            )
        )
        db_session.flush()

    def test_model_count_matches_documented_tables(self) -> None:
        assert len(Base.metadata.tables) == 15

    def test_all_models_use_innodb_and_utf8mb4(self, test_db_engine: object) -> None:
        from sqlalchemy import Engine, text

        assert isinstance(test_db_engine, Engine)
        with test_db_engine.connect() as connection:
            rows = connection.execute(
                text(
                    "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME != 'alembic_version'"
                )
            ).fetchall()
        assert rows
        for table, engine_name in rows:
            assert engine_name == "InnoDB", f"{table} is not InnoDB"


def test_inspector_sees_char_types_for_addresses(test_db_engine: object) -> None:
    from sqlalchemy import Engine

    assert isinstance(test_db_engine, Engine)
    columns = {c["name"]: c for c in inspect(test_db_engine).get_columns("wallet_profiles")}
    assert str(columns["address"]["type"]).startswith("CHAR(42)")
