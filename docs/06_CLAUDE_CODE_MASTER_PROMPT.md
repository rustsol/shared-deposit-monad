# Claude Code Master Prompt — Build Shared Deposit on Monad

Copy the entire prompt below into Claude Code from the empty parent directory where the new repository should be created.

---

You are the lead engineer responsible for building **Shared Deposit**, a new solo project for the Spark hackathon. Work directly on my local Windows development machine. WAMP is installed and provides MySQL. I am already logged into GitHub in VS Code; verify GitHub CLI authentication before repository creation.

## Non-negotiable objective

Build a complete, working, hosted-ready MVP with:

- Solidity smart contract deployed to Monad Testnet;
- Python FastAPI backend;
- MySQL database using local WAMP;
- React + TypeScript frontend;
- real wallet transactions and real contract state;
- no fake success paths, fake production records, placeholder financial values, or simulated onchain results;
- a public GitHub repository with natural, meaningful commit history maintained throughout development;
- complete tests, documentation, deployment records, and hackathon submission materials.

The core product is a voluntary security-deposit escrow for 2 to 8 tenant wallets and one separate deposit-recipient wallet. All participants accept the same immutable terms hash. Tenants fund their shares in native MON. After the lease end, the recipient submits evidence-backed shared or individual claims. Tenants vote. Strict-majority-approved deductions go to the recipient; the remainder is calculated and withdrawn by tenants.

## Critical product alignment

Do not reinterpret the product into a roommate expense splitter, generic multisig, crowdfunding app, property marketplace, or legal registry.

The following decisions are fixed:

1. The deposit-recipient wallet is required, but no profile registration, KYC, property ownership validation, or government property registration is included.
2. The recipient must accept the same terms hash onchain before activation.
3. The recipient wallet must be different from every tenant wallet in the MVP.
4. The creator must be one of the tenant wallets and has no special financial power after creation.
5. Native MON is the only escrow asset in the MVP. Do not deploy or display a mock stablecoin in the submitted app.
6. The smart contract is the financial and settlement source of truth.
7. MySQL stores private metadata, evidence metadata, authentication, event copies, and caches only.
8. No backend private key or relayer signs user financial actions.
9. No owner, admin rescue withdrawal, platform fee, upgradeable proxy, or admin settlement override is allowed in the contract.
10. Full property address, names, reason text, receipts, and photos remain offchain. Only deterministic hashes are onchain.
11. Strict majority means `floor(tenantCount / 2) + 1` YES votes.
12. Votes are immutable in the MVP.
13. Pending claims that do not reach the YES threshold by the settlement deadline are rejected.
14. Funds are distributed using pull withdrawals after finalization.
15. The application must never show success before a real receipt and expected contract state/event exist.

## First action: preflight, do not code blindly

Before creating or changing files:

1. Print current local and UTC date/time.
2. Confirm the current directory and list its contents.
3. Verify this is not an existing Shared Deposit implementation and do not copy code from any older repository.
4. Run and record:

```text
git --version
gh --version
gh auth status
node --version
npm --version
python --version
mysql --version
```

5. Test the local MySQL connection using:

```text
host: 127.0.0.1
port: 3306
username: root
password: empty
```

6. Check ports 5173, 8000, and 8545.
7. Create `docs/BUILD_LOG.md` and record the real results. Do not fabricate unavailable versions or successful checks.

If `gh` is missing or not authenticated, continue creating and testing the local repository, clearly record the blocker, and give the exact command I need to run. Do not pretend a remote repository was created.

## Repository creation and hackathon history

Create a new directory and repository named:

```text
shared-deposit-monad
```

Create the project at `E:\wamp64\www\Hackathon\shared-deposit-monad`. Before creating the GitHub repository, run `gh auth status`, report the authenticated GitHub username, and wait for explicit confirmation that the account is correct. If that GitHub repository name already exists under the authenticated account, report it and stop. Do not overwrite or reuse an old codebase and do not automatically use an alternative name.

Initialize Git with `main`. The first commit must contain only the seven canonical documents, the root README, the MIT LICENSE, `.gitignore`, `.editorconfig`, and empty environment examples where appropriate. Do not copy the combined DOCX, combined master blueprint, pack manifest, or duplicate prompt files into the repository. Create the public GitHub repository using the authenticated GitHub CLI and push immediately after account confirmation.

The Spark hackathon checks project age, static placeholder data, and suspicious commits. Therefore:

