# Shared Deposit — MVP Scope Document

## 1. Product summary

Shared Deposit is a non-custodial-by-operator, wallet-based escrow for a small rental group. Tenants lock their agreed shares of a security deposit in a Monad smart contract. A designated deposit recipient accepts the same terms and may submit evidence-backed deduction claims at the end of the lease. Tenants vote on claims under an agreed strict-majority rule. Approved deductions become withdrawable by the recipient; the remaining balance becomes withdrawable by the tenants.

The product solves four concrete problems:

- one roommate should not have to hold everyone else's deposit;
- all parties should see who funded what and which terms were accepted;
- deductions should not be made without a reason, evidence hash, and recorded vote;
- settlement should follow deterministic rules rather than private spreadsheets or message history.

## 2. Hackathon fit

The MVP is designed around Spark's published constraints:

- it is a new, solo-buildable project;
- it contains a real Monad onchain component;
- the hosted app uses live contract data;
- the key flow can be demonstrated in less than three minutes;
- the public repository contains setup instructions, tests, meaningful commits, and no single "final final" commit;
- the build focuses on one complete feature: creating, funding, claiming, voting, and settling a shared deposit.

## 3. Product positioning

### 3.1 Correct positioning

> A voluntary security-deposit escrow for a small group of tenants and one deposit recipient, with transparent funding, evidence-backed claims, majority voting, and onchain settlement.

### 3.2 Positioning to avoid

The MVP must not claim that it:

- registers legal ownership of a property;
- validates a tenancy agreement under local law;
- replaces government deposit-protection schemes;
- verifies a participant's real-world identity;
- determines who legally caused property damage;
- provides legal arbitration;
- guarantees that an uploaded receipt is authentic;
- guarantees the fiat value of MON;
- can recover a lost wallet.

## 4. Required participants

### 4.1 Tenant

A wallet that:

- is included in the agreement at creation;
- accepts the exact onchain terms hash;
- funds its required contribution;
- may vote on deduction claims;
- may withdraw its finalized refund;
- may withdraw its own funding if the agreement is cancelled before activation.

### 4.2 Deposit recipient

A wallet that:

- is identified at agreement creation;
- is not one of the tenant wallets in the MVP;
- accepts the exact onchain terms hash;
- may submit claims during the claim window;
- may withdraw only the total amount of approved claims after finalization.

The recipient can be called "landlord", "property manager", or "deposit recipient" in the UI. The contract uses the neutral term `recipient`.

### 4.3 Agreement creator

The creator must be one of the tenant wallets. The creator prepares the readable agreement and submits the onchain creation transaction. The creator receives no special power after creation.

### 4.4 Platform operator

The application operator:

- hosts the frontend and Python API;
- stores private offchain metadata and immutable evidence files;
- indexes contract events;
- cannot accept terms for users;
- cannot deposit or vote for users;
- cannot approve claims;
- cannot withdraw or redirect agreement funds;
- cannot edit an onchain agreement.

## 5. Required agreement data

### 5.1 Onchain data

Each agreement stores or exposes:

- agreement ID;
- creator wallet;
- recipient wallet;
- canonical terms hash;
- lease start timestamp;
- lease end timestamp;
- funding deadline;
- claim deadline;
- final voting/settlement deadline;
- tenant count;
- strict-majority approval threshold;
- tenant wallet list;
- required contribution per tenant in wei;
- funded amount per tenant;
- tenant acceptance flags;
- recipient acceptance flag;
- agreement status;
- claims, claim votes, and claim statuses;
- approved individual deductions per tenant;
- approved shared-deduction total;
- finalized refund per tenant;
- recipient payout;
- withdrawal flags.

### 5.2 Offchain data

The private application database may store:

- property alias, such as "Indiranagar apartment";
- optional private address text;
- participant display labels;
- email-based invitation delivery metadata, if later added;
- the canonical readable terms JSON;
- evidence reason text;
- evidence file metadata and immutable content-addressed file path;
- authentication nonces and sessions;
- chain-event copies and sync checkpoints;
- transaction and explorer links;
- UI status cache.

The database must never be treated as authoritative for balances, claim approval, refund amount, payout amount, or withdrawal status.

## 6. Canonical terms

Before contract creation, the frontend and backend produce one deterministic JSON object. The same object must produce the same `bytes32` hash in the browser and backend.

Canonicalization rules:

