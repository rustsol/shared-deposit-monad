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
