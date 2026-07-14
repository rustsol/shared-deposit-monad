# Shared Deposit — Technical Design Document

## 1. System architecture

```text
Browser / wallet
  |
  | HTTPS REST + wallet-signed contract transactions
  v
React + TypeScript frontend
  |                         Monad Testnet
  | REST                    chain 10143
  v                              ^
FastAPI backend                  | JSON-RPC / logs
  |                              |
  +---- MySQL (WAMP local)       |
  +---- immutable evidence store |
  +---- finalized-block worker --+

Financial source of truth: SharedDepositEscrow smart contract
Private metadata source of truth: MySQL and immutable evidence files
```

### 1.1 Technology choices

| Layer | Technology | Purpose |
|---|---|---|
| Smart contract | Solidity, Hardhat, OpenZeppelin | Agreement, custody, voting, settlement, withdrawals |
| Chain client in browser | Viem + Wagmi | Wallet connection, chain switching, contract reads/writes |
| Frontend | React, TypeScript, Vite | Responsive application UI |
| Backend | Python, FastAPI, Pydantic | Auth, private metadata, canonicalization, evidence, API |
| ORM | SQLAlchemy 2 | MySQL access and transactional persistence |
| Migrations | Alembic | Versioned schema changes |
| Chain worker | Python + web3.py | Finalized event indexing and cache reconciliation |
| Local database | WAMP MySQL | Development database on `127.0.0.1:3306` |
| Testing | Hardhat tests, Pytest, Vitest, Playwright | Contract, API, component, and end-to-end tests |
| CI | GitHub Actions | Public reproducible build and test history |

### 1.2 Network configuration

The default hackathon deployment is Monad Testnet:

| Setting | Value |
|---|---|
| Network name | Monad Testnet |
| Chain ID | `10143` |
| Native currency | `MON` |
| Public RPC | `https://testnet-rpc.monad.xyz` |
| Explorer | `https://testnet.monadscan.com` |
| Alternate explorer | `https://testnet.monadvision.com` |

All values must be environment-configurable. The frontend must reject a contract address whose deployed bytecode is empty on the configured chain.

The backend event worker indexes only through the RPC's `finalized` block. The frontend may show a mined transaction immediately, but financial state is labelled final only when the receipt block is at or below the finalized height.

## 2. Repository structure

```text
shared-deposit-monad/
├─ README.md
├─ LICENSE
├─ .gitignore
├─ .editorconfig
├─ .env.example
├─ package.json
├─ docs/
│  ├─ SCOPE.md
│  ├─ TECHNICAL_DESIGN.md
│  ├─ IMPLEMENTATION.md
│  ├─ USER_GUIDE.md
│  ├─ UI_UX.md
│  ├─ BUILD_LOG.md
│  ├─ DEPLOYMENT.md
│  └─ SUBMISSION_CHECKLIST.md
├─ contracts/
│  ├─ package.json
│  ├─ hardhat.config.ts
│  ├─ contracts/
│  │  └─ SharedDepositEscrow.sol
│  ├─ ignition/modules/
│  │  └─ SharedDepositEscrow.ts
│  ├─ scripts/
│  │  └─ inspect-deployment.ts
│  ├─ test/
│  │  ├─ agreement.lifecycle.ts
│  │  ├─ claims.voting.ts
│  │  ├─ settlement.accounting.ts
│  │  ├─ withdrawals.security.ts
│  │  └─ invariants.property.ts
│  └─ deployments/
│     └─ .gitkeep
├─ backend/
│  ├─ pyproject.toml
│  ├─ alembic.ini
│  ├─ .env.example
│  ├─ alembic/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ config.py
│  │  ├─ database.py
│  │  ├─ dependencies.py
│  │  ├─ api/v1/
│  │  ├─ auth/
│  │  ├─ blockchain/
│  │  ├─ canonical/
│  │  ├─ evidence/
│  │  ├─ models/
│  │  ├─ schemas/
│  │  ├─ services/
│  │  └─ worker.py
│  ├─ storage/evidence/.gitkeep
│  └─ tests/
├─ frontend/
│  ├─ package.json
│  ├─ vite.config.ts
│  ├─ .env.example
│  ├─ src/
│  │  ├─ app/
│  │  ├─ components/
│  │  ├─ features/
│  │  ├─ hooks/
│  │  ├─ lib/
│  │  ├─ pages/
│  │  ├─ routes/
│  │  ├─ styles/
│  │  └─ types/
│  └─ tests/
├─ scripts/
│  ├─ setup-local.ps1
│  ├─ run-dev.ps1
│  ├─ test-all.ps1
│  └─ verify-env.ps1
└─ .github/workflows/ci.yml
```

The monorepo is new and created after the hackathon announcement. No code from an earlier application is copied into it. The repository license is MIT. The local project directory is `E:\wamp64\www\Hackathon\shared-deposit-monad`, and `docs/` receives only the seven canonical documents — not the combined blueprint, pack manifest, DOCX, or duplicate prompt files.

## 3. Smart contract specification

### 3.1 Contract name and boundaries

Contract: `SharedDepositEscrow`

The contract manages multiple independent agreements. It accepts native MON only. It has no owner, no fee collector, no upgradeable proxy, and no privileged withdrawal method.

Use OpenZeppelin `ReentrancyGuard` for all external value-withdrawal functions. Apply checks-effects-interactions. Reject direct native transfers through `receive()` and `fallback()`.

### 3.2 Constants

```solidity
uint16 public constant MIN_TENANTS = 2;
uint16 public constant MAX_TENANTS = 8;
uint32 public constant MAX_CLAIMS = 32;
```

No arbitrary fixed monetary minimum is required. Every contribution must be greater than zero.

`MAX_CLAIMS` bounds the number of claim IDs ever created for one agreement. A withdrawn claim still consumes its claim ID and counts toward the limit. This must be documented in the contract comments and surfaced in the UI.

### 3.3 Enums