- UTF-8 encoding;
- JSON keys sorted recursively;
- no insignificant whitespace;
- wallet addresses normalized to lowercase hexadecimal;
- timestamps represented as integer Unix seconds and also shown as UTC in the UI;
- amounts represented as decimal wei strings, never floating-point numbers;
- tenant list ordered exactly as submitted and stored onchain;
- schema version included;
- chain ID and currency included;
- voting and deduction rules included.

Minimum terms schema:

```json
{
  "schemaVersion": "1.0",
  "chainId": 10143,
  "currency": "MON",
  "creator": "0x...",
  "recipient": "0x...",
  "propertyAlias": "Private offchain label",
  "leaseStart": 0,
  "leaseEnd": 0,
  "fundingDeadline": 0,
  "claimDeadline": 0,
  "settlementDeadline": 0,
  "tenantContributions": [
    {
      "wallet": "0x...",
      "requiredAmountWei": "0"
    }
  ],
  "approvalRule": {
    "type": "STRICT_MAJORITY",
    "requiredApprovals": 0
  },
  "individualDeductionRule": "DEDUCT_FROM_LIABLE_TENANT_FIRST",
  "sharedDeductionRule": "PROPORTIONAL_TO_REMAINING_BALANCE_AFTER_INDIVIDUAL_DEDUCTIONS",
  "evidenceRequired": true
}
```

The `propertyAlias` is included in the canonical terms because participants need to know which agreement they accepted, but the readable value is not stored directly onchain. Its inclusion is proven through the terms hash.

## 7. Agreement lifecycle

### 7.1 Funding state

An agreement begins in `FUNDING`.

During this state:

- all tenants may review and accept the terms;
- the recipient may review and accept the terms;
- accepted tenants may deposit part or all of their required contribution;
- a tenant may withdraw its own deposited funding before activation;
- no claims can be created;
- the creator cannot change tenant wallets, amounts, dates, recipient, or terms hash;
- if any term is wrong, a new agreement must be created.

### 7.2 Activation

The agreement activates only when all of the following are true before the funding deadline:

- every tenant accepted the same terms hash;
- the recipient accepted the same terms hash;
- every tenant fully funded its exact required contribution.

The final acceptance or deposit transaction triggers `ACTIVE` automatically.

### 7.3 Funding cancellation

If the funding deadline passes before activation:

- any participant may call the expiry-cancellation function;
- the agreement becomes `CANCELLED`;
- each funded tenant withdraws its own deposited amount using a pull-payment function;
- the recipient receives nothing;
- historical funded amounts are preserved as onchain accounting records and are never erased or decreased by cancelled-funding withdrawals; the contract tracks each tenant's cancelled-funding withdrawal separately, the withdrawable amount becomes zero after withdrawal, and `sum(cancelled withdrawals) <= totalFunded` must always hold.

### 7.4 Active lease period

While active and before the lease end:

- funds remain locked;
- claims cannot be submitted;
- votes cannot be cast because no claims exist;
- participants can view the live contract state and evidence-free activity timeline;
- the application must clearly show the upcoming lease-end and claim dates.

### 7.5 Claim period

From `leaseEnd` through `claimDeadline`:

- only the recipient can submit a claim;
- every claim requires a nonzero amount, a nonzero reason hash, and a nonzero evidence-manifest hash;
- the claim is either `SHARED` or `INDIVIDUAL`;
- an individual claim names one tenant wallet;
- the recipient may withdraw a pending claim and submit a corrected new claim;
- the aggregate open and approved claim amount cannot exceed the funded deposit;
- aggregate individual open and approved claims against one tenant cannot exceed that tenant's funded contribution;
- no more than 32 claim IDs may ever be created for one agreement; a withdrawn claim still consumes its claim ID and counts toward this lifetime limit, preventing unbounded claim spam and settlement work.

### 7.6 Voting period

Tenants can vote from claim creation until `settlementDeadline`.

Rules:

- one vote per tenant per claim;
- vote is immutable in the MVP;
- `YES` or `NO` only;
- recipient cannot vote;
- strict majority is `floor(tenantCount / 2) + 1`;
- claim becomes approved immediately when YES votes reach the threshold;
- claim becomes rejected immediately when NO votes make approval mathematically impossible;
- any still-pending claim is finalized after the settlement deadline: approve if the YES threshold was reached, otherwise reject.

