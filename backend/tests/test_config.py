"""Configuration validation, hosted-safety rules, and secret redaction."""

import os
import subprocess
import sys

import pytest
from pydantic import ValidationError

from app.config import Settings

LOCAL_URL = "mysql+pymysql://root:@127.0.0.1:3306/shared_deposit?charset=utf8mb4"
HOSTED_URL = "mysql+pymysql://appuser:strongpass@db.internal:3306/shared_deposit"


def make(**values: str) -> Settings:
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def test_valid_local_configuration() -> None:
    settings = make(DATABASE_URL=LOCAL_URL)
    assert settings.app_env == "development"
    assert settings.chain_id == 10143
    assert settings.database_name == "shared_deposit"
    assert settings.safe_database_target == "127.0.0.1:3306/shared_deposit"


def test_missing_database_url_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    # conftest sets a process-level default; remove it so the value is truly absent.
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValidationError):
        make()


@pytest.mark.parametrize("value", ["0", "-5", "not-a-number"])
def test_invalid_chain_id_rejected(value: str) -> None:
    with pytest.raises(ValidationError):
        make(DATABASE_URL=LOCAL_URL, CHAIN_ID=value)


@pytest.mark.parametrize(
    "url",
    [
        "sqlite:///./local.db",
        "mysql+mysqldb://root:@127.0.0.1:3306/shared_deposit",
        "mariadb+pymysql://root:@127.0.0.1:3306/shared_deposit",
        "postgresql://root:@127.0.0.1:5432/shared_deposit",
        "mysql+pymysql://root:@127.0.0.1:3306/",  # missing database name
    ],
)
def test_invalid_database_scheme_rejected(url: str) -> None:
    with pytest.raises(ValidationError):
        make(DATABASE_URL=url)


def test_production_rejects_root_database_user() -> None:
    with pytest.raises(ValidationError, match="root"):
        make(
            DATABASE_URL="mysql+pymysql://root:strongpass@db.internal:3306/shared_deposit",
            APP_ENV="production",
            SESSION_SECRET="x" * 32,
            FRONTEND_ORIGIN="https://app.example.com",
        )


def test_production_rejects_blank_database_password() -> None:
    with pytest.raises(ValidationError, match="password"):
        make(
            DATABASE_URL="mysql+pymysql://appuser:@db.internal:3306/shared_deposit",
            APP_ENV="production",
            SESSION_SECRET="x" * 32,
            FRONTEND_ORIGIN="https://app.example.com",
        )


def test_production_rejects_blank_session_secret_and_http_origin() -> None:
    with pytest.raises(ValidationError, match="SESSION_SECRET"):
        make(
            DATABASE_URL=HOSTED_URL,
            APP_ENV="production",
            FRONTEND_ORIGIN="https://app.example.com",
        )
    with pytest.raises(ValidationError, match="HTTPS"):
        make(
            DATABASE_URL=HOSTED_URL,
            APP_ENV="production",
            SESSION_SECRET="x" * 32,
            FRONTEND_ORIGIN="http://app.example.com",
        )


def test_valid_production_configuration_passes() -> None:
    settings = make(
        DATABASE_URL=HOSTED_URL,
        APP_ENV="production",
        SESSION_SECRET="x" * 32,
        FRONTEND_ORIGIN="https://app.example.com",
    )
    assert settings.app_env == "production"


def test_secrets_are_redacted_in_repr_and_str() -> None:
    secret = "super-secret-session-value"
    password = "strongpass"
    settings = make(
        DATABASE_URL=HOSTED_URL,
        APP_ENV="production",
        SESSION_SECRET=secret,
        FRONTEND_ORIGIN="https://app.example.com",
    )
    for rendered in (repr(settings), str(settings)):
        assert secret not in rendered
        assert password not in rendered
    assert password not in settings.safe_database_target


def test_import_opens_no_database_connection() -> None:
    """Importing the app with an unroutable DATABASE_URL must succeed quickly:
    nothing connects at import time."""
    code = "import app.main; import app.database; print('imported-ok')"
    env = dict(os.environ)
    # TEST-NET-3 address (RFC 5737): guaranteed unroutable. If anything tried to
    # connect during import, this subprocess would hang or fail instead of
    # printing the marker within the timeout.
    env["DATABASE_URL"] = "mysql+pymysql://root:@203.0.113.1:3306/unreachable"
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        timeout=60,
        env=env,
        cwd=".",
    )
    assert result.returncode == 0, result.stderr
    assert "imported-ok" in result.stdout