```solidity
enum AgreementStatus {
    NONE,
    FUNDING,
    ACTIVE,
    FINALIZED,
    CANCELLED
}

enum ClaimType {
    SHARED,
    INDIVIDUAL
}

enum ClaimStatus {
    NONE,
    PENDING,
    APPROVED,
    REJECTED,
    WITHDRAWN
}
```

### 3.4 Agreement storage

```solidity
struct Agreement {
    address creator;
    address recipient;
    bytes32 termsHash;
    uint64 leaseStart;
    uint64 leaseEnd;
    uint64 fundingDeadline;
    uint64 claimDeadline;
    uint64 settlementDeadline;
    uint16 tenantCount;
    uint16 requiredApprovals;
    uint32 claimCount;
    uint32 unresolvedClaimCount;
    uint128 totalRequired;
    uint128 totalFunded;
    uint128 totalCancelledFundingWithdrawn;
    uint128 totalOpenClaimAmount;
    uint128 totalApprovedClaims;
    uint128 sharedApprovedClaims;
    bool recipientAccepted;
    bool recipientPayoutWithdrawn;
    AgreementStatus status;
}
```

Storage mappings:

```solidity
uint256 public nextAgreementId;
mapping(uint256 => Agreement) private agreements;
mapping(uint256 => address[]) private agreementTenants;
mapping(uint256 => mapping(address => Tenant)) private tenants;
mapping(uint256 => mapping(uint256 => Claim)) private claims;
mapping(uint256 => mapping(uint256 => mapping(address => uint8))) private votes;
```

### 3.5 Tenant storage

```solidity
struct Tenant {
    uint128 requiredAmount;
    uint128 fundedAmount;
    uint128 openIndividualClaimAmount;
    uint128 approvedIndividualClaims;
    uint128 refundAmount;
    uint128 cancelledFundingWithdrawnAmount;
    uint16 index;
    bool exists;
    bool accepted;
    bool cancelledFundingWithdrawn;
    bool refundWithdrawn;
}
```

`index` is the position in the agreement tenant array and is used for deterministic settlement and UI ordering.

### 3.6 Claim storage

```solidity
struct Claim {
    address liableTenant;
    bytes32 reasonHash;
    bytes32 evidenceHash;
    uint128 amount;
    uint16 yesVotes;
    uint16 noVotes;
    ClaimType claimType;
    ClaimStatus status;
}
```

A `SHARED` claim must have `liableTenant == address(0)`. An `INDIVIDUAL` claim must identify an existing tenant.

### 3.7 Required custom errors

Use custom errors instead of long revert strings. At minimum:

```solidity
error InvalidAgreement();
error InvalidStatus();
error InvalidAddress();
error InvalidTenantCount();
error DuplicateTenant();
error CreatorMustBeTenant();
error RecipientCannotBeTenant();
error InvalidTimeline();
error InvalidAmount();
error InvalidTermsHash();
error NotTenant();
error NotRecipient();
error AlreadyAccepted();
error FundingDeadlinePassed();
error FundingDeadlineNotPassed();
error TermsMismatch();
error Overfunding();
error AgreementNotReady();
error ClaimWindowClosed();
error ClaimWindowNotOpen();
error MissingEvidence();
error ClaimExceedsAvailableDeposit();
error IndividualClaimExceedsTenantBalance();
error InvalidClaim();
error AlreadyVoted();
error VotingClosed();
error VotingStillOpen();
error UnresolvedClaimsRemain();
error NothingToWithdraw();
error AlreadyWithdrawn();
error TransferFailed();
error DirectTransferNotAllowed();
```

### 3.8 Required events

```solidity
event AgreementCreated(
    uint256 indexed agreementId,
    address indexed creator,
    address indexed recipient,
    bytes32 termsHash,
    uint128 totalRequired
);

event TenantAccepted(uint256 indexed agreementId, address indexed tenant);
event RecipientAccepted(uint256 indexed agreementId, address indexed recipient);
event DepositAdded(uint256 indexed agreementId, address indexed tenant, uint128 amount, uint128 tenantFunded);
event FundingWithdrawn(uint256 indexed agreementId, address indexed tenant, uint128 amount);
event AgreementActivated(uint256 indexed agreementId, uint128 totalFunded);
event FundingCancelled(uint256 indexed agreementId);
event CancelledFundingWithdrawn(uint256 indexed agreementId, address indexed tenant, uint128 amount);

event ClaimSubmitted(
    uint256 indexed agreementId,
    uint256 indexed claimId,
    ClaimType claimType,
    address indexed liableTenant,
    uint128 amount,
    bytes32 reasonHash,
    bytes32 evidenceHash
);

event ClaimVoted(uint256 indexed agreementId, uint256 indexed claimId, address indexed tenant, bool support);
event ClaimApproved(uint256 indexed agreementId, uint256 indexed claimId, uint128 amount);
event ClaimRejected(uint256 indexed agreementId, uint256 indexed claimId, uint128 amount);
event ClaimWithdrawn(uint256 indexed agreementId, uint256 indexed claimId, uint128 amount);

event AgreementFinalized(uint256 indexed agreementId, uint128 recipientPayout, uint128 tenantRefundTotal);
event TenantRefundWithdrawn(uint256 indexed agreementId, address indexed tenant, uint128 amount);
event RecipientPayoutWithdrawn(uint256 indexed agreementId, address indexed recipient, uint128 amount);
```

### 3.9 Contract functions

#### `createAgreement`

```solidity
function createAgreement(
    address recipient,
    bytes32 termsHash,
    uint64 leaseStart,
    uint64 leaseEnd,
    uint64 fundingDeadline,
    uint64 claimDeadline,
    uint64 settlementDeadline,
    address[] calldata tenantAddresses,
    uint128[] calldata requiredAmounts
) external returns (uint256 agreementId);
```

Validations:

- recipient nonzero;
- terms hash nonzero;
- tenant arrays same length;
- tenant count 2 through 8;
- no zero tenant;
- no duplicate tenant;
- recipient not a tenant;
- caller is a tenant;
- every required amount greater than zero;
- total fits `uint128`;
- `fundingDeadline > block.timestamp`;
- `leaseStart <= leaseEnd`;
- `fundingDeadline <= leaseEnd`;
- `leaseEnd < claimDeadline < settlementDeadline`;
- exact values are stored without later edit.