- do not backdate commits;
- do not amend old pushed commits to conceal history;
- do not squash the entire build into one commit;
- do not create meaningless empty commits;
- do not use vague messages like `update`, `final`, or `fix stuff`;
- commit and push after coherent tested milestones;
- keep `docs/BUILD_LOG.md` updated with work completed, validation commands, results, blockers, deployment addresses, and commit SHA;
- never claim a test passed unless you ran it and saw a passing result.

Suggested commit progression, adjusted only when the actual work differs:

```text
docs: define Shared Deposit MVP and architecture
chore: scaffold contract backend and frontend workspaces
feat(contract): implement agreement creation acceptance and funding
test(contract): cover funding lifecycle and cancellation
feat(contract): implement claims voting and settlement
test(contract): add accounting invariants and withdrawal security
feat(api): add MySQL schema wallet auth and canonical terms
feat(api): add evidence manifests and chain event indexer
feat(web): add wallet connection and agreement creation flow
feat(web): add funding claims voting and settlement screens
test: add integrated local escrow lifecycle
fix: resolve end-to-end and accessibility findings
docs: add Monad testnet deployment and verified contract
chore: prepare hosted demo and hackathon submission
```

Push each milestone after tests pass. Do not deploy mainnet.

## Read and preserve the design documents

Create the following documentation files under `docs/` from the supplied build pack or from the specification in this prompt:

```text
SCOPE.md
TECHNICAL_DESIGN.md
IMPLEMENTATION.md
USER_GUIDE.md
UI_UX.md
BUILD_LOG.md
DEPLOYMENT.md
SUBMISSION_CHECKLIST.md
```

Treat them as the governing specification. When implementation reveals a necessary correction, update the relevant document in the same commit and explain the correction in `BUILD_LOG.md`. Do not silently diverge.

## Required monorepo structure

Create:

```text
shared-deposit-monad/
├─ README.md
├─ LICENSE
├─ .gitignore
├─ .editorconfig
├─ .env.example
├─ package.json
├─ docs/
├─ contracts/
├─ backend/
├─ frontend/
├─ scripts/
└─ .github/workflows/ci.yml
```

Use separate lockfiles where appropriate and commit all lockfiles.

### Contracts workspace

Use Solidity with Hardhat and TypeScript. Follow current official Monad Hardhat guidance. Resolve and pin actual package versions. Configure:

```text
evmVersion: prague
optimizer: enabled
optimizer runs: 200
metadata bytecode hash: ipfs
Monad Testnet chain ID: 10143
Monad Testnet RPC: https://testnet-rpc.monad.xyz
Monad Mainnet chain ID: 143
Monad Mainnet RPC: https://rpc.monad.xyz
```

Mainnet configuration may exist, but no mainnet deployment is permitted without a separate explicit instruction.

Use OpenZeppelin Contracts for `ReentrancyGuard`. Do not add Ownable merely for convenience.

### Backend workspace

Use:

- Python 3.11+ based on installed version;
- FastAPI;
- SQLAlchemy 2;
- Alembic;
- PyMySQL;
- web3.py;
- eth-account;
- pydantic-settings;
- Pytest;
- Ruff;
- a static type checker.

Use a Python virtual environment at `backend/.venv` and do not commit it.

### Frontend workspace

Use:

- React;
- TypeScript strict mode;
- Vite;
- Wagmi;
- Viem;
- TanStack Query;
- React Router;
- React Hook Form plus schema validation;
- Vitest and React Testing Library;
- Playwright.

Do not expose any private key or backend secret in `VITE_` variables.

## Local WAMP MySQL configuration

Create the database if it does not exist:

