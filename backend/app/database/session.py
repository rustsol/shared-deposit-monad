"""Session lifecycle: one request, one session; always closed; rollback on
error; writes require explicit commit."""

from collections.abc import Iterator

from sqlalchemy.orm import Session, sessionmaker

from app.database.engine import get_engine

_session_factory: sessionmaker[Session] | None = None


def get_session_factory() -> sessionmaker[Session]:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(),
            expire_on_commit=False,
            autoflush=False,
        )
    return _session_factory


def get_db_session() -> Iterator[Session]:
    """FastAPI dependency: yields one session per request, rolls back on any
    exception, and always closes. Commits are explicit in the calling code."""
    session = get_session_factory()()
    try:
        yield session
        session.rollback()  # discard anything left uncommitted by the request
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
