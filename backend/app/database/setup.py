"""Safe, repeatable database creation: ``python -m app.database.setup``.

Creates the configured database only when it does not exist, using PyMySQL
directly (the MySQL CLI is not reliably on PATH under WAMP). Never drops,
never truncates, never recreates, never seeds. ``--check`` reports state
without changing anything. Credentials are never printed.
"""

from __future__ import annotations

import argparse
import sys
from urllib.parse import unquote, urlsplit

import pymysql

from app.config import Settings, get_settings


def _connect(settings: Settings) -> pymysql.connections.Connection[pymysql.cursors.Cursor]:
    parsed = urlsplit(settings.database_url.get_secret_value())
    return pymysql.connect(
        host=parsed.hostname or "127.0.0.1",
        port=parsed.port or 3306,
        user=unquote(parsed.username or "root"),
        password=unquote(parsed.password or ""),
        charset="utf8mb4",
    )


def ensure_database(settings: Settings, *, check_only: bool = False) -> dict[str, str]:
    """Ensures the configured database exists. Returns observed facts."""
    database = settings.database_name
    connection = _connect(settings)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT VERSION()")
            row = cursor.fetchone()
            server_version = str(row[0]) if row else "unknown"

            cursor.execute(
                "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = %s",
                (database,),
            )
            exists = cursor.fetchone() is not None

            created = False
            if not exists and not check_only:
                # Identifier quoting: the database name comes from validated
                # configuration, not user input; backticks guard edge names.
                cursor.execute(
                    f"CREATE DATABASE `{database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
                created = True
                exists = True

            charset = collation = "absent"
            if exists:
                cursor.execute(
                    "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME "
                    "FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = %s",
                    (database,),
                )
                info = cursor.fetchone()
                if info:
                    charset, collation = str(info[0]), str(info[1])
        connection.commit()
    finally:
        connection.close()

    return {
        "server_version": server_version,
        "database": database,
        "state": "created" if created else ("present" if exists else "absent"),
        "charset": charset,
        "collation": collation,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.database.setup",
        description="Create the configured MySQL database if missing (never destructive).",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="report state only; create nothing",
    )
    args = parser.parse_args()

    settings = get_settings()
    try:
        result = ensure_database(settings, check_only=args.check)
    except pymysql.MySQLError as error:
        # Never print the URL or credentials; the target is host/db only.
        print(
            f"MySQL not reachable at {settings.safe_database_target}: "
            f"error class {type(error).__name__}",
            file=sys.stderr,
        )
        return 1

    for key, value in result.items():
        print(f"{key}: {value}")
    if result["state"] == "absent":
        print("database is absent (run without --check to create it)", file=sys.stderr)
        return 1
    if result["charset"] != "utf8mb4":
        print("warning: database charset is not utf8mb4", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
