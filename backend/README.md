# Shared Deposit — Backend

FastAPI backend for authentication, private metadata, canonical hashing, evidence, and chain-event indexing. **Current status: database foundation, migrations, health/readiness, and canonical hashing only.** Wallet authentication, invitations, evidence upload, agreement/claim APIs, and the event indexer arrive in later phases. Nothing is deployed and no testnet is contacted.

## Source-of-truth boundary

The `SharedDepositEscrow` contract is authoritative for all financial and settlement state (participants, funding, status, claims, votes, refunds, payouts, withdrawals). MySQL is authoritative only for auth sessions, private display metadata, evidence references, pre-chain drafts, invitation lifecycle, and audit records. `agreement_index`, `claim_index`, `chain_events`, and `chain_sync_state` are event-derived **caches** — a direct contract read always wins.

## Local setup (WAMP MySQL)

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
copy .env.example .env                       # local values; never committed
.\.venv\Scripts\python.exe -m app.database.setup    # creates shared_deposit if missing (never destructive)
.\.venv\Scripts\python.exe -m alembic upgrade head  # applies the schema
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`python -m app.database.setup --check` reports state without changing anything. The blank-password root URL is **local WAMP development only** and must never appear in hosted configuration — production settings validation rejects root users, blank passwords, blank session secrets, and non-HTTPS origins.

## Migrations

Alembic is the only schema authority (`create_all` is never used). The database URL comes from validated app settings — no credentials in `alembic.ini`.

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
```

## Health vs readiness

- `GET /api/v1/health` — process facts only (status, version, environment, chain ID). No I/O.
- `GET /api/v1/readiness` — live checks: MySQL reachable, correct database selected, Alembic revision equals the repository head. Returns 503 when not ready. It does **not** claim contract deployment, RPC connectivity, or indexer sync — those checks arrive with those features.

## Canonical hashing

`app/canonical/terms.py` produces the deterministic agreement-terms JSON (sorted keys, compact separators, UTF-8, lowercase addresses, decimal-string wei, closed schema) and its Ethereum Keccak-256 hash. `app/canonical/reason.py` normalizes claim reasons (NFC, CRLF→LF, outer trim) before hashing. Golden vectors live in `tests/fixtures/` (unit-test fixtures only — not real agreements); the expected hash is independently reproduced with viem's `keccak256`, proving browser/backend parity.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Tests run against **real MySQL** (never SQLite). Destructive test operations are guarded: they run only against database names ending in `_test` (`shared_deposit_test` locally), and `shared_deposit` is never dropped or truncated. CI runs the same suite against an official `mysql:8.4` service container.
