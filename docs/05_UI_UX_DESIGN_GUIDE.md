# Shared Deposit — UI/UX Design Guide

## 1. Design objective

The interface should feel like a trustworthy financial agreement, not a generic crypto dashboard. It must make roles, money, deadlines, and irreversible actions understandable before asking for a wallet transaction.

## 2. Visual direction

- light, spacious background;
- restrained Monad-purple accent;
- dark neutral text;
- green only for finalized success;
- amber for pending deadlines or chain finality;
- red for destructive, expired, rejected, and reverted states;
- no token-price charts, decorative coins, neon trading visuals, or generic AI imagery;
- rounded panels used sparingly;
- visible transaction and contract references;
- unique house/key/escrow visual language rather than template dashboard cards.

Suggested design tokens:

```text
background: #F8F7FC
surface: #FFFFFF
text-primary: #17141F
text-secondary: #645F70
border: #E5E1EC
accent: #6D28D9
accent-soft: #F0E8FF
success: #168A50
warning: #A15C00
danger: #B42318
focus: #7C3AED
```

Exact colors may be adjusted after contrast testing. Do not use color alone to communicate state.

## 3. Typography

Use one clear display face and one readable UI face available through normal web delivery. Avoid loading local font files into the repository unless licensing is clear.

Guidelines:

- body minimum 16px;
- form labels 14 to 16px;
- numeric financial values use tabular numerals;
- wallet and hash values use monospace;
- line length near 65 to 80 characters;
- headings describe actions, not vague categories.

## 4. Navigation

Desktop:

```text
Logo | Dashboard | Agreements | How it works | Network status | Wallet
```

Mobile:

- compact header;
- no persistent bottom navigation unless it improves the tested flow;
- wallet status available without hiding primary action;
- action bars must respect safe-area insets.

## 5. Core pages

## 5.1 Landing page

Purpose: explain the problem in under ten seconds.

Content:

- headline: "One deposit. Clear contributions. Verifiable settlement.";
- short description;
- three-step flow: Fund, Review claims, Settle;
- contract-backed explanation;
- primary action: Create agreement;
- secondary action: Open invitation;
- visible Monad Testnet badge in hackathon deployment;
- legal limitation link.

Avoid inflated claims such as "dispute-free forever".

## 5.2 Wallet connection and login

Display:

- supported wallet choices;
- current network;
- explanation that login is a signature, not a transaction;
- exact connected address after connection;
- clear cancel path.

Do not show a connected state until the provider returns the address.

## 5.3 Dashboard

Sections:

- action-required agreements;
- funding agreements;
- active agreements;
- settlement agreements;
- finalized/cancelled agreements.

Each agreement row/card shows only:

- private property alias;
- role;
- status;
- total deposit;
- next deadline;
- one context action;
- chain-sync state.

Do not fill the page with analytics irrelevant to the core flow.

## 5.4 Create-agreement wizard

Five steps:

1. Basics
2. Participants
3. Contributions
4. Rules and dates
5. Terms review and create

### Basics

- property alias;
- optional private address;
- recipient wallet;
- privacy explanation.

### Participants

- tenant wallet rows;
- creator row locked and clearly identified;
- add/remove tenant;
- duplicate and recipient-conflict validation.

### Contributions

- MON string input per tenant;
- exact total;
- no floating-point calculations;
- show wei in advanced disclosure, not main form.

### Rules and dates

- lease dates;
- funding deadline;
- claim deadline;
- settlement deadline;
- computed strict-majority threshold;
- immutable rule explanations.

### Review

Display a human-readable agreement summary and:

- browser hash;
- backend hash;
- match indicator;
- public data warning;
- checkbox acknowledging immutability;
- contract simulation result;
- create button.

## 5.5 Agreement detail page

Header:

- property alias;
- role;
- status badge;
- total deposit;
- next deadline;
- agreement ID;
- contract and explorer links.

Tabs or anchored sections:

- Overview
- Participants and funding
- Claims
- Settlement
- Activity
- Terms and proof

The primary action changes by role and state. Never show actions the wallet cannot perform.

## 5.6 Invitation review

Before wallet connection, show only limited safe details. After wallet match, show full authorized metadata.

Required states:

- valid link, wallet disconnected;
- valid link, correct wallet;
- valid link, wrong wallet;
- expired link;
- rotated/revoked link;
- already accepted.

Invitation pages must be served with `Referrer-Policy: no-referrer` and must not load third-party analytics, fonts, scripts, or images. The raw invitation token must never appear in logs, error messages, or page content beyond the URL the user already holds.

## 5.7 Funding panel

For each tenant:

- shortened wallet;
- private label if authorized;
- required MON;
- funded MON;
- remaining MON;
- accepted indicator;
- transaction link for deposits.

For current tenant:

- amount input capped at remaining;
- deposit button;
- withdraw-before-activation button;
- wallet balance;
- gas warning.