Calculate:

```text
requiredApprovals = floor(tenantCount / 2) + 1
```

Set status to `FUNDING` and increment `nextAgreementId`.

#### `acceptAsTenant`

```solidity
function acceptAsTenant(uint256 agreementId, bytes32 expectedTermsHash) external;
```

- tenant only;
- funding state only;
- before funding deadline;
- expected hash must equal stored hash;
- only once.

After acceptance, call internal readiness check.

#### `acceptAsRecipient`

```solidity
function acceptAsRecipient(uint256 agreementId, bytes32 expectedTermsHash) external;
```

Same rules for the recipient.

#### `deposit`

```solidity
function deposit(uint256 agreementId) external payable;
```

- accepted tenant only;
- funding state only;
- before deadline;
- `msg.value > 0`;
- `fundedAmount + msg.value <= requiredAmount`;
- cast only after upper bound validates.

Update tenant and agreement totals, emit event, then check activation.

#### `withdrawFundingBeforeActivation`

```solidity
function withdrawFundingBeforeActivation(uint256 agreementId, uint128 amount) external nonReentrant;
```

- tenant only;
- funding state only;
- amount nonzero and no greater than tenant funded amount;
- reduce state before transfer;
- transfer only to `msg.sender`.

This may be used even if the tenant previously accepted. The agreement simply remains unready.

#### `cancelExpiredFunding`

```solidity
function cancelExpiredFunding(uint256 agreementId) external;
```

- funding state;
- current time strictly after funding deadline;
- changes status to `CANCELLED`.

#### `withdrawCancelledFunding`

```solidity
function withdrawCancelledFunding(uint256 agreementId) external nonReentrant;
```

- cancelled state;
- tenant funded amount greater than zero;
- one withdrawal per tenant, enforced by the `cancelledFundingWithdrawn` flag;
- historical `fundedAmount` and `totalFunded` are never erased or decreased; they remain queryable accounting records;
- record the withdrawn amount in the tenant's `cancelledFundingWithdrawnAmount` and add it to the agreement's `totalCancelledFundingWithdrawn`;
- the withdrawable cancelled amount becomes zero after withdrawal because the flag blocks repetition;
- set the withdrawal flag and accounting fields before the transfer;
- accounting invariant: `totalCancelledFundingWithdrawn <= totalFunded`.

#### `submitClaim`

```solidity
function submitClaim(
    uint256 agreementId,
    ClaimType claimType,
    address liableTenant,
    uint128 amount,
    bytes32 reasonHash,
    bytes32 evidenceHash
) external returns (uint256 claimId);
```

- recipient only;
- active agreement;
- `block.timestamp >= leaseEnd`;
- `block.timestamp <= claimDeadline`;
- amount greater than zero;
- agreement claim count below `MAX_CLAIMS`;
- hashes nonzero;
- correct liable-tenant rule;
- total approved plus total open plus new amount no greater than total funded;
- individual approved plus individual open plus new amount no greater than liable tenant funded amount.

Update open-claim reservation and unresolved count before emitting.

#### `withdrawPendingClaim`

```solidity
function withdrawPendingClaim(uint256 agreementId, uint256 claimId) external;
```

- recipient only;
- pending only;
- release open reservations;
- mark withdrawn;
- decrement unresolved count.

#### `voteClaim`

```solidity
function voteClaim(uint256 agreementId, uint256 claimId, bool support) external;
```

- tenant only;
- claim pending;
- current time no later than settlement deadline;
- no prior vote;
- store vote as `1` for yes, `2` for no;
- increment count;
- immediately approve if yes reaches required approvals;
- immediately reject if no reaches `tenantCount - requiredApprovals + 1`.

#### `finalizePendingClaim`

```solidity
function finalizePendingClaim(uint256 agreementId, uint256 claimId) external;
```

- after settlement deadline;
- pending only;
- approve if yes votes reached threshold; otherwise reject.

In normal operation a claim with enough YES votes has already approved, so post-deadline pending claims normally reject.

#### `finalizeAgreement`

```solidity
function finalizeAgreement(uint256 agreementId) external;
```

- active state;
- after settlement deadline;
- unresolved count zero;
- calculate every tenant refund and store it;
- set recipient payout as total approved claims;
- status becomes finalized;
- emit exact refund-total and payout values.

Settlement algorithm (deterministic proportional allocation with largest-remainder distribution):

```text
A. individualTotal = sum(approvedIndividualClaims[i])

B. For each tenant:
     remaining[i] = funded[i] - individualApproved[i]

C. totalRemaining = totalFunded - individualTotal
   sharedTotal = sharedApprovedClaims
   require sharedTotal <= totalRemaining

D. For each tenant, compute the base allocation with OpenZeppelin Math.mulDiv:
     base[i] = Math.mulDiv(sharedTotal, remaining[i], totalRemaining)
   (floor division, overflow-safe)

E. For each tenant, compute the fractional remainder numerator using mulmod
   or an equivalent overflow-safe calculation:
     frac[i] = mulmod(sharedTotal, remaining[i], totalRemaining)

F. unallocatedRemainder = sharedTotal - sum(base[i])

G. Distribute the remaining wei with the largest-remainder method:
   - give one additional wei at a time to the tenant with the highest frac[i];
   - a tenant may receive the additional wei only while
     base[i] + extra[i] < remaining[i];
   - resolve equal fractional remainders by original tenant index;
   - the tenant count is at most eight, so the comparison is a bounded
     in-memory pass; no unbounded loop is allowed.

H. sharedPart[i] = base[i] + extra[i]
   refund[i] = remaining[i] - sharedPart[i]
```

Mandatory allocation invariants:

```text
sharedPart[i] <= remaining[i]
sum(sharedPart) == sharedTotal
refund[i] = remaining[i] - sharedPart[i]
sum(refunds) + recipientPayout == totalFunded
```

