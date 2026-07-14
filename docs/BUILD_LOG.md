# Shared Deposit — Build Log

Chronological record of real work, validation results, and blockers. No fabricated results are recorded here; every entry reflects a command actually run and its observed output.

---

## 2026-07-14 08:40 UTC — Phase 0: documentation and environment validation

### Repository

- Local project path: `E:\wamp64\www\Hackathon\shared-deposit-monad`
- GitHub repository: https://github.com/rustsol/shared-deposit-monad (public, MIT license)
- Default branch: `main`
- First commit: `4748eb85eb94c06af3a287c8b35b03b39f82cfbd` — `docs: establish Shared Deposit MVP specification`
- First commit contents: the seven canonical documents in `docs/`, root `README.md`, `LICENSE` (MIT), `.gitignore`, `.editorconfig`, and blank-value environment examples (root, `contracts/`, `backend/`, `frontend/`)

### Verified tool versions

| Tool | Version | Result |
|---|---|---|
| git | 2.46.0.windows.1 | OK |
| GitHub CLI (gh) | 2.54.0 | OK — authenticated as `rustsol` (keyring), scopes: gist, read:org, repo, workflow |
| Node.js | v24.13.1 | OK |
| npm | 11.8.0 | OK |
| Python | 3.11.7 | OK — meets the 3.11+ requirement |
| MySQL client | not on PATH; WAMP ships client 5.7.31 at `E:\wamp64\bin\mysql\mysql5.7.31\bin` | usable via full path |

### MySQL connectivity (WAMP)

- Connected to `127.0.0.1:3306` as `root` with blank password: **success**
- Server version reported by `SELECT VERSION()`: **9.1.0**
- `shared_deposit` database: **does not exist yet** (intentionally not created in Phase 0)
- Note: blank root password is local-development configuration only and must never be used on a hosted server

### Port availability

| Port | Purpose | Status |
|---|---|---|
| 5173 | Vite dev server | available |
| 8000 | FastAPI | available |
| 8545 | local Hardhat node (optional) | available |
| 3306 | WAMP MySQL | in use by MySQL (expected) |

### Current state — explicitly not yet done

No source code, no dependency installation (npm or Python), no `shared_deposit` database, no Alembic migrations, no Solidity contract, no CI workflows, no wallets or private keys generated, no contract deployment, and no blockchain data of any kind exist yet. The repository contains documentation and environment examples only. Financial logic is not implemented.

### Next phase

Phase 1 — workspace scaffolding (contracts, backend, frontend, scripts, CI), pending explicit approval.

---

## 2026-07-14 09:03 UTC — Phase 1: workspace scaffolding

### Guidance verified at build time (not assumed)

- Official Monad Hardhat guide (docs.monad.xyz) offers Hardhat 2 and Hardhat 3 templates; requires `evmVersion: "prague"` and uses Solidity `0.8.28`.
- Official template `monad-developers/hardhat-monad` config confirmed: chain IDs 10143 (testnet) / 143 (mainnet), RPC URLs `https://testnet-rpc.monad.xyz` / `https://rpc.monad.xyz`, `metadata.bytecodeHash: "ipfs"`, verification via Sourcify (`https://sourcify-api-monad.blockvision.org`) plus Etherscan v2 custom chains (monadscan).
- Chose Hardhat 2 with `@nomicfoundation/hardhat-toolbox-viem` + `hardhat-ignition-viem`, matching the official template and the viem-based frontend.
- Deviations from the template: added `evmVersion: "prague"` and optimizer (enabled, runs 200) explicitly per the guide and docs/02; guarded `accounts` so a blank `PRIVATE_KEY` cannot crash compile/test.

### Resolved workspace versions (from lockfiles)

