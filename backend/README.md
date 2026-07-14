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

## Authentication (wallet signature, EIP-4361)

docs/02 §5.2 defines the message contents but no exact text, so the sign-in
message is **EIP-4361 (Sign-In with Ethereum) verbatim** — reproducible in the
browser with viem's `createSiweMessage` (JavaScript `toISOString()` timestamp
form; EIP-55 checksummed address in the message, lowercase normalization in
storage). A golden message fixture lives in `tests/test_auth_flow.py`.

- `POST /api/v1/auth/nonce` — 256-bit one-time nonce (10-minute TTL), returned
  only inside the exact message to sign; only its SHA-256 hash is stored.
- `POST /api/v1/auth/verify` — byte-exact message match, current-config
  domain/URI/chain re-validation, `eth_account` signer recovery, atomic
  single-statement nonce consumption (concurrent replays cannot both win),
  session + CSRF issue, wallet profile created on first login (never
  duplicated, never overwritten).
- Sessions: 256-bit opaque token, hash-only storage, `HttpOnly` `SameSite=Lax`
  `Path=/` cookie (`Secure` mandatory outside local development),
  `SESSION_TTL_SECONDS` lifetime, explicit revocation via `POST /auth/logout`.
  Policy: multiple concurrent sessions per wallet (one per device).
- CSRF: session-bound double-submit. A 256-bit value is issued at login; only
  its hash is stored; every cookie-authenticated mutation requires the
  `X-CSRF-Token` header (constant-time hash comparison) plus an approved
  `Origin`. `GET /auth/me` rotates and returns the current session's CSRF
  value (exactly one active per session), since only the hash is persisted.
- Rate limiting: in-process sliding window on nonce/verify/invitation
  endpoints — **single-instance MVP only**; it does not coordinate across
  servers and is deliberately replaceable by a shared store later.

## Invitations (offchain draft access only)

Invitations gate access to **pre-onchain drafts**. Claiming one records
`used_at` and nothing else — it never marks anything accepted, funded, or
active onchain; that always requires a real wallet transaction later.

States: `active`, `already_claimed` (one-time), `expired` (72h TTL),
`revoked`, `rotated` (revoked + `superseded_by`). Tokens are 256-bit
URL-safe values shown exactly once at creation/rotation; the database stores
SHA-256 hashes only; review responses send `Referrer-Policy: no-referrer` and
`Cache-Control: no-store`; the app access log redacts `/api/v1/invitations/*`
path segments. Duplicate-prevention policy: one active token per
draft/wallet/role — creating a second is rejected (409); rotation is the
explicit replacement operation and atomically leaves at most one active token.

**Deployment note:** a hosted reverse proxy keeps its own access log — it MUST
redact `/api/v1/invitations/*` path segments and never log `Cookie`,
`Authorization`, or `X-CSRF-Token` headers. The application-level redaction
covers only the app's own log.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Tests run against **real MySQL** (never SQLite). Destructive test operations are guarded: they run only against database names ending in `_test` (`shared_deposit_test` locally), and `shared_deposit` is never dropped or truncated. CI runs the same suite against an official `mysql:8.4` service container.
