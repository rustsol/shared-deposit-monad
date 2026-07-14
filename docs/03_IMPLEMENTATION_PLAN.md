# Shared Deposit — Implementation Plan

## 1. Implementation principles

1. Build a new repository and preserve its natural history.
2. Implement the contract and its accounting tests before building polished UI.
3. Use real contract calls from the first integration phase.
4. Treat MySQL as private metadata and cache, never financial authority.
5. Do not add features from the out-of-scope list until all acceptance criteria pass.
6. Commit only coherent, tested milestones; do not rewrite, squash, backdate, or fabricate history.
7. Push after each milestone so the public repository demonstrates continuous development.
8. Never put a private key into the application repository.

## 2. Local environment model

### 2.1 What WAMP provides

WAMP supplies MySQL on the Windows machine. Apache is optional during development. The Python API runs with Uvicorn, and the frontend runs with Vite.

Default local services:

| Service | Address |
|---|---|
| WAMP MySQL | `127.0.0.1:3306` |
| FastAPI | `http://127.0.0.1:8000` |
| Vite frontend | `http://localhost:5173` |
| Local Hardhat node, when used | `http://127.0.0.1:8545` |

### 2.2 MySQL local credentials

- username: `root`
- password: empty
- database: `shared_deposit`

Create database:

```sql
CREATE DATABASE IF NOT EXISTS shared_deposit
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Database URL:

```text
mysql+pymysql://root:@127.0.0.1:3306/shared_deposit?charset=utf8mb4
```

Do not change the WAMP root password automatically. The blank password is local-development configuration only and must not be reused on the hosted server.

## 3. Tool preflight

Claude Code must inspect and record actual versions before creating files:

```text
git --version
gh --version
gh auth status
node --version
npm --version
python --version
mysql --version
```

It must also test:

- WAMP MySQL connection with root and blank password;
- port availability for 5173, 8000, and 8545;
- ability to create a public GitHub repository;
- that the working directory does not contain an older Shared Deposit codebase.

If a tool is missing, document the exact missing tool and continue with all independent work. Do not replace a missing tool with fake output.

## 4. GitHub repository creation

Repository:

```text
shared-deposit-monad
```

The local project directory is `E:\wamp64\www\Hackathon\shared-deposit-monad`. The repository is public and licensed under MIT.

Creation sequence:

1. create the new project directory `E:\wamp64\www\Hackathon\shared-deposit-monad`;
2. run `gh auth status`, report the authenticated GitHub username, and wait for the owner to confirm the account is correct before any repository creation;
3. initialize Git with `main` as default branch;
4. make the initial commit containing only the seven canonical documents in `docs/`, the root README, the MIT `LICENSE`, `.gitignore`, `.editorconfig`, and empty environment examples where appropriate — do not copy the combined DOCX, combined master blueprint, pack manifest, or duplicate prompt files;
5. use GitHub CLI to create a public repository from the local directory;
6. set `origin` and push;
7. record the repository URL in `docs/BUILD_LOG.md`.

Command pattern:

```powershell
git init -b main
git add .
git commit -m "docs: define Shared Deposit MVP and architecture"
gh repo create shared-deposit-monad --public --source . --remote origin --push
```

If the repository name already exists under the authenticated account, do not overwrite it. Report the conflict and stop. Do not automatically use an alternative name.

## 5. Commit and versioning policy

### 5.1 Commit requirements

Every commit must:

- have a specific message;
- represent one coherent milestone;
- include tests or documentation for its behavior;
- leave the repository buildable or clearly mark a scaffolding-only commit;
- be pushed to GitHub after local validation.

Do not use messages such as:

- `update`;
- `changes`;
- `final`;
- `final final v2`;
- `fix stuff`;
- `working now`.

### 5.2 Suggested milestone commits

1. `docs: define Shared Deposit MVP and architecture`
2. `chore: scaffold contract backend and frontend workspaces`
3. `feat(contract): implement agreement creation acceptance and funding`
4. `test(contract): cover funding lifecycle and cancellation`
5. `feat(contract): implement claims voting and settlement`
6. `test(contract): add accounting invariants and withdrawal security`
7. `feat(api): add MySQL schema wallet auth and canonical terms`
8. `feat(api): add evidence manifests and chain event indexer`
9. `feat(web): add wallet connection and agreement creation flow`
10. `feat(web): add funding claims voting and settlement screens`
11. `test: add integrated local escrow lifecycle`
12. `fix: resolve end-to-end and accessibility findings`
13. `docs: add Monad testnet deployment and verified contract`
14. `chore: prepare hosted demo and hackathon submission`

Actual commit messages may differ if they accurately describe the work. Do not create empty commits merely to match the list.

### 5.3 Tags

Create tags only after verified milestones:

- `v0.1.0-contract-local`
- `v0.2.0-full-local`
- `v0.3.0-monad-testnet`
- `v1.0.0-spark-submission`

## 6. Phase-by-phase implementation

## Phase 0 — Documentation and preflight

### Work

- create repository;
- copy only the seven canonical documents into `docs/`; exclude the combined DOCX, combined master blueprint, pack manifest, and duplicate prompt files;
- add the MIT `LICENSE`;
- create `BUILD_LOG.md` with current UTC time, tool versions, and repo URL;
- create root `.gitignore` covering Python, Node, Hardhat, environment files, evidence files, IDE files, and deployment secrets;
- create `.env.example` files with blank sensitive values.

### Validation

- repository is public;
- first commit timestamp is after hackathon announcement;
- no secret or old code is present;
- README explains that financial logic is not yet implemented.

### Commit

`docs: define Shared Deposit MVP and architecture`

## Phase 1 — Workspace scaffolding

### Work

- root npm workspace or root scripts;
- Hardhat TypeScript project under `contracts/`;
- FastAPI Python project under `backend/`;
- React/Vite TypeScript project under `frontend/`;
- CI skeleton;
- PowerShell helper scripts;
- formatting and lint configuration.

### Contract compiler settings

Use the Solidity/compiler settings resolved by the official Monad Hardhat guide at build time. Set:

```text
evmVersion = prague
optimizer enabled = true
optimizer runs = 200
metadata bytecodeHash = ipfs
```

Pin resolved dependency versions in lockfiles. Do not invent a version number in documentation before the package manager resolves it.

### Python standards

- target Python 3.11 or later, after detecting installed version;
- type annotations for application code;
- Ruff for lint/format;
- Pytest;
- SQLAlchemy 2 style;
- Alembic;
- PyMySQL;
- web3.py;
- `pydantic-settings`.

### Frontend standards

- React and TypeScript strict mode;
- Vite;
- Wagmi and Viem;
- React Router;
- TanStack Query;
- React Hook Form and a schema validator;
- Vitest and React Testing Library;
- Playwright for end-to-end tests.

### Validation

- `npm install` completes in contract and frontend workspaces;
- Python virtual environment installs backend dependencies;
- empty builds and linters run;
- CI parses.

### Commit

`chore: scaffold contract backend and frontend workspaces`

## Phase 2 — Contract funding lifecycle

### Work

Implement:

- enums, structs, mappings, events, custom errors;
- agreement creation;
- tenant and recipient acceptance;
- partial deposits;
- pre-activation funding withdrawal;
- readiness check and automatic activation;
- expired funding cancellation;
- cancelled funding withdrawal;
- view functions;
- direct transfer rejection.

### Tests

- valid 2, 3, and 8 tenant agreements;
- invalid counts;
- duplicate tenant;
- recipient tenant conflict;
- caller not a tenant;
- invalid timelines;
- zero amount;
- terms mismatch;
- wrong role acceptance;
- partial funding;
- overfund attempt;
- activation only after all requirements;
- cancellation timing;
- refund exactly equals deposited amount;
- historical `fundedAmount` and `totalFunded` preserved after cancelled-funding withdrawal;
- `totalCancelledFundingWithdrawn` accounting and `sum(cancelled withdrawals) <= totalFunded`;
- reentrancy and repeat withdrawal.

### Validation gate

Contract coverage should cover every branch of the funding lifecycle. Do not proceed to claims while any accounting test fails.

### Commits

- `feat(contract): implement agreement creation acceptance and funding`
- `test(contract): cover funding lifecycle and cancellation`

## Phase 3 — Claims, voting, settlement

### Work

Implement:

- claim submission and reservation accounting;
- shared and individual claim rules;
- claim withdrawal;
- one-vote-per-tenant;
- immediate approval/rejection thresholds;
- post-deadline pending claim finalization;
- final settlement calculation;
- recipient and tenant pull withdrawals.

### Required property tests

Generate varied tenant contributions and claim mixes. Verify:

```text
sum(refunds) + recipient payout = total funded
```

Also verify every refund and payout is nonnegative and no individual deduction exceeds that tenant's funding.

The shared-deduction allocation must be tested against the exact largest-remainder algorithm:

- base allocations computed with `Math.mulDiv`;
- fractional remainders computed with `mulmod` or an equivalent overflow-safe calculation;
- remaining wei assigned one at a time to the highest fractional remainder, capped at each tenant's remaining balance, ties resolved by original tenant index;
- `sharedPart[i] <= remaining[i]` for every tenant;
- `sum(sharedPart) == sharedApprovedClaims`;
- no underflow and no rounding dust at wei-level boundary cases, including shared totals within a few wei of the total remaining balance.

### Security tests

- malicious refund receiver;
- malicious recipient receiver;
- repeated withdrawal;
- claim reservation release after withdrawal/rejection;
- claim submission at exact date boundaries;
- voting at exact deadline boundary;
- finalization before and after deadline;
- forced native balance does not increase entitlements.

### Commits

- `feat(contract): implement claims voting and settlement`
- `test(contract): add accounting invariants and withdrawal security`

### Tag

`v0.1.0-contract-local`

## Phase 4 — Backend foundation and MySQL

### Work

- typed configuration with startup failure on missing required values;
- SQLAlchemy engine and session management;
- Alembic initial migration;
- wallet profiles;
- auth nonces and sessions;
- wallet signature verification;
- canonical terms and reason hashing;
- agreement draft endpoints;
- health endpoint;
- request IDs and structured logs.

### Local database steps

```powershell
mysql -u root -e "CREATE DATABASE IF NOT EXISTS shared_deposit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell execution policy blocks activation, use the virtual environment's Python executable directly rather than changing machine-wide policy automatically.