Finalization must never underflow or leave rounding dust. If `totalRemaining == 0`, `sharedTotal` must also be zero and all refunds are zero. The contract comments must document this exact algorithm.

#### `withdrawTenantRefund`

```solidity
function withdrawTenantRefund(uint256 agreementId) external nonReentrant;
```

- finalized state;
- tenant only;
- not withdrawn;
- positive refund;
- mark withdrawn before transfer.

#### `withdrawRecipientPayout`

```solidity
function withdrawRecipientPayout(uint256 agreementId) external nonReentrant;
```

- finalized state;
- recipient only;
- not withdrawn;
- positive payout;
- mark withdrawn before transfer.

#### View functions

Provide explicit view methods rather than relying on public nested mappings:

```solidity
function getAgreement(uint256 agreementId) external view returns (Agreement memory);
function getAgreementTenants(uint256 agreementId) external view returns (address[] memory);
function getTenant(uint256 agreementId, address tenant) external view returns (Tenant memory);
function getClaim(uint256 agreementId, uint256 claimId) external view returns (Claim memory);
function getVote(uint256 agreementId, uint256 claimId, address tenant) external view returns (uint8);
function isAgreementReady(uint256 agreementId) external view returns (bool);
```

### 3.10 Internal helpers

- `_requireAgreement`;
- `_checkAndActivate`;
- `_allTenantsAcceptedAndFunded`;
- `_approveClaim`;
- `_rejectClaim`;
- `_releaseOpenClaimReservation`;
- `_sendMON`.

### 3.11 Contract accounting invariants

Tests must continuously enforce:

1. `totalApprovedClaims + totalOpenClaimAmount <= totalFunded`.
2. For each tenant: `approvedIndividualClaims + openIndividualClaimAmount <= fundedAmount`.
3. After finalization: `sum(refundAmount) + totalApprovedClaims == totalFunded`.
4. A withdrawal flag can move from false to true only once.
5. Agreement funds can be transferred only to a tenant's own address or the configured recipient.
6. No external account can alter tenant membership, required amounts, deadlines, or terms hash.
7. Contract balance must be at least all outstanding recorded liabilities. Do not use raw balance to calculate entitlements because forced native transfers are possible.
8. In a cancelled agreement: `sum(cancelledFundingWithdrawnAmount) == totalCancelledFundingWithdrawn <= totalFunded`, and historical `fundedAmount`/`totalFunded` values are never decreased.
9. Shared-deduction allocation: `sharedPart[i] <= remaining[i]` for every tenant and `sum(sharedPart) == sharedApprovedClaims`; finalization never underflows or leaves rounding dust.

## 4. Canonicalization and hashing

### 4.1 Terms hash

Use Keccak-256 so frontend Viem and Solidity tooling share the same primitive.

Pseudocode:

```python
canonical_json = json.dumps(
    normalized_terms,
    sort_keys=True,
    separators=(",", ":"),
    ensure_ascii=False,
)
terms_hash = Web3.keccak(text=canonical_json).hex()
```

The frontend performs the equivalent operation and must compare the result with the backend response before enabling contract creation.

### 4.2 Reason hash

Normalize reason text by:

- Unicode NFC normalization;
- trim leading/trailing whitespace;
- convert CRLF to LF;
- preserve internal words and punctuation;
- encode UTF-8;
- Keccak-256.

The readable text is private in MySQL. The hash is public onchain.

### 4.3 Evidence manifest

A claim may include 1 to 5 files. Each file is hashed using SHA-256. Files are stored under a path derived from their hash and are never overwritten.

Canonical manifest example:

```json
{
  "schemaVersion": "1.0",
  "files": [
    {
      "sha256": "...",
      "sizeBytes": 12345,
      "mimeType": "image/png",
      "originalName": "repair-photo.png"
    }
  ]
}
```

Sort manifest files by `sha256`, serialize canonically, then Keccak-256 the manifest JSON. That Keccak value is the onchain `evidenceHash`.

On download, the browser recomputes SHA-256 and shows `Verified` only when it matches the manifest.

## 5. Backend design

### 5.1 FastAPI application modules

| Module | Responsibility |
|---|---|
| `config.py` | Typed environment configuration and startup validation |
| `database.py` | SQLAlchemy engine, session factory, health check |
| `auth/` | Nonce issuance, signature verification, session cookie |
| `canonical/` | Terms and evidence canonicalization |
| `evidence/` | Upload validation, hashing, storage, authenticated download |
| `blockchain/` | ABI loading, RPC client, receipt/finality helpers |
| `services/` | Agreement drafts, invitations, claim drafts, event reconciliation |
| `worker.py` | Finalized-block event indexer |
| `api/v1/` | REST endpoints |

### 5.2 Authentication

Authentication is wallet-signature based and does not require a password.

Flow:

1. Client requests nonce for a checksummed wallet address.
2. Backend creates a cryptographically random nonce, stores only its hash, and sets an expiry.
3. Backend returns a human-readable message containing domain, URI, address, chain ID, nonce, issued time, and expiry.
4. Wallet signs the message using personal-sign semantics.
5. Backend recovers the signer with `eth_account` and compares normalized addresses.
6. Nonce is marked used in the same database transaction.
7. Backend creates a random session token, stores its hash, and sends the raw token in an HttpOnly cookie.

Security rules:

- nonce expires in 10 minutes;
- nonce is one-time;
- session expires according to configuration;
- session cookie uses `Secure` in hosted mode, `SameSite=Lax`, and a narrow path;
- signing message does not request token approval or blockchain transaction;
- rate limit nonce and verify endpoints per IP and wallet.

### 5.3 Database connection

Local WAMP default:

```text
mysql+pymysql://root:@127.0.0.1:3306/shared_deposit?charset=utf8mb4
```

Use SQLAlchemy 2 style and `pool_pre_ping=True`. Use UTC throughout. Run all schema changes with Alembic.

### 5.4 Database schema

#### `wallet_profiles`

