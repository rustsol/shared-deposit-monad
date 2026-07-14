import hre from "hardhat";
import { keccak256, toHex, type Address } from "viem";
import { time } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";

export const TERMS_HASH = keccak256(
  toHex("shared-deposit-canonical-terms-test-vector-1"),
);
export const OTHER_HASH = keccak256(toHex("some-other-terms"));
export const ZERO_HASH = `0x${"0".repeat(64)}` as const;
export const ZERO_ADDRESS = `0x${"0".repeat(40)}` as Address;

export interface Timeline {
  leaseStart: bigint;
  leaseEnd: bigint;
  fundingDeadline: bigint;
  claimDeadline: bigint;
  settlementDeadline: bigint;
}

/** A valid timeline relative to the current chain time. */
export async function futureTimeline(): Promise<Timeline> {
  const now = BigInt(await time.latest());
  return {
    leaseStart: now + 200n,
    fundingDeadline: now + 1_000n,
    leaseEnd: now + 10_000n,
    claimDeadline: now + 20_000n,
    settlementDeadline: now + 30_000n,
  };
}

export async function deployEscrowFixture() {
  const escrow = await hre.viem.deployContract("SharedDepositEscrow");
  const wallets = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  // Wallet roles for readability. wallets[0] is the deployer and is deliberately
  // NOT a participant in any test agreement, proving the deployer has no authority.
  const [deployer, creator, tenantB, tenantC, recipient, outsider, ...extra] =
    wallets;
  return {
    escrow,
    publicClient,
    deployer,
    creator,
    tenantB,
    tenantC,
    recipient,
    outsider,
    extra,
  };
}

export type EscrowContract = Awaited<
  ReturnType<typeof deployEscrowFixture>
>["escrow"];
export type Wallet = Awaited<ReturnType<typeof deployEscrowFixture>>["creator"];

export interface CreateOptions {
  tenants: Address[];
  amounts: bigint[];
  recipient: Address;
  termsHash?: `0x${string}`;
  timeline?: Timeline;
}

/** Creates an agreement from `creator` and returns its sequential ID. */
export async function createAgreement(
  escrow: EscrowContract,
  creator: Wallet,
  options: CreateOptions,
): Promise<bigint> {
  const timeline = options.timeline ?? (await futureTimeline());
  const agreementId = await escrow.read.nextAgreementId();
  await escrow.write.createAgreement(
    [
      options.recipient,
      options.termsHash ?? TERMS_HASH,
      timeline.leaseStart,
      timeline.leaseEnd,
      timeline.fundingDeadline,
      timeline.claimDeadline,
      timeline.settlementDeadline,
      options.tenants,
      options.amounts,
    ],
    { account: creator.account },
  );
  return agreementId;
}

/** Asserts that `promise` reverts; when `errorName` is given, the decoded error
 *  message must contain it. No expected failure is swallowed without assertion. */
export async function expectRevert(
  promise: Promise<unknown>,
  errorName?: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (errorName) {
      expect(String(error), `expected revert with ${errorName}`).to.include(
        errorName,
      );
    }
    return;
  }
  expect.fail(
    `Expected transaction to revert${errorName ? ` with ${errorName}` : ""}`,
  );
}

export enum AgreementStatus {
  NONE = 0,
  FUNDING = 1,
  ACTIVE = 2,
  FINALIZED = 3,
  CANCELLED = 4,
}
