import { expect } from "chai";
import hre from "hardhat";
import { parseEther, type Address } from "viem";
import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import {
  AgreementStatus,
  ClaimType,
  computeExpectedSettlement,
  createAgreement,
  deployEscrowFixture,
  EVIDENCE_HASH,
  expectRevert,
  futureTimeline,
  REASON_HASH,
  setupActiveAgreement,
  TERMS_HASH,
  Wallet,
  ZERO_ADDRESS,
} from "./helpers";

interface ClaimSpec {
  type: ClaimType;
  liableIndex?: number; // index into tenantWallets for INDIVIDUAL claims
  amount: bigint;
  outcome: "approve" | "reject" | "withdraw" | "pending";
}

/**
 * Builds an ACTIVE agreement, plays the given claims to their outcomes, advances
 * past the settlement deadline, and returns everything needed for verification.
 */
async function playScenario(
  context: Awaited<ReturnType<typeof deployEscrowFixture>>,
  tenantWallets: Wallet[],
  amounts: bigint[],
  claimSpecs: ClaimSpec[],
) {
  const { escrow, creator, recipient } = context;
  const { agreementId, timeline } = await setupActiveAgreement(
    escrow,
    creator,
    recipient,
    tenantWallets,
    amounts,
  );
  await time.increaseTo(timeline.leaseEnd);

  const requiredApprovals = Math.floor(tenantWallets.length / 2) + 1;
  const individualApproved = tenantWallets.map(() => 0n);
  let sharedApproved = 0n;

  for (let c = 0; c < claimSpecs.length; c++) {
    const spec = claimSpecs[c];
    const liable =
      spec.type === ClaimType.INDIVIDUAL
        ? tenantWallets[spec.liableIndex ?? 0].account.address
        : ZERO_ADDRESS;
    await escrow.write.submitClaim(
      [agreementId, spec.type, liable, spec.amount, REASON_HASH, EVIDENCE_HASH],
      { account: recipient.account },
    );
    const claimId = BigInt(c + 1);
    if (spec.outcome === "approve") {
      for (let v = 0; v < requiredApprovals; v++) {
        await escrow.write.voteClaim([agreementId, claimId, true], {
          account: tenantWallets[v].account,
        });
      }
      if (spec.type === ClaimType.INDIVIDUAL) {
        individualApproved[spec.liableIndex ?? 0] += spec.amount;
      } else {
        sharedApproved += spec.amount;
      }
    } else if (spec.outcome === "reject") {
      const rejectionThreshold = tenantWallets.length - requiredApprovals + 1;
      for (let v = 0; v < rejectionThreshold; v++) {
        await escrow.write.voteClaim([agreementId, claimId, false], {
          account: tenantWallets[v].account,
        });
      }
    } else if (spec.outcome === "withdraw") {
      await escrow.write.withdrawPendingClaim([agreementId, claimId], {
        account: recipient.account,
      });
    }
    // "pending" claims are left untouched.
  }

  await time.increaseTo(timeline.settlementDeadline + 1n);
  return { agreementId, timeline, individualApproved, sharedApproved };
}

/** Finalizes and verifies stored refunds against the TypeScript settlement model. */
async function finalizeAndVerify(
  context: Awaited<ReturnType<typeof deployEscrowFixture>>,
  agreementId: bigint,
  tenantWallets: Wallet[],
  funded: bigint[],
  individualApproved: bigint[],
  sharedApproved: bigint,
) {
  const { escrow, creator, publicClient } = context;
  const balanceBefore = await publicClient.getBalance({
    address: escrow.address,
  });
  await escrow.write.finalizeAgreement([agreementId], {
    account: creator.account,
  });
  // Finalization moves no funds.
  expect(await publicClient.getBalance({ address: escrow.address })).to.equal(
    balanceBefore,
  );

  const expected = computeExpectedSettlement(
    funded,
    individualApproved,
    sharedApproved,
  );
  const totalFunded = funded.reduce((a, b) => a + b, 0n);
  let refundSum = 0n;
  for (let i = 0; i < tenantWallets.length; i++) {
    const tenant = await escrow.read.getTenant([
      agreementId,
      tenantWallets[i].account.address,
    ]);
    expect(tenant.refundAmount, `tenant ${i} refund`).to.equal(
      expected.refunds[i],
    );
    // No allocation exceeds the tenant's remaining balance.
    expect(
      expected.allocations[i] <= funded[i] - individualApproved[i],
    ).to.equal(true);
    refundSum += tenant.refundAmount;
  }
  const agreement = await escrow.read.getAgreement([agreementId]);
  expect(agreement.status).to.equal(AgreementStatus.FINALIZED);
  // The core conservation invariant: no dust, no underflow.
  expect(refundSum + agreement.totalApprovedClaims, "conservation").to.equal(
    totalFunded,
  );
  expect(await escrow.read.getRecipientPayout([agreementId])).to.equal(
    agreement.totalApprovedClaims,
  );
  return { refundSum, payout: agreement.totalApprovedClaims };
}

