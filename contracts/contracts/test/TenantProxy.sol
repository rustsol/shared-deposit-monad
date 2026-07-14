// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SharedDepositEscrow} from "../SharedDepositEscrow.sol";

/// @title TenantProxy
/// @notice TEST-ONLY fixture. Lets a contract address act as a tenant or as the
///         deposit recipient so the test suite can exercise malicious-receiver and
///         reentrancy behavior against every SharedDepositEscrow withdrawal path.
///         Never deployed to any public network and not part of the product.
contract TenantProxy {
    enum ReceiveMode {
        ACCEPT, // receives funds normally
        REJECT, // reverts on any incoming transfer
        REENTER_FUNDING, // attempts to re-enter withdrawFundingBeforeActivation
        REENTER_CANCELLED, // attempts to re-enter withdrawCancelledFunding
        REENTER_REFUND, // attempts to re-enter withdrawTenantRefund
        REENTER_PAYOUT // attempts to re-enter withdrawRecipientPayout
    }

    SharedDepositEscrow public immutable escrow;
    ReceiveMode public mode;
    uint256 public reentryAgreementId;
    uint128 public reentryAmount;

    constructor(SharedDepositEscrow escrowAddress) {
        escrow = escrowAddress;
    }

    function setMode(ReceiveMode newMode, uint256 agreementId, uint128 amount) external {
        mode = newMode;
        reentryAgreementId = agreementId;
        reentryAmount = amount;
    }

    function acceptAsTenant(uint256 agreementId, bytes32 expectedTermsHash) external {
        escrow.acceptAsTenant(agreementId, expectedTermsHash);
    }

    function acceptAsRecipient(uint256 agreementId, bytes32 expectedTermsHash) external {
        escrow.acceptAsRecipient(agreementId, expectedTermsHash);
    }

    function deposit(uint256 agreementId) external payable {
        escrow.deposit{value: msg.value}(agreementId);
    }

    function submitClaim(
        uint256 agreementId,
        SharedDepositEscrow.ClaimType claimType,
        address liableTenant,
        uint128 amount,
        bytes32 reasonHash,
        bytes32 evidenceHash
    ) external returns (uint256) {
        return
            escrow.submitClaim(
                agreementId,
                claimType,
                liableTenant,
                amount,
                reasonHash,
                evidenceHash
            );
    }

    function withdrawFundingBeforeActivation(uint256 agreementId, uint128 amount) external {
        escrow.withdrawFundingBeforeActivation(agreementId, amount);
    }

    function withdrawCancelledFunding(uint256 agreementId) external {
        escrow.withdrawCancelledFunding(agreementId);
    }

    function withdrawTenantRefund(uint256 agreementId) external {
        escrow.withdrawTenantRefund(agreementId);
    }

    function withdrawRecipientPayout(uint256 agreementId) external {
        escrow.withdrawRecipientPayout(agreementId);
    }

    receive() external payable {
        if (mode == ReceiveMode.REJECT) {
            revert("TenantProxy: transfer rejected");
        }
        if (mode == ReceiveMode.REENTER_FUNDING) {
            escrow.withdrawFundingBeforeActivation(reentryAgreementId, reentryAmount);
        }
        if (mode == ReceiveMode.REENTER_CANCELLED) {
            escrow.withdrawCancelledFunding(reentryAgreementId);
        }
        if (mode == ReceiveMode.REENTER_REFUND) {
            escrow.withdrawTenantRefund(reentryAgreementId);
        }
        if (mode == ReceiveMode.REENTER_PAYOUT) {
            escrow.withdrawRecipientPayout(reentryAgreementId);
        }
    }
}