| Column | Type | Notes |
|---|---|---|
| `address` | CHAR(42), ascii_bin, PK | lowercase normalized address |
| `display_name` | VARCHAR(80), nullable | private UI label |
| `created_at` | DATETIME(6) | UTC |
| `updated_at` | DATETIME(6) | UTC |

#### `auth_nonces`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT PK | auto increment |
| `wallet_address` | CHAR(42) | indexed |
| `nonce_hash` | CHAR(64) | SHA-256 hex, unique |
| `message` | TEXT | exact message signed |
| `expires_at` | DATETIME(6) | indexed |
| `used_at` | DATETIME(6), nullable | replay protection |
| `created_at` | DATETIME(6) | UTC |

#### `auth_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(36) PK | UUID |
| `wallet_address` | CHAR(42) | indexed |
| `token_hash` | CHAR(64) | SHA-256 hex, unique |
| `expires_at` | DATETIME(6) | indexed |
| `revoked_at` | DATETIME(6), nullable | logout |
| `created_at` | DATETIME(6) | UTC |
| `last_seen_at` | DATETIME(6) | optional rotation/audit |

#### `agreement_drafts`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(36) PK | UUID |
| `creator_address` | CHAR(42) | auth owner |
| `recipient_address` | CHAR(42) | exact wallet |
| `property_alias` | VARCHAR(160) | private label |
| `private_address` | TEXT, nullable | encrypted-at-rest later; plain local MVP with access control warning |
| `terms_json` | JSON | canonical normalized object |
| `terms_hash` | CHAR(66) | unique per draft version |
| `chain_id` | BIGINT | 10143 for submitted build |
| `contract_address` | CHAR(42) | configured escrow address |
| `agreement_id_onchain` | DECIMAL(65,0), nullable | set after event |
| `creation_tx_hash` | CHAR(66), nullable | submitted tx |
| `creation_block_number` | BIGINT UNSIGNED, nullable | finalized event |
| `status` | VARCHAR(32) | DRAFT, TX_SUBMITTED, CONFIRMED, FAILED |
| `created_at` | DATETIME(6) | UTC |
| `updated_at` | DATETIME(6) | UTC |

#### `agreement_draft_tenants`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT PK | auto increment |
| `draft_id` | CHAR(36) FK | cascade delete while draft only |
| `tenant_index` | SMALLINT | deterministic order |
| `wallet_address` | CHAR(42) | unique per draft |
| `display_label` | VARCHAR(80), nullable | private |
| `required_amount_wei` | DECIMAL(65,0) | never float |

#### `agreement_index`

This is an event-derived cache, not authority.

| Column | Type | Notes |
|---|---|---|
| `chain_id` | BIGINT | composite PK |
| `contract_address` | CHAR(42) | composite PK |
| `agreement_id` | DECIMAL(65,0) | composite PK |
| `creator_address` | CHAR(42) | event value |
| `recipient_address` | CHAR(42) | event value |
| `terms_hash` | CHAR(66) | event value |
| `status_cache` | VARCHAR(32) | reconciled from contract |
| `last_synced_block` | BIGINT UNSIGNED | finalized block |
| `created_tx_hash` | CHAR(66) | chain tx |
| `created_at_chain` | DATETIME(6) | block timestamp |
| `updated_at` | DATETIME(6) | database timestamp |

#### `agreement_metadata`

| Column | Type | Notes |
|---|---|---|
| `chain_id` | BIGINT | composite FK |
| `contract_address` | CHAR(42) | composite FK |
| `agreement_id` | DECIMAL(65,0) | composite FK |
| `property_alias` | VARCHAR(160) | private |
| `private_address` | TEXT, nullable | private |
| `terms_json` | JSON | exact accepted object |
| `is_shareable` | BOOLEAN | default false |
| `created_at` | DATETIME(6) | UTC |

#### `invitations`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(36) PK | UUID |
| `agreement_key` | VARCHAR(180) | chain/contract/id encoded |
| `role` | VARCHAR(16) | TENANT or RECIPIENT |
| `wallet_address` | CHAR(42) | expected wallet |
| `token_hash` | CHAR(64) | only hash stored |
| `expires_at` | DATETIME(6) | private link expiry |
| `used_at` | DATETIME(6), nullable | view/join audit, not onchain acceptance |
| `created_by` | CHAR(42) | creator |
| `created_at` | DATETIME(6) | UTC |

#### `evidence_manifests`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(36) PK | UUID |
| `owner_address` | CHAR(42) | recipient who uploaded |
| `manifest_json` | JSON | canonical manifest |
| `manifest_hash` | CHAR(66) | Keccak-256, unique |
| `total_size_bytes` | BIGINT UNSIGNED | validation |
| `created_at` | DATETIME(6) | UTC |

#### `evidence_files`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT PK | auto increment |
| `manifest_id` | CHAR(36) FK | cascade only if unreferenced draft deleted |
| `sha256` | CHAR(64) | content address |
| `original_name` | VARCHAR(255) | sanitized display only |
| `mime_type` | VARCHAR(100) | validated |
| `size_bytes` | BIGINT UNSIGNED | validated |
| `storage_relative_path` | VARCHAR(500) | derived from hash |
| `created_at` | DATETIME(6) | UTC |

#### `claim_drafts`

| Column | Type | Notes |
|---|---|---|
| `id` | CHAR(36) PK | UUID |
| `agreement_key` | VARCHAR(180) | indexed |
| `recipient_address` | CHAR(42) | owner |
| `claim_type` | VARCHAR(16) | SHARED or INDIVIDUAL |
| `liable_tenant` | CHAR(42), nullable | required for individual |
| `amount_wei` | DECIMAL(65,0) | exact |
| `reason_text` | TEXT | private |
| `reason_hash` | CHAR(66) | Keccak |
| `evidence_manifest_id` | CHAR(36) FK | required |
| `evidence_hash` | CHAR(66) | copied for immutable request |
| `tx_hash` | CHAR(66), nullable | user-signed tx |
| `claim_id_onchain` | DECIMAL(65,0), nullable | event result |
| `status` | VARCHAR(32) | DRAFT, TX_SUBMITTED, CONFIRMED, FAILED |
| `created_at` | DATETIME(6) | UTC |
| `updated_at` | DATETIME(6) | UTC |