| Workspace | Key packages |
|---|---|
| contracts | hardhat 2.28.6, @nomicfoundation/hardhat-toolbox-viem ^3, hardhat-ignition-viem 0.15.16, @openzeppelin/contracts ^5.1, prettier + prettier-plugin-solidity, TypeScript strict |
| backend | Python 3.11.7 venv at `backend/.venv`; fastapi ≥0.115, uvicorn, SQLAlchemy ≥2.0, alembic, PyMySQL, web3 ≥7, eth-account, pydantic-settings; dev: pytest, httpx, ruff, mypy (strict) |
| frontend | Vite 8.1, React 19.2, TypeScript ~6.0 (strict enabled explicitly), wagmi 3.7, viem 2.55, @tanstack/react-query 5, react-router-dom 7, react-hook-form 7 + zod 4, vitest 4 + Testing Library, @playwright/test 1.61 (browsers not installed yet), oxlint |

### Validation results (all real, run locally)

- `contracts`: `npm run lint` exit 0; `npm run compile` "Nothing to compile" (no sources yet, by design); `npx hardhat test` 0 passing (harness works). Note: with zero sources, hardhat-viem's typegen needs `artifacts/` to exist — `precompile`/`pretest` npm hooks create it; remove the hooks in Phase 2 when the real contract exists.
- `backend`: `ruff check` clean; `mypy` (strict) clean, 2 files; `pytest` 1 passed (import smoke test).
- `frontend`: `oxlint` clean; `tsc -b` clean; `vitest` 1 passed; production build succeeded.
- `scripts/test-all.ps1` full suite: **All checks passed.**

### What Phase 1 contains — and does not

Workspace configuration, lockfiles, a bare FastAPI instance, a placeholder frontend page that states the app is not implemented, empty contract/test/ignition directories, PowerShell helper scripts, and a 3-job CI skeleton. **No product business logic, no Solidity contract, no database (`shared_deposit` still not created), no Alembic migrations, no API endpoints, no wallet code, no keys, no deployment, no placeholder application data.**

### Next phase

Phase 2 — contract funding lifecycle (`SharedDepositEscrow.sol` creation/acceptance/funding + tests), pending explicit approval.

---

## 2026-07-14 (Phase 2): contract funding lifecycle

### Implemented (commit `e973f97` + this commit)

`contracts/contracts/SharedDepositEscrow.sol` — agreement creation (full validation, recomputed totals, sequential IDs starting at 1), tenant/recipient acceptance against the exact stored terms hash, partial funding with overfunding prevention, automatic activation on the final qualifying acceptance or deposit, pre-activation withdrawal, participant-only expiry cancellation, cancelled-funding withdrawal with the approved historical-accounting model (`fundedAmount`/`totalFunded` never decreased; `cancelledFundingWithdrawnAmount`, `cancelledFundingWithdrawn`, `totalCancelledFundingWithdrawn` recorded), documented views, and `receive`/`fallback` rejection. No owner/admin/fee/rescue/upgrade path exists; the deployer has no special authority (asserted by tests at the ABI level). OpenZeppelin `ReentrancyGuard` + checks-effects-interactions on both withdrawal functions. Claim/settlement storage fields exist (documented) so the storage layout is final, but no claim logic is implemented.

Documented additions to the canonical minimum error list: `TenantNotAccepted` (deposit before acceptance), `NotParticipant` (non-participant cancellation attempt). Documented decision: agreement IDs start at 1 so ID 0 is never valid.

`contracts/contracts/test/TenantProxy.sol` — test-only fixture enabling malicious-receiver and reentrancy scenarios; not part of the product.

### Validation (all commands actually run)

- `npm run lint` (prettier incl. Solidity): exit 0
- `npm run compile`: "Compiled 2 Solidity files successfully (evm target: prague)" (solc 0.8.28, optimizer 200, ipfs metadata — unchanged Phase 1 settings)
- `npm run typecheck` (tsc strict incl. generated artifact types): exit 0
- `npx hardhat test`: **75 passing** (agreement.lifecycle 47, withdrawals.security 27, invariants.property 1 covering 20 seeded randomized scenarios), 0 failing, 0 skipped, no `.only`
- Secret scan over changed files: no key material; no `.env` files exist; no deployment artifacts committed
- Note: one stack-too-deep compiler error during development was resolved by extracting `_registerTenants` (no `viaIR` change); one property-test scenario generator bug (non-completing scenarios could accidentally fully fund and legitimately activate) was fixed in the test, not the contract

