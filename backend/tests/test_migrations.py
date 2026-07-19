"""Migration round-trips, schema completeness, and structural checks -
executed against the guarded *_test MySQL database only."""

from sqlalchemy import Engine, inspect, text

from alembic import command
from tests.conftest import alembic_config_for, get_test_database_url

EXPECTED_TABLES = {
    "wallet_profiles",
    "auth_nonces",
    "auth_sessions",
    "agreement_drafts",
    "agreement_draft_tenants",
    "agreement_index",
    "agreement_metadata",
    "invitations",
    "evidence_manifests",
    "evidence_files",
    "claim_drafts",
    "claim_index",
    "chain_events",
    "chain_sync_state",
    "audit_log",
    "contract_transactions",
}


def test_all_documented_tables_exist(test_db_engine: Engine) -> None:
    tables = set(inspect(test_db_engine).get_table_names())
    assert EXPECTED_TABLES <= tables
    assert "alembic_version" in tables
    assert len(EXPECTED_TABLES) == 16


def test_current_revision_is_head(test_db_engine: Engine) -> None:
    from app.database.health import expected_head_revision

    with test_db_engine.connect() as connection:
        current = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
    assert current == expected_head_revision()
    assert current is not None


def test_expected_unique_constraints_and_indexes(test_db_engine: Engine) -> None:
    inspector = inspect(test_db_engine)

    def unique_column_sets(table: str) -> list[set[str]]:
        sets = [set(uc["column_names"]) for uc in inspector.get_unique_constraints(table)]
        sets += [set(ix["column_names"]) for ix in inspector.get_indexes(table) if ix["unique"]]
        return sets

    assert {"chain_id", "contract_address", "tx_hash", "log_index"} in unique_column_sets(
        "chain_events"
    )
    assert {"draft_id", "wallet_address"} in unique_column_sets("agreement_draft_tenants")
    assert {"nonce_hash"} in unique_column_sets("auth_nonces")
    assert {"token_hash"} in unique_column_sets("auth_sessions")
    assert {"token_hash"} in unique_column_sets("invitations")
    assert {"manifest_hash"} in unique_column_sets("evidence_manifests")
    assert {"terms_hash"} in unique_column_sets("agreement_drafts")
    assert {"chain_id", "tx_hash"} in unique_column_sets("contract_transactions")

    index_columns = {tuple(ix["column_names"]) for ix in inspector.get_indexes("chain_events")}
    assert ("block_number",) in index_columns
    assert ("event_name",) in index_columns


def test_expected_foreign_keys(test_db_engine: Engine) -> None:
    inspector = inspect(test_db_engine)
    draft_fks = inspector.get_foreign_keys("agreement_draft_tenants")
    assert any(fk["referred_table"] == "agreement_drafts" for fk in draft_fks)
    file_fks = inspector.get_foreign_keys("evidence_files")
    assert any(fk["referred_table"] == "evidence_manifests" for fk in file_fks)
    claim_fks = inspector.get_foreign_keys("claim_drafts")
    assert any(fk["referred_table"] == "evidence_manifests" for fk in claim_fks)
    metadata_fks = inspector.get_foreign_keys("agreement_metadata")
    assert any(fk["referred_table"] == "agreement_index" for fk in metadata_fks)


def test_no_seed_rows_exist(test_db_engine: Engine) -> None:
    with test_db_engine.connect() as connection:
        for table in EXPECTED_TABLES:
            count = connection.execute(text(f"SELECT COUNT(*) FROM `{table}`")).scalar()
            assert count == 0, f"unexpected seed rows in {table}"


def test_no_float_or_double_columns_anywhere(test_db_engine: Engine) -> None:
    with test_db_engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND DATA_TYPE IN ('float', 'double')"
            )
        ).fetchall()
    assert rows == [], f"float/double columns found: {rows}"


def test_wei_columns_are_decimal_65_0(test_db_engine: Engine) -> None:
    with test_db_engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT TABLE_NAME, COLUMN_NAME, NUMERIC_PRECISION, NUMERIC_SCALE "
                "FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME LIKE '%wei%'"
            )
        ).fetchall()
    assert rows, "expected wei columns to exist"
    for table, column, precision, scale in rows:
        assert (precision, scale) == (65, 0), f"{table}.{column} is not DECIMAL(65,0)"


def test_downgrade_and_reupgrade_round_trip(test_db_engine: Engine) -> None:
    """Full round trip in the guarded test database: head -> base -> head -> head."""
    url = get_test_database_url()
    config = alembic_config_for(url)
    test_db_engine.dispose()  # release pooled connections before DDL churn

    command.downgrade(config, "base")
    with test_db_engine.connect() as connection:
        remaining = set(inspect(test_db_engine).get_table_names()) & EXPECTED_TABLES
        assert remaining == set(), f"downgrade left tables behind: {remaining}"
        assert connection is not None

    command.upgrade(config, "head")
    assert EXPECTED_TABLES <= set(inspect(test_db_engine).get_table_names())

    # Re-running upgrade head must be a safe no-op.
    command.upgrade(config, "head")
    assert EXPECTED_TABLES <= set(inspect(test_db_engine).get_table_names())
