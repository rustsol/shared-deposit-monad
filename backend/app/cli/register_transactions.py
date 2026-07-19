"""Register KNOWN transaction hashes into contract_transactions.

    python -m app.cli.register_transactions --tx 0x... [--tx 0x...]...

One-time/operator tool: each hash is fetched from the chain BY HASH, its
sender/target/function are taken from the transaction itself, its receipt is
verified, and the agreement cache is refreshed from a direct contract read.
No block scanning, no event discovery - only the hashes given on the command
line are touched. Idempotent: re-running with the same hashes changes
nothing.
"""

import argparse
import json
import sys
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from app.blockchain.deployment import load_deployment_metadata
from app.blockchain.service import get_chain_service
from app.config import get_settings
from app.database.session import get_session_factory
from app.services.transactions import TxChainReader, TxError, register_known_transaction


def run(
    argv: list[str] | None = None,
    chain: TxChainReader | None = None,
    session_factory: Callable[[], Session] | None = None,
) -> list[dict[str, Any]]:
    parser = argparse.ArgumentParser(prog="python -m app.cli.register_transactions")
    parser.add_argument(
        "--tx", action="append", required=True, help="transaction hash (repeatable)"
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    metadata = load_deployment_metadata()
    if metadata is None:
        raise SystemExit("no verified contract deployment is configured")
    reader = chain or get_chain_service()
    session = (session_factory or get_session_factory())()
    results: list[dict[str, Any]] = []
    try:
        for tx_hash in args.tx:
            try:
                row = register_known_transaction(
                    session, settings, reader, metadata.contract_address, tx_hash
                )
                results.append(
                    {
                        "tx_hash": row.tx_hash,
                        "wallet": row.wallet_address,
                        "function": row.function_name,
                        "agreement_id": (
                            str(int(row.agreement_id)) if row.agreement_id is not None else None
                        ),
                        "status": row.status,
                        "block_number": row.block_number,
                    }
                )
            except TxError as error:
                results.append({"tx_hash": tx_hash.lower(), "error": error.detail})
        session.commit()
    finally:
        session.close()
    return results


def main() -> None:
    json.dump(run(), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
