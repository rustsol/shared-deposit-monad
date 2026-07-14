"""Phase 1 smoke test: the application package imports and instantiates."""

from app.main import app


def test_app_exists() -> None:
    assert app.title == "Shared Deposit API"
