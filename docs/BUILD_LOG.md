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
