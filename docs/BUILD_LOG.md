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