### Local gas estimates (Hardhat network only — NOT testnet measurements)

| Operation | Gas |
|---|---|
| deploy SharedDepositEscrow | 1,957,285 |
| createAgreement (2 tenants) | 349,136 |
| acceptAsTenant | 35,916 |
| acceptAsRecipient | 44,918 |
| deposit (partial) | 47,218 |
| deposit (final, triggers activation) | 58,889 |
| withdrawFundingBeforeActivation | 48,911 |
| cancelExpiredFunding | 32,572 |
| withdrawCancelledFunding | 87,483 |

### Explicitly not done in Phase 2

No claims, voting, settlement, refunds, or recipient payout; no deployment to Monad Testnet or anywhere; no private keys requested, generated, or stored; no backend/DB/frontend changes; no CI changes.

### Next phase

Phase 3 — claims, voting, and settlement (with the approved largest-remainder allocation), pending explicit approval.

---

## 2026-07-14 (Phase 3): claims, voting, settlement, withdrawals

### Implemented (commits `d07e3b4`, `9e9e8ed` + this commit)

- **Claims** (`d07e3b4`): `ClaimType`/`ClaimStatus` enums, `Claim` struct (hash-only public data: amount, reason hash, evidence-manifest hash, vote counts, status), claim/vote mappings, `submitClaim` (recipient-only, `leaseEnd <= now <= claimDeadline`, global and per-tenant reservation caps computed in uint256, 32-claim lifetime limit with withdrawn claims counted, sequential 1-based claim IDs never reused), `withdrawPendingClaim` (releases reservations, preserves historical claim values, no funds move), `voteClaim` (one immutable vote, YES threshold `floor(n/2)+1`, immediate rejection at `tenantCount - requiredApprovals + 1` NO votes with the impossibility derivation commented), `finalizePendingClaim` (participant-only per the user guide, strictly after the settlement deadline, approve only if the YES threshold was reached), shared `_approveClaim`/`_rejectClaim`/`_releaseOpenClaimReservation` helpers so no counter can double-move, `getClaim`/`getVote` views.
- **Settlement** (`9e9e8ed`): `finalizeAgreement` (permissionless per the scope document, strictly after the settlement deadline, zero unresolved claims, moves no funds), `_computeSettlement` implementing the approved algorithm exactly — individual deductions first, `Math.mulDiv` base allocations, `mulmod` fractional remainders, largest-remainder distribution capped at each tenant's remaining balance with index tie-breaks and cleared remainders, bounded loops (remainder < 8, proof commented) — stored refunds, `withdrawTenantRefund`/`withdrawRecipientPayout` (finalized-only, once, flag-before-transfer, ReentrancyGuard, never recomputed), `getRecipientPayout` view, `AgreementFinalized`/`TenantRefundWithdrawn`/`RecipientPayoutWithdrawn` events.
- **Tests** (this commit): `claims.voting.ts` (29), `settlement.accounting.ts` (30), extended `invariants.property.ts` (full-lifecycle seeded suite, 12 scenarios), `TenantProxy` extended with recipient role and refund/payout reentry modes, new `ForceSend` fixture (test-only selfdestruct force-transfer; deprecation warning expected and accepted).

Documented additions/decisions: `TooManyClaims` error (canonical list had none for the claim-ID limit); claim IDs are 1-based sequential per agreement; `finalizePendingClaim` is participant-only (user guide: "any participant") while `finalizeAgreement` is permissionless (scope doc: "anyone may finalize"); `getRecipientPayout` view added for safe frontend consumption.

### Validation (all commands actually run)