Agreement readiness checklist:

```text
[ ] Recipient accepted
[ ] All tenants accepted
[ ] All tenant contributions fully funded
```

## 5.8 Claim composer

Recipient-only.

Fields:

- claim type segmented control;
- liable tenant selector only for individual;
- amount string;
- reason textarea;
- evidence uploader;
- remaining claimable amount;
- reason and evidence hashes in advanced section;
- final transaction review.

Do not upload files before the user intentionally selects them. Show progress and file validation results.

## 5.9 Claim detail

Show:

- type;
- amount;
- liable tenant or Shared;
- status;
- reason;
- evidence gallery/list;
- hash verification per file;
- YES/NO counts;
- required approvals;
- time remaining;
- wallet's vote or available vote controls;
- onchain transaction and event.

Do not use an unqualified "Verified claim" label. Use "Evidence file hash verified" for technical hash checks.

## 5.10 Settlement page

Before finalization:

- approved claims;
- rejected claims;
- unresolved claims;
- estimated refund preview clearly labelled as preview;
- exact reason finalization is blocked.

After finalization:

- recipient payout;
- each tenant refund;
- individual deduction;
- shared deduction portion;
- accounting equality;
- withdrawal status;
- buttons for current wallet only.

## 5.11 Activity timeline

Derived from finalized contract events where possible. Each row includes:

- event name in plain language;
- actor wallet;
- amount if relevant;
- block timestamp;
- transaction link;
- finality badge.

Private offchain events, such as an invitation being generated, must be visually distinguished from onchain events.

## 6. Status vocabulary

Agreement statuses:

- Funding
- Active
- Finalized
- Cancelled

Transaction statuses:

- Waiting for wallet
- Broadcast
- Mined
- Reverted
- Finalized

Claim statuses:

- Pending vote
- Approved
- Rejected
- Withdrawn by recipient

Sync statuses:

- Live
- Syncing
- Delayed
- RPC unavailable

Avoid ambiguous labels such as Done, Processed, or Success without context.

## 7. Form validation

Validation must be both client-side and server/contract-side.

### Wallet address

- valid 20-byte address;
- checksum display;
- normalized comparison;
- duplicate prevention;
- wrong-role conflict.

### Amount

- decimal string;
- greater than zero;
- maximum 18 fractional digits;
- converted to bigint;
- no scientific notation;
- no comma separators in raw field;
- clear remaining cap.

### Dates

- local date/time selection with UTC preview;
- funding deadline in future;
- ordered lifecycle;
- exact onchain Unix seconds shown in review.

### Evidence

- required file count;
- allowed type;
- size;
- magic-byte result;
- per-file hash after upload.

## 8. Transaction confirmation patterns

Before wallet opens, show a transaction summary:

- function/action;
- amount sent;
- contract address;
- chain;
- irreversible effect;
- expected state change.

After broadcast, use a persistent transaction drawer. Do not hide progress behind a temporary toast.

On revert:

- show decoded known error;
- retain user-entered form values when safe;
- provide explorer link if a transaction hash exists;
- do not mark backend draft confirmed.

## 9. Empty and error states

### No agreements

Explain the product and offer Create or Open invitation.

### API unavailable

Keep wallet and contract reads available where possible. State that private metadata and evidence are temporarily unavailable.

### RPC unavailable

Do not show cached data as current. Show last synchronized block/time and retry.

### Chain mismatch

Show current chain and required chain with a switch action.

### Missing contract deployment

Application startup must show configuration error; do not render a fake dashboard.

## 10. Responsive requirements

Test at minimum:

- 360 x 800;
- 390 x 844;
- 768 x 1024;
- 1280 x 720;
- 1440 x 900.

Requirements:

- no horizontal body scroll;
- hashes truncate with copy button;
- tables become stacked rows on narrow screens;
- primary action remains visible but does not cover content;
- modal content is scrollable;
- wallet dialogs are external and not mimicked.

## 11. Accessibility

- semantic headings;
- explicit form labels;
- keyboard-operable controls;
- visible focus;
- ARIA live region for transaction stage changes;
- text plus icon for status;
- contrast meeting WCAG AA;
- reduced-motion support;
- evidence images have user-supplied or generated descriptive labels;
- tables use headers;
- errors associated with fields.

## 12. Content style

Use direct language:

- "Deposit 2.5 MON";
- "Three of four tenant votes are required";
- "This transaction records your acceptance on Monad";
- "The agreement cannot be edited after creation".

Avoid:

- "Revolutionary trustless rental infrastructure";
- "Seamless decentralized synergy";
- unexplained protocol jargon;
- legal certainty claims.

## 13. Demo mode

The hosted app must not contain a fake demo mode. A demonstration agreement may use short real onchain dates and testnet MON. Label it as a testnet demonstration agreement and keep every action real.

