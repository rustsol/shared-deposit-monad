# Shared Deposit — Spark Hackathon Build Pack

**Prepared:** 14 July 2026  
**Target:** Spark hackathon on BuildAnything  
**Default chain:** Monad Testnet  
**Repository name:** `shared-deposit-monad`  
**License:** MIT  
**Local project path:** `E:\wamp64\www\Hackathon\shared-deposit-monad`

This pack contains the complete MVP definition and implementation instructions for **Shared Deposit**, a wallet-based rental security-deposit escrow for a small group of tenants and one deposit recipient.

## Fixed product decisions

1. **A deposit-recipient wallet is required.** The recipient can be a landlord or property manager. They do not need a separate profile, KYC process, or registered property record. They only connect a wallet and accept the agreement terms.
2. **The contract, not MySQL, is the source of truth for money and settlement state.** MySQL stores private labels, invitations, evidence metadata, authentication data, indexed event copies, and UI caches.
3. **The hackathon MVP uses native MON only.** It does not use an unverified stablecoin address or a mock production token. Local automated tests may use the local Hardhat network; the submitted app must use Monad Testnet or Mainnet.
4. **Funds remain in the smart contract during the agreement.** The recipient receives only deductions approved under the pre-agreed voting rule. The remainder is withdrawn by tenants after finalization.
5. **Every participant accepts the same canonical terms hash onchain.** The full readable terms remain offchain; their deterministic hash is recorded onchain.
6. **No administrator can move agreement funds.** There is no upgradeability, rescue withdrawal, platform fee, or owner-controlled settlement path in the MVP.
7. **Claims are deterministic.** The recipient may submit claims only after the lease end and before the claim deadline. Tenants vote. A strict majority approves. Claims that do not reach approval by the final voting deadline are rejected.
8. **Private information is not written onchain.** No full address, legal name, email, phone number, free-text reason, receipt file, or photograph is stored in contract storage.
9. **The product is not presented as legal advice or a government tenancy-deposit scheme.** It is a voluntary escrow agreement between wallet participants.
10. **No fake UI success states or seeded production data.** A transaction is shown as successful only after a real receipt is returned and the expected contract event/state is observed.

## Documents

- `01_SCOPE_DOCUMENT.md` — product scope, boundaries, roles, acceptance criteria, risks.
- `02_TECHNICAL_DESIGN.md` — architecture, contract state machine, backend, database, API, security, chain integration.
- `03_IMPLEMENTATION_PLAN.md` — phased build sequence, tests, Git/GitHub history, local WAMP setup, deployment and submission.
- `04_USER_GUIDE.md` — end-user workflows for tenants and the deposit recipient.
- `05_UI_UX_DESIGN_GUIDE.md` — pages, components, statuses, validation, responsive and accessibility requirements.
- `06_CLAUDE_CODE_MASTER_PROMPT.md` — master prompt to give Claude Code.

## Official references used

- Spark overview and requirements: https://buildanything.so/hackathons/spark
- Spark rules: https://buildanything.so/hackathons/spark?tab=rules
- Spark FAQ: https://buildanything.so/hackathons/spark?tab=faq
- Monad Testnet information: https://docs.monad.xyz/developer-essentials/testnets
- Monad JSON-RPC behavior: https://docs.monad.xyz/reference/json-rpc/overview
- Monad Hardhat deployment: https://docs.monad.xyz/guides/deploy-smart-contract/hardhat
- Monad Hardhat verification: https://docs.monad.xyz/guides/verify-smart-contract/hardhat
- FastAPI documentation: https://fastapi.tiangolo.com/
- SQLAlchemy MySQL dialect: https://docs.sqlalchemy.org/en/20/dialects/mysql.html
- Alembic documentation: https://alembic.sqlalchemy.org/en/latest/
- web3.py documentation: https://web3py.readthedocs.io/en/stable/
- OpenZeppelin Contracts documentation: https://docs.openzeppelin.com/contracts/5.x/
- GitHub repository quickstart: https://docs.github.com/en/repositories/creating-and-managing-repositories/quickstart-for-repositories?tool=cli