- `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run compile` clean (solc 0.8.28, prague, optimizer 200 — unchanged settings)
- `npx hardhat test`: **135 passing, 0 failing, 0 skipped** (lifecycle 47, withdrawals.security 27, claims.voting 29, settlement.accounting 30, property 2 — funding 20 scenarios seed `0xc0ffee`, full lifecycle 12 scenarios seed `0xbadd1ce`)
- Forced-MON tests prove unsolicited transfers never change `totalFunded`, claim capacity, refunds, payout, or withdrawable amounts, and that the excess stays unallocated with no rescue path
- Two test-generator bugs were found and fixed during development (individual-claim capacity ignoring the global cap; an event-query semantics assertion) — both in tests, not the contract
- Secret scan clean; no `.env`, no deployment artifacts, no fake addresses/hashes

### Bytecode (local artifact)

Creation 16,408 bytes; **deployed 16,340 bytes = 66.5% of the 24,576-byte EVM limit**.

### Local gas estimates (Hardhat network only — NOT testnet measurements)

| Operation | Gas |
|---|---|
| submitClaim (shared) | 135,854 |
| voteClaim (no resolution) | 60,266 |
| voteClaim (causing approval) | 94,365 |
| voteClaim (causing rejection) | 69,715 |
| finalizePendingClaim (reject) | 40,535 |
| finalizeAgreement (2 tenants) | 97,706 |
| finalizeAgreement (4 tenants, mixed claims) | 159,206 |
| finalizeAgreement (8 tenants) | 282,208 |
| withdrawTenantRefund | 42,843 |
| withdrawRecipientPayout | 42,746 |

No function approaches block-gas concerns (worst case ~282k with 8 tenants).

### Explicitly not done in Phase 3

No deployment to any network; no private keys requested, generated, or used (local Hardhat signers only); no backend, MySQL, Alembic, auth, invitations, evidence upload, event indexer, or frontend product flows; no demo/fake data.

### Next phase

Phase 4 — backend foundation and MySQL (typed config, SQLAlchemy engine, Alembic initial migration, wallet-signature auth, canonical hashing, drafts, health endpoint), pending explicit approval.

---

## 2026-07-14 (Phase 3 milestone tag + Phase 4): backend database foundation

### Milestone tag

Annotated tag `v0.1.0-contract-local` ("Shared Deposit contract complete and locally verified") created on `a03f948` and pushed; verified locally and on the remote (tag object `e5c1073` dereferences to `a03f948`). No branch or commit was modified.

### Dependency verification (Phase 1 pins — no upgrades needed)

Installed and compatible: Python 3.11.7, FastAPI 0.139.0, pydantic 2.13.4, pydantic-settings 2.14.2, SQLAlchemy 2.0.51, Alembic 1.18.5, PyMySQL 1.2.0, web3 7.16.0, eth-account 0.13.7, ruff 0.15.21, mypy 2.3.0, pytest 9.1.1. Additions (declared in pyproject): `eth-utils>=4` + `eth-hash[pycryptodome]>=0.7` (previously transitive via web3, now explicit because the canonical hashing imports them directly — Ethereum Keccak-256, correctness verified against the known keccak256("abc") digest) and `types-PyMySQL` (dev, mypy strict stubs).

### Implemented

