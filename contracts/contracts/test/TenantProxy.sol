// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SharedDepositEscrow} from "../SharedDepositEscrow.sol";

/// @title TenantProxy
/// @notice TEST-ONLY fixture. Lets a contract address act as a tenant so the test
///         suite can exercise malicious-receiver and reentrancy behavior against
///         SharedDepositEscrow withdrawals. Never deployed to any public network and
///         not part of the product.
contract TenantProxy {
    enum ReceiveMode {
        ACCEPT, // receives funds normally
        REJECT, // reverts on any incoming transfer
        REENTER_FUNDING, // attempts to re-enter withdrawFundingBeforeActivation
        REENTER_CANCELLED // attempts to re-enter withdrawCancelledFunding
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

    function deposit(uint256 agreementId) external payable {
        escrow.deposit{value: msg.value}(agreementId);
    }

    function withdrawFundingBeforeActivation(uint256 agreementId, uint128 amount) external {
        escrow.withdrawFundingBeforeActivation(agreementId, amount);
    }

    function withdrawCancelledFunding(uint256 agreementId) external {
        escrow.withdrawCancelledFunding(agreementId);
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
    }
}