describe("SharedDepositEscrow — settlement and finalized withdrawals", () => {
  describe("agreement finalization", () => {
    async function activePastLeaseFixture() {
      const context = await deployEscrowFixture();
      const { escrow, creator, tenantB, recipient } = context;
      const tenantWallets = [creator, tenantB];
      const amounts = [parseEther("1"), parseEther("2")];
      const { agreementId, timeline } = await setupActiveAgreement(
        escrow,
        creator,
        recipient,
        tenantWallets,
        amounts,
      );
      await time.increaseTo(timeline.leaseEnd);
      return { ...context, agreementId, timeline, tenantWallets, amounts };
    }

    it("rejects finalization before and exactly at the settlement deadline", async () => {
      const { escrow, creator, agreementId, timeline } = await loadFixture(
        activePastLeaseFixture,
      );
      await expectRevert(
        escrow.write.finalizeAgreement([agreementId], {
          account: creator.account,
        }),
        "VotingStillOpen",
      );
      await time.setNextBlockTimestamp(timeline.settlementDeadline);
      await expectRevert(
        escrow.write.finalizeAgreement([agreementId], {
          account: creator.account,
        }),
        "VotingStillOpen",
      );
    });

    it("blocks finalization while unresolved claims remain", async () => {
      const { escrow, creator, recipient, agreementId, timeline } =
        await loadFixture(activePastLeaseFixture);
      await escrow.write.submitClaim(
        [
          agreementId,
          ClaimType.SHARED,
          ZERO_ADDRESS,
          1n,
          REASON_HASH,
          EVIDENCE_HASH,
        ],
        { account: recipient.account },
      );
      await time.increaseTo(timeline.settlementDeadline + 1n);
      await expectRevert(
        escrow.write.finalizeAgreement([agreementId], {
          account: creator.account,
        }),
        "UnresolvedClaimsRemain",
      );
      // Resolve the pending claim, then finalization succeeds.
      await escrow.write.finalizePendingClaim([agreementId, 1n], {
        account: creator.account,
      });
      await escrow.write.finalizeAgreement([agreementId], {
        account: creator.account,
      });
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.FINALIZED);
    });

    it("rejects finalization of non-active agreements", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB, recipient } = context;
      const timeline = await futureTimeline();
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [creator.account.address, tenantB.account.address],
        amounts: [1n, 1n],
        recipient: recipient.account.address,
        timeline,
      });
      await time.increaseTo(timeline.settlementDeadline + 1n);
      // Still FUNDING (never activated, never cancelled).
      await expectRevert(
        escrow.write.finalizeAgreement([agreementId], {
          account: creator.account,
        }),
        "InvalidStatus",
      );
      await escrow.write.cancelExpiredFunding([agreementId], {
        account: creator.account,
      });
      await expectRevert(
        escrow.write.finalizeAgreement([agreementId], {
          account: creator.account,
        }),
        "InvalidStatus",
      );
    });

    it("is permissionless (even an outsider may finalize) and emits exact event values", async () => {
      const {
        escrow,
        outsider,
        recipient,
        tenantWallets,
        agreementId,
        timeline,
      } = await loadFixture(activePastLeaseFixture);
      const amount = parseEther("0.9");
      await escrow.write.submitClaim(
        [
          agreementId,
          ClaimType.SHARED,
          ZERO_ADDRESS,
          amount,
          REASON_HASH,
          EVIDENCE_HASH,
        ],
        { account: recipient.account },
      );
      await escrow.write.voteClaim([agreementId, 1n, true], {
        account: tenantWallets[0].account,
      });
      await escrow.write.voteClaim([agreementId, 1n, true], {
        account: tenantWallets[1].account,
      });
      await time.increaseTo(timeline.settlementDeadline + 1n);
      await escrow.write.finalizeAgreement([agreementId], {
        account: outsider.account,
      });
      const events = await escrow.getEvents.AgreementFinalized();
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.recipientPayout).to.equal(amount);
      expect(events[0].args.tenantRefundTotal).to.equal(
        parseEther("3") - amount,
      );
    });

    it("rejects repeated finalization and post-finalization claim activity", async () => {
      const { escrow, creator, recipient, agreementId, timeline } =
        await loadFixture(activePastLeaseFixture);
      await time.increaseTo(timeline.settlementDeadline + 1n);
      await escrow.write.finalizeAgreement([agreementId], {
        account: creator.account,
      });
      await expectRevert(
        escrow.write.finalizeAgreement([agreementId], {
          account: creator.account,
        }),
        "InvalidStatus",
      );
      await expectRevert(
        escrow.write.submitClaim(
          [
            agreementId,
            ClaimType.SHARED,
            ZERO_ADDRESS,
            1n,
            REASON_HASH,
            EVIDENCE_HASH,
          ],
          { account: recipient.account },
        ),
        "InvalidStatus",
      );
    });
  });

  describe("settlement math (exact values against the documented algorithm)", () => {
    it("no claims: every tenant refunds exactly what it funded", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB, tenantC } = context;
      const tenantWallets = [creator, tenantB, tenantC];
      const amounts = [parseEther("1"), parseEther("2"), parseEther("3")];
      const s = await playScenario(context, tenantWallets, amounts, []);
      const { payout } = await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      expect(payout).to.equal(0n);
      const tenant = await context.escrow.read.getTenant([
        s.agreementId,
        creator.account.address,
      ]);
      expect(tenant.refundAmount).to.equal(parseEther("1"));
    });

    it("one approved individual claim reduces only the liable tenant", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB } = context;
      const tenantWallets = [creator, tenantB];
      const amounts = [parseEther("1"), parseEther("2")];
      const s = await playScenario(context, tenantWallets, amounts, [
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 1,
          amount: parseEther("0.5"),
          outcome: "approve",
        },
      ]);
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      const t0 = await context.escrow.read.getTenant([
        s.agreementId,
        creator.account.address,
      ]);
      const t1 = await context.escrow.read.getTenant([
        s.agreementId,
        tenantB.account.address,
      ]);
      expect(t0.refundAmount).to.equal(parseEther("1"));
      expect(t1.refundAmount).to.equal(parseEther("1.5"));
    });

    it("multiple individual claims on different tenants settle independently", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB, tenantC } = context;
      const tenantWallets = [creator, tenantB, tenantC];
      const amounts = [parseEther("1"), parseEther("2"), parseEther("3")];
      const s = await playScenario(context, tenantWallets, amounts, [
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 0,
          amount: parseEther("0.25"),
          outcome: "approve",
        },
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 2,
          amount: parseEther("1"),
          outcome: "approve",
        },
      ]);
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
    });

    it("one shared claim over equal contributions splits exactly", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB, tenantC } = context;
      const tenantWallets = [creator, tenantB, tenantC];
      const amounts = [parseEther("2"), parseEther("2"), parseEther("2")];
      const s = await playScenario(context, tenantWallets, amounts, [
        {
          type: ClaimType.SHARED,
          amount: parseEther("1.5"),
          outcome: "approve",
        },
      ]);
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      const t0 = await context.escrow.read.getTenant([
        s.agreementId,
        creator.account.address,
      ]);
      expect(t0.refundAmount).to.equal(parseEther("1.5")); // 2 - 0.5 exact
    });

    it("shared claim with indivisible remainder follows largest-remainder with index ties", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB } = context;
      const tenantWallets = [creator, tenantB];
      // Equal 1-ether contributions, shared claim of 1 wei: base allocations are 0,
      // fractional remainders are equal, so the tie goes to tenant index 0.
      const amounts = [parseEther("1"), parseEther("1")];
      const s = await playScenario(context, tenantWallets, amounts, [
        { type: ClaimType.SHARED, amount: 1n, outcome: "approve" },
      ]);
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      const t0 = await context.escrow.read.getTenant([
        s.agreementId,
        creator.account.address,
      ]);
      const t1 = await context.escrow.read.getTenant([
        s.agreementId,
        tenantB.account.address,
      ]);
      expect(t0.refundAmount).to.equal(parseEther("1") - 1n); // tie resolved to index 0
      expect(t1.refundAmount).to.equal(parseEther("1"));
    });

    it("distributes distinct fractional remainders to the largest first (hand-computed)", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB, tenantC } = context;
      const tenantWallets = [creator, tenantB, tenantC];
      // funded = [3, 5, 9] wei, shared = 7 wei, totalRemaining = 17.
      // base = floor(7*3/17)=1, floor(7*5/17)=2, floor(7*9/17)=3  → allocated 6, left 1.
      // frac = 21%17=4, 35%17=1, 63%17=12 → the extra wei goes to tenant 2.
      // alloc = [1, 2, 4] → refunds = [2, 3, 5].
      const amounts = [3n, 5n, 9n];
      const s = await playScenario(context, tenantWallets, amounts, [
        { type: ClaimType.SHARED, amount: 7n, outcome: "approve" },
      ]);
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      const refunds = [];
      for (const w of tenantWallets) {
        refunds.push(
          (
            await context.escrow.read.getTenant([
              s.agreementId,
              w.account.address,
            ])
          ).refundAmount,
        );
      }
      expect(refunds).to.deep.equal([2n, 3n, 5n]);
    });

    it("accumulates multiple shared and individual claims (mixed)", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB, tenantC } = context;
      const tenantWallets = [creator, tenantB, tenantC];
      const amounts = [parseEther("1"), parseEther("2"), parseEther("3")];
      const s = await playScenario(context, tenantWallets, amounts, [
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 1,
          amount: parseEther("0.7"),
          outcome: "approve",
        },
        {
          type: ClaimType.SHARED,
          amount: parseEther("0.31"),
          outcome: "approve",
        },
        {
          type: ClaimType.SHARED,
          amount: parseEther("0.29"),
          outcome: "approve",
        },
        { type: ClaimType.SHARED, amount: parseEther("1"), outcome: "reject" },
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 0,
          amount: parseEther("0.4"),
          outcome: "withdraw",
        },
      ]);
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
    });

    it("handles 1-wei contributions with a 1-wei shared claim", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB } = context;
      const tenantWallets = [creator, tenantB];
      const amounts = [1n, 1n];
      const s = await playScenario(context, tenantWallets, amounts, [
        { type: ClaimType.SHARED, amount: 1n, outcome: "approve" },
      ]);
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      const t0 = await context.escrow.read.getTenant([
        s.agreementId,
        creator.account.address,
      ]);
      const t1 = await context.escrow.read.getTenant([
        s.agreementId,
        tenantB.account.address,
      ]);
      expect(t0.refundAmount).to.equal(0n); // tie → index 0 pays the wei
      expect(t1.refundAmount).to.equal(1n);
    });

    it("shared total equal to the total remaining leaves zero refunds", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB } = context;
      const tenantWallets = [creator, tenantB];
      const amounts = [parseEther("1"), parseEther("2")];
      const s = await playScenario(context, tenantWallets, amounts, [
        { type: ClaimType.SHARED, amount: parseEther("3"), outcome: "approve" },
      ]);
      const { refundSum, payout } = await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      expect(refundSum).to.equal(0n);
      expect(payout).to.equal(parseEther("3"));
    });

    it("shared total one wei below the total remaining settles without underflow (uneven wei balances)", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB } = context;
      const tenantWallets = [creator, tenantB];
      // The Phase-0-identified pathological shape: a tiny remaining balance next to a
      // large one, shared total within one wei of everything.
      const amounts = [5n, 1n];
      const s = await playScenario(context, tenantWallets, amounts, [
        { type: ClaimType.SHARED, amount: 5n, outcome: "approve" },
      ]);
      const { refundSum } = await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      expect(refundSum).to.equal(1n); // exactly one wei refunded in total, no revert
    });

    it("gives no shared allocation to a tenant with zero remaining after individual deduction", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB, tenantC } = context;
      const tenantWallets = [creator, tenantB, tenantC];
      const amounts = [parseEther("1"), parseEther("2"), parseEther("3")];
      const s = await playScenario(context, tenantWallets, amounts, [
        // Tenant 0's entire contribution is individually deducted.
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 0,
          amount: parseEther("1"),
          outcome: "approve",
        },
        {
          type: ClaimType.SHARED,
          amount: parseEther("2.5"),
          outcome: "approve",
        },
      ]);
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      const t0 = await context.escrow.read.getTenant([
        s.agreementId,
        creator.account.address,
      ]);
      expect(t0.refundAmount).to.equal(0n);
    });

    it("handles every tenant fully deducted individually (all remaining zero, shared impossible)", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB } = context;
      const tenantWallets = [creator, tenantB];
      const amounts = [parseEther("1"), parseEther("2")];
      const s = await playScenario(context, tenantWallets, amounts, [
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 0,
          amount: parseEther("1"),
          outcome: "approve",
        },
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 1,
          amount: parseEther("2"),
          outcome: "approve",
        },
      ]);
      // A shared claim is now impossible: the reservation check blocks even 1 wei.
      await expectRevert(
        context.escrow.write.submitClaim(
          [
            s.agreementId,
            ClaimType.SHARED,
            ZERO_ADDRESS,
            1n,
            REASON_HASH,
            EVIDENCE_HASH,
          ],
          { account: context.recipient.account },
        ),
        // The claim window is already past the settlement deadline here, so timing
        // rejects first; assert the general revert and re-check via reservations in
        // the claims suite. The important part is the settlement below.
      );
      const { refundSum, payout } = await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      expect(refundSum).to.equal(0n);
      expect(payout).to.equal(parseEther("3"));
    });

    it("settles an 8-tenant agreement with unequal funding and mixed claims via the model", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, extra } = context;
      const tenantWallets = [creator, ...extra.slice(0, 7)];
      const amounts = tenantWallets.map(
        (_, i) => parseEther("0.5") * BigInt(i + 1) + BigInt(i * 13),
      );
      const s = await playScenario(context, tenantWallets, amounts, [
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 3,
          amount: parseEther("0.9"),
          outcome: "approve",
        },
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 6,
          amount: parseEther("1.3"),
          outcome: "approve",
        },
        {
          type: ClaimType.SHARED,
          amount: parseEther("2.000000000000000007"),
          outcome: "approve",
        },
        {
          type: ClaimType.SHARED,
          amount: parseEther("0.5"),
          outcome: "reject",
        },
      ]);
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
    });

    it("handles very large contributions near uint128 practicality without overflow", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB, recipient } = context;
      const tenantWallets = [creator, tenantB];
      const big = 1n << 99n; // ~6.3e29 wei each; totals far above real MON supply
      const amounts = [big, big + 12345n];
      for (const wallet of [...tenantWallets]) {
        await hre.network.provider.send("hardhat_setBalance", [
          wallet.account.address,
          `0x${(amounts[0] + amounts[1]).toString(16)}`,
        ]);
      }
      const s = await playScenario(context, tenantWallets, amounts, [
        {
          type: ClaimType.SHARED,
          amount: (1n << 98n) + 7n,
          outcome: "approve",
        },
      ]);
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      expect(recipient).to.not.equal(undefined);
      expect(escrow).to.not.equal(undefined);
    });

    it("sends a 1-wei shared claim to the largest fractional remainder among unequal tenants", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { creator, tenantB, tenantC } = context;
      const tenantWallets = [creator, tenantB, tenantC];
      // funded = [2, 3, 5]; shared = 1 wei; base all 0; frac = 2, 3, 5 → tenant 2 pays.
      const amounts = [2n, 3n, 5n];
      const s = await playScenario(context, tenantWallets, amounts, [
        { type: ClaimType.SHARED, amount: 1n, outcome: "approve" },
      ]);
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      const refunds = [];
      for (const w of tenantWallets) {
        refunds.push(
          (
            await context.escrow.read.getTenant([
              s.agreementId,
              w.account.address,
            ])
          ).refundAmount,
        );
      }
      expect(refunds).to.deep.equal([2n, 3n, 4n]);
    });
  });

  describe("finalized withdrawals", () => {
    async function finalizedFixture() {
      const context = await deployEscrowFixture();
      const { creator, tenantB, tenantC } = context;
      const tenantWallets = [creator, tenantB, tenantC];
      const amounts = [parseEther("1"), parseEther("2"), parseEther("3")];
      const s = await playScenario(context, tenantWallets, amounts, [
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 2,
          amount: parseEther("1"),
          outcome: "approve",
        },
        {
          type: ClaimType.SHARED,
          amount: parseEther("0.5"),
          outcome: "approve",
        },
      ]);
      await context.escrow.write.finalizeAgreement([s.agreementId], {
        account: context.creator.account,
      });
      return { ...context, ...s, tenantWallets, amounts };
    }

    it("pays each tenant its exact stored refund exactly once", async () => {
      const { escrow, publicClient, tenantWallets, agreementId } =
        await loadFixture(finalizedFixture);
      for (const wallet of tenantWallets) {
        const stored = (
          await escrow.read.getTenant([agreementId, wallet.account.address])
        ).refundAmount;
        const before = await publicClient.getBalance({
          address: wallet.account.address,
        });
        const txHash = await escrow.write.withdrawTenantRefund([agreementId], {
          account: wallet.account,
        });
        const receipt = await publicClient.getTransactionReceipt({
          hash: txHash,
        });
        const after = await publicClient.getBalance({
          address: wallet.account.address,
        });
        expect(after - before).to.equal(
          stored - receipt.gasUsed * receipt.effectiveGasPrice,
        );
        const record = await escrow.read.getTenant([
          agreementId,
          wallet.account.address,
        ]);
        expect(record.refundWithdrawn).to.equal(true);
        expect(record.refundAmount, "stored refund is never changed").to.equal(
          stored,
        );
        await expectRevert(
          escrow.write.withdrawTenantRefund([agreementId], {
            account: wallet.account,
          }),
          "AlreadyWithdrawn",
        );
      }
      const events = await publicClient.getContractEvents({
        address: escrow.address,
        abi: escrow.abi,
        eventName: "TenantRefundWithdrawn",
        fromBlock: 0n,
      });
      expect(events).to.have.lengthOf(tenantWallets.length);
    });

    it("pays the recipient the exact stored payout exactly once", async () => {
      const { escrow, publicClient, recipient, agreementId } =
        await loadFixture(finalizedFixture);
      const payout = await escrow.read.getRecipientPayout([agreementId]);
      expect(payout).to.equal(parseEther("1.5"));
      const before = await publicClient.getBalance({
        address: recipient.account.address,
      });
      const txHash = await escrow.write.withdrawRecipientPayout([agreementId], {
        account: recipient.account,
      });
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash,
      });
      const after = await publicClient.getBalance({
        address: recipient.account.address,
      });
      expect(after - before).to.equal(
        payout - receipt.gasUsed * receipt.effectiveGasPrice,
      );
      const events = await escrow.getEvents.RecipientPayoutWithdrawn();
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.amount).to.equal(payout);
      await expectRevert(
        escrow.write.withdrawRecipientPayout([agreementId], {
          account: recipient.account,
        }),
        "AlreadyWithdrawn",
      );
    });

    it("rejects wrong callers for both withdrawal paths", async () => {
      const {
        escrow,
        recipient,
        outsider,
        deployer,
        tenantWallets,
        agreementId,
      } = await loadFixture(finalizedFixture);
      await expectRevert(
        escrow.write.withdrawTenantRefund([agreementId], {
          account: outsider.account,
        }),
        "NotTenant",
      );
      await expectRevert(
        escrow.write.withdrawTenantRefund([agreementId], {
          account: recipient.account,
        }),
        "NotTenant",
      );
      await expectRevert(
        escrow.write.withdrawRecipientPayout([agreementId], {
          account: tenantWallets[0].account,
        }),
        "NotRecipient",
      );
      await expectRevert(
        escrow.write.withdrawRecipientPayout([agreementId], {
          account: outsider.account,
        }),
        "NotRecipient",
      );
      await expectRevert(
        escrow.write.withdrawRecipientPayout([agreementId], {
          account: deployer.account,
        }),
        "NotRecipient",
      );
    });

    it("rejects withdrawals before finalization and zero-value withdrawals", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB, recipient } = context;
      const tenantWallets = [creator, tenantB];
      const amounts = [parseEther("1"), parseEther("1")];
      const s = await playScenario(context, tenantWallets, amounts, []);
      // Not finalized yet.
      await expectRevert(
        escrow.write.withdrawTenantRefund([s.agreementId], {
          account: creator.account,
        }),
        "InvalidStatus",
      );
      await escrow.write.finalizeAgreement([s.agreementId], {
        account: creator.account,
      });
      // No approved claims → zero payout → the recipient has nothing to withdraw.
      await expectRevert(
        escrow.write.withdrawRecipientPayout([s.agreementId], {
          account: recipient.account,
        }),
        "NothingToWithdraw",
      );
    });

    it("rejects a zero-refund tenant's withdrawal", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB } = context;
      const tenantWallets = [creator, tenantB];
      const amounts = [parseEther("1"), parseEther("2")];
      const s = await playScenario(context, tenantWallets, amounts, [
        // Tenant 0 is fully deducted individually → refund 0.
        {
          type: ClaimType.INDIVIDUAL,
          liableIndex: 0,
          amount: parseEther("1"),
          outcome: "approve",
        },
      ]);
      await escrow.write.finalizeAgreement([s.agreementId], {
        account: creator.account,
      });
      await expectRevert(
        escrow.write.withdrawTenantRefund([s.agreementId], {
          account: creator.account,
        }),
        "NothingToWithdraw",
      );
    });

    it("supports any withdrawal order and never blocks others on a lazy party", async () => {
      const { escrow, publicClient, recipient, tenantWallets, agreementId } =
        await loadFixture(finalizedFixture);
      // Recipient first, then one tenant; another tenant never withdraws.
      await escrow.write.withdrawRecipientPayout([agreementId], {
        account: recipient.account,
      });
      await escrow.write.withdrawTenantRefund([agreementId], {
        account: tenantWallets[1].account,
      });
      // Liability conservation: the contract still holds exactly the un-withdrawn refunds.
      const t0 = await escrow.read.getTenant([
        agreementId,
        tenantWallets[0].account.address,
      ]);
      const t2 = await escrow.read.getTenant([
        agreementId,
        tenantWallets[2].account.address,
      ]);
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(t0.refundAmount + t2.refundAmount);
      await escrow.write.withdrawTenantRefund([agreementId], {
        account: tenantWallets[0].account,
      });
      await escrow.write.withdrawTenantRefund([agreementId], {
        account: tenantWallets[2].account,
      });
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(0n);
    });

    it("blocks reentrancy and failed transfers on the tenant refund path", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB, recipient, publicClient } = context;
      const proxy = await hre.viem.deployContract("TenantProxy", [
        escrow.address,
      ]);
      const timeline = await futureTimeline();
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [
          creator.account.address,
          proxy.address,
          tenantB.account.address,
        ],
        amounts: [parseEther("1"), parseEther("1"), parseEther("1")],
        recipient: recipient.account.address,
        timeline,
      });
      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      for (const w of [creator, tenantB]) {
        await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
          account: w.account,
        });
        await escrow.write.deposit([agreementId], {
          account: w.account,
          value: parseEther("1"),
        });
      }
      await proxy.write.acceptAsTenant([agreementId, TERMS_HASH]);
      await proxy.write.deposit([agreementId], { value: parseEther("1") });
      await time.increaseTo(timeline.settlementDeadline + 1n);
      await escrow.write.finalizeAgreement([agreementId], {
        account: creator.account,
      });

      // REENTER_REFUND: receive() re-calls withdrawTenantRefund → guard reverts all.
      await proxy.write.setMode([4, agreementId, 0n]);
      await expectRevert(proxy.write.withdrawTenantRefund([agreementId]));
      let record = await escrow.read.getTenant([agreementId, proxy.address]);
      expect(record.refundWithdrawn).to.equal(false);
      const balance = await publicClient.getBalance({
        address: escrow.address,
      });
      expect(balance).to.equal(parseEther("3"));

      // REJECT: failed transfer reverts the whole state transition.
      await proxy.write.setMode([1, agreementId, 0n]);
      await expectRevert(proxy.write.withdrawTenantRefund([agreementId]));
      record = await escrow.read.getTenant([agreementId, proxy.address]);
      expect(record.refundWithdrawn).to.equal(false);

      // Normal mode: exactly one successful withdrawal.
      await proxy.write.setMode([0, agreementId, 0n]);
      await proxy.write.withdrawTenantRefund([agreementId]);
      record = await escrow.read.getTenant([agreementId, proxy.address]);
      expect(record.refundWithdrawn).to.equal(true);
      await expectRevert(proxy.write.withdrawTenantRefund([agreementId]));
    });

    it("blocks reentrancy and failed transfers on the recipient payout path", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB, publicClient } = context;
      const proxy = await hre.viem.deployContract("TenantProxy", [
        escrow.address,
      ]);
      const timeline = await futureTimeline();
      // The proxy contract is the recipient this time.
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [creator.account.address, tenantB.account.address],
        amounts: [parseEther("1"), parseEther("1")],
        recipient: proxy.address,
        timeline,
      });
      await proxy.write.acceptAsRecipient([agreementId, TERMS_HASH]);
      for (const w of [creator, tenantB]) {
        await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
          account: w.account,
        });
        await escrow.write.deposit([agreementId], {
          account: w.account,
          value: parseEther("1"),
        });
      }
      await time.increaseTo(timeline.leaseEnd);
      await proxy.write.submitClaim([
        agreementId,
        ClaimType.SHARED,
        ZERO_ADDRESS,
        parseEther("0.8"),
        REASON_HASH,
        EVIDENCE_HASH,
      ]);
      await escrow.write.voteClaim([agreementId, 1n, true], {
        account: creator.account,
      });
      await escrow.write.voteClaim([agreementId, 1n, true], {
        account: tenantB.account,
      });
      await time.increaseTo(timeline.settlementDeadline + 1n);
      await escrow.write.finalizeAgreement([agreementId], {
        account: creator.account,
      });

      await proxy.write.setMode([5, agreementId, 0n]); // REENTER_PAYOUT
      await expectRevert(proxy.write.withdrawRecipientPayout([agreementId]));
      let agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.recipientPayoutWithdrawn).to.equal(false);

      await proxy.write.setMode([1, agreementId, 0n]); // REJECT
      await expectRevert(proxy.write.withdrawRecipientPayout([agreementId]));

      await proxy.write.setMode([0, agreementId, 0n]);
      await proxy.write.withdrawRecipientPayout([agreementId]);
      agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.recipientPayoutWithdrawn).to.equal(true);
      expect(
        await publicClient.getBalance({ address: proxy.address }),
      ).to.equal(parseEther("0.8"));
      await expectRevert(proxy.write.withdrawRecipientPayout([agreementId]));
    });
  });

  describe("forced MON never changes entitlements", () => {
    async function forceSend(target: Address, amount: bigint) {
      await hre.viem.deployContract("ForceSend", [target], { value: amount });
    }

    it("ignores forced MON before claims: capacity still derives from totalFunded", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB, recipient, publicClient } = context;
      const tenantWallets = [creator, tenantB];
      const amounts = [parseEther("1"), parseEther("1")];
      const { agreementId, timeline } = await setupActiveAgreement(
        escrow,
        creator,
        recipient,
        tenantWallets,
        amounts,
      );
      await forceSend(escrow.address, parseEther("5"));
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(parseEther("7"));
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(
        agreement.totalFunded,
        "totalFunded unaffected by forced MON",
      ).to.equal(parseEther("2"));
      await time.increaseTo(timeline.leaseEnd);
      // A claim above totalFunded still fails even though the raw balance would cover it.
      await expectRevert(
        escrow.write.submitClaim(
          [
            agreementId,
            ClaimType.SHARED,
            ZERO_ADDRESS,
            parseEther("2") + 1n,
            REASON_HASH,
            EVIDENCE_HASH,
          ],
          { account: recipient.account },
        ),
        "ClaimExceedsAvailableDeposit",
      );
    });

    it("keeps refunds, payout, and withdrawals exact despite forced MON; excess stays unallocated", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB, recipient, publicClient } = context;
      const tenantWallets = [creator, tenantB];
      const amounts = [parseEther("1"), parseEther("2")];
      const s = await playScenario(context, tenantWallets, amounts, [
        {
          type: ClaimType.SHARED,
          amount: parseEther("0.6"),
          outcome: "approve",
        },
      ]);
      const forced = parseEther("3.33");
      await forceSend(escrow.address, forced); // before finalization
      await finalizeAndVerify(
        context,
        s.agreementId,
        tenantWallets,
        amounts,
        s.individualApproved,
        s.sharedApproved,
      );
      await forceSend(escrow.address, 7n); // after finalization

      // Everyone withdraws; amounts are exactly the recorded entitlements.
      await escrow.write.withdrawRecipientPayout([s.agreementId], {
        account: recipient.account,
      });
      for (const w of tenantWallets) {
        await escrow.write.withdrawTenantRefund([s.agreementId], {
          account: w.account,
        });
      }
      // Only the forced excess remains; nobody can withdraw it and no sweep exists.
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(forced + 7n);
      await expectRevert(
        escrow.write.withdrawRecipientPayout([s.agreementId], {
          account: recipient.account,
        }),
        "AlreadyWithdrawn",
      );
      await expectRevert(
        escrow.write.withdrawTenantRefund([s.agreementId], {
          account: creator.account,
        }),
        "AlreadyWithdrawn",
      );
    });
  });
});