#### `claim_index`

Event-derived cache only. It mirrors the immutable onchain `Claim` structure and the emitted claim events (`ClaimSubmitted`, `ClaimVoted`, `ClaimApproved`, `ClaimRejected`, `ClaimWithdrawn`) and must never override direct contract state.

| Column | Type | Notes |
|---|---|---|
| `chain_id` | BIGINT | composite PK |
| `contract_address` | CHAR(42) | composite PK |
| `agreement_id` | DECIMAL(65,0) | composite PK |
| `claim_id` | DECIMAL(65,0) | composite PK |
| `claim_type` | VARCHAR(16) | SHARED or INDIVIDUAL, event value |
| `liable_tenant` | CHAR(42), nullable | null for shared claims |
| `amount_wei` | DECIMAL(65,0) | event value, never float |
| `reason_hash` | CHAR(66) | event value |
| `evidence_hash` | CHAR(66) | event value |
| `yes_votes` | SMALLINT UNSIGNED | reconciled from finalized `ClaimVoted` events |
| `no_votes` | SMALLINT UNSIGNED | reconciled from finalized `ClaimVoted` events |
| `status_cache` | VARCHAR(16) | PENDING, APPROVED, REJECTED, WITHDRAWN; reconciled from contract |
| `submitted_tx_hash` | CHAR(66) | `ClaimSubmitted` transaction |
| `submitted_block` | BIGINT UNSIGNED | finalized block number |
| `resolved_tx_hash` | CHAR(66), nullable | approval/rejection/withdrawal transaction |
| `resolved_block` | BIGINT UNSIGNED, nullable | finalized block number |
| `last_synced_block` | BIGINT UNSIGNED | worker checkpoint at last update |
| `created_at` | DATETIME(6) | UTC |
| `updated_at` | DATETIME(6) | UTC |

These exact columns must be reviewed against the final contract build before the Alembic migration is created.

#### `chain_events`

| Column | Type | Notes |
|---|---|---|
| `chain_id` | BIGINT | composite unique |
| `contract_address` | CHAR(42) | composite unique |
| `tx_hash` | CHAR(66) | composite unique |
| `log_index` | INT UNSIGNED | composite unique |
| `block_number` | BIGINT UNSIGNED | indexed |
| `block_hash` | CHAR(66) | finality audit |
| `event_name` | VARCHAR(80) | indexed |
| `agreement_id` | DECIMAL(65,0), nullable | indexed |
| `claim_id` | DECIMAL(65,0), nullable | indexed |
| `payload_json` | JSON | decoded values as strings |
| `block_timestamp` | DATETIME(6) | UTC |
| `created_at` | DATETIME(6) | UTC |

#### `chain_sync_state`

One row per chain and contract, storing the last indexed finalized block and last successful sync time.

#### `audit_log`

Private application actions only: login, draft creation, invitation creation, evidence access, sync repair. Never use this table as a replacement for contract events.

### 5.5 Database indexes and constraints

- binary/ascii collation for addresses and hashes;
- unique `(draft_id, wallet_address)`;
- unique chain event identity `(chain_id, contract_address, tx_hash, log_index)`;
- indexes on wallet membership, event block number, invitation hash, expiry, and draft status;
- foreign keys enabled using InnoDB;
- no money column uses FLOAT or DOUBLE;
- JSON values containing wei values keep them as strings.

## 6. REST API specification

Base path: `/api/v1`