```sql
CREATE DATABASE IF NOT EXISTS shared_deposit
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Use this local development URL:

```text
mysql+pymysql://root:@127.0.0.1:3306/shared_deposit?charset=utf8mb4
```

Do not alter the WAMP root account or set a password automatically. Do not use root/blank credentials in production documentation except as an explicit local-only warning.

Create Alembic migrations. Do not use `Base.metadata.create_all()` as the production schema-management mechanism. It may be used only in isolated tests if clearly separated.

Use InnoDB, `utf8mb4`, binary/ascii collation for addresses and hashes, and `DECIMAL(65,0)` for all copied wei amounts. Never use FLOAT or DOUBLE for money.

## Smart contract to implement

Create `contracts/contracts/SharedDepositEscrow.sol`.

### Constants

```solidity
MIN_TENANTS = 2
MAX_TENANTS = 8
MAX_CLAIMS = 32
```

### Enums

```solidity
AgreementStatus: NONE, FUNDING, ACTIVE, FINALIZED, CANCELLED
ClaimType: SHARED, INDIVIDUAL
ClaimStatus: NONE, PENDING, APPROVED, REJECTED, WITHDRAWN
```

### Agreement structure

Include at least:

```text
creator
recipient
termsHash
leaseStart
leaseEnd
fundingDeadline
claimDeadline
settlementDeadline
tenantCount
requiredApprovals
claimCount
unresolvedClaimCount
totalRequired
totalFunded
totalCancelledFundingWithdrawn
totalOpenClaimAmount
totalApprovedClaims
sharedApprovedClaims
recipientAccepted
recipientPayoutWithdrawn
status
```

Use safe integer widths only after calculating upper bounds. If narrower integer packing adds risk or complexity, use `uint256` and prioritize correctness. Document the final choice.

### Tenant structure

Include:

```text
requiredAmount
fundedAmount
openIndividualClaimAmount
approvedIndividualClaims
refundAmount
cancelledFundingWithdrawnAmount
index
exists
accepted
cancelledFundingWithdrawn
refundWithdrawn
```

### Claim structure

Include:

```text
liableTenant
reasonHash
evidenceHash
amount
yesVotes
noVotes
claimType
status
```

### Required functions

Implement and test:

```text
createAgreement
acceptAsTenant
acceptAsRecipient
deposit
withdrawFundingBeforeActivation
cancelExpiredFunding
withdrawCancelledFunding
submitClaim
withdrawPendingClaim
voteClaim
finalizePendingClaim
finalizeAgreement
withdrawTenantRefund
withdrawRecipientPayout
getAgreement
getAgreementTenants
getTenant
getClaim
getVote
isAgreementReady
```

### Agreement creation validation

Enforce:

- 2 to 8 tenants;
- arrays have same length;
- nonzero addresses;
- no duplicates;
- creator is a listed tenant;
- recipient is not a tenant;
- every amount > 0;
- nonzero terms hash;
- funding deadline is future;
- timeline is ordered;
- total contribution cannot overflow.

Store the exact tenant order.

### Acceptance and activation

- tenant and recipient acceptance require `expectedTermsHash` to equal stored hash;
- acceptance happens once;
- funding requires prior tenant acceptance;
- partial deposits allowed;
- overfunding forbidden;
- final acceptance/deposit automatically activates only when every tenant and recipient accepted and all contributions are complete.

### Funding cancellation

- before activation, a tenant can withdraw only its own contribution;
- after missed funding deadline, any participant can cancel;
- cancelled tenants withdraw their actual recorded contributions individually;
- recipient receives nothing;
- historical `fundedAmount` and `totalFunded` are never erased or decreased by cancelled-funding withdrawals; record each tenant's withdrawn amount in `cancelledFundingWithdrawnAmount`, track completion with `cancelledFundingWithdrawn`, accumulate `totalCancelledFundingWithdrawn`, and enforce `sum(cancelled withdrawals) <= totalFunded`; the withdrawable amount becomes zero after withdrawal but historical funded data stays queryable.

### Claims

Claims open at lease end and close at claim deadline.

- recipient only;
- amount > 0;
- no more than 32 claim IDs may ever be created for one agreement; a withdrawn claim still consumes its claim ID and counts toward the limit; document this in the contract, UI, Scope Document, and User Guide;
- reason and evidence hashes nonzero;
- shared claim has zero liable tenant;
- individual claim names an existing tenant;
- total approved + open + new <= total funded;
- individual approved + open + new <= liable tenant funded;
- pending claim can be withdrawn only by recipient;
- withdrawal releases reserved amounts.

### Voting

- tenants only;
- one immutable vote per claim;
- before or at settlement deadline;
- strict majority YES approves immediately;
- mathematically blocking NO count rejects immediately;
- after deadline, remaining pending claim approves only if YES threshold reached, otherwise rejects.

### Settlement algorithm

Approved individual claims reduce their named tenant first.

Approved shared claims are allocated proportionally to each tenant's remaining balance after individual deductions, using this deterministic algorithm:

```text
A. Apply approved individual deductions first.
B. remainingBalance[i] = fundedAmount[i] - approvedIndividualDeductions[i]
C. totalRemaining = sum(remainingBalance)
D. baseAllocation[i] = Math.mulDiv(sharedApprovedTotal, remainingBalance[i], totalRemaining)
   (OpenZeppelin Math.mulDiv, floor, overflow-safe)
