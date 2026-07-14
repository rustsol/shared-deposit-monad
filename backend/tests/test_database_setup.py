"""Safe database-creation command behavior against the real MySQL server."""

from urllib.parse import urlsplit

from app.database.setup import ensure_database
from tests.conftest import (
    drop_test_database,
    get_test_database_url,
    make_test_settings,
)

# A dedicated throwaway name — the _test suffix keeps every operation guarded.
SETUP_DB_URL = get_test_database_url().replace("shared_deposit_test", "shared_deposit_setup_test")


def test_reports_existing_database_without_touching_it() -> None:
    settings = make_test_settings()
    result = ensure_database(settings, check_only=True)
    assert result["database"] == urlsplit(get_test_database_url()).path.lstrip("/").split("?")[0]
    assert result["state"] in {"present", "absent"}
    assert result["server_version"]  # the real observed server version


def test_creates_database_when_missing_and_repeat_is_safe() -> None:
    drop_test_database(SETUP_DB_URL)
    settings = make_test_settings(DATABASE_URL=SETUP_DB_URL)
    try:
        first = ensure_database(settings)
        assert first["state"] == "created"
        assert first["charset"] == "utf8mb4"
        assert first["collation"] == "utf8mb4_unicode_ci"

        second = ensure_database(settings)
        assert second["state"] == "present"  # repeat run never recreates

        checked = ensure_database(settings, check_only=True)
        assert checked["state"] == "present"
    finally:
        drop_test_database(SETUP_DB_URL)


def test_check_only_never_creates() -> None:
    drop_test_database(SETUP_DB_URL)
    settings = make_test_settings(DATABASE_URL=SETUP_DB_URL)
    result = ensure_database(settings, check_only=True)
    assert result["state"] == "absent"
