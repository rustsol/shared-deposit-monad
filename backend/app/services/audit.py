"""Safe audit logging: append-oriented rows with no secret material.

Callers pass only safe identifiers and category strings. This module never
receives raw nonces, tokens, signatures, cookies, URLs, or request bodies —
enforced by convention here and by the logging/audit redaction tests.
"""

from typing import Any

from sqlalchemy.orm import Session

from app.auth.service import utcnow
from app.models import AuditLog


def record_audit_event(
    db: Session,
    *,
    event_type: str,
    actor_wallet: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Adds an audit row to the current transaction (committed by the caller)."""
    db.add(
        AuditLog(
            actor_wallet=actor_wallet,
            event_type=event_type,
            target_type=target_type,
            target_id=target_id,
            metadata_json=metadata,
            created_at=utcnow(),
        )
    )