### Tests

- canonical golden vectors;
- database migration up/down on a disposable database;
- nonce replay and expiry;
- signature mismatch;
- session cookie;
- draft authorization;
- amount and date validation;
- no float conversions.

### Commit

`feat(api): add MySQL schema wallet auth and canonical terms`

## Phase 5 — Evidence storage and event indexing

### Work

- immutable evidence upload;
- MIME and magic-byte checks;
- SHA-256 content paths;
- manifest canonicalization;
- participant-only evidence retrieval;
- contract ABI loader;
- finalized block worker;
- idempotent event storage;
- agreement and claim cache reconciliation;
- transaction finality endpoint.

### Evidence storage layout

```text
backend/storage/evidence/
  ab/
    cdef...full-sha256
```

The first two hash characters are directory sharding. An existing file with the same hash is reused only after verifying size and hash; it is never overwritten.

### Tests

- valid PNG/JPEG/PDF;
- extension/MIME mismatch;
- executable upload rejection;
- too many files;
- too large;
- deterministic manifest;
- unauthorized download;
- event duplicate reprocessing;
- finalized checkpoint rollback on failure;
- RPC timeout.

### Commit

`feat(api): add evidence manifests and chain event indexer`

## Phase 6 — Frontend agreement creation and funding

### Work

- wallet connection;
- Monad chain configuration and switch prompt;
- signed-message login;
- dashboard;
- creation wizard;
- canonical terms review;
- browser/backend hash comparison;
- contract simulation and write;
- transaction lifecycle component;
- invitation review;
- tenant/recipient acceptance;
- deposit and pre-activation withdrawal;
- funding progress;
- cancellation and cancelled refund.

