// GENERATED FILE - do not edit by hand.
// Source: contracts/artifacts (real Hardhat compile output).
// Regenerate with: node contracts/scripts/sync-artifacts.mjs

export const sharedDepositEscrow = {
  "contractName": "SharedDepositEscrow",
  "solcLongVersion": "0.8.28+commit.7893614a",
  "optimizer": {
    "enabled": true,
    "runs": 200
  },
  "evmVersion": "prague",
  "abi": [
    {
      "inputs": [],
      "name": "AlreadyAccepted",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "AlreadyVoted",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "AlreadyWithdrawn",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ClaimExceedsAvailableDeposit",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ClaimWindowClosed",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ClaimWindowNotOpen",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "CreatorMustBeTenant",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "DirectTransferNotAllowed",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "DuplicateTenant",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "FundingDeadlineNotPassed",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "FundingDeadlinePassed",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "IndividualClaimExceedsTenantBalance",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidAddress",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidAgreement",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidAmount",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidClaim",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidStatus",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidTenantCount",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidTermsHash",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidTimeline",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "MissingEvidence",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NotParticipant",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NotRecipient",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NotTenant",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NothingToWithdraw",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "Overfunding",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "RecipientCannotBeTenant",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ReentrancyGuardReentrantCall",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "TenantNotAccepted",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "TermsMismatch",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "TooManyClaims",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "TransferFailed",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "UnresolvedClaimsRemain",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "VotingClosed",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "VotingStillOpen",
      "type": "error"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "totalFunded",
          "type": "uint128"
        }
      ],
      "name": "AgreementActivated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "creator",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "recipient",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "bytes32",
          "name": "termsHash",
          "type": "bytes32"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "totalRequired",
          "type": "uint128"
        }
      ],
      "name": "AgreementCreated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "recipientPayout",
          "type": "uint128"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "tenantRefundTotal",
          "type": "uint128"
        }
      ],
      "name": "AgreementFinalized",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "tenant",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "amount",
          "type": "uint128"
        }
      ],
      "name": "CancelledFundingWithdrawn",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "claimId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "amount",
          "type": "uint128"
        }
      ],
      "name": "ClaimApproved",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "claimId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "amount",
          "type": "uint128"
        }
      ],
      "name": "ClaimRejected",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "claimId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "enum SharedDepositEscrow.ClaimType",
          "name": "claimType",
          "type": "uint8"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "liableTenant",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "amount",
          "type": "uint128"
        },
        {
          "indexed": false,
          "internalType": "bytes32",
          "name": "reasonHash",
          "type": "bytes32"
        },
        {
          "indexed": false,
          "internalType": "bytes32",
          "name": "evidenceHash",
          "type": "bytes32"
        }
      ],
      "name": "ClaimSubmitted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "claimId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "tenant",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "bool",
          "name": "support",
          "type": "bool"
        }
      ],
      "name": "ClaimVoted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "claimId",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "amount",
          "type": "uint128"
        }
      ],
      "name": "ClaimWithdrawn",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "tenant",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "amount",
          "type": "uint128"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "tenantFunded",
          "type": "uint128"
        }
      ],
      "name": "DepositAdded",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "name": "FundingCancelled",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "tenant",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "amount",
          "type": "uint128"
        }
      ],
      "name": "FundingWithdrawn",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "recipient",
          "type": "address"
        }
      ],
      "name": "RecipientAccepted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "recipient",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "amount",
          "type": "uint128"
        }
      ],
      "name": "RecipientPayoutWithdrawn",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "tenant",
          "type": "address"
        }
      ],
      "name": "TenantAccepted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "tenant",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint128",
          "name": "amount",
          "type": "uint128"
        }
      ],
      "name": "TenantRefundWithdrawn",
      "type": "event"
    },
    {
      "stateMutability": "payable",
      "type": "fallback"
    },
    {
      "inputs": [],
      "name": "MAX_CLAIMS",
      "outputs": [
        {
          "internalType": "uint32",
          "name": "",
          "type": "uint32"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAX_TENANTS",
      "outputs": [
        {
          "internalType": "uint16",
          "name": "",
          "type": "uint16"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MIN_TENANTS",
      "outputs": [
        {
          "internalType": "uint16",
          "name": "",
          "type": "uint16"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "internalType": "bytes32",
          "name": "expectedTermsHash",
          "type": "bytes32"
        }
      ],
      "name": "acceptAsRecipient",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "internalType": "bytes32",
          "name": "expectedTermsHash",
          "type": "bytes32"
        }
      ],
      "name": "acceptAsTenant",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "name": "cancelExpiredFunding",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "recipient",
          "type": "address"
        },
        {
          "internalType": "bytes32",
          "name": "termsHash",
          "type": "bytes32"
        },
        {
          "internalType": "uint64",
          "name": "leaseStart",
          "type": "uint64"
        },
        {
          "internalType": "uint64",
          "name": "leaseEnd",
          "type": "uint64"
        },
        {
          "internalType": "uint64",
          "name": "fundingDeadline",
          "type": "uint64"
        },
        {
          "internalType": "uint64",
          "name": "claimDeadline",
          "type": "uint64"
        },
        {
          "internalType": "uint64",
          "name": "settlementDeadline",
          "type": "uint64"
        },
        {
          "internalType": "address[]",
          "name": "tenantAddresses",
          "type": "address[]"
        },
        {
          "internalType": "uint128[]",
          "name": "requiredAmounts",
          "type": "uint128[]"
        }
      ],
      "name": "createAgreement",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "name": "deposit",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "name": "finalizeAgreement",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "claimId",
          "type": "uint256"
        }
      ],
      "name": "finalizePendingClaim",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "name": "getAgreement",
      "outputs": [
        {
          "components": [
            {
              "internalType": "address",
              "name": "creator",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "recipient",
              "type": "address"
            },
            {
              "internalType": "bytes32",
              "name": "termsHash",
              "type": "bytes32"
            },
            {
              "internalType": "uint64",
              "name": "leaseStart",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "leaseEnd",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "fundingDeadline",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "claimDeadline",
              "type": "uint64"
            },
            {
              "internalType": "uint64",
              "name": "settlementDeadline",
              "type": "uint64"
            },
            {
              "internalType": "uint16",
              "name": "tenantCount",
              "type": "uint16"
            },
            {
              "internalType": "uint16",
              "name": "requiredApprovals",
              "type": "uint16"
            },
            {
              "internalType": "uint32",
              "name": "claimCount",
              "type": "uint32"
            },
            {
              "internalType": "uint32",
              "name": "unresolvedClaimCount",
              "type": "uint32"
            },
            {
              "internalType": "uint128",
              "name": "totalRequired",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "totalFunded",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "totalCancelledFundingWithdrawn",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "totalOpenClaimAmount",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "totalApprovedClaims",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "sharedApprovedClaims",
              "type": "uint128"
            },
            {
              "internalType": "bool",
              "name": "recipientAccepted",
              "type": "bool"
            },
            {
              "internalType": "bool",
              "name": "recipientPayoutWithdrawn",
              "type": "bool"
            },
            {
              "internalType": "enum SharedDepositEscrow.AgreementStatus",
              "name": "status",
              "type": "uint8"
            }
          ],
          "internalType": "struct SharedDepositEscrow.Agreement",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "name": "getAgreementTenants",
      "outputs": [
        {
          "internalType": "address[]",
          "name": "",
          "type": "address[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "claimId",
          "type": "uint256"
        }
      ],
      "name": "getClaim",
      "outputs": [
        {
          "components": [
            {
              "internalType": "address",
              "name": "liableTenant",
              "type": "address"
            },
            {
              "internalType": "bytes32",
              "name": "reasonHash",
              "type": "bytes32"
            },
            {
              "internalType": "bytes32",
              "name": "evidenceHash",
              "type": "bytes32"
            },
            {
              "internalType": "uint128",
              "name": "amount",
              "type": "uint128"
            },
            {
              "internalType": "uint16",
              "name": "yesVotes",
              "type": "uint16"
            },
            {
              "internalType": "uint16",
              "name": "noVotes",
              "type": "uint16"
            },
            {
              "internalType": "enum SharedDepositEscrow.ClaimType",
              "name": "claimType",
              "type": "uint8"
            },
            {
              "internalType": "enum SharedDepositEscrow.ClaimStatus",
              "name": "status",
              "type": "uint8"
            }
          ],
          "internalType": "struct SharedDepositEscrow.Claim",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "name": "getRecipientPayout",
      "outputs": [
        {
          "internalType": "uint128",
          "name": "",
          "type": "uint128"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "tenant",
          "type": "address"
        }
      ],
      "name": "getRemainingContribution",
      "outputs": [
        {
          "internalType": "uint128",
          "name": "",
          "type": "uint128"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "tenant",
          "type": "address"
        }
      ],
      "name": "getTenant",
      "outputs": [
        {
          "components": [
            {
              "internalType": "uint128",
              "name": "requiredAmount",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "fundedAmount",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "openIndividualClaimAmount",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "approvedIndividualClaims",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "refundAmount",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "cancelledFundingWithdrawnAmount",
              "type": "uint128"
            },
            {
              "internalType": "uint16",
              "name": "index",
              "type": "uint16"
            },
            {
              "internalType": "bool",
              "name": "exists",
              "type": "bool"
            },
            {
              "internalType": "bool",
              "name": "accepted",
              "type": "bool"
            },
            {
              "internalType": "bool",
              "name": "cancelledFundingWithdrawn",
              "type": "bool"
            },
            {
              "internalType": "bool",
              "name": "refundWithdrawn",
              "type": "bool"
            }
          ],
          "internalType": "struct SharedDepositEscrow.Tenant",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "claimId",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "tenant",
          "type": "address"
        }
      ],
      "name": "getVote",
      "outputs": [
        {
          "internalType": "uint8",
          "name": "",
          "type": "uint8"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "name": "isAgreementReady",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "nextAgreementId",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "internalType": "enum SharedDepositEscrow.ClaimType",
          "name": "claimType",
          "type": "uint8"
        },
        {
          "internalType": "address",
          "name": "liableTenant",
          "type": "address"
        },
        {
          "internalType": "uint128",
          "name": "amount",
          "type": "uint128"
        },
        {
          "internalType": "bytes32",
          "name": "reasonHash",
          "type": "bytes32"
        },
        {
          "internalType": "bytes32",
          "name": "evidenceHash",
          "type": "bytes32"
        }
      ],
      "name": "submitClaim",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "claimId",
          "type": "uint256"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "claimId",
          "type": "uint256"
        },
        {
          "internalType": "bool",
          "name": "support",
          "type": "bool"
        }
      ],
      "name": "voteClaim",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "name": "withdrawCancelledFunding",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "internalType": "uint128",
          "name": "amount",
          "type": "uint128"
        }
      ],
      "name": "withdrawFundingBeforeActivation",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "claimId",
          "type": "uint256"
        }
      ],
      "name": "withdrawPendingClaim",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "name": "withdrawRecipientPayout",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agreementId",
          "type": "uint256"
        }
      ],
      "name": "withdrawTenantRefund",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "stateMutability": "payable",
      "type": "receive"
    }
  ],
  "bytecode": "0x608060405260015f553480156012575f5ffd5b5060017f9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f0055613fd4806100445f395ff3fe608060405260043610610184575f3560e01c80639744742b116100d0578063b88fd50c11610089578063cf2a8f9b11610063578063cf2a8f9b146104dd578063cf62ba92146104f1578063e68bbeef1461051a578063f45f6a1114610539576101a2565b8063b88fd50c1461047b578063c839b4b01461049a578063c9b99dab146104c9576101a2565b80639744742b146103b8578063a06824b7146103d7578063b14401e4146103f6578063b1f477011461041d578063b6b55f251461043c578063b828a0f61461044f576101a2565b80634f9f6fe61161013d57806372a180ea1161011757806372a180ea1461032e5780638b0acd621461035b5780638dd6afb41461037a5780639462113814610399576101a2565b80634f9f6fe61461029f57806366470358146102cb5780636d4168e6146102f7576101a2565b80631f3aee3b146101bb5780631f64c168146101dc57806327b64389146101fb578063412459fa1461021a578063427a2fc2146102395780634f2b42341461026e576101a2565b366101a257604051633ee6509d60e01b815260040160405180910390fd5b604051633ee6509d60e01b815260040160405180910390fd5b3480156101c6575f5ffd5b506101da6101d5366004613702565b610558565b005b3480156101e7575f5ffd5b506101da6101f6366004613722565b610699565b348015610206575f5ffd5b506101da610215366004613702565b610816565b348015610225575f5ffd5b506101da610234366004613722565b61098b565b348015610244575f5ffd5b50610258610253366004613702565b610aa7565b6040516102659190613771565b60405180910390f35b348015610279575f5ffd5b5061028d610288366004613816565b610c20565b60405160ff9091168152602001610265565b3480156102aa575f5ffd5b506102be6102b9366004613722565b610cb4565b6040516102659190613848565b3480156102d6575f5ffd5b506102ea6102e5366004613722565b610f11565b6040516102659190613a58565b348015610302575f5ffd5b50610316610311366004613722565b610f83565b6040516001600160801b039091168152602001610265565b348015610339575f5ffd5b5061034d610348366004613b00565b610fe1565b604051908152602001610265565b348015610366575f5ffd5b506101da610375366004613702565b6113a6565b348015610385575f5ffd5b506101da610394366004613722565b611526565b3480156103a4575f5ffd5b506101da6103b3366004613bdc565b6116d7565b3480156103c3575f5ffd5b506101da6103d2366004613722565b6119cd565b3480156103e2575f5ffd5b506101da6103f1366004613702565b611ae8565b348015610401575f5ffd5b5061040a600281565b60405161ffff9091168152602001610265565b348015610428575f5ffd5b506101da610437366004613c2c565b611c47565b6101da61044a366004613722565b611e37565b34801561045a575f5ffd5b5061046e610469366004613c56565b612075565b6040516102659190613c77565b348015610486575f5ffd5b5061034d610495366004613d7b565b6121c7565b3480156104a5575f5ffd5b506104b96104b4366004613722565b61268a565b6040519015158152602001610265565b3480156104d4575f5ffd5b5061034d5f5481565b3480156104e8575f5ffd5b5061040a600881565b3480156104fc575f5ffd5b50610505602081565b60405163ffffffff9091168152602001610265565b348015610525575f5ffd5b506101da610534366004613722565b6126d0565b348015610544575f5ffd5b50610316610553366004613c56565b612826565b5f610562836128a2565b90506001600882015462010000900460ff16600481111561058557610585613739565b146105a3576040516307a92f1960e51b815260040160405180910390fd5b6003810154600160801b90046001600160401b03164211156105d85760405163c4ec394160e01b815260040160405180910390fd5b60018101546001600160a01b031633146106055760405163586d335760e01b815260040160405180910390fd5b600881015460ff161561062b576040516306aa019360e21b815260040160405180910390fd5b8060020154821461064f576040516361784c7d60e11b815260040160405180910390fd5b60088101805460ff19166001179055604051339084907f94c709d66476b828da20385feeb3568d8da65dc2437b6870ab749d9e228cbcff905f90a361069483826128cf565b505050565b6106a1612952565b5f6106ab826128a2565b90506003600882015462010000900460ff1660048111156106ce576106ce613739565b146106ec576040516307a92f1960e51b815260040160405180910390fd5b5f8281526003602081815260408084203385529091529091209081015462010000900460ff1661072f576040516394484cb360e01b815260040160405180910390fd5b600381015465010000000000900460ff161561075e57604051636507689f60e01b815260040160405180910390fd5b60028101546001600160801b03165f81900361078d57604051630686827b60e51b815260040160405180910390fd5b60038201805465ff00000000001916650100000000001790556040516001600160801b0382168152339085907f3e7527301899702eaaa596676c91e65b441a44e3d0899426e21b6e6a8471fb77906020015b60405180910390a36107fa33826001600160801b031661296d565b50505061081360015f516020613f7f5f395f51905f5255565b50565b5f610820836128a2565b90506002600882015462010000900460ff16600481111561084357610843613739565b14610861576040516307a92f1960e51b815260040160405180910390fd5b60048101546001600160401b0316421161088e576040516388c081c760e01b815260040160405180910390fd5b5f838152600360208181526040808420338552909152909120015462010000900460ff161580156108cc575060018101546001600160a01b03163314155b156108ea5760405163721c7c6760e11b815260040160405180910390fd5b5f838152600460209081526040808320858452909152902060016003820154600160a81b900460ff16600481111561092457610924613739565b1461094257604051633b4f091f60e21b815260040160405180910390fd5b60048201546003820154600160501b90910461ffff908116600160801b909204161061097957610974848385846129dd565b610985565b61098584838584612c4e565b50505050565b5f610995826128a2565b90506001600882015462010000900460ff1660048111156109b8576109b8613739565b146109d6576040516307a92f1960e51b815260040160405180910390fd5b6003810154600160801b90046001600160401b03164211610a0a57604051631da98d7560e01b815260040160405180910390fd5b5f828152600360208181526040808420338552909152909120015462010000900460ff16158015610a48575060018101546001600160a01b03163314155b15610a665760405163721c7c6760e11b815260040160405180910390fd5b60088101805462ff000019166204000017905560405182907f85c4c0ac23e43ccf9574b409e27645142db85cd2b3917ca03a0bb56b573a9fc1905f90a25050565b610aec60408051610100810182525f80825260208201819052918101829052606081018290526080810182905260a081018290529060c082019081526020015f905290565b610af583612cf4565b5f838152600460209081526040808320858452825280832081516101008101835281546001600160a01b031681526001808301549482019490945260028201549281019290925260038101546001600160801b0381166060840152600160801b810461ffff9081166080850152600160901b82041660a08401529192909160c0840191600160a01b90910460ff1690811115610b9357610b93613739565b6001811115610ba457610ba4613739565b81526020016003820160159054906101000a900460ff166004811115610bcc57610bcc613739565b6004811115610bdd57610bdd613739565b90525090505f8160e001516004811115610bf957610bf9613739565b03610c1757604051633b4f091f60e21b815260040160405180910390fd5b90505b92915050565b5f610c2a84612cf4565b5f848152600460208181526040808420878552909152822060030154600160a81b900460ff1690811115610c6057610c60613739565b03610c7e57604051633b4f091f60e21b815260040160405180910390fd5b505f83815260056020908152604080832085845282528083206001600160a01b038516845290915290205460ff165b9392505050565b610d60604080516102a0810182525f80825260208201819052918101829052606081018290526080810182905260a0810182905260c0810182905260e08101829052610100810182905261012081018290526101408101829052610160810182905261018081018290526101a081018290526101c081018290526101e0810182905261020081018290526102208101829052610240810182905261026081018290529061028082015290565b5f82815260016020818152604080842081516102a08101835281546001600160a01b039081168252948201549094169284019290925260028201549083015260038101546001600160401b038082166060850152600160401b80830482166080860152600160801b808404831660a0870152600160c01b909304821660c086015260048085015492831660e087015261ffff918304821661010080880191909152600160501b840490921661012087015263ffffffff600160601b840481166101408801529284900490921661016086015260058401546001600160801b038082166101808801529084900481166101a087015260068501548082166101c088015284900481166101e0870152600785015480821661020088015293909304909216610220850152600883015460ff808216151561024087015292810483161515610260860152610280850192620100009091041690811115610ec557610ec5613739565b6004811115610ed657610ed6613739565b90525090505f8161028001516004811115610ef357610ef3613739565b03610c1a57604051637f0ed44d60e11b815260040160405180910390fd5b6060610f1c82612cf4565b5f8281526002602090815260409182902080548351818402810184019094528084529091830182828015610f7757602002820191905f5260205f20905b81546001600160a01b03168152600190910190602001808311610f59575b50505050509050919050565b5f81815260016020526040812081600882015462010000900460ff166004811115610fb057610fb0613739565b03610fce57604051637f0ed44d60e11b815260040160405180910390fd5b600701546001600160801b031692915050565b5f6001600160a01b038c166110095760405163e6c4247b60e01b815260040160405180910390fd5b8a611027576040516392a3c43160e01b815260040160405180910390fd5b83821461104757604051630e6751f960e21b815260040160405180910390fd5b60028410806110565750600884115b1561107457604051630e6751f960e21b815260040160405180910390fd5b42886001600160401b03161161109d57604051637063c71f60e11b815260040160405180910390fd5b886001600160401b03168a6001600160401b031611156110d057604051637063c71f60e11b815260040160405180910390fd5b886001600160401b0316886001600160401b0316111561110357604051637063c71f60e11b815260040160405180910390fd5b886001600160401b0316876001600160401b03161161113557604051637063c71f60e11b815260040160405180910390fd5b866001600160401b0316866001600160401b03161161116757604051637063c71f60e11b815260040160405180910390fd5b5f549050806001015f819055505f60015f8381526020019081526020015f20905033815f015f6101000a8154816001600160a01b0302191690836001600160a01b031602179055508c816001015f6101000a8154816001600160a01b0302191690836001600160a01b031602179055508b81600201819055508a816003015f6101000a8154816001600160401b0302191690836001600160401b03160217905550898160030160086101000a8154816001600160401b0302191690836001600160401b03160217905550888160030160106101000a8154816001600160401b0302191690836001600160401b03160217905550878160030160186101000a8154816001600160401b0302191690836001600160401b0316021790555086816004015f6101000a8154816001600160401b0302191690836001600160401b03160217905550858590508160040160086101000a81548161ffff021916908361ffff1602179055506002868690506112dd9190613e03565b6112e8906001613e22565b60048201805461ffff92909216600160501b0261ffff60501b1990921691909117905560088101805462ff000019166201000017905561132c828e88888888612d3e565b6005820180546001600160801b0319166001600160801b03929092169182179055604080518e815260208101929092526001600160a01b038f1691339185917f9b0461ecfe5046f4cfc1c49a87ff0edfb7c4a932c90223643f164363f0eeb929910160405180910390a4509b9a5050505050505050505050565b5f6113b0836128a2565b90506002600882015462010000900460ff1660048111156113d3576113d3613739565b146113f1576040516307a92f1960e51b815260040160405180910390fd5b60018101546001600160a01b0316331461141e5760405163586d335760e01b815260040160405180910390fd5b5f838152600460209081526040808320858452909152902060016003820154600160a81b900460ff16600481111561145857611458613739565b1461147657604051633b4f091f60e21b815260040160405180910390fd5b60038101805460ff60a81b1916600160aa1b179055600482018054600191906010906114b0908490600160801b900463ffffffff16613e3c565b92506101000a81548163ffffffff021916908363ffffffff1602179055506114d9848383612f7b565b60038101546040516001600160801b039091168152839085907f5435271388555e2377f38c9dad3ef6c3fe6b895da582647455e54e6ddc9e36e6906020015b60405180910390a350505050565b61152e612952565b5f611538826128a2565b90506004600882015462010000900460ff16600481111561155b5761155b613739565b14611579576040516307a92f1960e51b815260040160405180910390fd5b5f8281526003602081815260408084203385529091529091209081015462010000900460ff166115bc576040516394484cb360e01b815260040160405180910390fd5b6003810154640100000000900460ff16156115ea57604051636507689f60e01b815260040160405180910390fd5b8054600160801b90046001600160801b03165f81900361161d57604051630686827b60e51b815260040160405180910390fd5b60038201805464010000000064ff00000000199091161790556002820180546001600160801b03908116600160801b848316021790915560068401805483925f9161166a91859116613e58565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550336001600160a01b0316847f03af746e29da1d465675339e956c5b9b6988197b76038abca43cd342f8ba1502836040516107df91906001600160801b0391909116815260200190565b5f6116e1846128a2565b90506002600882015462010000900460ff16600481111561170457611704613739565b14611722576040516307a92f1960e51b815260040160405180910390fd5b60048101546001600160401b03164211156117505760405163335b65a560e11b815260040160405180910390fd5b5f8481526003602081815260408084203385529091529091209081015462010000900460ff16611793576040516394484cb360e01b815260040160405180910390fd5b5f858152600460209081526040808320878452909152902060016003820154600160a81b900460ff1660048111156117cd576117cd613739565b146117eb57604051633b4f091f60e21b815260040160405180910390fd5b5f868152600560209081526040808320888452825280832033845290915290205460ff161561182d57604051637c9a1cf960e01b815260040160405180910390fd5b8361183957600261183c565b60015b5f87815260056020908152604080832089845282528083203384529091529020805460ff191660ff9290921691909117905583156118b55760018160030160108282829054906101000a900461ffff166118969190613e22565b92506101000a81548161ffff021916908361ffff1602179055506118f2565b60018160030160128282829054906101000a900461ffff166118d79190613e22565b92506101000a81548161ffff021916908361ffff1602179055505b336001600160a01b031685877fea498045c56d0bd317fccdf38b00bb19baa61dedafd56d3364cff25f9f1e299b87604051611931911515815260200190565b60405180910390a460048301546003820154600160501b90910461ffff908116600160801b90920416106119705761196b868487846129dd565b6119c5565b60048301546119939061ffff600160501b8204811691600160401b900416613e77565b61199e906001613e22565b600382015461ffff918216600160901b909104909116106119c5576119c586848784612c4e565b505050505050565b5f6119d7826128a2565b90506002600882015462010000900460ff1660048111156119fa576119fa613739565b14611a18576040516307a92f1960e51b815260040160405180910390fd5b60048101546001600160401b03164211611a45576040516388c081c760e01b815260040160405180910390fd5b6004810154600160801b900463ffffffff1615611a7557604051630316cdf360e11b815260040160405180910390fd5b5f611a808383613072565b6008830180546203000062ff0000199091161790556007830154604080516001600160801b039283168152918316602083015291925084917fa016668dfb48b31468ae8a35fad8918516fa761314b1420a25dccb810c4b9a50910160405180910390a2505050565b5f611af2836128a2565b90506001600882015462010000900460ff166004811115611b1557611b15613739565b14611b33576040516307a92f1960e51b815260040160405180910390fd5b6003810154600160801b90046001600160401b0316421115611b685760405163c4ec394160e01b815260040160405180910390fd5b5f8381526003602081815260408084203385529091529091209081015462010000900460ff16611bab576040516394484cb360e01b815260040160405180910390fd5b60038101546301000000900460ff1615611bd8576040516306aa019360e21b815260040160405180910390fd5b81600201548314611bfc576040516361784c7d60e11b815260040160405180910390fd5b60038101805463ff00000019166301000000179055604051339085907f4a32210ff9e307956563cb678bbba46cc253e0729a80fad530d84f054ced15c2905f90a361098584836128cf565b611c4f612952565b5f611c59836128a2565b90506001600882015462010000900460ff166004811115611c7c57611c7c613739565b14611c9a576040516307a92f1960e51b815260040160405180910390fd5b5f8381526003602081815260408084203385529091529091209081015462010000900460ff16611cdd576040516394484cb360e01b815260040160405180910390fd5b6001600160801b0383161580611d07575080546001600160801b03600160801b9091048116908416115b15611d255760405163162908e360e11b815260040160405180910390fd5b805483908290601090611d49908490600160801b90046001600160801b0316613e91565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550828260050160108282829054906101000a90046001600160801b0316611d939190613e91565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550336001600160a01b0316847f72f705c814d5ba20f8444a5ea01e059de9c2a59d5d882d20a4f3e7720e22aa1985604051611e0091906001600160801b0391909116815260200190565b60405180910390a3611e1b33846001600160801b031661296d565b5050611e3360015f516020613f7f5f395f51905f5255565b5050565b5f611e41826128a2565b90506001600882015462010000900460ff166004811115611e6457611e64613739565b14611e82576040516307a92f1960e51b815260040160405180910390fd5b6003810154600160801b90046001600160401b0316421115611eb75760405163c4ec394160e01b815260040160405180910390fd5b5f8281526003602081815260408084203385529091529091209081015462010000900460ff16611efa576040516394484cb360e01b815260040160405180910390fd5b60038101546301000000900460ff16611f2657604051637362875560e11b815260040160405180910390fd5b345f03611f465760405163162908e360e11b815260040160405180910390fd5b80545f90611f66906001600160801b03600160801b820481169116613eb0565b905080341115611f8957604051636d0d16c560e11b815260040160405180910390fd5b8154349081908490601090611faf908490600160801b90046001600160801b0316613e58565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550808460050160108282829054906101000a90046001600160801b0316611ff99190613e58565b82546101009290920a6001600160801b038181021990931691831602179091558454604080518584168152600160801b909204909216602082015233925087917ffb46e6ccae6e539e28b46d13b924d86372e2b730cee0d0be9d83e39f93b639cc910160405180910390a361206e85856128cf565b5050505050565b60408051610160810182525f80825260208201819052918101829052606081018290526080810182905260a0810182905260c0810182905260e08101829052610100810182905261012081018290526101408101919091526120d683612cf4565b5f8381526003602081815260408084206001600160a01b038716855282529283902083516101608101855281546001600160801b038082168352600160801b918290048116948301949094526001830154808516968301969096529485900483166060820152600282015480841660808301529490940490911660a0840152015461ffff811660c083015260ff6201000082048116151560e08401819052630100000083048216151561010085015264010000000083048216151561012085015265010000000000909204161515610140830152610c17576040516394484cb360e01b815260040160405180910390fd5b5f5f6121d2886128a2565b90506002600882015462010000900460ff1660048111156121f5576121f5613739565b14612213576040516307a92f1960e51b815260040160405180910390fd5b60018101546001600160a01b031633146122405760405163586d335760e01b815260040160405180910390fd5b6003810154600160401b90046001600160401b0316421015612275576040516309ca1d3560e11b815260040160405180910390fd5b6003810154600160c01b90046001600160401b03164211156122aa5760405163f0f25a3360e01b815260040160405180910390fd5b60048101546020600160601b90910463ffffffff16106122dd57604051638eb57d2760e01b815260040160405180910390fd5b846001600160801b03165f036123065760405163162908e360e11b815260040160405180910390fd5b831580612311575082155b1561232f5760405163ea8acc1f60e01b815260040160405180910390fd5b6005810154600782015460068301546001600160801b03600160801b9384900481169389821693612367939083169291900416613ec3565b6123719190613ec3565b1115612390576040516306d2f9d160e51b815260040160405180910390fd5b5f8760018111156123a3576123a3613739565b036123d5576001600160a01b038616156123d057604051633b4f091f60e21b815260040160405180910390fd5b6124be565b5f8881526003602081815260408084206001600160a01b038b1685529091529091209081015462010000900460ff1661242157604051633b4f091f60e21b815260040160405180910390fd5b805460018201546001600160801b03600160801b92839004811692898216926124509291810482169116613ec3565b61245a9190613ec3565b1115612479576040516347cc8cb360e11b815260040160405180910390fd5b6001810180548791905f906124989084906001600160801b0316613e58565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550505b60048101546124db90600160601b900463ffffffff166001613ec3565b60048201805463ffffffff808416600160601b0263ffffffff60601b199092169190911780835592945060019260109161251f918591600160801b90910416613ed6565b92506101000a81548163ffffffff021916908363ffffffff160217905550848160060160108282829054906101000a90046001600160801b03166125639190613e58565b82546101009290920a6001600160801b038181021990931691831602179091555f8a8152600460209081526040808320878452909152902080546001600160a01b0319166001600160a01b038a161781556001818101889055600282018790556003820180546001600160801b03198116948b1694851782559294508b93909274ff00000000ffffffffffffffffffffffffffffffff19161790600160a01b90849081111561261457612614613739565b02179055506003810180546001919060ff60a81b1916600160a81b830217905550866001600160a01b0316838a7f4a3d363d14b4e4079fbf30c6f61e95522d30a8d6ea9b967f7a53aa5069034a218b8a8a8a6040516126769493929190613ef2565b60405180910390a450509695505050505050565b5f818152600160208190526040822090600882015462010000900460ff1660048111156126b9576126b9613739565b146126c657505f92915050565b610cad8382613525565b6126d8612952565b5f6126e2826128a2565b90506003600882015462010000900460ff16600481111561270557612705613739565b14612723576040516307a92f1960e51b815260040160405180910390fd5b60018101546001600160a01b031633146127505760405163586d335760e01b815260040160405180910390fd5b6008810154610100900460ff161561277b57604051636507689f60e01b815260040160405180910390fd5b60078101546001600160801b03165f8190036127aa57604051630686827b60e51b815260040160405180910390fd5b60088201805461ff0019166101001790556040516001600160801b0382168152339084907f992c3349b2298e6ceca1b22431a9f05d3e494d78fad75c620df8fb4bf9f661269060200160405180910390a361280e33826001600160801b031661296d565b505061081360015f516020613f7f5f395f51905f5255565b5f61283083612cf4565b5f8381526003602081815260408084206001600160a01b03871685529091529091209081015462010000900460ff1661287c576040516394484cb360e01b815260040160405180910390fd5b805461289a906001600160801b03600160801b820481169116613e91565b949350505050565b5f81815260016020526040812081600882015462010000900460ff166004811115610ef357610ef3613739565b600881015460ff166128df575050565b6128e98282613525565b6128f1575050565b60088101805462ff0000191662020000179055600581015460408051600160801b9092046001600160801b031682525183917f836194798b969a3eef8631422e48b27d1423783f2ef62ffaacb4a5637bfcd727919081900360200190a25050565b61295a6135f4565b60025f516020613f7f5f395f51905f5255565b5f826001600160a01b0316826040515f6040518083038185875af1925050503d805f81146129b6576040519150601f19603f3d011682016040523d82523d5f602084013e6129bb565b606091505b5050905080610694576040516312171d8360e31b815260040160405180910390fd5b60038101805460ff60a81b1916600160a91b17905560048301805460019190601090612a17908490600160801b900463ffffffff16613e3c565b825463ffffffff9182166101009390930a92830291909202199091161790555060038101546006840180546001600160801b0392831692601091612a64918591600160801b900416613e91565b82546101009290920a6001600160801b0381810219909316918316021790915560038301546007860180549183169350915f91612aa391859116613e58565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550600180811115612ad957612ad9613739565b6003820154600160a01b900460ff166001811115612af957612af9613739565b03612bb9575f84815260036020818152604080842085546001600160a01b0316855290915282209083015460018201805492936001600160801b039283169391929091612b4891859116613e91565b82546101009290920a6001600160801b038181021990931691831602179091556003840154600184018054918316935091601091612b8f918591600160801b900416613e58565b92506101000a8154816001600160801b0302191690836001600160801b0316021790555050612c0b565b60038101546007840180546001600160801b0392831692601091612be6918591600160801b900416613e58565b92506101000a8154816001600160801b0302191690836001600160801b031602179055505b60038101546040516001600160801b039091168152829085907feec457516c5397fa2d4d4e2835ac683a039643e3d8ad1ebaec6a63b75ebd5eb490602001611518565b60038101805460ff60a81b1916600360a81b17905560048301805460019190601090612c88908490600160801b900463ffffffff16613e3c565b92506101000a81548163ffffffff021916908363ffffffff160217905550612cb1848483612f7b565b60038101546040516001600160801b039091168152829085907f666925b8d406fe5d0c7d5390adfb4841653bc34f6addb74d141107550cdc4d5c90602001611518565b5f5f8281526001602052604090206008015462010000900460ff166004811115612d2057612d20613739565b0361081357604051637f0ed44d60e11b815260040160405180910390fd5b5f8080805b86811015612f28575f888883818110612d5e57612d5e613f24565b9050602002016020810190612d739190613f38565b90506001600160a01b038116612d9c5760405163e6c4247b60e01b815260040160405180910390fd5b896001600160a01b0316816001600160a01b031603612dce5760405163895f1b4b60e01b815260040160405180910390fd5b5f8b81526003602081815260408084206001600160a01b0386168552909152909120015462010000900460ff1615612e19576040516304cc939360e51b815260040160405180910390fd5b5f878784818110612e2c57612e2c613f24565b9050602002016020810190612e419190613f51565b9050806001600160801b03165f03612e6c5760405163162908e360e11b815260040160405180910390fd5b336001600160a01b03831603612e8157600194505b612e946001600160801b03821685613ec3565b5f8d81526003602081815260408084206001600160a01b0390971680855296825280842080546001600160801b039097166001600160801b031990971696909617865594909101805462ffffff191661ffff881617620100001790558e8252600281529281208054600181810183559183529390912090920180546001600160a01b03191690931790925590925001612d43565b5081612f4757604051631ae2acdd60e21b815260040160405180910390fd5b6001600160801b03811115612f6f5760405163162908e360e11b815260040160405180910390fd5b98975050505050505050565b60038101546006830180546001600160801b0392831692601091612fa8918591600160801b900416613e91565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550600180811115612fde57612fde613739565b6003820154600160a01b900460ff166001811115612ffe57612ffe613739565b03610694576003808201545f8581526020928352604080822085546001600160a01b0316835290935291822060010180546001600160801b0392831693919261304991859116613e91565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550505050565b5f828152600260205260408120805482816001600160401b0381111561309a5761309a613f6a565b6040519080825280602002602001820160405280156130c3578160200160208202803683370190505b5090505f805b83811015613190575f888152600360205260408120865482908890859081106130f4576130f4613f24565b5f9182526020808320909101546001600160a01b03168352820192909252604001902060018101548154919250613142916001600160801b03600160801b9283900481169290910416613eb0565b84838151811061315457613154613f24565b60200260200101818152505083828151811061317257613172613f24565b6020026020010151836131859190613ec3565b9250506001016130c9565b506007860154600160801b90046001600160801b0316818111156131c75760405163162908e360e11b815260040160405180910390fd5b5f846001600160401b038111156131e0576131e0613f6a565b604051908082528060200260200182016040528015613209578160200160208202803683370190505b509050811561344b575f856001600160401b0381111561322b5761322b613f6a565b604051908082528060200260200182016040528015613254578160200160208202803683370190505b5090505f805b8781101561331b576132868588838151811061327857613278613f24565b602002602001015188613625565b84828151811061329857613298613f24565b60200260200101818152505085806132b2576132b2613ddb565b8782815181106132c4576132c4613f24565b602002602001015186098382815181106132e0576132e0613f24565b6020026020010181815250508381815181106132fe576132fe613f24565b6020026020010151826133119190613ec3565b915060010161325a565b505f6133278286613eb0565b90505f5b81811015613446575f195f805b8b8110156133ce578a818151811061335257613352613f24565b602002602001015188828151811061336c5761336c613f24565b602002602001015110156133c6575f198314806133a157508187828151811061339757613397613f24565b6020026020010151115b156133c6578092508681815181106133bb576133bb613f24565b602002602001015191505b600101613338565b505f1982036133f05760405163162908e360e11b815260040160405180910390fd5b600187838151811061340457613404613f24565b602002602001018181516134189190613ec3565b90525085515f9087908490811061343157613431613f24565b6020908102919091010152505060010161332b565b505050505b5f5b85811015613518575f82828151811061346857613468613f24565b602002602001015186838151811061348257613482613f24565b60200260200101516134949190613eb0565b5f8c81526003602052604081208a5492935083928392908c90879081106134bd576134bd613f24565b5f918252602080832091909101546001600160a01b03168352820192909252604001902060020180546001600160801b0319166001600160801b039290921691909117905561350c818b613e58565b9950505060010161344d565b5050505050505092915050565b60088101545f9060ff1661353a57505f610c1a565b5f838152600260205260408120905b81548110156135e9575f8581526003602052604081208354829085908590811061357557613575613f24565b5f9182526020808320909101546001600160a01b031683528201929092526040019020600381015490915060ff6301000000909104166135ba575f9350505050610c1a565b8054600160801b81046001600160801b039081169116146135e0575f9350505050610c1a565b50600101613549565b506001949350505050565b5f516020613f7f5f395f51905f525460020361362357604051633ee5aeb560e01b815260040160405180910390fd5b565b5f5f5f61363286866136d5565b91509150815f036136565783818161364c5761364c613ddb565b0492505050610cad565b81841161366d5761366d60038515026011186136f1565b5f848688095f868103871696879004966002600389028118808a02820302808a02820302808a02820302808a02820302808a02820302808a02909103029181900381900460010185841190960395909502919093039390930492909217029150509392505050565b5f805f1983850993909202808410938190039390930393915050565b634e487b715f52806020526024601cfd5b5f5f60408385031215613713575f5ffd5b50508035926020909101359150565b5f60208284031215613732575f5ffd5b5035919050565b634e487b7160e01b5f52602160045260245ffd5b6002811061375d5761375d613739565b9052565b6005811061375d5761375d613739565b81516001600160a01b0316815260208083015190820152604080830151908201526060808301516001600160801b03169082015260808083015161ffff169082015260a0828101516101008301916137ce9084018261ffff169052565b5060c08301516137e160c084018261374d565b5060e08301516137f460e0840182613761565b5092915050565b80356001600160a01b0381168114613811575f5ffd5b919050565b5f5f5f60608486031215613828575f5ffd5b833592506020840135915061383f604085016137fb565b90509250925092565b81516001600160a01b031681526102a08101602083015161387460208401826001600160a01b03169052565b5060408301516040830152606083015161389960608401826001600160401b03169052565b5060808301516138b460808401826001600160401b03169052565b5060a08301516138cf60a08401826001600160401b03169052565b5060c08301516138ea60c08401826001600160401b03169052565b5060e083015161390560e08401826001600160401b03169052565b5061010083015161391d61010084018261ffff169052565b5061012083015161393561012084018261ffff169052565b5061014083015161394f61014084018263ffffffff169052565b5061016083015161396961016084018263ffffffff169052565b506101808301516139866101808401826001600160801b03169052565b506101a08301516139a36101a08401826001600160801b03169052565b506101c08301516139c06101c08401826001600160801b03169052565b506101e08301516139dd6101e08401826001600160801b03169052565b506102008301516139fa6102008401826001600160801b03169052565b50610220830151613a176102208401826001600160801b03169052565b50610240830151613a2d61024084018215159052565b50610260830151613a4361026084018215159052565b506102808301516137f4610280840182613761565b602080825282518282018190525f918401906040840190835b81811015613a985783516001600160a01b0316835260209384019390920191600101613a71565b509095945050505050565b80356001600160401b0381168114613811575f5ffd5b5f5f83601f840112613ac9575f5ffd5b5081356001600160401b03811115613adf575f5ffd5b6020830191508360208260051b8501011115613af9575f5ffd5b9250929050565b5f5f5f5f5f5f5f5f5f5f5f6101208c8e031215613b1b575f5ffd5b613b248c6137fb565b9a5060208c01359950613b3960408d01613aa3565b9850613b4760608d01613aa3565b9750613b5560808d01613aa3565b9650613b6360a08d01613aa3565b9550613b7160c08d01613aa3565b945060e08c01356001600160401b03811115613b8b575f5ffd5b613b978e828f01613ab9565b9095509350506101008c01356001600160401b03811115613bb6575f5ffd5b613bc28e828f01613ab9565b915080935050809150509295989b509295989b9093969950565b5f5f5f60608486031215613bee575f5ffd5b833592506020840135915060408401358015158114613c0b575f5ffd5b809150509250925092565b80356001600160801b0381168114613811575f5ffd5b5f5f60408385031215613c3d575f5ffd5b82359150613c4d60208401613c16565b90509250929050565b5f5f60408385031215613c67575f5ffd5b82359150613c4d602084016137fb565b81516001600160801b0316815261016081016020830151613ca360208401826001600160801b03169052565b506040830151613cbe60408401826001600160801b03169052565b506060830151613cd960608401826001600160801b03169052565b506080830151613cf460808401826001600160801b03169052565b5060a0830151613d0f60a08401826001600160801b03169052565b5060c0830151613d2560c084018261ffff169052565b5060e0830151613d3960e084018215159052565b50610100830151613d4f61010084018215159052565b50610120830151613d6561012084018215159052565b506101408301516137f461014084018215159052565b5f5f5f5f5f5f60c08789031215613d90575f5ffd5b86359550602087013560028110613da5575f5ffd5b9450613db3604088016137fb565b9350613dc160608801613c16565b9598949750929560808101359460a0909101359350915050565b634e487b7160e01b5f52601260045260245ffd5b634e487b7160e01b5f52601160045260245ffd5b5f82613e1d57634e487b7160e01b5f52601260045260245ffd5b500490565b61ffff8181168382160190811115610c1a57610c1a613def565b63ffffffff8281168282160390811115610c1a57610c1a613def565b6001600160801b038181168382160190811115610c1a57610c1a613def565b61ffff8281168282160390811115610c1a57610c1a613def565b6001600160801b038281168282160390811115610c1a57610c1a613def565b81810381811115610c1a57610c1a613def565b80820180821115610c1a57610c1a613def565b63ffffffff8181168382160190811115610c1a57610c1a613def565b60808101613f00828761374d565b6001600160801b038516602083015283604083015282606083015295945050505050565b634e487b7160e01b5f52603260045260245ffd5b5f60208284031215613f48575f5ffd5b610cad826137fb565b5f60208284031215613f61575f5ffd5b610cad82613c16565b634e487b7160e01b5f52604160045260245ffdfe9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00a264697066735822122078d7860c3052a7fbc3b6b2ec53863d574f31cdadd415aaa065fc47907e45df2e64736f6c634300081c0033",
  "deployedBytecode": "0x608060405260043610610184575f3560e01c80639744742b116100d0578063b88fd50c11610089578063cf2a8f9b11610063578063cf2a8f9b146104dd578063cf62ba92146104f1578063e68bbeef1461051a578063f45f6a1114610539576101a2565b8063b88fd50c1461047b578063c839b4b01461049a578063c9b99dab146104c9576101a2565b80639744742b146103b8578063a06824b7146103d7578063b14401e4146103f6578063b1f477011461041d578063b6b55f251461043c578063b828a0f61461044f576101a2565b80634f9f6fe61161013d57806372a180ea1161011757806372a180ea1461032e5780638b0acd621461035b5780638dd6afb41461037a5780639462113814610399576101a2565b80634f9f6fe61461029f57806366470358146102cb5780636d4168e6146102f7576101a2565b80631f3aee3b146101bb5780631f64c168146101dc57806327b64389146101fb578063412459fa1461021a578063427a2fc2146102395780634f2b42341461026e576101a2565b366101a257604051633ee6509d60e01b815260040160405180910390fd5b604051633ee6509d60e01b815260040160405180910390fd5b3480156101c6575f5ffd5b506101da6101d5366004613702565b610558565b005b3480156101e7575f5ffd5b506101da6101f6366004613722565b610699565b348015610206575f5ffd5b506101da610215366004613702565b610816565b348015610225575f5ffd5b506101da610234366004613722565b61098b565b348015610244575f5ffd5b50610258610253366004613702565b610aa7565b6040516102659190613771565b60405180910390f35b348015610279575f5ffd5b5061028d610288366004613816565b610c20565b60405160ff9091168152602001610265565b3480156102aa575f5ffd5b506102be6102b9366004613722565b610cb4565b6040516102659190613848565b3480156102d6575f5ffd5b506102ea6102e5366004613722565b610f11565b6040516102659190613a58565b348015610302575f5ffd5b50610316610311366004613722565b610f83565b6040516001600160801b039091168152602001610265565b348015610339575f5ffd5b5061034d610348366004613b00565b610fe1565b604051908152602001610265565b348015610366575f5ffd5b506101da610375366004613702565b6113a6565b348015610385575f5ffd5b506101da610394366004613722565b611526565b3480156103a4575f5ffd5b506101da6103b3366004613bdc565b6116d7565b3480156103c3575f5ffd5b506101da6103d2366004613722565b6119cd565b3480156103e2575f5ffd5b506101da6103f1366004613702565b611ae8565b348015610401575f5ffd5b5061040a600281565b60405161ffff9091168152602001610265565b348015610428575f5ffd5b506101da610437366004613c2c565b611c47565b6101da61044a366004613722565b611e37565b34801561045a575f5ffd5b5061046e610469366004613c56565b612075565b6040516102659190613c77565b348015610486575f5ffd5b5061034d610495366004613d7b565b6121c7565b3480156104a5575f5ffd5b506104b96104b4366004613722565b61268a565b6040519015158152602001610265565b3480156104d4575f5ffd5b5061034d5f5481565b3480156104e8575f5ffd5b5061040a600881565b3480156104fc575f5ffd5b50610505602081565b60405163ffffffff9091168152602001610265565b348015610525575f5ffd5b506101da610534366004613722565b6126d0565b348015610544575f5ffd5b50610316610553366004613c56565b612826565b5f610562836128a2565b90506001600882015462010000900460ff16600481111561058557610585613739565b146105a3576040516307a92f1960e51b815260040160405180910390fd5b6003810154600160801b90046001600160401b03164211156105d85760405163c4ec394160e01b815260040160405180910390fd5b60018101546001600160a01b031633146106055760405163586d335760e01b815260040160405180910390fd5b600881015460ff161561062b576040516306aa019360e21b815260040160405180910390fd5b8060020154821461064f576040516361784c7d60e11b815260040160405180910390fd5b60088101805460ff19166001179055604051339084907f94c709d66476b828da20385feeb3568d8da65dc2437b6870ab749d9e228cbcff905f90a361069483826128cf565b505050565b6106a1612952565b5f6106ab826128a2565b90506003600882015462010000900460ff1660048111156106ce576106ce613739565b146106ec576040516307a92f1960e51b815260040160405180910390fd5b5f8281526003602081815260408084203385529091529091209081015462010000900460ff1661072f576040516394484cb360e01b815260040160405180910390fd5b600381015465010000000000900460ff161561075e57604051636507689f60e01b815260040160405180910390fd5b60028101546001600160801b03165f81900361078d57604051630686827b60e51b815260040160405180910390fd5b60038201805465ff00000000001916650100000000001790556040516001600160801b0382168152339085907f3e7527301899702eaaa596676c91e65b441a44e3d0899426e21b6e6a8471fb77906020015b60405180910390a36107fa33826001600160801b031661296d565b50505061081360015f516020613f7f5f395f51905f5255565b50565b5f610820836128a2565b90506002600882015462010000900460ff16600481111561084357610843613739565b14610861576040516307a92f1960e51b815260040160405180910390fd5b60048101546001600160401b0316421161088e576040516388c081c760e01b815260040160405180910390fd5b5f838152600360208181526040808420338552909152909120015462010000900460ff161580156108cc575060018101546001600160a01b03163314155b156108ea5760405163721c7c6760e11b815260040160405180910390fd5b5f838152600460209081526040808320858452909152902060016003820154600160a81b900460ff16600481111561092457610924613739565b1461094257604051633b4f091f60e21b815260040160405180910390fd5b60048201546003820154600160501b90910461ffff908116600160801b909204161061097957610974848385846129dd565b610985565b61098584838584612c4e565b50505050565b5f610995826128a2565b90506001600882015462010000900460ff1660048111156109b8576109b8613739565b146109d6576040516307a92f1960e51b815260040160405180910390fd5b6003810154600160801b90046001600160401b03164211610a0a57604051631da98d7560e01b815260040160405180910390fd5b5f828152600360208181526040808420338552909152909120015462010000900460ff16158015610a48575060018101546001600160a01b03163314155b15610a665760405163721c7c6760e11b815260040160405180910390fd5b60088101805462ff000019166204000017905560405182907f85c4c0ac23e43ccf9574b409e27645142db85cd2b3917ca03a0bb56b573a9fc1905f90a25050565b610aec60408051610100810182525f80825260208201819052918101829052606081018290526080810182905260a081018290529060c082019081526020015f905290565b610af583612cf4565b5f838152600460209081526040808320858452825280832081516101008101835281546001600160a01b031681526001808301549482019490945260028201549281019290925260038101546001600160801b0381166060840152600160801b810461ffff9081166080850152600160901b82041660a08401529192909160c0840191600160a01b90910460ff1690811115610b9357610b93613739565b6001811115610ba457610ba4613739565b81526020016003820160159054906101000a900460ff166004811115610bcc57610bcc613739565b6004811115610bdd57610bdd613739565b90525090505f8160e001516004811115610bf957610bf9613739565b03610c1757604051633b4f091f60e21b815260040160405180910390fd5b90505b92915050565b5f610c2a84612cf4565b5f848152600460208181526040808420878552909152822060030154600160a81b900460ff1690811115610c6057610c60613739565b03610c7e57604051633b4f091f60e21b815260040160405180910390fd5b505f83815260056020908152604080832085845282528083206001600160a01b038516845290915290205460ff165b9392505050565b610d60604080516102a0810182525f80825260208201819052918101829052606081018290526080810182905260a0810182905260c0810182905260e08101829052610100810182905261012081018290526101408101829052610160810182905261018081018290526101a081018290526101c081018290526101e0810182905261020081018290526102208101829052610240810182905261026081018290529061028082015290565b5f82815260016020818152604080842081516102a08101835281546001600160a01b039081168252948201549094169284019290925260028201549083015260038101546001600160401b038082166060850152600160401b80830482166080860152600160801b808404831660a0870152600160c01b909304821660c086015260048085015492831660e087015261ffff918304821661010080880191909152600160501b840490921661012087015263ffffffff600160601b840481166101408801529284900490921661016086015260058401546001600160801b038082166101808801529084900481166101a087015260068501548082166101c088015284900481166101e0870152600785015480821661020088015293909304909216610220850152600883015460ff808216151561024087015292810483161515610260860152610280850192620100009091041690811115610ec557610ec5613739565b6004811115610ed657610ed6613739565b90525090505f8161028001516004811115610ef357610ef3613739565b03610c1a57604051637f0ed44d60e11b815260040160405180910390fd5b6060610f1c82612cf4565b5f8281526002602090815260409182902080548351818402810184019094528084529091830182828015610f7757602002820191905f5260205f20905b81546001600160a01b03168152600190910190602001808311610f59575b50505050509050919050565b5f81815260016020526040812081600882015462010000900460ff166004811115610fb057610fb0613739565b03610fce57604051637f0ed44d60e11b815260040160405180910390fd5b600701546001600160801b031692915050565b5f6001600160a01b038c166110095760405163e6c4247b60e01b815260040160405180910390fd5b8a611027576040516392a3c43160e01b815260040160405180910390fd5b83821461104757604051630e6751f960e21b815260040160405180910390fd5b60028410806110565750600884115b1561107457604051630e6751f960e21b815260040160405180910390fd5b42886001600160401b03161161109d57604051637063c71f60e11b815260040160405180910390fd5b886001600160401b03168a6001600160401b031611156110d057604051637063c71f60e11b815260040160405180910390fd5b886001600160401b0316886001600160401b0316111561110357604051637063c71f60e11b815260040160405180910390fd5b886001600160401b0316876001600160401b03161161113557604051637063c71f60e11b815260040160405180910390fd5b866001600160401b0316866001600160401b03161161116757604051637063c71f60e11b815260040160405180910390fd5b5f549050806001015f819055505f60015f8381526020019081526020015f20905033815f015f6101000a8154816001600160a01b0302191690836001600160a01b031602179055508c816001015f6101000a8154816001600160a01b0302191690836001600160a01b031602179055508b81600201819055508a816003015f6101000a8154816001600160401b0302191690836001600160401b03160217905550898160030160086101000a8154816001600160401b0302191690836001600160401b03160217905550888160030160106101000a8154816001600160401b0302191690836001600160401b03160217905550878160030160186101000a8154816001600160401b0302191690836001600160401b0316021790555086816004015f6101000a8154816001600160401b0302191690836001600160401b03160217905550858590508160040160086101000a81548161ffff021916908361ffff1602179055506002868690506112dd9190613e03565b6112e8906001613e22565b60048201805461ffff92909216600160501b0261ffff60501b1990921691909117905560088101805462ff000019166201000017905561132c828e88888888612d3e565b6005820180546001600160801b0319166001600160801b03929092169182179055604080518e815260208101929092526001600160a01b038f1691339185917f9b0461ecfe5046f4cfc1c49a87ff0edfb7c4a932c90223643f164363f0eeb929910160405180910390a4509b9a5050505050505050505050565b5f6113b0836128a2565b90506002600882015462010000900460ff1660048111156113d3576113d3613739565b146113f1576040516307a92f1960e51b815260040160405180910390fd5b60018101546001600160a01b0316331461141e5760405163586d335760e01b815260040160405180910390fd5b5f838152600460209081526040808320858452909152902060016003820154600160a81b900460ff16600481111561145857611458613739565b1461147657604051633b4f091f60e21b815260040160405180910390fd5b60038101805460ff60a81b1916600160aa1b179055600482018054600191906010906114b0908490600160801b900463ffffffff16613e3c565b92506101000a81548163ffffffff021916908363ffffffff1602179055506114d9848383612f7b565b60038101546040516001600160801b039091168152839085907f5435271388555e2377f38c9dad3ef6c3fe6b895da582647455e54e6ddc9e36e6906020015b60405180910390a350505050565b61152e612952565b5f611538826128a2565b90506004600882015462010000900460ff16600481111561155b5761155b613739565b14611579576040516307a92f1960e51b815260040160405180910390fd5b5f8281526003602081815260408084203385529091529091209081015462010000900460ff166115bc576040516394484cb360e01b815260040160405180910390fd5b6003810154640100000000900460ff16156115ea57604051636507689f60e01b815260040160405180910390fd5b8054600160801b90046001600160801b03165f81900361161d57604051630686827b60e51b815260040160405180910390fd5b60038201805464010000000064ff00000000199091161790556002820180546001600160801b03908116600160801b848316021790915560068401805483925f9161166a91859116613e58565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550336001600160a01b0316847f03af746e29da1d465675339e956c5b9b6988197b76038abca43cd342f8ba1502836040516107df91906001600160801b0391909116815260200190565b5f6116e1846128a2565b90506002600882015462010000900460ff16600481111561170457611704613739565b14611722576040516307a92f1960e51b815260040160405180910390fd5b60048101546001600160401b03164211156117505760405163335b65a560e11b815260040160405180910390fd5b5f8481526003602081815260408084203385529091529091209081015462010000900460ff16611793576040516394484cb360e01b815260040160405180910390fd5b5f858152600460209081526040808320878452909152902060016003820154600160a81b900460ff1660048111156117cd576117cd613739565b146117eb57604051633b4f091f60e21b815260040160405180910390fd5b5f868152600560209081526040808320888452825280832033845290915290205460ff161561182d57604051637c9a1cf960e01b815260040160405180910390fd5b8361183957600261183c565b60015b5f87815260056020908152604080832089845282528083203384529091529020805460ff191660ff9290921691909117905583156118b55760018160030160108282829054906101000a900461ffff166118969190613e22565b92506101000a81548161ffff021916908361ffff1602179055506118f2565b60018160030160128282829054906101000a900461ffff166118d79190613e22565b92506101000a81548161ffff021916908361ffff1602179055505b336001600160a01b031685877fea498045c56d0bd317fccdf38b00bb19baa61dedafd56d3364cff25f9f1e299b87604051611931911515815260200190565b60405180910390a460048301546003820154600160501b90910461ffff908116600160801b90920416106119705761196b868487846129dd565b6119c5565b60048301546119939061ffff600160501b8204811691600160401b900416613e77565b61199e906001613e22565b600382015461ffff918216600160901b909104909116106119c5576119c586848784612c4e565b505050505050565b5f6119d7826128a2565b90506002600882015462010000900460ff1660048111156119fa576119fa613739565b14611a18576040516307a92f1960e51b815260040160405180910390fd5b60048101546001600160401b03164211611a45576040516388c081c760e01b815260040160405180910390fd5b6004810154600160801b900463ffffffff1615611a7557604051630316cdf360e11b815260040160405180910390fd5b5f611a808383613072565b6008830180546203000062ff0000199091161790556007830154604080516001600160801b039283168152918316602083015291925084917fa016668dfb48b31468ae8a35fad8918516fa761314b1420a25dccb810c4b9a50910160405180910390a2505050565b5f611af2836128a2565b90506001600882015462010000900460ff166004811115611b1557611b15613739565b14611b33576040516307a92f1960e51b815260040160405180910390fd5b6003810154600160801b90046001600160401b0316421115611b685760405163c4ec394160e01b815260040160405180910390fd5b5f8381526003602081815260408084203385529091529091209081015462010000900460ff16611bab576040516394484cb360e01b815260040160405180910390fd5b60038101546301000000900460ff1615611bd8576040516306aa019360e21b815260040160405180910390fd5b81600201548314611bfc576040516361784c7d60e11b815260040160405180910390fd5b60038101805463ff00000019166301000000179055604051339085907f4a32210ff9e307956563cb678bbba46cc253e0729a80fad530d84f054ced15c2905f90a361098584836128cf565b611c4f612952565b5f611c59836128a2565b90506001600882015462010000900460ff166004811115611c7c57611c7c613739565b14611c9a576040516307a92f1960e51b815260040160405180910390fd5b5f8381526003602081815260408084203385529091529091209081015462010000900460ff16611cdd576040516394484cb360e01b815260040160405180910390fd5b6001600160801b0383161580611d07575080546001600160801b03600160801b9091048116908416115b15611d255760405163162908e360e11b815260040160405180910390fd5b805483908290601090611d49908490600160801b90046001600160801b0316613e91565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550828260050160108282829054906101000a90046001600160801b0316611d939190613e91565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550336001600160a01b0316847f72f705c814d5ba20f8444a5ea01e059de9c2a59d5d882d20a4f3e7720e22aa1985604051611e0091906001600160801b0391909116815260200190565b60405180910390a3611e1b33846001600160801b031661296d565b5050611e3360015f516020613f7f5f395f51905f5255565b5050565b5f611e41826128a2565b90506001600882015462010000900460ff166004811115611e6457611e64613739565b14611e82576040516307a92f1960e51b815260040160405180910390fd5b6003810154600160801b90046001600160401b0316421115611eb75760405163c4ec394160e01b815260040160405180910390fd5b5f8281526003602081815260408084203385529091529091209081015462010000900460ff16611efa576040516394484cb360e01b815260040160405180910390fd5b60038101546301000000900460ff16611f2657604051637362875560e11b815260040160405180910390fd5b345f03611f465760405163162908e360e11b815260040160405180910390fd5b80545f90611f66906001600160801b03600160801b820481169116613eb0565b905080341115611f8957604051636d0d16c560e11b815260040160405180910390fd5b8154349081908490601090611faf908490600160801b90046001600160801b0316613e58565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550808460050160108282829054906101000a90046001600160801b0316611ff99190613e58565b82546101009290920a6001600160801b038181021990931691831602179091558454604080518584168152600160801b909204909216602082015233925087917ffb46e6ccae6e539e28b46d13b924d86372e2b730cee0d0be9d83e39f93b639cc910160405180910390a361206e85856128cf565b5050505050565b60408051610160810182525f80825260208201819052918101829052606081018290526080810182905260a0810182905260c0810182905260e08101829052610100810182905261012081018290526101408101919091526120d683612cf4565b5f8381526003602081815260408084206001600160a01b038716855282529283902083516101608101855281546001600160801b038082168352600160801b918290048116948301949094526001830154808516968301969096529485900483166060820152600282015480841660808301529490940490911660a0840152015461ffff811660c083015260ff6201000082048116151560e08401819052630100000083048216151561010085015264010000000083048216151561012085015265010000000000909204161515610140830152610c17576040516394484cb360e01b815260040160405180910390fd5b5f5f6121d2886128a2565b90506002600882015462010000900460ff1660048111156121f5576121f5613739565b14612213576040516307a92f1960e51b815260040160405180910390fd5b60018101546001600160a01b031633146122405760405163586d335760e01b815260040160405180910390fd5b6003810154600160401b90046001600160401b0316421015612275576040516309ca1d3560e11b815260040160405180910390fd5b6003810154600160c01b90046001600160401b03164211156122aa5760405163f0f25a3360e01b815260040160405180910390fd5b60048101546020600160601b90910463ffffffff16106122dd57604051638eb57d2760e01b815260040160405180910390fd5b846001600160801b03165f036123065760405163162908e360e11b815260040160405180910390fd5b831580612311575082155b1561232f5760405163ea8acc1f60e01b815260040160405180910390fd5b6005810154600782015460068301546001600160801b03600160801b9384900481169389821693612367939083169291900416613ec3565b6123719190613ec3565b1115612390576040516306d2f9d160e51b815260040160405180910390fd5b5f8760018111156123a3576123a3613739565b036123d5576001600160a01b038616156123d057604051633b4f091f60e21b815260040160405180910390fd5b6124be565b5f8881526003602081815260408084206001600160a01b038b1685529091529091209081015462010000900460ff1661242157604051633b4f091f60e21b815260040160405180910390fd5b805460018201546001600160801b03600160801b92839004811692898216926124509291810482169116613ec3565b61245a9190613ec3565b1115612479576040516347cc8cb360e11b815260040160405180910390fd5b6001810180548791905f906124989084906001600160801b0316613e58565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550505b60048101546124db90600160601b900463ffffffff166001613ec3565b60048201805463ffffffff808416600160601b0263ffffffff60601b199092169190911780835592945060019260109161251f918591600160801b90910416613ed6565b92506101000a81548163ffffffff021916908363ffffffff160217905550848160060160108282829054906101000a90046001600160801b03166125639190613e58565b82546101009290920a6001600160801b038181021990931691831602179091555f8a8152600460209081526040808320878452909152902080546001600160a01b0319166001600160a01b038a161781556001818101889055600282018790556003820180546001600160801b03198116948b1694851782559294508b93909274ff00000000ffffffffffffffffffffffffffffffff19161790600160a01b90849081111561261457612614613739565b02179055506003810180546001919060ff60a81b1916600160a81b830217905550866001600160a01b0316838a7f4a3d363d14b4e4079fbf30c6f61e95522d30a8d6ea9b967f7a53aa5069034a218b8a8a8a6040516126769493929190613ef2565b60405180910390a450509695505050505050565b5f818152600160208190526040822090600882015462010000900460ff1660048111156126b9576126b9613739565b146126c657505f92915050565b610cad8382613525565b6126d8612952565b5f6126e2826128a2565b90506003600882015462010000900460ff16600481111561270557612705613739565b14612723576040516307a92f1960e51b815260040160405180910390fd5b60018101546001600160a01b031633146127505760405163586d335760e01b815260040160405180910390fd5b6008810154610100900460ff161561277b57604051636507689f60e01b815260040160405180910390fd5b60078101546001600160801b03165f8190036127aa57604051630686827b60e51b815260040160405180910390fd5b60088201805461ff0019166101001790556040516001600160801b0382168152339084907f992c3349b2298e6ceca1b22431a9f05d3e494d78fad75c620df8fb4bf9f661269060200160405180910390a361280e33826001600160801b031661296d565b505061081360015f516020613f7f5f395f51905f5255565b5f61283083612cf4565b5f8381526003602081815260408084206001600160a01b03871685529091529091209081015462010000900460ff1661287c576040516394484cb360e01b815260040160405180910390fd5b805461289a906001600160801b03600160801b820481169116613e91565b949350505050565b5f81815260016020526040812081600882015462010000900460ff166004811115610ef357610ef3613739565b600881015460ff166128df575050565b6128e98282613525565b6128f1575050565b60088101805462ff0000191662020000179055600581015460408051600160801b9092046001600160801b031682525183917f836194798b969a3eef8631422e48b27d1423783f2ef62ffaacb4a5637bfcd727919081900360200190a25050565b61295a6135f4565b60025f516020613f7f5f395f51905f5255565b5f826001600160a01b0316826040515f6040518083038185875af1925050503d805f81146129b6576040519150601f19603f3d011682016040523d82523d5f602084013e6129bb565b606091505b5050905080610694576040516312171d8360e31b815260040160405180910390fd5b60038101805460ff60a81b1916600160a91b17905560048301805460019190601090612a17908490600160801b900463ffffffff16613e3c565b825463ffffffff9182166101009390930a92830291909202199091161790555060038101546006840180546001600160801b0392831692601091612a64918591600160801b900416613e91565b82546101009290920a6001600160801b0381810219909316918316021790915560038301546007860180549183169350915f91612aa391859116613e58565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550600180811115612ad957612ad9613739565b6003820154600160a01b900460ff166001811115612af957612af9613739565b03612bb9575f84815260036020818152604080842085546001600160a01b0316855290915282209083015460018201805492936001600160801b039283169391929091612b4891859116613e91565b82546101009290920a6001600160801b038181021990931691831602179091556003840154600184018054918316935091601091612b8f918591600160801b900416613e58565b92506101000a8154816001600160801b0302191690836001600160801b0316021790555050612c0b565b60038101546007840180546001600160801b0392831692601091612be6918591600160801b900416613e58565b92506101000a8154816001600160801b0302191690836001600160801b031602179055505b60038101546040516001600160801b039091168152829085907feec457516c5397fa2d4d4e2835ac683a039643e3d8ad1ebaec6a63b75ebd5eb490602001611518565b60038101805460ff60a81b1916600360a81b17905560048301805460019190601090612c88908490600160801b900463ffffffff16613e3c565b92506101000a81548163ffffffff021916908363ffffffff160217905550612cb1848483612f7b565b60038101546040516001600160801b039091168152829085907f666925b8d406fe5d0c7d5390adfb4841653bc34f6addb74d141107550cdc4d5c90602001611518565b5f5f8281526001602052604090206008015462010000900460ff166004811115612d2057612d20613739565b0361081357604051637f0ed44d60e11b815260040160405180910390fd5b5f8080805b86811015612f28575f888883818110612d5e57612d5e613f24565b9050602002016020810190612d739190613f38565b90506001600160a01b038116612d9c5760405163e6c4247b60e01b815260040160405180910390fd5b896001600160a01b0316816001600160a01b031603612dce5760405163895f1b4b60e01b815260040160405180910390fd5b5f8b81526003602081815260408084206001600160a01b0386168552909152909120015462010000900460ff1615612e19576040516304cc939360e51b815260040160405180910390fd5b5f878784818110612e2c57612e2c613f24565b9050602002016020810190612e419190613f51565b9050806001600160801b03165f03612e6c5760405163162908e360e11b815260040160405180910390fd5b336001600160a01b03831603612e8157600194505b612e946001600160801b03821685613ec3565b5f8d81526003602081815260408084206001600160a01b0390971680855296825280842080546001600160801b039097166001600160801b031990971696909617865594909101805462ffffff191661ffff881617620100001790558e8252600281529281208054600181810183559183529390912090920180546001600160a01b03191690931790925590925001612d43565b5081612f4757604051631ae2acdd60e21b815260040160405180910390fd5b6001600160801b03811115612f6f5760405163162908e360e11b815260040160405180910390fd5b98975050505050505050565b60038101546006830180546001600160801b0392831692601091612fa8918591600160801b900416613e91565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550600180811115612fde57612fde613739565b6003820154600160a01b900460ff166001811115612ffe57612ffe613739565b03610694576003808201545f8581526020928352604080822085546001600160a01b0316835290935291822060010180546001600160801b0392831693919261304991859116613e91565b92506101000a8154816001600160801b0302191690836001600160801b03160217905550505050565b5f828152600260205260408120805482816001600160401b0381111561309a5761309a613f6a565b6040519080825280602002602001820160405280156130c3578160200160208202803683370190505b5090505f805b83811015613190575f888152600360205260408120865482908890859081106130f4576130f4613f24565b5f9182526020808320909101546001600160a01b03168352820192909252604001902060018101548154919250613142916001600160801b03600160801b9283900481169290910416613eb0565b84838151811061315457613154613f24565b60200260200101818152505083828151811061317257613172613f24565b6020026020010151836131859190613ec3565b9250506001016130c9565b506007860154600160801b90046001600160801b0316818111156131c75760405163162908e360e11b815260040160405180910390fd5b5f846001600160401b038111156131e0576131e0613f6a565b604051908082528060200260200182016040528015613209578160200160208202803683370190505b509050811561344b575f856001600160401b0381111561322b5761322b613f6a565b604051908082528060200260200182016040528015613254578160200160208202803683370190505b5090505f805b8781101561331b576132868588838151811061327857613278613f24565b602002602001015188613625565b84828151811061329857613298613f24565b60200260200101818152505085806132b2576132b2613ddb565b8782815181106132c4576132c4613f24565b602002602001015186098382815181106132e0576132e0613f24565b6020026020010181815250508381815181106132fe576132fe613f24565b6020026020010151826133119190613ec3565b915060010161325a565b505f6133278286613eb0565b90505f5b81811015613446575f195f805b8b8110156133ce578a818151811061335257613352613f24565b602002602001015188828151811061336c5761336c613f24565b602002602001015110156133c6575f198314806133a157508187828151811061339757613397613f24565b6020026020010151115b156133c6578092508681815181106133bb576133bb613f24565b602002602001015191505b600101613338565b505f1982036133f05760405163162908e360e11b815260040160405180910390fd5b600187838151811061340457613404613f24565b602002602001018181516134189190613ec3565b90525085515f9087908490811061343157613431613f24565b6020908102919091010152505060010161332b565b505050505b5f5b85811015613518575f82828151811061346857613468613f24565b602002602001015186838151811061348257613482613f24565b60200260200101516134949190613eb0565b5f8c81526003602052604081208a5492935083928392908c90879081106134bd576134bd613f24565b5f918252602080832091909101546001600160a01b03168352820192909252604001902060020180546001600160801b0319166001600160801b039290921691909117905561350c818b613e58565b9950505060010161344d565b5050505050505092915050565b60088101545f9060ff1661353a57505f610c1a565b5f838152600260205260408120905b81548110156135e9575f8581526003602052604081208354829085908590811061357557613575613f24565b5f9182526020808320909101546001600160a01b031683528201929092526040019020600381015490915060ff6301000000909104166135ba575f9350505050610c1a565b8054600160801b81046001600160801b039081169116146135e0575f9350505050610c1a565b50600101613549565b506001949350505050565b5f516020613f7f5f395f51905f525460020361362357604051633ee5aeb560e01b815260040160405180910390fd5b565b5f5f5f61363286866136d5565b91509150815f036136565783818161364c5761364c613ddb565b0492505050610cad565b81841161366d5761366d60038515026011186136f1565b5f848688095f868103871696879004966002600389028118808a02820302808a02820302808a02820302808a02820302808a02820302808a02909103029181900381900460010185841190960395909502919093039390930492909217029150509392505050565b5f805f1983850993909202808410938190039390930393915050565b634e487b715f52806020526024601cfd5b5f5f60408385031215613713575f5ffd5b50508035926020909101359150565b5f60208284031215613732575f5ffd5b5035919050565b634e487b7160e01b5f52602160045260245ffd5b6002811061375d5761375d613739565b9052565b6005811061375d5761375d613739565b81516001600160a01b0316815260208083015190820152604080830151908201526060808301516001600160801b03169082015260808083015161ffff169082015260a0828101516101008301916137ce9084018261ffff169052565b5060c08301516137e160c084018261374d565b5060e08301516137f460e0840182613761565b5092915050565b80356001600160a01b0381168114613811575f5ffd5b919050565b5f5f5f60608486031215613828575f5ffd5b833592506020840135915061383f604085016137fb565b90509250925092565b81516001600160a01b031681526102a08101602083015161387460208401826001600160a01b03169052565b5060408301516040830152606083015161389960608401826001600160401b03169052565b5060808301516138b460808401826001600160401b03169052565b5060a08301516138cf60a08401826001600160401b03169052565b5060c08301516138ea60c08401826001600160401b03169052565b5060e083015161390560e08401826001600160401b03169052565b5061010083015161391d61010084018261ffff169052565b5061012083015161393561012084018261ffff169052565b5061014083015161394f61014084018263ffffffff169052565b5061016083015161396961016084018263ffffffff169052565b506101808301516139866101808401826001600160801b03169052565b506101a08301516139a36101a08401826001600160801b03169052565b506101c08301516139c06101c08401826001600160801b03169052565b506101e08301516139dd6101e08401826001600160801b03169052565b506102008301516139fa6102008401826001600160801b03169052565b50610220830151613a176102208401826001600160801b03169052565b50610240830151613a2d61024084018215159052565b50610260830151613a4361026084018215159052565b506102808301516137f4610280840182613761565b602080825282518282018190525f918401906040840190835b81811015613a985783516001600160a01b0316835260209384019390920191600101613a71565b509095945050505050565b80356001600160401b0381168114613811575f5ffd5b5f5f83601f840112613ac9575f5ffd5b5081356001600160401b03811115613adf575f5ffd5b6020830191508360208260051b8501011115613af9575f5ffd5b9250929050565b5f5f5f5f5f5f5f5f5f5f5f6101208c8e031215613b1b575f5ffd5b613b248c6137fb565b9a5060208c01359950613b3960408d01613aa3565b9850613b4760608d01613aa3565b9750613b5560808d01613aa3565b9650613b6360a08d01613aa3565b9550613b7160c08d01613aa3565b945060e08c01356001600160401b03811115613b8b575f5ffd5b613b978e828f01613ab9565b9095509350506101008c01356001600160401b03811115613bb6575f5ffd5b613bc28e828f01613ab9565b915080935050809150509295989b509295989b9093969950565b5f5f5f60608486031215613bee575f5ffd5b833592506020840135915060408401358015158114613c0b575f5ffd5b809150509250925092565b80356001600160801b0381168114613811575f5ffd5b5f5f60408385031215613c3d575f5ffd5b82359150613c4d60208401613c16565b90509250929050565b5f5f60408385031215613c67575f5ffd5b82359150613c4d602084016137fb565b81516001600160801b0316815261016081016020830151613ca360208401826001600160801b03169052565b506040830151613cbe60408401826001600160801b03169052565b506060830151613cd960608401826001600160801b03169052565b506080830151613cf460808401826001600160801b03169052565b5060a0830151613d0f60a08401826001600160801b03169052565b5060c0830151613d2560c084018261ffff169052565b5060e0830151613d3960e084018215159052565b50610100830151613d4f61010084018215159052565b50610120830151613d6561012084018215159052565b506101408301516137f461014084018215159052565b5f5f5f5f5f5f60c08789031215613d90575f5ffd5b86359550602087013560028110613da5575f5ffd5b9450613db3604088016137fb565b9350613dc160608801613c16565b9598949750929560808101359460a0909101359350915050565b634e487b7160e01b5f52601260045260245ffd5b634e487b7160e01b5f52601160045260245ffd5b5f82613e1d57634e487b7160e01b5f52601260045260245ffd5b500490565b61ffff8181168382160190811115610c1a57610c1a613def565b63ffffffff8281168282160390811115610c1a57610c1a613def565b6001600160801b038181168382160190811115610c1a57610c1a613def565b61ffff8281168282160390811115610c1a57610c1a613def565b6001600160801b038281168282160390811115610c1a57610c1a613def565b81810381811115610c1a57610c1a613def565b80820180821115610c1a57610c1a613def565b63ffffffff8181168382160190811115610c1a57610c1a613def565b60808101613f00828761374d565b6001600160801b038516602083015283604083015282606083015295945050505050565b634e487b7160e01b5f52603260045260245ffd5b5f60208284031215613f48575f5ffd5b610cad826137fb565b5f60208284031215613f61575f5ffd5b610cad82613c16565b634e487b7160e01b5f52604160045260245ffdfe9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00a264697066735822122078d7860c3052a7fbc3b6b2ec53863d574f31cdadd415aaa065fc47907e45df2e64736f6c634300081c0033"
} as const;

export const sharedDepositEscrowAbi = sharedDepositEscrow.abi;
