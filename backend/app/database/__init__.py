"""Database foundation: declarative base, engine, sessions, setup, readiness.

Source-of-truth boundary (docs/02 §1, §5): the SharedDepositEscrow contract is
authoritative for all financial and settlement state. MySQL is authoritative
only for authentication, private metadata, drafts, invitation lifecycle, and
application audit records. The chain-related tables (agreement_index,
claim_index, chain_events, chain_sync_state) are event-derived caches and must
never override a direct contract read.
"""

from app.database.base import Base
from app.database.engine import create_app_engine, dispose_engine, get_engine
from app.database.session import get_db_session, get_session_factory

__all__ = [
    "Base",
    "create_app_engine",
    "dispose_engine",
    "get_db_session",
    "get_engine",
    "get_session_factory",
]