### Real-data rules

- do not display an agreement until returned by the contract or finalized event index;
- do not generate random funded progress;
- do not show a success state solely because the wallet dialog closed;
- do not catch an RPC error and replace it with sample data;
- show `Unavailable` with a retry action when real data cannot be read.

### Tests

- wrong network;
- wrong wallet invitation;
- hash mismatch;
- insufficient wallet balance error;
- rejected wallet transaction;
- reverted transaction;
- activation after final deposit;
- responsive views.

### Commit

`feat(web): add wallet connection and agreement creation flow`

## Phase 7 — Claims, voting, and settlement UI

### Work

- recipient claim composer;
- evidence uploader and local preview;
- claim transaction;
- claims list;
- evidence verification viewer;
- tenant vote controls;
- threshold visualization;
- pending claim finalization;
- settlement preview using exact onchain algorithm;
- contract finalization transaction;
- refund and payout withdrawals;
- activity timeline.

### Critical validation

The frontend's settlement preview must be compared to contract-calculated stored values after finalization. The contract values win.

### Commit

`feat(web): add funding claims voting and settlement screens`

## Phase 8 — Integrated local lifecycle

### Work

- run local Hardhat node;
- deploy actual contract locally;
- set backend/frontend local contract address;
- create end-to-end fixture wallets only in test configuration;
- execute full lifecycle through browser/API/contract;
- ensure MySQL and worker reflect events;
- capture no fake values.

### Validation commands

Create a root script that runs:

```text
contracts: compile, lint, test
backend: lint, type-check, migration check, pytest
frontend: lint, type-check, unit test, build
end-to-end: local chain lifecycle
```