### 7.7 Finalization

After the settlement deadline:

- every pending claim must first be finalized;
- once no unresolved claim remains, anyone may finalize the agreement;
- the contract calculates recipient payout and every tenant refund;
- the agreement becomes `FINALIZED`;
- calculations cannot be changed;
- funds are not pushed automatically; each party withdraws its own amount.

### 7.8 Withdrawals

After finalization:

- each tenant calls `withdrawTenantRefund` once;
- the recipient calls `withdrawRecipientPayout` once;
- a zero-value withdrawal is rejected;
- a second withdrawal is rejected;
- failure to withdraw does not affect other participants.

## 8. Deduction allocation

### 8.1 Individual deduction

An approved individual claim reduces only the liable tenant's balance.

```text
remainingAfterIndividual[tenant]
  = fundedAmount[tenant] - approvedIndividualClaims[tenant]
```

Individual open plus approved claims can never exceed the tenant's funded amount.

### 8.2 Shared deduction

Approved shared claims are added together. They are distributed proportionally across each tenant's balance remaining after individual deductions.

```text
totalRemainingAfterIndividual
  = sum(remainingAfterIndividual for all tenants)

sharedShare[tenant]
  = totalSharedApproved
    * remainingAfterIndividual[tenant]
    / totalRemainingAfterIndividual
```

Integer rounding is resolved with the deterministic largest-remainder method:

- every tenant receives a base allocation of
  `floor(totalSharedApproved * remainingAfterIndividual[tenant] / totalRemainingAfterIndividual)`,
  computed with an overflow-safe multiply-divide;
- the unallocated remainder in wei equals
  `totalSharedApproved - sum(base allocations)`;
- remaining wei are assigned one at a time to the tenant with the highest
  fractional remainder, and a tenant may receive an additional wei only while
  their allocation remains below their remaining balance;
- equal fractional remainders are resolved by original tenant index;
- the tenant count is limited to eight, so the comparison is bounded and no
  unbounded loop exists.

Required allocation invariants:

```text
sharedShare[tenant] <= remainingAfterIndividual[tenant]
sum(sharedShares) == totalSharedApproved
refund[tenant] = remainingAfterIndividual[tenant] - sharedShare[tenant]
```

Finalization must never underflow or leave rounding dust. This guarantees:

```text
sum(all tenant refunds) + recipient payout = total funded deposit
```

### 8.3 Recipient payout

```text
recipient payout
  = total approved individual claims
  + total approved shared claims
```

## 9. In-scope MVP features

### Agreement creation

- wallet connection;
- wallet-signature login;
- create one agreement with 2 to 8 tenants;
- define recipient wallet;
- define private property alias;
- define dates and contribution amounts;
- generate and display canonical terms;
- compare browser-generated and backend-generated terms hashes;
- submit real contract transaction;
- wait for receipt and expected `AgreementCreated` event.

### Invitation and acceptance

- generate a private invitation link for each wallet;
- recipient and tenant review page;
- wrong-wallet protection;
- onchain terms acceptance;
- acceptance progress display.

### Funding

- partial native MON deposits;
- exact remaining amount display;
- overfunding prevention;
- pre-activation tenant withdrawal;
- funding-expiry cancellation;
- cancelled-funding withdrawal;
- activation event and state display.

### Claims and evidence

- recipient-only claim form;
- shared or individual claim;
- amount in MON converted safely to wei;
- required reason;
- 1 to 5 evidence files;
- allowed file types: PNG, JPEG, PDF;
- maximum total upload size set by configuration;
- immutable content-addressed storage on the application server;
- evidence manifest hash placed in the contract transaction;
- evidence viewer with client-side hash verification.

### Voting and settlement

- tenant YES/NO voting;
- live threshold display;
- onchain claim approval/rejection;
- post-deadline claim finalization;
- final settlement calculation;
- tenant refund withdrawal;
- recipient payout withdrawal;
- explorer links for every financial transaction.

### Activity and verification

- event-derived activity timeline;
- current chain and contract address;
- receipt status and finality status;
- raw onchain ID and transaction hash;
- no simulated success path in the deployed app.

## 10. Explicitly out of scope

The following must not be added before the core MVP is complete and tested:

