# Shared Deposit — User Guide

## 1. Before using the application

Shared Deposit is a voluntary onchain escrow. Every participant needs:

- a compatible EVM wallet;
- the correct Monad network selected;
- enough MON for their deposit contribution and transaction fees;
- access to the private invitation link or agreement dashboard;
- an understanding that wallet addresses, deposit amounts, dates, votes, hashes, and withdrawals are public onchain.

The application does not verify property ownership or legal identity. Participants should review the readable agreement before accepting.

## 2. Roles

### Tenant

A tenant accepts the agreement, funds their share, votes on claims, and withdraws their final refund.

### Deposit recipient

The recipient accepts the agreement, submits claims after the lease ends, and withdraws approved deductions after settlement.

### Creator

The creator is one of the tenants. They prepare and create the agreement but cannot change it afterward.

## 3. Creating an agreement

### Step 1 — Connect the creator wallet

1. Open the application.
2. Select **Connect wallet**.
3. Choose the wallet provider.
4. Switch to Monad Testnet if prompted.
5. Sign the login message. This is not a blockchain transaction and does not move funds.

The connected wallet must be included as one of the tenant wallets.

### Step 2 — Enter agreement basics

Enter:

- private property alias;
- optional private address text;
- lease start;
- lease end;
- funding deadline;
- claim deadline;
- settlement deadline;
- deposit-recipient wallet.

Date order must be valid:

```text
funding deadline <= lease end < claim deadline < settlement deadline
```

The recipient wallet cannot be included as a tenant in the MVP.

### Step 3 — Add tenants and shares

Add 2 to 8 tenant wallets. For each tenant, enter:

- wallet address;
- private display label, optional;
- required MON contribution.

The total deposit is the exact sum of the tenant contributions. The application displays both MON and exact wei.

### Step 4 — Review settlement rules

The application shows:

- strict-majority vote threshold;
- individual deduction rule;
- shared deduction allocation rule;
- evidence requirement;
- funding and settlement deadlines;
- public-data warning.

For example, with four tenants, three YES votes are required.

### Step 5 — Verify the terms hash

The browser and server independently generate the canonical terms hash. Both values must match. If they differ, the Create button remains disabled.

### Step 6 — Create onchain

1. Select **Create agreement on Monad**.
2. Review the wallet transaction.
3. Confirm it.
4. Wait for the transaction to be mined and the expected agreement-created event to appear.
5. Open the explorer link to verify the transaction.

Once created, no term can be edited. A mistake requires a new agreement.

## 4. Inviting participants

The creator can generate one private link per expected wallet.

The link:

- expires;
- is associated with a tenant or recipient role;
- does not replace wallet verification;
- may be rotated if leaked.

The recipient or tenant opens the link, connects a wallet, and must match the expected wallet address.

## 5. Accepting an agreement

### Tenant acceptance

1. Open the agreement.
2. Confirm the connected wallet is listed as a tenant.
3. Review property alias, dates, recipient, tenant shares, vote threshold, and deduction rules.
4. Compare the displayed terms hash with the onchain hash.
5. Select **Accept terms**.
6. Confirm the wallet transaction.
7. Wait for the acceptance event.

Accepting terms does not fund the deposit. Funding is a separate transaction.

### Recipient acceptance

The recipient follows the same review flow and selects **Accept as deposit recipient**.

The agreement cannot activate until the recipient and all tenants accept.

## 6. Funding the agreement

### Deposit a share

A tenant can deposit the full remaining contribution or make partial deposits.

1. Open **Funding**.
2. Review required, already funded, and remaining amounts.
3. Enter an amount no greater than the remaining amount.
4. Confirm the wallet transaction.
5. Wait for the deposit event and updated contract balance.

The application does not permit:

- another wallet funding the tenant's slot;
- overfunding;
- a zero deposit;
- funding after the deadline;
- funding before the tenant accepts.

### Automatic activation

The agreement activates when:

- every tenant accepted;
- the recipient accepted;
- every tenant fully funded.

The final required action emits the activation event. No platform operator activates it manually.

### Withdraw before activation

Before activation, a tenant can withdraw some or all of their own funded amount.

This returns real MON to the same wallet and may prevent activation until the amount is redeposited.

### Funding deadline missed

If the agreement is not active after the funding deadline:

1. any participant selects **Cancel expired funding**;
2. the contract changes the agreement to cancelled;
3. every funded tenant separately selects **Withdraw cancelled funding**.

The recipient receives no funds from a cancelled agreement. The agreement's historical funding record remains visible after withdrawal; only the withdrawable amount becomes zero.

## 7. During the active lease

The dashboard shows:

- total funded;
- tenant contribution status;
- lease dates;
- time until claims open;
- terms hash;
- contract and explorer link;
- activity events.

Funds remain locked. The recipient cannot submit a deduction claim before the lease end.

