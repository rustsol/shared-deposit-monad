"""Typed application configuration.

Values come from environment variables (and backend/.env during local
development). Importing this module never connects to the database and never
prints secret values: the database URL and session secret are wrapped in
``SecretStr`` so repr/logging shows ``**********`` instead of credentials.

The blank-password WAMP root URL is permitted only while APP_ENV is a local
environment; production configuration is validated against root users, blank
passwords, blank session secrets, and non-HTTPS origins.
"""

from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent

_LOCAL_ENVS = {"development", "test"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = Field(default="development", alias="APP_ENV")
    app_version: str = Field(default="local", alias="APP_VERSION")
    git_commit_sha: str = Field(default="", alias="GIT_COMMIT_SHA")

    database_url: SecretStr = Field(alias="DATABASE_URL")

    backend_host: str = Field(default="127.0.0.1", alias="BACKEND_HOST")
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    frontend_origin: str = Field(default="http://localhost:5173", alias="FRONTEND_ORIGIN")

    session_cookie_name: str = Field(default="shared_deposit_session", alias="SESSION_COOKIE_NAME")
    session_ttl_seconds: int = Field(default=86400, alias="SESSION_TTL_SECONDS")
    auth_nonce_ttl_seconds: int = Field(default=600, alias="AUTH_NONCE_TTL_SECONDS")
    session_secret: SecretStr = Field(default=SecretStr(""), alias="SESSION_SECRET")

    chain_id: int = Field(default=10143, alias="CHAIN_ID")
    chain_name: str = Field(default="Monad Testnet", alias="CHAIN_NAME")
    rpc_url: str = Field(default="https://testnet-rpc.monad.xyz", alias="RPC_URL")
    explorer_tx_base: str = Field(
        default="https://testnet.monadscan.com/tx/", alias="EXPLORER_TX_BASE"
    )
    escrow_contract_address: str = Field(default="", alias="ESCROW_CONTRACT_ADDRESS")
    escrow_deployment_block: int | None = Field(default=None, alias="ESCROW_DEPLOYMENT_BLOCK")

    log_block_chunk_size: int = Field(default=100, alias="LOG_BLOCK_CHUNK_SIZE")
    chain_poll_seconds: int = Field(default=5, alias="CHAIN_POLL_SECONDS")
    # How long a recorded hash may stay unobserved before it is NOT_FOUND.
    tx_not_found_seconds: int = Field(default=900, alias="TX_NOT_FOUND_SECONDS")

    evidence_storage_root: str = Field(default="./storage/evidence", alias="EVIDENCE_STORAGE_ROOT")
    evidence_max_files: int = Field(default=5, alias="EVIDENCE_MAX_FILES")
    evidence_max_total_bytes: int = Field(default=10_485_760, alias="EVIDENCE_MAX_TOTAL_BYTES")

    # ------------------------------------------------------------------
    # Field validation
    # ------------------------------------------------------------------

    @field_validator("escrow_deployment_block", mode="before")
    @classmethod
    def _blank_optional_int(cls, value: object) -> object:
        # .env files express "unset" as an empty string.
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @field_validator("chain_id")
    @classmethod
    def _chain_id_positive(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("CHAIN_ID must be a positive integer")
        return value

    @field_validator("database_url")
    @classmethod
    def _database_url_scheme(cls, value: SecretStr) -> SecretStr:
        raw = value.get_secret_value()
        if not raw.startswith("mysql+pymysql://"):
            raise ValueError(
                "DATABASE_URL must use the mysql+pymysql:// scheme; "
                "SQLite, MariaDB dialects, and in-memory substitutes are not permitted"
            )
        parsed = urlsplit(raw)
        if not parsed.hostname or not parsed.path.lstrip("/"):
            raise ValueError("DATABASE_URL must include a host and a database name")
        return value

    @field_validator("frontend_origin")
    @classmethod
    def _origin_shape(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("FRONTEND_ORIGIN must be an http(s) origin")
        if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            raise ValueError("FRONTEND_ORIGIN must be a bare origin without path or query")
        return value.rstrip("/")

    # ------------------------------------------------------------------
    # Hosted-environment safety
    # ------------------------------------------------------------------

    @model_validator(mode="after")
    def _reject_unsafe_hosted_configuration(self) -> "Settings":
        if self.app_env in _LOCAL_ENVS:
            # Local WAMP development explicitly permits root with a blank password.
            return self
        problems: list[str] = []
        parsed = urlsplit(self.database_url.get_secret_value())
        if not self.session_secret.get_secret_value():
            problems.append("SESSION_SECRET must not be blank outside local development")
        if not self.frontend_origin.startswith("https://"):
            problems.append("FRONTEND_ORIGIN must use HTTPS outside local development")
        if parsed.username == "root":
            problems.append("the database user must not be root outside local development")
        if not parsed.password:
            problems.append("the database password must not be blank outside local development")
        if problems:
            raise ValueError("unsafe hosted configuration: " + "; ".join(problems))
        return self

    # ------------------------------------------------------------------
    # Derived values
    # ------------------------------------------------------------------

    @property
    def database_name(self) -> str:
        """The database name from the URL (safe to display)."""
        return urlsplit(self.database_url.get_secret_value()).path.lstrip("/").split("?")[0]

    @property
    def safe_database_target(self) -> str:
        """Host, port, and database name only — no credentials. Safe for logs."""
        parsed = urlsplit(self.database_url.get_secret_value())
        return f"{parsed.hostname}:{parsed.port or 3306}/{self.database_name}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings instance. Never called at module import time."""
    return Settings()  # type: ignore[call-arg]