All error responses use:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable explanation",
    "details": {}
  },
  "requestId": "uuid"
}
```

### 6.1 Health and configuration

#### `GET /health`

Returns API, MySQL, storage, RPC, chain ID, and contract-bytecode status. Must not expose secrets.

#### `GET /config/public`

Returns:

- chain ID;
- network name;
- RPC public URL if safe to expose;
- explorer base URL;
- contract address;
- native symbol;
- upload limits;
- application version and commit SHA.

### 6.2 Authentication

#### `POST /auth/nonce`

Request:

```json
{"address":"0x..."}
```

Response contains the exact message to sign and expiry.

#### `POST /auth/verify`

Request:

```json
{
  "address":"0x...",
  "message":"exact returned message",
  "signature":"0x..."
}
```

Sets session cookie and returns normalized wallet.

#### `POST /auth/logout`

Revokes the current session.

#### `GET /auth/me`

Returns the authenticated wallet and private profile label.

### 6.3 Agreement drafts

#### `POST /agreements/drafts`

Authenticated creator submits readable form data. Backend validates timeline, tenants, amounts, recipient conflict, and chain configuration. It generates canonical terms and hash.

#### `GET /agreements/drafts/{draftId}`

Creator only before confirmation; participants may view through an invitation token after confirmation.

#### `POST /agreements/drafts/{draftId}/verify-hash`

Frontend submits browser-computed hash. Backend must return match or mismatch. Creation button remains disabled on mismatch.

#### `POST /agreements/drafts/{draftId}/attach-transaction`

Request includes tx hash. Backend validates that transaction exists or returns `PENDING_CHAIN_CONFIRMATION`; it does not trust client-supplied agreement ID.

### 6.4 Agreements

#### `GET /agreements`

Returns agreements where authenticated wallet is creator, tenant, or recipient. State values are reconciled from the contract/cache.

#### `GET /agreements/{agreementId}`

Returns:

- private metadata if authorized;
- direct contract state;
- tenant records;
- claim records;
- activity timeline;
- finality and sync status;
- permitted actions for current wallet.

The route also includes configured chain and contract address in the path or query to avoid ambiguous IDs.

#### `POST /agreements/{agreementId}/invitations`

Creator creates or rotates an invitation for a specific expected wallet. The raw token is returned once. Store only its hash.

#### `GET /invitations/{rawToken}`

Returns limited agreement review data after token and expiry validation. Wallet must still connect and match expected address before an onchain action.

Invitation-token protections (all required):

- generate at least 256 bits of cryptographically secure randomness per token;
- store only the token hash, never the raw token;
- short expiration;
- one-time acceptance semantics: the token is marked used once its expected wallet completes review/join, and reuse is rejected;
- support token rotation and revocation by the creator;
- never log raw invitation URLs or raw tokens;
- redact invitation routes in application and reverse-proxy access logs;
- serve invitation pages with `Referrer-Policy: no-referrer`;
- load no third-party analytics, fonts, scripts, or images on invitation pages;
- require HTTPS in hosted environments;
- never expose the token in API error responses.

### 6.5 Evidence

#### `POST /evidence/manifests`

Multipart authenticated recipient upload. Validates:

- agreement participation and recipient role;
- file count 1 through 5;
- configured total bytes;
- extension and MIME allowlist;
- content signature for PNG/JPEG/PDF;
- no executable HTML/SVG;
- safe filename handling.

Returns manifest JSON and hash.

#### `GET /evidence/manifests/{manifestId}`

Only agreement participants. Returns manifest metadata, not raw filesystem path.

#### `GET /evidence/files/{sha256}`

Authenticated participant only. Streams immutable file with `Content-Disposition: inline` or attachment and security headers.

### 6.6 Claim drafts

#### `POST /agreements/{agreementId}/claim-drafts`

Recipient only. Backend reads current contract state before accepting the draft. Returns exact amount wei, reason hash, evidence hash, and calldata-ready values.

#### `POST /claim-drafts/{draftId}/attach-transaction`

Attaches tx hash. Worker confirms `ClaimSubmitted` and derives claim ID.

### 6.7 Chain endpoints

#### `GET /chain/transactions/{txHash}`

Returns unknown, pending, mined, failed, or finalized. If mined, include receipt status, block, confirmations/finality, and explorer URL.

#### `POST /agreements/{agreementId}/refresh`

Authenticated participant requests immediate contract reconciliation. Rate limited. It must not fabricate data if RPC fails.

## 7. Chain event worker

### 7.1 Process model

Run separately:

```text
python -m app.worker
```

The worker:

1. reads configured chain and contract;
2. obtains finalized block number;
3. reads last indexed finalized block from MySQL;
4. fetches logs in configurable chunks no larger than the provider limit;
5. decodes known ABI events;
6. inserts each event idempotently;
7. updates derived agreement/claim cache;
8. reconciles direct view calls where required;
9. advances checkpoint only after successful transaction commit.

Default `LOG_BLOCK_CHUNK_SIZE` should be 100 for compatibility with public Monad RPC limits and must be configurable.

### 7.2 Reorganization/finality policy

Only finalized blocks are persisted as canonical. The worker may expose mined-but-not-final UI state through direct receipt checks, but its durable event tables use finalized blocks.

### 7.3 Idempotency

Use unique chain-event identity. Reprocessing a chunk must produce no duplicate agreement, claim, or timeline records.

### 7.4 Failure behavior

- exponential backoff with maximum configured delay;
- structured logs with request ID, chain ID, block range, and exception;
- checkpoint unchanged after a failed chunk;
- health endpoint reports stale sync duration;
- frontend shows `Chain sync delayed` rather than old cache as current.

## 8. Frontend chain integration

### 8.1 Reads

Use Viem public client. Read contract directly for:

- agreement status;
- acceptance flags;
- funding amounts;
- claims and votes;
- settlement values;
- withdrawal flags.

Use backend for private metadata and indexed activity. If cache differs, direct contract values win.

### 8.2 Writes

All writes are initiated by the browser wallet:

- create agreement;
- accept as tenant;
- accept as recipient;
- deposit;
- withdraw pre-activation funding;
- cancel expired funding;
- withdraw cancelled funding;
- submit/withdraw claim;
- vote;
- finalize pending claim;
- finalize agreement;
- withdraw refund/payout.

The backend never asks for a private key and never signs these actions.

### 8.3 Transaction state machine

```text
IDLE
 -> WALLET_CONFIRMATION
 -> BROADCAST
 -> MINED_SUCCESS or MINED_REVERTED
 -> FINALIZED