## 8. Creating a deduction claim

Only the deposit recipient can create claims.

### Step 1 — Choose claim type

- **Shared:** deducted proportionally from all tenants after individual deductions.
- **Individual:** deducted from one named tenant first.

### Step 2 — Enter amount and reason

Enter the exact MON amount and a clear reason. The readable reason stays private in the application. Its hash is placed onchain.

### Step 3 — Upload evidence

Upload 1 to 5 PNG, JPEG, or PDF files within the displayed size limit.

The application:

- computes SHA-256 for every file;
- stores the file using its content hash;
- creates a canonical manifest;
- computes a public evidence-manifest hash;
- never overwrites a file with the same path.

Evidence files can be viewed only by authenticated agreement participants, although the evidence hash is public.

### Step 4 — Submit claim onchain

Review:

- claim type;
- amount;
- liable tenant if individual;
- reason hash;
- evidence hash;
- remaining claimable deposit.

Confirm the wallet transaction. The claim appears only after the contract event is observed.

### Claim limitations

- total open and approved claims cannot exceed total deposit;
- individual claims cannot exceed the liable tenant's contribution;
- claim must be submitted before the claim deadline;
- recipient may withdraw a pending claim, but approved/rejected claims cannot be edited;
- a corrected claim is a new transaction;
- no more than 32 claims can ever be created for one agreement, and a withdrawn claim still counts toward this limit.

## 9. Voting on claims

Every tenant sees:

- claim amount and type;
- readable reason;
- evidence files and verified hashes;
- current YES and NO counts;
- required YES threshold;
- settlement deadline;
- their own vote state.

### Vote YES

Select YES only if you approve the deduction under the agreement rules.

### Vote NO

Select NO if you reject it.

A vote is a real contract transaction and cannot be changed in the MVP.

### Immediate resolution

The contract approves immediately when YES votes reach the strict-majority threshold. It rejects immediately when enough NO votes make approval impossible.

### Deadline resolution

After the settlement deadline, any participant may finalize a still-pending claim. It is approved only if it reached the required YES votes; otherwise it is rejected.

## 10. Final settlement

When the settlement deadline has passed and no claim remains pending:

1. select **Finalize agreement**;
2. confirm the transaction;
3. the contract calculates all refunds and the recipient payout;
4. the app displays final immutable amounts.

### Individual deductions

Taken from the named tenant first.

### Shared deductions

Distributed proportionally using each tenant's balance remaining after individual deductions. Rounding wei are distributed deterministically using the largest-remainder method, and no tenant's shared deduction can exceed their remaining balance.

### Accounting verification

The settlement screen displays:

```text
all tenant refunds + recipient payout = total funded deposit
```

The values are read from the contract.

## 11. Withdrawing funds

### Tenant refund

Each tenant selects **Withdraw my refund** and confirms the transaction. The refund goes only to the same tenant wallet.

### Recipient payout

The recipient selects **Withdraw approved deductions**. The payout is the exact sum of approved claims.

Each withdrawal can happen once. One participant's delay or failed transaction does not block others.

## 12. Transaction statuses

### Waiting for wallet

The application is waiting for the user to approve or reject the wallet request.

### Broadcast

The transaction has a hash and was sent to the network. It is not yet mined.

### Mined

A receipt exists. The UI confirms whether the transaction succeeded or reverted.

### Finalized

The receipt's block is at or below Monad's finalized block height. Financial state is now shown as final.

## 13. Common errors

### Wrong wallet

Connect the exact wallet assigned to the role. The invitation link alone does not authorize another wallet.

### Wrong network

Switch to the configured Monad network.

### Terms mismatch

Do not proceed. Refresh and compare the accepted canonical terms. A mismatch indicates stale or altered offchain data.

### Overfunding

Deposit only the remaining amount displayed from the contract.

### Funding deadline passed

The agreement cannot activate. Cancel expired funding and withdraw contributions.

### Claim window not open

Wait until the lease end.

### Claim window closed

No new claims can be submitted. Existing claims can still resolve according to the settlement deadline.

### Already voted

Votes are immutable in the MVP.

### Nothing to withdraw

The agreement may not be finalized, the amount may be zero, or the wallet may already have withdrawn.

### RPC unavailable

The application must show an error and retry option. It does not replace missing chain data with sample values.

## 14. Privacy and safety

Do not include sensitive personal information in:

- property alias;
- onchain reason hash preimage shared publicly;
- wallet labels shown on public pages;
- GitHub issues or demo screenshots.

Remember that onchain data cannot be deleted. Use a dedicated wallet if public association is a concern.

## 15. Legal limitation

Shared Deposit executes the voluntary rules accepted by the wallet participants. It does not decide legal liability, verify documents, or replace legal advice. Participants remain responsible for compliance with local rental and deposit laws.