### Commit

`test: add integrated local escrow lifecycle`

### Tag

`v0.2.0-full-local`

## Phase 9 — UX, security, and README audit

### Work

- mobile and viewport audit;
- keyboard and screen-reader labels;
- contrast audit;
- user-readable custom error mapping;
- privacy warnings;
- legal limitation notice;
- loading, empty, error, and stale-chain states;
- security headers;
- dependency audit;
- README install test from a clean directory;
- remove unused scaffolding and template text.

### Commit

`fix: resolve end-to-end and accessibility findings`

## Phase 10 — Monad Testnet deployment

### Preconditions

- all tests pass;
- deployment wallet has testnet MON;
- `.env` private key is local and ignored;
- chain ID from RPC equals 10143;
- deployer address and balance are printed before deployment;
- user explicitly authorizes testnet deployment if Claude Code requires confirmation for signing.

### Deployment

Use Hardhat Ignition or a deterministic deployment script. Record all output. The official Monad guide requires `evmVersion: "prague"` and provides the testnet RPC and chain ID.

After deployment:

1. verify contract bytecode exists;
2. call view methods;
3. create a minimal smoke-test agreement;
4. verify source on Monad explorers;
5. create deployment JSON with address, tx, block, compiler settings, commit;
6. copy generated ABI into frontend/backend build path;
7. update environment configuration;
8. update README and live contract links.

### Commit

`docs: add Monad testnet deployment and verified contract`

### Tag

`v0.3.0-monad-testnet`

## Phase 11 — Hosted deployment

The server deployment is performed only after local and testnet validation. The repository should contain a deployment guide but no production credentials.

Expected deployment shape:

- static frontend served by Apache or Nginx;
- FastAPI behind reverse proxy;
- MySQL with a dedicated non-root user and strong password;
- evidence storage on persistent disk with backups;
- worker managed by a service manager;
- HTTPS required;
- exact frontend origin configured;
- health checks and logs enabled.

Do not use WAMP's blank-root credentials on the server.

### Commit

`chore: prepare hosted demo and hackathon submission`

## 7. Continuous integration

GitHub Actions must run on push and pull request:

### Contract job

- install Node dependencies from lockfile;
- compile;
- format/lint check;
- test;
- optional gas report.

### Backend job

- install Python from declared supported version;
- install package and dev dependencies;
- run Ruff;
- run type checker;
- run Pytest;
- run Alembic migration against a GitHub Actions MySQL service.

### Frontend job

- install from lockfile;
- lint;
- type-check;
- unit test;
- production build.

CI must not require private keys or a live-chain transaction. Testnet smoke checks can be a manual workflow that reads deployed contract state only.

## 8. Definition of done

### Contract

- complete lifecycle implemented;
- all tests pass;
- accounting invariants pass randomized tests;
- deployed and verified on Monad Testnet;
- ABI generated and committed;
- contract address documented.

### Backend

- clean database migration from zero;
- wallet auth works;
- canonical hashes match frontend;
- evidence immutable and access-controlled;
- finalized event worker current;
- API tests pass;
- no secrets in Git.

### Frontend

- all required pages implemented;
- real wallet writes and reads;
- accurate transaction stages;
- no production placeholders;
- responsive and accessible;
- testnet app usable from a fresh wallet with testnet MON.

### Repository

- public;
- meaningful history;
- README can reproduce setup;
- CI green;
- license and limitations present;
- demo URL, video URL, post URL, contract address, and submission text ready.

## 9. Hackathon submission checklist

- project name;
- one-sentence description;
- problem statement;
- solution statement;
- hosted URL;
- public GitHub URL;
- category: Monad Testnet unless mainnet is actually deployed;
- verified contract address;
- public video under three minutes;
- public social post URL for viral prize;
- README updated at submission commit;
- release tag `v1.0.0-spark-submission`;
- deployed app displays the same commit SHA as the release tag.

## 10. Proposed submission copy

### Name

Shared Deposit

### Description

A wallet-based rental deposit escrow where tenants fund their shares, a deposit recipient submits evidence-backed deductions, tenants vote, and Monad settles the approved deductions and refunds transparently.

### Problem

Shared rental deposits are often held by one person and tracked through messages or spreadsheets. Roommates cannot easily prove contributions, review deductions, or ensure the final refund follows agreed rules.

### Solution

Shared Deposit locks each tenant's contribution in a Monad smart contract. Every participant accepts the same terms hash. At lease end, the deposit recipient submits evidence-backed claims, tenants vote under a strict-majority rule, and the contract calculates and releases the exact settlement.