```

The UI must:

- keep the transaction hash;
- show explorer link immediately after broadcast;
- decode known custom errors when simulation fails;
- wait for receipt;
- verify expected event or state transition;
- avoid declaring success from wallet submission alone.

### 8.4 Amount handling

- input as decimal string;
- parse using Viem `parseEther`;
- display using `formatEther`;
- preserve exact wei value in state;
- never use `Number` for wei;
- reject more than 18 fractional digits;
- show remaining contribution from onchain integers.

## 9. Security and threat model

### 9.1 Smart-contract threats

| Threat | Control |
|---|---|
| Reentrancy during withdrawal | ReentrancyGuard, state update before call |
| Double withdrawal | explicit boolean flags |
| Overfunding | exact required amount cap |
| Claim over-reservation | total open + approved cap |
| Tenant-specific overclaim | individual open + approved cap |
| Duplicate tenant | creation validation |
| Role collision | recipient cannot be tenant |
| Mutable terms | terms hash immutable |
| Unbounded loops | maximum eight tenants; claims finalized one at a time |
| Gas griefing by many claims | recipient only, each amount reserves deposit, and `MAX_CLAIMS = 32` bounds settlement work |
| Direct accidental transfer | receive/fallback revert |
| Admin theft | no owner and no rescue path |
| Contract upgrade risk | non-upgradeable deployment |
| Push-payment failure | pull withdrawals |

### 9.2 Application threats

| Threat | Control |
|---|---|
| Wallet impersonation | signed nonce and recovered address |
| Nonce replay | one-time hash and expiry |
| Invitation leak | 256-bit CSPRNG token, hash-only storage, short expiry, one-time acceptance, rotation/revocation, log redaction, no-referrer policy, no third-party assets on invitation pages, wallet match |
| Evidence replacement | content-addressed SHA-256 storage |
| Malicious upload | allowlist, size limit, magic-byte validation, no SVG/HTML |
| Database amount corruption | contract remains authority; DECIMAL integer copies |
| RPC stale data | finalized event worker and explicit status |
| Fake success UI | receipt plus expected event/state verification |
| XSS in labels/reasons | render text, never raw HTML |
| CORS/CSRF | exact origins, SameSite cookie, CSRF token for cookie-authenticated mutations |
| Secret leakage | env files ignored, redacted logs |

### 9.3 Economic and governance limitations

The strict-majority vote is a voluntary rule, not objective proof of damage. Tenants may collude to reject a valid claim; recipient may submit excessive claims within the funded cap. The product makes the rule transparent and deterministic but does not solve all real-world disputes.

The UI must state this before acceptance.

## 10. Environment variables

### Root/public

```text
APP_ENV=development
APP_VERSION=local
GIT_COMMIT_SHA=
```

### Backend

```text
DATABASE_URL=mysql+pymysql://root:@127.0.0.1:3306/shared_deposit?charset=utf8mb4
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
FRONTEND_ORIGIN=http://localhost:5173
SESSION_COOKIE_NAME=shared_deposit_session
SESSION_TTL_SECONDS=86400
AUTH_NONCE_TTL_SECONDS=600
SESSION_SECRET=<random local secret>
CHAIN_ID=10143
CHAIN_NAME=Monad Testnet
RPC_URL=https://testnet-rpc.monad.xyz
EXPLORER_TX_BASE=https://testnet.monadscan.com/tx/
ESCROW_CONTRACT_ADDRESS=
ESCROW_DEPLOYMENT_BLOCK=
LOG_BLOCK_CHUNK_SIZE=100
CHAIN_POLL_SECONDS=5
EVIDENCE_STORAGE_ROOT=./storage/evidence
EVIDENCE_MAX_FILES=5
EVIDENCE_MAX_TOTAL_BYTES=10485760
```

### Frontend

```text
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
VITE_CHAIN_ID=10143
VITE_CHAIN_NAME=Monad Testnet
VITE_RPC_URL=https://testnet-rpc.monad.xyz
VITE_EXPLORER_URL=https://testnet.monadscan.com
VITE_ESCROW_CONTRACT_ADDRESS=
```

### Contracts

```text
PRIVATE_KEY=
MONAD_TESTNET_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_MAINNET_RPC_URL=https://rpc.monad.xyz
ETHERSCAN_API_KEY=
```

Never place a production or testnet private key in root `.env.example`, frontend variables, logs, screenshots, or Git history.

## 11. Logging and observability

Backend structured log fields:

- timestamp UTC;
- level;
- request ID;
- route;
- wallet if authenticated, shortened or hashed in general logs;
- chain ID;
- agreement ID;
- tx hash where relevant;
- error code;
- duration.

Do not log:

- session token;
- raw nonce;
- signature unless temporarily in secure debug mode;
- private property address;
- evidence file bytes;
- private key;
- database password.

Frontend errors may be reported to console in development. Hosted production must show a user-safe message and a request ID.

## 12. Test design

### 12.1 Contract unit tests

Required categories:

- agreement creation validation;
- role and duplicate validation;
- canonical terms hash storage;
- acceptance permissions;
- partial funding and exact cap;
- pre-activation withdrawal;
- automatic activation;
- funding expiry and refunds;
- claim timing and role checks;
- reason/evidence requirement;
- total and individual reservation caps;
- claim withdrawal;
- voting once, vote permissions, approval threshold, rejection threshold;
- deadline finalization;
- proportional shared allocation with Math.mulDiv base allocations;
- largest-remainder wei distribution, per-tenant caps, and index tie-breaking;
- no settlement underflow and no rounding dust at wei-level boundaries;
- cancelled-funding historical accounting and `totalCancelledFundingWithdrawn` invariant;
- zero-refund cases;
- withdrawal success and repeat rejection;
- malicious receiver/reentrancy test;
- direct transfer rejection;
- randomized property tests for 2 to 8 tenants and claim mixes.

### 12.2 Backend tests

- MySQL-compatible model constraints;
- terms canonicalization golden vectors shared with frontend;
- reason normalization;
- evidence manifest deterministic hash;
- file magic-byte and size validation;
- nonce expiry and replay;
- bad signature and wrong wallet;
- session revocation;
- role authorization;
- duplicate event idempotency;
- finalized checkpoint behavior;
- RPC error response;
- no authority conflict between cache and direct read.

### 12.3 Frontend tests

- amount parsing and formatting;
- creation wizard validation;
- wallet mismatch states;
- terms hash mismatch blocks creation;
- transaction lifecycle UI;
- role-based action buttons;
- claim threshold math;
- no placeholder fallback when API/RPC fails;
- mobile layouts and keyboard navigation.

### 12.4 End-to-end tests

Run a local Hardhat node and deploy the actual contract. Use deterministic local accounts only in test automation. Test:

1. create;
2. accept all roles;
3. fund;
4. activate;
5. advance time;
6. upload evidence through backend;
7. submit claim;
8. vote;
9. finalize;
10. withdraw;
11. verify exact balances and events.

The hosted submission must not expose local test accounts or test-only controls.

## 13. Build and deployment outputs

Contract deployment must create a machine-readable artifact containing:

```json
{
  "chainId": 10143,
  "network": "monadTestnet",
  "contractName": "SharedDepositEscrow",
  "contractAddress": "0x...",
  "deploymentTxHash": "0x...",
  "deploymentBlock": "0",
  "deployer": "0x...",
  "solcVersion": "resolved build version",
  "optimizer": {"enabled": true, "runs": 200},
  "evmVersion": "prague",
  "gitCommit": "...",
  "deployedAtUtc": "..."
}
```

The ABI copied to frontend/backend must be generated by the contract build, not manually transcribed.

## 14. Documentation requirements in repository

README must contain:

- problem and solution;
- architecture diagram;
- live URL;
- contract address and explorers;
- exact local setup;
- MySQL setup for WAMP;
- environment variable instructions;
- how to run all tests;
- security and legal limitations;
- demo video and social post links after available;
- current commit SHA used by deployed app.

