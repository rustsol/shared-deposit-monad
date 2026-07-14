# Shared Deposit

A wallet-based rental security-deposit escrow on **Monad Testnet**, built for the Spark hackathon on BuildAnything.

## The problem

Shared rental deposits are usually held by one roommate or the landlord and tracked through messages or spreadsheets. Roommates cannot easily prove who funded what, review why deductions were made, or ensure the final refund follows the rules everyone agreed to.

## The solution

Shared Deposit locks each tenant's contribution in a Monad smart contract:

1. **Create** — one tenant creates an agreement for 2–8 tenant wallets and one deposit-recipient wallet, with fixed dates, contributions, and voting rules. Every participant accepts the same immutable canonical terms hash onchain.
2. **Fund** — each tenant funds their exact share in native MON. The agreement activates automatically when everyone has accepted and fully funded. If the funding deadline is missed, anyone can cancel and every tenant withdraws their own money back.
3. **Claim** — after the lease ends, the deposit recipient may submit deduction claims. Every claim requires an amount, a reason hash, and an evidence-manifest hash (PNG/JPEG/PDF evidence stored offchain, content-addressed by SHA-256).
4. **Vote** — tenants vote YES/NO on each claim. A strict majority (`floor(tenantCount / 2) + 1`) approves; claims that cannot reach the threshold are rejected. Votes are immutable.
5. **Settle** — the contract deterministically calculates the recipient payout and every tenant refund (individual deductions first, then shared deductions allocated proportionally with a largest-remainder rounding method). Everyone withdraws their own amount; no one else can move it.

## Roles

- **Tenant** — accepts terms, funds their share, votes on claims, withdraws their refund.
- **Deposit recipient** (landlord or property manager) — accepts the same terms, submits evidence-backed claims after lease end, withdraws only approved deductions. Wallet only; no profile, KYC, or property registration.
- **Creator** — one of the tenants; prepares and submits the agreement, with no special power afterward.

## Architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Smart contract | Solidity + Hardhat + OpenZeppelin | **Financial source of truth**: custody, acceptance, funding, claims, voting, settlement, pull withdrawals |
| Backend | Python, FastAPI, SQLAlchemy 2, Alembic | Wallet-signature auth, canonical terms hashing, evidence storage, finalized-event indexing |
| Database | MySQL (local WAMP in development) | **Private metadata and indexed cache only** — never authoritative for balances, approvals, refunds, or withdrawals |
| Frontend | React, TypeScript, Vite, Wagmi, Viem | Wallet-signed transactions and direct contract reads |

The contract has no owner, no platform fee, no upgrade proxy, and no admin path that can move funds. Private information (names, addresses, reason text, receipts) stays offchain; only deterministic hashes go onchain.

## No fake data policy

The application never shows a success state without a real transaction receipt and the expected contract event or state. There is no seeded production data, no placeholder transaction hashes, no simulated blockchain results, and no fallback sample data when RPC or API calls fail.

## Documentation

- [Build pack overview](docs/00_README.md)
- [Scope document](docs/01_SCOPE_DOCUMENT.md)
- [Technical design](docs/02_TECHNICAL_DESIGN.md)
- [Implementation plan](docs/03_IMPLEMENTATION_PLAN.md)
- [User guide](docs/04_USER_GUIDE.md)
- [UI/UX design guide](docs/05_UI_UX_DESIGN_GUIDE.md)
- [Claude Code master prompt](docs/06_CLAUDE_CODE_MASTER_PROMPT.md)

## Project status

**The smart contract is functionally complete for the documented MVP and tested locally.** `SharedDepositEscrow` covers the full lifecycle: agreement creation, terms acceptance, funding with automatic activation, pre-activation withdrawal, funding-expiry cancellation with historical accounting, recipient deduction claims (shared and individual, hash-only evidence references, 32-claim lifetime limit), immutable tenant voting with immediate mathematical resolution, post-deadline claim finalization, deterministic settlement using the largest-remainder allocation, and reentrancy-safe pull withdrawals for tenant refunds and the recipient payout — verified by 135 passing Hardhat tests (boundary, security, forced-MON, and seeded randomized invariant tests) against local test signers only.

Not implemented yet: backend (auth, evidence storage, canonical hashing, event indexer), MySQL schema and migrations, frontend product flows, and any deployment. **The contract is not deployed to any network and no wallet keys exist in this repository.** Implementation follows the phased plan in [docs/03_IMPLEMENTATION_PLAN.md](docs/03_IMPLEMENTATION_PLAN.md).

## License

[MIT](LICENSE)