- **Config** (`app/config.py`): pydantic-settings, secrets in `SecretStr` (redacted in repr/str), URL scheme validation (mysql+pymysql only — SQLite/MariaDB substitutes rejected), chain-ID/origin validation, hosted-safety rules (root user, blank password, blank session secret, non-HTTPS origin all rejected outside development/test). No DB connection at import (subprocess-tested with an unroutable RFC 5737 address).
- **Database package** (`app/database/`): declarative base with deterministic naming conventions; lazy engine (`pool_pre_ping`, recycle 1800s); one-session-per-request lifecycle with rollback-on-error; `python -m app.database.setup` (PyMySQL-based, MySQL CLI not required; create-if-missing only, `--check` mode, repeat-safe, never drops/seeds); readiness checks (SELECT 1, selected database, Alembic revision vs head).
- **Per-connection strict SQL mode**: the local WAMP MySQL 9.1 server runs with a **blank sql_mode** (discovered by failing tests — negatives were clamped and overlong strings truncated silently). Every application/test connection now sets `STRICT_TRANS_TABLES,STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO` via `init_command`, so financial data can never be silently altered regardless of server defaults. The server's global configuration was not touched.
- **Models**: all 15 documented tables (docs/02 §5.4) in 8 modules; wei as `DECIMAL(65,0)`; addresses `CHAR(42)`/hashes `CHAR(66)`/token hashes `CHAR(64)` with `ascii_bin`; `DATETIME(6)` UTC; InnoDB/utf8mb4; unique event identity `(chain_id, contract_address, tx_hash, log_index)`; cache tables named with `status_cache`; hash-only token columns. Documented schema addition: `invitations.revoked_at` (backs the approved rotation/revocation protections; the doc table listed only `used_at`).
- **Alembic**: URL from validated settings (no credentials in alembic.ini); initial migration `34260d5be01a` ("initial documented schema") creating all 15 tables; downgrade hand-adjusted to drop tables in FK-safe dependency order (MySQL refuses to drop an index that backs a foreign key — found by the round-trip test).
- **Endpoints**: `GET /api/v1/health` (process facts only) and `GET /api/v1/readiness` (real checks, 503 when not ready, no secret/SQL/traceback leakage).
- **Canonical hashing**: closed-schema terms model (floats, negatives, extra fields, duplicate tenants, wrong thresholds all rejected), deterministic JSON (sorted keys, compact, UTF-8, lowercase addresses), Keccak-256. **Golden vector cross-verified: the Python canonical text and hash `0x14a430dc…5446` are byte-identical to an independent viem (frontend toolchain) implementation.** Reason hashing: NFC + CRLF→LF + outer trim, empty rejected, keccak≠sha3-256 asserted.

### Local database state

`shared_deposit` created on WAMP MySQL **9.1.0** (utf8mb4/utf8mb4_unicode_ci), migrated to head `34260d5be01a`, 15 tables + alembic_version, **zero rows in every table** (no seeds). Setup command verified repeat-safe and check-only.

### Validation (all commands actually run)

- `ruff check` clean; `ruff format --check` clean (39 files); `mypy` strict: no issues in 28 source files
- `pytest`: **86 passed, 0 failed** against real MySQL (canonical terms 24, config 16, database setup 3, migrations 8, models/constraints 20, readiness 7, reason hashing 7, smoke 1 — parametrized cases included)
- Migration round-trip in guarded `shared_deposit_test`: head → base → head → head, all 15 tables verified with indexes, FKs, unique constraints; DECIMAL(65,0) exact round-trip at 10^60+7 and 2^128−1; negative wei and overlong addresses rejected under strict mode; duplicate event identity rejected, different log_index accepted
- Test-database guard: destructive operations require a `*_test` name; `shared_deposit` is never dropped or truncated by tests

### CI MySQL choice

`mysql:8.4` official image — current LTS tag; schema requires only 8.0+ features (utf8mb4, DATETIME(6), JSON, DECIMAL(65,0)); local server is 9.1, CI on LTS keeps the matrix honest without chasing innovation releases. CI-only root password lives in workflow env (never blank, no repository secrets needed); CI migrates `shared_deposit_ci`, verifies `alembic current` is at head, then runs the full suite with `shared_deposit_ci_test` as the guarded test database.

### Explicitly not done in Phase 4

No auth endpoints, invitations, evidence upload, agreement/claim APIs, RPC access, event worker, frontend flows, deployment, private keys, or demo data. Monad RPC was never contacted.

### Next phase

Phase 5 — evidence storage and event indexing (per docs/03), pending explicit approval.
