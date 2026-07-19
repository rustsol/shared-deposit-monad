"""Re-verify unresolved stored transactions.

    python -m app.cli.verify_transactions [--limit N]

Checks ONLY hashes already stored in contract_transactions whose status is
unresolved (SUBMITTED / BROADCAST_CONFIRMED / PENDING / MINED_SUCCESS). One
transaction lookup and at most one receipt lookup per row - never a block
scan, never a log range query, never a write to the chain.
"""

import argparse
import json
import sys
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from app.blockchain.service import get_chain_service
from app.config import get_settings
from app.database.session import get_session_factory
from app.models import ContractTransaction
from app.models.transactions import UNRESOLVED_STATUSES
from app.services.transactions import TxChainReader, verify_transaction


def run(
    argv: list[str] | None = None,
    chain: TxChainReader | None = None,
    session_factory: Callable[[], Session] | None = None,
) -> list[dict[str, Any]]:
    parser = argparse.ArgumentParser(prog="python -m app.cli.verify_transactions")
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args(argv)

    settings = get_settings()
    reader = chain or get_chain_service()
    session = (session_factory or get_session_factory())()
    results: list[dict[str, Any]] = []
    try:
        rows = (
            session.query(ContractTransaction)
            .filter(
                ContractTransaction.chain_id == settings.chain_id,
                ContractTransaction.status.in_(sorted(UNRESOLVED_STATUSES)),
            )
            .order_by(ContractTransaction.submitted_at)
            .limit(args.limit)
            .all()
        )
        for row in rows:
            before = row.status
            verify_transaction(session, settings, reader, row)
            results.append({"tx_hash": row.tx_hash, "before": before, "after": row.status})
        session.commit()
    finally:
        session.close()
    return results


def main() -> None:
    json.dump(run(), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