- property registry or title verification;
- KYC or identity verification;
- fiat payment rails;
- stablecoin integration;
- recurring rent payment;
- maintenance requests;
- landlord marketplace;
- background checks or credit scoring;
- legal document generation;
- legal arbitration;
- external human arbitrators;
- AI damage analysis;
- OCR invoice verification;
- NFT receipts;
- token rewards;
- DAO governance;
- social profiles;
- chat;
- multi-chain support;
- mobile applications;
- upgradeable proxy contracts;
- admin settlement overrides;
- platform fees;
- production email delivery unless the core flow is complete.

## 11. Non-functional requirements

### Correctness

- all financial amounts use integer wei values;
- no JavaScript floating-point arithmetic for final amounts;
- MySQL uses `DECIMAL(65,0)` for wei copies;
- refund accounting invariant must hold in contract tests;
- shared-deduction allocation must satisfy the largest-remainder invariants in contract tests;
- cancelled-funding accounting invariant `sum(cancelled withdrawals) <= totalFunded` must hold in contract tests;
- backend chain sync must be idempotent.

### Security

- no private keys in frontend, backend source, repository, logs, or database;
- `.env` files ignored;
- all user financial transactions signed in the wallet;
- contract uses checks-effects-interactions and reentrancy protection;
- evidence files are content-addressed and never overwritten;
- authentication nonce is one-time and expires;
- session cookie is HttpOnly and Secure in hosted deployment;
- CORS allows only configured frontend origins;
- upload MIME and extension are both validated;
- rate limits apply to auth and upload endpoints.

### Reliability

- frontend remains readable if backend cache is delayed;
- core agreement state can be read directly from the contract;
- chain worker resumes from stored finalized block;
- duplicate events do not create duplicate records;
- RPC failures produce retryable states, not fabricated data.

### Privacy

- full property address optional and offchain only;
- evidence URLs require an authenticated participant session;
- public pages show only alias, wallet-shortened values, onchain status, and amounts if the agreement is explicitly marked shareable offchain;
- the contract is public and the UI must warn users that wallet addresses, amounts, dates, votes, and hashes are visible.

### Usability

- desktop and mobile responsive;
- each action states who can perform it and what happens next;
- transaction status distinguishes wallet confirmation, broadcast, mined, and finalized;
- dates show local time and UTC tooltip;
- error messages state the actual contract or validation reason.

## 12. Acceptance criteria

The MVP is accepted only when all criteria below pass with real contract state.

1. A tenant creates an agreement on a local chain and Monad Testnet.
2. The created agreement contains the correct terms hash, dates, recipient, tenant list, and required amounts.
3. Every tenant and the recipient can accept from only their assigned wallet.
4. The agreement does not activate until all acceptances and all required funding are complete.
5. A tenant cannot overfund or fund another tenant's slot.
6. A funding agreement can expire, cancel, and return actual deposited MON.
7. The recipient cannot submit a claim before the lease end or after the claim deadline.
8. A claim cannot omit evidence or reason hashes.
9. A non-recipient cannot submit or withdraw a claim.
10. A tenant can vote once; a non-tenant cannot vote.
11. Approval and rejection thresholds behave correctly for 2 through 8 tenants.
12. Approved individual deductions never exceed the liable tenant's funded contribution.
13. Open plus approved claims never exceed the total funded amount.
14. Finalization is impossible while unresolved claims remain.
15. Final settlement satisfies the exact accounting invariant.
16. Each party can withdraw only its calculated amount and only once.
17. The UI displays the real transaction hash and explorer link.
18. Refreshing the page reconstructs state from contract/API data without seeded placeholders.
19. The public GitHub repository can be installed using its README.
20. CI runs contract, backend, and frontend checks.

## 13. Demo definition

The submitted demo must use Monad Testnet and real wallet transactions. A time-compressed test agreement can use short future timestamps permitted by the contract, but the UI must clearly label it as a hackathon demonstration agreement.

Suggested demo sequence:

1. Show the problem and the empty dashboard.
2. Create a 2-tenant agreement with one recipient.
3. Show the onchain agreement transaction.
4. Accept and fund from the two tenant wallets and accept as recipient.
5. Show activation.
6. Move to a pre-created demonstration agreement whose lease has ended.
7. Submit one evidence-backed shared claim.
8. Vote YES from both tenants.
9. Finalize and withdraw one tenant refund and recipient payout.
10. Show Monad explorer links and the public repository.

No step may be represented by a fake toast or hardcoded state.