E. fractional remainder numerator via mulmod(sharedApprovedTotal, remainingBalance[i], totalRemaining)
   or an equivalent overflow-safe calculation
F. unallocatedRemainder = sharedApprovedTotal - sum(baseAllocations)
G. Largest-remainder distribution: give one additional wei at a time to the
   tenant with the highest fractional remainder; a tenant may receive the
   additional wei only while their allocation remains below their remaining
   balance; resolve ties by original tenant index; the tenant count is at most
   eight, so a bounded in-memory comparison is acceptable; no unbounded loop.
```

Document this exact algorithm in the contract comments and test it explicitly.

These invariants are mandatory:

```text
sharedAllocation[i] <= remainingBalance[i]
sum(sharedAllocations) == sharedApprovedTotal
refund[i] = remainingBalance[i] - sharedAllocation[i]
sum(all finalized tenant refunds) + recipient payout == total funded
finalization never underflows and leaves no rounding dust
```

Store refunds at finalization. Use pull withdrawals. Update state before external value transfer. Use `ReentrancyGuard`.

### No privileged fund movement

Do not implement:

- owner;
- fee;
- emergency sweep;
- forced settlement;
- mutable recipient;
- mutable tenant;
- mutable amount;
- upgrade proxy.

Reject direct `receive` and fallback transfers.

### Contract events and custom errors

Create comprehensive events for every state and financial change. Use custom errors. Frontend must map known custom errors to plain language.

### Contract tests

Write comprehensive tests before UI integration:

- all creation validation;
- acceptance permissions and hash mismatch;
- partial and full funding;
- overfunding;
- automatic activation;
- pre-activation withdrawal;
- cancellation and refunds;
- claim boundaries and role checks;
- evidence/reason requirement;
- claim reservation caps and maximum claim count;
- claim withdrawal;
- vote once and threshold math for 2 through 8 tenants;
- finalization timing;
- shared and individual settlement;
- rounding;
- zero-refund tenant;
- recipient and tenant withdrawal exactly once;
- malicious receiving contract and reentrancy;
- direct-transfer rejection;
- randomized property/invariant tests.

Do not continue to production UI until the accounting invariants pass.

## Canonical terms and hashes

Implement a deterministic canonical JSON schema containing:

```text
schemaVersion
chainId
currency
creator
recipient
propertyAlias
leaseStart
leaseEnd
fundingDeadline
claimDeadline
settlementDeadline
tenantContributions in onchain order
approval rule and threshold
individual deduction rule
shared deduction rule
evidenceRequired
```

Normalization:

- UTF-8;
- recursive sorted keys;
- compact JSON separators;
- lowercase normalized addresses;
- Unix timestamps;
- wei as decimal strings;
- no floats;
- exact tenant order;
- Keccak-256 of canonical UTF-8 JSON.

Implement the same algorithm in Python and TypeScript. Add shared golden-vector tests. The frontend must compare its hash with the backend hash before enabling creation.

Normalize reason text using Unicode NFC, LF newlines, trim outer whitespace, then Keccak-256.

## Evidence system

Claims require 1 to 5 files. Allow PNG, JPEG, and PDF only. Make limits configurable; default total limit 10 MiB.

For every file:

- validate extension;
- validate MIME;
- validate magic bytes;
- reject SVG, HTML, scripts, executables, and polyglot types when detected;
- compute SHA-256;
- store using hash-derived directories;
- never overwrite an existing hash path;
- verify an existing same-hash file before reuse.

Create a canonical evidence manifest with file SHA-256, byte size, MIME type, and safe original filename. Sort files by SHA-256, serialize canonically, and Keccak-256 the manifest. Put only this manifest hash onchain.

Evidence download requires an authenticated wallet that is a participant in the agreement. Add client-side file hash verification and label it accurately as `File hash verified`, not `Claim verified`.

## Wallet authentication

Implement passwordless wallet-signature auth:

1. request nonce;
2. backend returns exact message with domain, URI, address, chain ID, nonce, issued/expiry times;
3. wallet signs personal message;
4. backend recovers address;
5. nonce is one-time and expires in 10 minutes;
6. issue a random opaque session token;
7. store only token hash;
8. set HttpOnly SameSite cookie;
9. Secure cookie in hosted environment;
10. implement logout/revocation.

Add CSRF protection for cookie-authenticated mutation endpoints. Rate limit auth and upload endpoints. Do not log raw sessions, secrets, or private data.

## Backend API

Implement versioned `/api/v1` endpoints for:

- health and public chain config;
- auth nonce, verify, logout, current session;
- agreement drafts;
- canonical hash comparison;
- creation transaction attachment and reconciliation;
- agreement listing and detail;
- invitations and invitation review;
- evidence upload and authorized retrieval;
- claim drafts and transaction attachment;
- transaction status/finality;
- agreement refresh.

Use a consistent error envelope with machine code, human message, details, and request ID.

The backend must verify roles against direct contract state for sensitive operations. Do not trust only cached MySQL membership.

Invitation tokens require all of: at least 256 bits of cryptographically secure randomness; hash-only storage; short expiration; one-time acceptance semantics; rotation and revocation support; no raw token or invitation URL in any log; invitation-route redaction in application and reverse-proxy access logs; `Referrer-Policy: no-referrer` on invitation pages; no third-party analytics, fonts, scripts, or images on invitation pages; HTTPS in hosted environments; no token exposure in API errors.

## Database tables

Create Alembic-managed tables for:

```text
wallet_profiles
auth_nonces
auth_sessions
agreement_drafts
agreement_draft_tenants
agreement_index
agreement_metadata
invitations
evidence_manifests
evidence_files
claim_drafts
claim_index
chain_events
chain_sync_state
audit_log
```

Use composite chain/contract/agreement identifiers. The contract address must always be included in indexed keys so a future redeployment cannot collide with old IDs.

Use foreign keys and unique constraints. Store addresses and hashes using binary/ascii collation. Store timestamps in UTC. Store wei as DECIMAL integers or decimal strings in JSON.

## Finalized chain event worker

Create a separate Python worker command. It must:

- use the configured RPC and generated ABI;
- read the latest finalized block;
- fetch logs from the last checkpoint in bounded chunks;
- default to 100-block chunks because public Monad RPC block ranges are limited;
- decode all contract events;
- store unique `(chain, contract, txHash, logIndex)` records;
- update agreement and claim cache idempotently;
- advance checkpoint only after successful DB commit;
- retry RPC errors with bounded exponential backoff;
- report stale sync in the health endpoint.

Do not index speculative latest blocks into canonical event tables.

## Frontend behavior

### Required pages

- landing;
- wallet login;
- dashboard;
- create agreement wizard;
- invitation review;
- agreement overview;
- participants/funding;
- claims list and detail;
- recipient claim composer;
- settlement;
- activity and terms proof;
- network/configuration error.

### Real chain behavior

Use Viem/Wagmi. Read core state directly from the contract. Backend cache is supplementary. All writes are wallet-signed.

Transaction UI states:

```text
waiting for wallet
broadcast
mined success or reverted
finalized
```

For each write:

- simulate when possible;
- display exact contract, chain, amount, and effect;
- preserve transaction hash;
- wait for receipt;
- verify expected event or state;
- compare receipt block with finalized height;
- provide explorer link;
- decode custom errors.

Never set application state to success because a button was clicked or the wallet returned a hash alone.

### Amount safety

- user input stays a decimal string;
- use `parseEther` and bigint;
- reject scientific notation and >18 decimals;
- never convert wei to JavaScript Number;
- format with `formatEther`;
- show exact remaining amount from contract.

### Design

Use a clean light interface with restrained Monad purple. The app must fit common desktop and mobile viewports, have a unique rental/escrow identity, and avoid generic AI-dashboard styling.

Use clear direct copy. Do not claim legal certainty, objective damage verification, or guaranteed fairness.

### Accessibility

- semantic headings;
- explicit labels;
- keyboard operation;
- visible focus;
- status text plus icons;
- ARIA live region for transaction stages;
- WCAG AA contrast;
- reduced-motion support;
- responsive layouts with no horizontal page overflow.

## No fake data policy

The following is prohibited in the hosted or production code path:

- hardcoded agreement cards;
- mock funded amounts;
- random claims;
- a success toast without receipt verification;
- fallback sample data after an RPC/API failure;
- placeholder contract address treated as deployed;
- fake explorer links;
- fake user balances;
- fake evidence hashes;
- seed data automatically inserted in production;
- hidden demo switches that bypass contract writes.

Tests may use local deterministic accounts and fixtures. Keep all test-only code isolated and unavailable in production builds.

If an external dependency or credential is missing, show a real configuration error and document it. Do not silently mock the feature.

## Local development commands and scripts

Create Windows PowerShell scripts:

```text
scripts/setup-local.ps1
scripts/run-dev.ps1
scripts/test-all.ps1
scripts/verify-env.ps1
```

`setup-local.ps1` should:

- verify WAMP MySQL;
- create the database if absent;
- create Python venv;
- install backend dependencies;
- install npm dependencies;
- run Alembic migrations;
- copy example env files only when destination is absent;
- never overwrite secrets.

`run-dev.ps1` should explain or start separate terminals for:

- optional local Hardhat node;
- FastAPI;
- event worker;
- Vite.

Do not require Apache for development. WAMP provides MySQL. Document optional static frontend hosting through Apache later.

## Testing and quality gates

Create a root test command that runs:

1. contract compile/lint/test;
2. backend lint/type-check/pytest;
3. Alembic migration test against MySQL;
4. frontend lint/type-check/unit test/build;
5. local end-to-end lifecycle against the actual contract.

Add GitHub Actions with separate contract, backend, and frontend jobs. Use a MySQL service for backend CI. CI must not need a private key.

Before each milestone commit:

- show `git diff --stat`;
- run relevant tests;
- record results in `BUILD_LOG.md`;
- check `git status`;
- commit with a meaningful message;
- push;
- report commit SHA.

Do not commit failing code as a completed feature.

## Monad Testnet deployment

Do not deploy until all local tests pass.

Before deployment:

- validate RPC chain ID is 10143;
- print deployer address and testnet MON balance without printing private key;
- ensure `.env` is ignored;
- use the real compiled contract;
- record compiler, optimizer, EVM settings, deployment transaction, block, address, deployer, UTC time, and Git commit.

Use the official Monad Hardhat deployment and verification configuration. Deploy only to Monad Testnet. Verify source on Monad explorers and manually inspect explorer pages if verification command output is ambiguous.

After deployment:

- confirm nonempty bytecode;
- call view functions;
- create a real small smoke-test agreement;
- save deployment JSON under `contracts/deployments/10143/`;
- generate/copy ABI from build artifacts;
- update backend/frontend environment examples;
- update README with contract and explorer links;
- commit and push deployment records without secrets.

Do not deploy a new address casually after the public demo is configured. If redeployment is necessary, document why and keep old deployment records.

## Hosted server preparation

Do not perform server deployment until local and testnet work is complete. Prepare documentation for:

- static frontend behind HTTPS;
- FastAPI reverse proxy;
- dedicated MySQL user with strong password;
- Alembic migration command;
- persistent evidence storage;
- worker service;
- CORS origin;
- secure cookie;
- health endpoint;
- backups and logs.

Never recommend root with blank password on the server.

## README and public judge experience

README must let a judge understand and run the project in under three minutes. Include:

- problem;
- solution;
- architecture;
- onchain/offchain boundary;
- live URL;
- public repo;
- contract address and explorer;
- exact local setup;
- WAMP MySQL steps;
- test commands;
- security model;
- legal limitations;
- no-fake-data statement;
- demo video and social post links when available;
- deployment commit SHA.

The deployed app must show its build commit SHA in a subtle footer/about panel.

## Required final report after each working session

At the end of each session, provide:

```text
A. Current branch and HEAD SHA
B. Files changed
C. Features completed
D. Tests and exact results
E. Contract deployment state
F. Database migration state
G. GitHub push state and repository URL
H. Known issues or blockers
I. Next implementation phase
J. Confirmation that no secrets or fake production data were added
```

Do not say work is complete unless the definition of done is actually met.

## Final definition of done

The project is complete only when:

- public GitHub repo exists with meaningful history;
- CI is green;
- contract accounting invariants pass;
- clean MySQL migration works;
- wallet auth works;
- evidence hashes are deterministic and files immutable;
- local end-to-end lifecycle passes;
- contract is deployed and source-verified on Monad Testnet;
- hosted app uses the deployed contract and real data;
- create, accept, fund, claim, vote, finalize, and withdraw all work with real transactions;
- no fake production data or success path exists;
- README and submission fields are complete;
- demo video is under three minutes;
- submission release tag points to the deployed commit.

Begin with preflight and repository creation. Work phase by phase. Do not skip contract accounting tests. Do not ask me to choose implementation details already fixed above. Ask only when a secret, wallet signature, testnet funding, or irreversible external action genuinely requires my input.

---

