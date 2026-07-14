// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ForceSend
/// @notice TEST-ONLY fixture. Forces native currency into a target address via
///         `selfdestruct` in the constructor, bypassing the target's `receive()`
///         rejection. Used exclusively to prove that unsolicited MON cannot change
///         SharedDepositEscrow's recorded entitlements. The product contract itself
///         contains no selfdestruct; this fixture is never deployed to any public
///         network. (The selfdestruct deprecation warning is expected and accepted
///         for this fixture: same-transaction constructor selfdestruct still
///         force-transfers balance under current EVM rules.)
contract ForceSend {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}
