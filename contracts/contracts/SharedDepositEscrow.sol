// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SharedDepositEscrow
/// @notice Wallet-based rental security-deposit escrow for 2..8 tenant wallets and one
///         deposit-recipient wallet, holding native MON only.
///
///         Phase 2 scope: agreement creation, terms acceptance, funding, automatic
///         activation, pre-activation withdrawal, funding-expiry cancellation, and
///         cancelled-funding withdrawal. Claims, voting, settlement, and finalized
///         withdrawals are implemented in a later phase; their storage fields already
///         exist below so the storage layout is final from the first deployment.
///
///         Authority model: there is NO owner, admin, operator, platform fee, rescue
///         function, emergency withdrawal, upgrade proxy, or deployer privilege. After
///         deployment the deployer is an ordinary address with no special permissions.
///         Escrowed funds can move only to the tenant that deposited them (in this
///         phase) via pull withdrawals.
///
///         Storage widths: amounts are uint128 (total native supply in wei is far below
///         2^128, and the creation path proves every stored total fits uint128 before
///         casting), timestamps are uint64, counters are uint16/uint32. Where packing
///         would have added casting risk, correctness was preferred over packing;
///         every cast is preceded by an explicit bound check.
contract SharedDepositEscrow is ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint16 public constant MIN_TENANTS = 2;
    uint16 public constant MAX_TENANTS = 8;

    /// @notice Lifetime bound on claim IDs per agreement (enforced by the claims phase).
    ///         A withdrawn claim still consumes its claim ID and counts toward this limit.
    uint32 public constant MAX_CLAIMS = 32;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum AgreementStatus {
        NONE,
        FUNDING,
        ACTIVE,
        FINALIZED,
        CANCELLED
    }

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
        // Claim accounting fields are populated by the claims/settlement phase.
        uint32 claimCount;
        uint32 unresolvedClaimCount;
        uint128 totalRequired;
        // Historical accounting record: totalFunded is reduced by pre-activation
        // withdrawals (active-funding accounting) but is NEVER reduced after
        // cancellation; cancelled-funding withdrawals are tracked separately in
        // totalCancelledFundingWithdrawn so the funding history stays queryable.
        uint128 totalFunded;
        uint128 totalCancelledFundingWithdrawn;
        uint128 totalOpenClaimAmount;
        uint128 totalApprovedClaims;
        uint128 sharedApprovedClaims;
        bool recipientAccepted;
        bool recipientPayoutWithdrawn;
        AgreementStatus status;
    }

    struct Tenant {
        uint128 requiredAmount;
        // Like Agreement.totalFunded: reduced by the tenant's own pre-activation
        // withdrawals, never reduced after cancellation. The cancelled-funding
        // withdrawal records its amount in cancelledFundingWithdrawnAmount instead
        // of erasing this historical value.
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

    /// @dev Claims store only public, non-private data: amounts, deterministic hashes,
    ///      vote counts, and status. Plain-text reasons, evidence files, names, and any
    ///      private metadata live offchain; only their hashes appear here. The claim
    ///      amount, type, liable tenant, reason hash, and evidence hash are immutable
    ///      after submission; there is no claim-editing function.
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

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice The next agreement ID to be assigned. IDs are sequential starting at 1,
    ///         so ID 0 is never a valid agreement.
    uint256 public nextAgreementId = 1;

    mapping(uint256 => Agreement) private agreements;
    mapping(uint256 => address[]) private agreementTenants;
    mapping(uint256 => mapping(address => Tenant)) private tenants;
    /// @dev Claim IDs are sequential per agreement, starting at 1 (matching agreement
    ///      IDs); ID 0 is never a valid claim. IDs are never reused: `claimCount` is a
    ///      lifetime counter that never decreases, and a withdrawn claim keeps its ID
    ///      and still counts toward MAX_CLAIMS.
    mapping(uint256 => mapping(uint256 => Claim)) private claims;
    /// @dev 0 = not voted, 1 = YES, 2 = NO. Votes are immutable once recorded.
    mapping(uint256 => mapping(uint256 => mapping(address => uint8))) private votes;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AgreementCreated(
        uint256 indexed agreementId,
        address indexed creator,
        address indexed recipient,
        bytes32 termsHash,
        uint128 totalRequired
    );

    event TenantAccepted(uint256 indexed agreementId, address indexed tenant);
    event RecipientAccepted(uint256 indexed agreementId, address indexed recipient);
    event DepositAdded(
        uint256 indexed agreementId,
        address indexed tenant,
        uint128 amount,
        uint128 tenantFunded
    );
    event FundingWithdrawn(uint256 indexed agreementId, address indexed tenant, uint128 amount);
    event AgreementActivated(uint256 indexed agreementId, uint128 totalFunded);
    event FundingCancelled(uint256 indexed agreementId);
    event CancelledFundingWithdrawn(
        uint256 indexed agreementId,
        address indexed tenant,
        uint128 amount
    );

    event ClaimSubmitted(
        uint256 indexed agreementId,
        uint256 indexed claimId,
        ClaimType claimType,
        address indexed liableTenant,
        uint128 amount,
        bytes32 reasonHash,
        bytes32 evidenceHash
    );

    event ClaimVoted(
        uint256 indexed agreementId,
        uint256 indexed claimId,
        address indexed tenant,
        bool support
    );
    event ClaimApproved(uint256 indexed agreementId, uint256 indexed claimId, uint128 amount);
    event ClaimRejected(uint256 indexed agreementId, uint256 indexed claimId, uint128 amount);
    event ClaimWithdrawn(uint256 indexed agreementId, uint256 indexed claimId, uint128 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

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
    /// @dev Addition to the documented minimum error list: caller is neither a listed
    ///      tenant nor the recipient of the agreement (used by cancelExpiredFunding,
    ///      which the scope document restricts to "any participant").
    error NotParticipant();
    error AlreadyAccepted();
    /// @dev Addition to the documented minimum error list: a tenant tried to deposit
    ///      before accepting the terms hash.
    error TenantNotAccepted();
    error FundingDeadlinePassed();
    error FundingDeadlineNotPassed();
    error TermsMismatch();
    error Overfunding();
    error ClaimWindowClosed();
    error ClaimWindowNotOpen();
    error MissingEvidence();
    error ClaimExceedsAvailableDeposit();
    error IndividualClaimExceedsTenantBalance();
    error InvalidClaim();
    /// @dev Addition to the documented minimum error list: the lifetime claim-ID limit
    ///      (MAX_CLAIMS = 32, withdrawn claims included) has been reached.
    error TooManyClaims();
    error AlreadyVoted();
    error VotingClosed();
    error VotingStillOpen();
    error UnresolvedClaimsRemain();
    error NothingToWithdraw();
    error AlreadyWithdrawn();
    error TransferFailed();
    error DirectTransferNotAllowed();

    // ---------------------------------------------------------------------
    // Agreement creation
    // ---------------------------------------------------------------------

    /// @notice Creates an immutable agreement. Nothing about it (participants, amounts,
    ///         deadlines, terms hash, recipient) can be edited afterwards; a mistake
    ///         requires a new agreement.
    /// @param recipient The deposit-recipient wallet. Must not be a tenant.
    /// @param termsHash Keccak-256 of the canonical terms JSON all parties accept.
    /// @param tenantAddresses Tenant wallets in their exact canonical order.
    /// @param requiredAmounts Exact required contribution in wei per tenant, same order.
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
    ) external returns (uint256 agreementId) {
        if (recipient == address(0)) revert InvalidAddress();
        if (termsHash == bytes32(0)) revert InvalidTermsHash();
        if (tenantAddresses.length != requiredAmounts.length) revert InvalidTenantCount();
        if (tenantAddresses.length < MIN_TENANTS || tenantAddresses.length > MAX_TENANTS) {
            revert InvalidTenantCount();
        }
        if (fundingDeadline <= block.timestamp) revert InvalidTimeline();
        if (leaseStart > leaseEnd) revert InvalidTimeline();
        if (fundingDeadline > leaseEnd) revert InvalidTimeline();
        if (claimDeadline <= leaseEnd) revert InvalidTimeline();
        if (settlementDeadline <= claimDeadline) revert InvalidTimeline();

        agreementId = nextAgreementId;
        // The ID counter increments once per creation; it cannot realistically overflow.
        unchecked {
            nextAgreementId = agreementId + 1;
        }

        Agreement storage agreement = agreements[agreementId];
        agreement.creator = msg.sender;
        agreement.recipient = recipient;
        agreement.termsHash = termsHash;
        agreement.leaseStart = leaseStart;
        agreement.leaseEnd = leaseEnd;
        agreement.fundingDeadline = fundingDeadline;
        agreement.claimDeadline = claimDeadline;
        agreement.settlementDeadline = settlementDeadline;
        agreement.tenantCount = uint16(tenantAddresses.length);
        agreement.requiredApprovals = uint16(tenantAddresses.length / 2) + 1;
        agreement.status = AgreementStatus.FUNDING;
        agreement.totalRequired = _registerTenants(
            agreementId,
            recipient,
            tenantAddresses,
            requiredAmounts
        );

        emit AgreementCreated(
            agreementId,
            msg.sender,
            recipient,
            termsHash,
            agreement.totalRequired
        );
    }

    /// @dev Registers and validates the tenant list. The total is recomputed from the
    ///      individual amounts; no caller-supplied total is trusted. Accumulated in
    ///      uint256, then bound-checked before the single cast to uint128.
    function _registerTenants(
        uint256 agreementId,
        address recipient,
        address[] calldata tenantAddresses,
        uint128[] calldata requiredAmounts
    ) private returns (uint128) {
        bool creatorListed = false;
        uint256 total = 0;

        for (uint256 i = 0; i < tenantAddresses.length; i++) {
            address tenantAddress = tenantAddresses[i];
            if (tenantAddress == address(0)) revert InvalidAddress();
            if (tenantAddress == recipient) revert RecipientCannotBeTenant();
            if (tenants[agreementId][tenantAddress].exists) revert DuplicateTenant();
            uint128 requiredAmount = requiredAmounts[i];
            if (requiredAmount == 0) revert InvalidAmount();

            if (tenantAddress == msg.sender) creatorListed = true;
            total += requiredAmount;

            Tenant storage tenant = tenants[agreementId][tenantAddress];
            tenant.requiredAmount = requiredAmount;
            tenant.index = uint16(i);
            tenant.exists = true;
            agreementTenants[agreementId].push(tenantAddress);
        }

        if (!creatorListed) revert CreatorMustBeTenant();
        if (total > type(uint128).max) revert InvalidAmount();
        return uint128(total);
    }

    // ---------------------------------------------------------------------
    // Acceptance
    // ---------------------------------------------------------------------

    /// @notice A listed tenant accepts the exact stored terms hash, once, while the
    ///         agreement is still funding and the funding deadline has not passed.
    function acceptAsTenant(uint256 agreementId, bytes32 expectedTermsHash) external {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.status != AgreementStatus.FUNDING) revert InvalidStatus();
        if (block.timestamp > agreement.fundingDeadline) revert FundingDeadlinePassed();

        Tenant storage tenant = tenants[agreementId][msg.sender];
        if (!tenant.exists) revert NotTenant();
        if (tenant.accepted) revert AlreadyAccepted();
        if (expectedTermsHash != agreement.termsHash) revert TermsMismatch();

        tenant.accepted = true;
        emit TenantAccepted(agreementId, msg.sender);

        _checkAndActivate(agreementId, agreement);
    }

    /// @notice The configured recipient accepts the exact stored terms hash, once,
    ///         under the same window rules as tenant acceptance.
    function acceptAsRecipient(uint256 agreementId, bytes32 expectedTermsHash) external {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.status != AgreementStatus.FUNDING) revert InvalidStatus();
        if (block.timestamp > agreement.fundingDeadline) revert FundingDeadlinePassed();
        if (msg.sender != agreement.recipient) revert NotRecipient();
        if (agreement.recipientAccepted) revert AlreadyAccepted();
        if (expectedTermsHash != agreement.termsHash) revert TermsMismatch();

        agreement.recipientAccepted = true;
        emit RecipientAccepted(agreementId, msg.sender);

        _checkAndActivate(agreementId, agreement);
    }

    // ---------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------

    /// @notice An accepted tenant funds its own slot, partially or fully, in native MON.
    ///         Overfunding is impossible: the deposit is capped at the tenant's exact
    ///         remaining contribution. The final qualifying deposit activates the
    ///         agreement automatically.
    function deposit(uint256 agreementId) external payable {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.status != AgreementStatus.FUNDING) revert InvalidStatus();
        if (block.timestamp > agreement.fundingDeadline) revert FundingDeadlinePassed();

        Tenant storage tenant = tenants[agreementId][msg.sender];
        if (!tenant.exists) revert NotTenant();
        if (!tenant.accepted) revert TenantNotAccepted();
        if (msg.value == 0) revert InvalidAmount();
        // Upper bound is validated before any cast: remaining fits uint128 because
        // requiredAmount does.
        uint256 remaining = uint256(tenant.requiredAmount) - uint256(tenant.fundedAmount);
        if (msg.value > remaining) revert Overfunding();

        uint128 amount = uint128(msg.value);
        tenant.fundedAmount += amount;
        agreement.totalFunded += amount;

        emit DepositAdded(agreementId, msg.sender, amount, tenant.fundedAmount);

        _checkAndActivate(agreementId, agreement);
    }

    /// @notice Before activation a tenant may withdraw part or all of its own funded
    ///         amount (even after accepting; the agreement simply remains unready).
    ///         This is active-funding accounting, so fundedAmount and totalFunded
    ///         decrease — unlike cancelled-funding withdrawal, which preserves them.
    function withdrawFundingBeforeActivation(
        uint256 agreementId,
        uint128 amount
    ) external nonReentrant {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.status != AgreementStatus.FUNDING) revert InvalidStatus();

        Tenant storage tenant = tenants[agreementId][msg.sender];
        if (!tenant.exists) revert NotTenant();
        if (amount == 0 || amount > tenant.fundedAmount) revert InvalidAmount();

        // Effects before interaction (checks-effects-interactions).
        tenant.fundedAmount -= amount;
        agreement.totalFunded -= amount;

        emit FundingWithdrawn(agreementId, msg.sender, amount);

        // Funds move only to the calling tenant itself; a failed transfer reverts the
        // whole transaction, so accounting cannot be corrupted.
        _sendMON(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Cancellation
    // ---------------------------------------------------------------------

    /// @notice After the funding deadline has strictly passed without activation, any
    ///         participant (listed tenant or the recipient) may cancel the agreement.
    ///         The recipient receives nothing from a cancelled agreement.
    function cancelExpiredFunding(uint256 agreementId) external {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.status != AgreementStatus.FUNDING) revert InvalidStatus();
        if (block.timestamp <= agreement.fundingDeadline) revert FundingDeadlineNotPassed();
        if (!tenants[agreementId][msg.sender].exists && msg.sender != agreement.recipient) {
            revert NotParticipant();
        }

        agreement.status = AgreementStatus.CANCELLED;
        emit FundingCancelled(agreementId);
    }

    /// @notice After cancellation each funded tenant withdraws its own recorded
    ///         contribution exactly once.
    ///
    ///         Historical-accounting model: the tenant's fundedAmount and the
    ///         agreement's totalFunded are NEVER erased or decreased by this function.
    ///         The withdrawal is recorded in cancelledFundingWithdrawnAmount and the
    ///         cancelledFundingWithdrawn flag (which makes the withdrawable amount
    ///         zero), and accumulated into totalCancelledFundingWithdrawn. Because each
    ///         tenant withdraws exactly its fundedAmount once, the invariant
    ///         totalCancelledFundingWithdrawn <= totalFunded always holds.
    function withdrawCancelledFunding(uint256 agreementId) external nonReentrant {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.status != AgreementStatus.CANCELLED) revert InvalidStatus();

        Tenant storage tenant = tenants[agreementId][msg.sender];
        if (!tenant.exists) revert NotTenant();
        if (tenant.cancelledFundingWithdrawn) revert AlreadyWithdrawn();
        uint128 amount = tenant.fundedAmount;
        if (amount == 0) revert NothingToWithdraw();

        // Effects before interaction: the flag blocks repetition, the historical
        // fundedAmount stays untouched.
        tenant.cancelledFundingWithdrawn = true;
        tenant.cancelledFundingWithdrawnAmount = amount;
        agreement.totalCancelledFundingWithdrawn += amount;

        emit CancelledFundingWithdrawn(agreementId, msg.sender, amount);

        _sendMON(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Claims
    // ---------------------------------------------------------------------

    /// @notice The recipient submits an evidence-backed deduction claim during the
    ///         claim window (`leaseEnd <= now <= claimDeadline`). Only deterministic
    ///         hashes of the reason and evidence manifest are stored; the readable
    ///         reason and the files themselves stay offchain. No funds move here —
    ///         the claim only reserves deposit capacity until it resolves.
    ///
    ///         Lifetime limit: at most MAX_CLAIMS (32) claim IDs may ever be created
    ///         for one agreement. A withdrawn claim still consumes its claim ID and
    ///         counts toward the limit; IDs are never reused.
    function submitClaim(
        uint256 agreementId,
        ClaimType claimType,
        address liableTenant,
        uint128 amount,
        bytes32 reasonHash,
        bytes32 evidenceHash
    ) external returns (uint256 claimId) {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.status != AgreementStatus.ACTIVE) revert InvalidStatus();
        if (msg.sender != agreement.recipient) revert NotRecipient();
        if (block.timestamp < agreement.leaseEnd) revert ClaimWindowNotOpen();
        if (block.timestamp > agreement.claimDeadline) revert ClaimWindowClosed();
        if (agreement.claimCount >= MAX_CLAIMS) revert TooManyClaims();
        if (amount == 0) revert InvalidAmount();
        if (reasonHash == bytes32(0) || evidenceHash == bytes32(0)) revert MissingEvidence();

        // Global reservation: open + approved + new can never exceed the funded
        // deposit. Computed in uint256 so the three uint128 terms cannot overflow.
        if (
            uint256(agreement.totalOpenClaimAmount) +
                uint256(agreement.totalApprovedClaims) +
                uint256(amount) >
            uint256(agreement.totalFunded)
        ) {
            revert ClaimExceedsAvailableDeposit();
        }

        if (claimType == ClaimType.SHARED) {
            if (liableTenant != address(0)) revert InvalidClaim();
        } else {
            Tenant storage liable = tenants[agreementId][liableTenant];
            if (!liable.exists) revert InvalidClaim();
            // Per-tenant reservation: open + approved + new individual claims can
            // never exceed the liable tenant's funded contribution.
            if (
                uint256(liable.openIndividualClaimAmount) +
                    uint256(liable.approvedIndividualClaims) +
                    uint256(amount) >
                uint256(liable.fundedAmount)
            ) {
                revert IndividualClaimExceedsTenantBalance();
            }
            liable.openIndividualClaimAmount += amount;
        }

        // Claim IDs are sequential per agreement starting at 1 and never reused.
        claimId = uint256(agreement.claimCount) + 1;
        agreement.claimCount = uint32(claimId);
        agreement.unresolvedClaimCount += 1;
        agreement.totalOpenClaimAmount += amount;

        Claim storage claim = claims[agreementId][claimId];
        claim.liableTenant = liableTenant;
        claim.reasonHash = reasonHash;
        claim.evidenceHash = evidenceHash;
        claim.amount = amount;
        claim.claimType = claimType;
        claim.status = ClaimStatus.PENDING;

        emit ClaimSubmitted(
            agreementId,
            claimId,
            claimType,
            liableTenant,
            amount,
            reasonHash,
            evidenceHash
        );
    }

    /// @notice The recipient withdraws a still-pending claim (for example to submit a
    ///         corrected one). The claim keeps its ID and still counts toward
    ///         MAX_CLAIMS; its stored values are never altered. No funds move.
    function withdrawPendingClaim(uint256 agreementId, uint256 claimId) external {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.status != AgreementStatus.ACTIVE) revert InvalidStatus();
        if (msg.sender != agreement.recipient) revert NotRecipient();

        Claim storage claim = claims[agreementId][claimId];
        if (claim.status != ClaimStatus.PENDING) revert InvalidClaim();

        claim.status = ClaimStatus.WITHDRAWN;
        agreement.unresolvedClaimCount -= 1;
        _releaseOpenClaimReservation(agreementId, agreement, claim);

        emit ClaimWithdrawn(agreementId, claimId, claim.amount);
    }

    /// @notice A tenant casts one immutable YES/NO vote on a pending claim, no later
    ///         than the settlement deadline. The claim resolves immediately once the
    ///         outcome is mathematically determined.
    function voteClaim(uint256 agreementId, uint256 claimId, bool support) external {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.status != AgreementStatus.ACTIVE) revert InvalidStatus();
        if (block.timestamp > agreement.settlementDeadline) revert VotingClosed();

        Tenant storage tenant = tenants[agreementId][msg.sender];
        if (!tenant.exists) revert NotTenant();

        Claim storage claim = claims[agreementId][claimId];
        if (claim.status != ClaimStatus.PENDING) revert InvalidClaim();
        if (votes[agreementId][claimId][msg.sender] != 0) revert AlreadyVoted();

        votes[agreementId][claimId][msg.sender] = support ? 1 : 2;
        if (support) {
            claim.yesVotes += 1;
        } else {
            claim.noVotes += 1;
        }

        emit ClaimVoted(agreementId, claimId, msg.sender, support);

        if (claim.yesVotes >= agreement.requiredApprovals) {
            // Strict majority reached: approve immediately.
            _approveClaim(agreementId, agreement, claimId, claim);
        } else if (claim.noVotes >= agreement.tenantCount - agreement.requiredApprovals + 1) {
            // Approval is mathematically impossible: the maximum achievable YES count
            // is tenantCount - noVotes. It drops below requiredApprovals exactly when
            //   noVotes > tenantCount - requiredApprovals
            // i.e. when noVotes >= tenantCount - requiredApprovals + 1.
            _rejectClaim(agreementId, agreement, claimId, claim);
        }
    }

    /// @notice After the settlement deadline has strictly passed, any participant may
    ///         finalize a still-pending claim: it approves only if the YES threshold
    ///         was already reached, otherwise it rejects. (In normal operation a claim
    ///         with enough YES votes approved immediately, so this normally rejects.)
    function finalizePendingClaim(uint256 agreementId, uint256 claimId) external {
        Agreement storage agreement = _requireAgreement(agreementId);
        if (agreement.status != AgreementStatus.ACTIVE) revert InvalidStatus();
        if (block.timestamp <= agreement.settlementDeadline) revert VotingStillOpen();
        if (!tenants[agreementId][msg.sender].exists && msg.sender != agreement.recipient) {
            revert NotParticipant();
        }

        Claim storage claim = claims[agreementId][claimId];
        if (claim.status != ClaimStatus.PENDING) revert InvalidClaim();

        if (claim.yesVotes >= agreement.requiredApprovals) {
            _approveClaim(agreementId, agreement, claimId, claim);
        } else {
            _rejectClaim(agreementId, agreement, claimId, claim);
        }
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Core agreement state, including totals, acceptance flags, and status.
    function getAgreement(uint256 agreementId) external view returns (Agreement memory) {
        Agreement memory agreement = agreements[agreementId];
        if (agreement.status == AgreementStatus.NONE) revert InvalidAgreement();
        return agreement;
    }

    /// @notice Tenant wallets in their exact stored order.
    function getAgreementTenants(uint256 agreementId) external view returns (address[] memory) {
        _requireAgreementView(agreementId);
        return agreementTenants[agreementId];
    }

    /// @notice Per-tenant contribution, funding, acceptance, and cancelled-withdrawal state.
    function getTenant(uint256 agreementId, address tenant) external view returns (Tenant memory) {
        _requireAgreementView(agreementId);
        Tenant memory record = tenants[agreementId][tenant];
        if (!record.exists) revert NotTenant();
        return record;
    }

    /// @notice The tenant's exact remaining contribution in wei.
    function getRemainingContribution(
        uint256 agreementId,
        address tenant
    ) external view returns (uint128) {
        _requireAgreementView(agreementId);
        Tenant storage record = tenants[agreementId][tenant];
        if (!record.exists) revert NotTenant();
        return record.requiredAmount - record.fundedAmount;
    }

    /// @notice True when every tenant accepted, the recipient accepted, and every
    ///         tenant is exactly fully funded, while the agreement is still FUNDING.
    function isAgreementReady(uint256 agreementId) external view returns (bool) {
        Agreement storage agreement = agreements[agreementId];
        if (agreement.status != AgreementStatus.FUNDING) return false;
        return _allTenantsAcceptedAndFunded(agreementId, agreement);
    }

    /// @notice Full immutable claim record plus live vote counts and status.
    ///         Retrieve claims one at a time by ID (1..claimCount); there is no
    ///         unbounded all-claims call.
    function getClaim(uint256 agreementId, uint256 claimId) external view returns (Claim memory) {
        _requireAgreementView(agreementId);
        Claim memory claim = claims[agreementId][claimId];
        if (claim.status == ClaimStatus.NONE) revert InvalidClaim();
        return claim;
    }

    /// @notice A tenant's recorded vote on a claim: 0 = not voted, 1 = YES, 2 = NO.
    function getVote(
        uint256 agreementId,
        uint256 claimId,
        address tenant
    ) external view returns (uint8) {
        _requireAgreementView(agreementId);
        if (claims[agreementId][claimId].status == ClaimStatus.NONE) revert InvalidClaim();
        return votes[agreementId][claimId][tenant];
    }

    // ---------------------------------------------------------------------
    // Direct transfers
    // ---------------------------------------------------------------------

    /// @dev Funds may enter only through deposit(); plain transfers are rejected.
    receive() external payable {
        revert DirectTransferNotAllowed();
    }

    /// @dev Unknown calldata is rejected; there is no proxy or delegate behavior.
    fallback() external payable {
        revert DirectTransferNotAllowed();
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _requireAgreement(uint256 agreementId) private view returns (Agreement storage) {
        Agreement storage agreement = agreements[agreementId];
        if (agreement.status == AgreementStatus.NONE) revert InvalidAgreement();
        return agreement;
    }

    function _requireAgreementView(uint256 agreementId) private view {
        if (agreements[agreementId].status == AgreementStatus.NONE) revert InvalidAgreement();
    }

    /// @dev Activates when all acceptances and exact full funding are in place. Called
    ///      after every acceptance and deposit; the final qualifying action activates.
    ///      Bounded loop: at most MAX_TENANTS (8) iterations.
    function _checkAndActivate(uint256 agreementId, Agreement storage agreement) private {
        if (!agreement.recipientAccepted) return;
        if (!_allTenantsAcceptedAndFunded(agreementId, agreement)) return;

        agreement.status = AgreementStatus.ACTIVE;
        emit AgreementActivated(agreementId, agreement.totalFunded);
    }

    function _allTenantsAcceptedAndFunded(
        uint256 agreementId,
        Agreement storage agreement
    ) private view returns (bool) {
        if (!agreement.recipientAccepted) return false;
        address[] storage tenantList = agreementTenants[agreementId];
        for (uint256 i = 0; i < tenantList.length; i++) {
            Tenant storage tenant = tenants[agreementId][tenantList[i]];
            if (!tenant.accepted) return false;
            if (tenant.fundedAmount != tenant.requiredAmount) return false;
        }
        return true;
    }

    /// @dev Resolves a pending claim as APPROVED. Exactly one resolution path runs per
    ///      claim (status guard in every caller), so no counter can double-move:
    ///      unresolved count decreases once, the open reservation converts to an
    ///      approved total once, and the per-tenant/shared buckets update once.
    function _approveClaim(
        uint256 agreementId,
        Agreement storage agreement,
        uint256 claimId,
        Claim storage claim
    ) private {
        claim.status = ClaimStatus.APPROVED;
        agreement.unresolvedClaimCount -= 1;
        agreement.totalOpenClaimAmount -= claim.amount;
        agreement.totalApprovedClaims += claim.amount;

        if (claim.claimType == ClaimType.INDIVIDUAL) {
            Tenant storage liable = tenants[agreementId][claim.liableTenant];
            liable.openIndividualClaimAmount -= claim.amount;
            liable.approvedIndividualClaims += claim.amount;
        } else {
            agreement.sharedApprovedClaims += claim.amount;
        }

        emit ClaimApproved(agreementId, claimId, claim.amount);
    }

    /// @dev Resolves a pending claim as REJECTED, releasing its reservations without
    ///      touching approved totals. Runs at most once per claim (status guard in
    ///      every caller).
    function _rejectClaim(
        uint256 agreementId,
        Agreement storage agreement,
        uint256 claimId,
        Claim storage claim
    ) private {
        claim.status = ClaimStatus.REJECTED;
        agreement.unresolvedClaimCount -= 1;
        _releaseOpenClaimReservation(agreementId, agreement, claim);

        emit ClaimRejected(agreementId, claimId, claim.amount);
    }

    /// @dev Releases the open-claim reservation of a claim leaving PENDING without
    ///      approval (rejection or recipient withdrawal).
    function _releaseOpenClaimReservation(
        uint256 agreementId,
        Agreement storage agreement,
        Claim storage claim
    ) private {
        agreement.totalOpenClaimAmount -= claim.amount;
        if (claim.claimType == ClaimType.INDIVIDUAL) {
            tenants[agreementId][claim.liableTenant].openIndividualClaimAmount -= claim.amount;
        }
    }

    /// @dev All value leaves the contract through this helper, only ever addressed to
    ///      msg.sender of a withdrawal function. Entitlements are computed from
    ///      recorded accounting, never from address(this).balance, so forced native
    ///      transfers cannot alter anyone's withdrawable amount.
    function _sendMON(address to, uint256 amount) private {
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();
    }
}
