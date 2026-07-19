import { expect } from "chai";
import { parseEther } from "viem";
import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import {
  AgreementStatus,
  ClaimStatus,
  ClaimType,
  createAgreement,
  deployEscrowFixture,
  EVIDENCE_HASH,
  expectRevert,
  futureTimeline,
  REASON_HASH,
  setupActiveAgreement,
  TERMS_HASH,
  ZERO_ADDRESS,
  ZERO_HASH,
} from "./helpers";

/** Three-tenant ACTIVE agreement with the chain advanced into the claim window. */
async function claimWindowFixture() {
  const context = await deployEscrowFixture();
  const { escrow, creator, tenantB, tenantC, recipient } = context;
  const tenantWallets = [creator, tenantB, tenantC];
  const amounts = [parseEther("1"), parseEther("2"), parseEther("3")];
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

function sharedClaimArgs(amount: bigint) {
  return [
    ClaimType.SHARED,
    ZERO_ADDRESS,
    amount,
    REASON_HASH,
    EVIDENCE_HASH,
  ] as const;
}

describe("SharedDepositEscrow - claims and voting", () => {
  describe("claim submission", () => {
    it("accepts a valid shared claim, stores it immutably, and updates accounting", async () => {
      const { escrow, recipient, agreementId } =
        await loadFixture(claimWindowFixture);
      const amount = parseEther("0.5");
      await escrow.write.submitClaim(
        [agreementId, ...sharedClaimArgs(amount)],
        {
          account: recipient.account,
        },
      );

      const events = await escrow.getEvents.ClaimSubmitted();
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.claimId).to.equal(1n);
      expect(events[0].args.claimType).to.equal(ClaimType.SHARED);
      expect(events[0].args.amount).to.equal(amount);
      expect(events[0].args.reasonHash).to.equal(REASON_HASH);
      expect(events[0].args.evidenceHash).to.equal(EVIDENCE_HASH);

      const claim = await escrow.read.getClaim([agreementId, 1n]);
      expect(claim.status).to.equal(ClaimStatus.PENDING);
      expect(claim.claimType).to.equal(ClaimType.SHARED);
      expect(claim.liableTenant).to.equal(ZERO_ADDRESS);
      expect(claim.amount).to.equal(amount);
      expect(claim.yesVotes).to.equal(0);
      expect(claim.noVotes).to.equal(0);

      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.claimCount).to.equal(1);
      expect(agreement.unresolvedClaimCount).to.equal(1);
      expect(agreement.totalOpenClaimAmount).to.equal(amount);
      expect(agreement.totalApprovedClaims).to.equal(0n);
    });

    it("accepts a valid individual claim and reserves the liable tenant's amount", async () => {
      const { escrow, recipient, tenantB, agreementId } =
        await loadFixture(claimWindowFixture);
      const amount = parseEther("0.75");
      await escrow.write.submitClaim(
        [
          agreementId,
          ClaimType.INDIVIDUAL,
          tenantB.account.address,
          amount,
          REASON_HASH,
          EVIDENCE_HASH,
        ],
        { account: recipient.account },
      );
      const claim = await escrow.read.getClaim([agreementId, 1n]);
      expect(claim.claimType).to.equal(ClaimType.INDIVIDUAL);
      expect(claim.liableTenant.toLowerCase()).to.equal(
        tenantB.account.address.toLowerCase(),
      );
      const liable = await escrow.read.getTenant([
        agreementId,
        tenantB.account.address,
      ]);
      expect(liable.openIndividualClaimAmount).to.equal(amount);
      expect(liable.approvedIndividualClaims).to.equal(0n);
    });

    it("assigns sequential claim IDs starting at 1", async () => {
      const { escrow, recipient, agreementId } =
        await loadFixture(claimWindowFixture);
      await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
        account: recipient.account,
      });
      await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(2n)], {
        account: recipient.account,
      });
      const first = await escrow.read.getClaim([agreementId, 1n]);
      const second = await escrow.read.getClaim([agreementId, 2n]);
      expect(first.amount).to.equal(1n);
      expect(second.amount).to.equal(2n);
      await expectRevert(
        escrow.read.getClaim([agreementId, 3n]),
        "InvalidClaim",
      );
    });

    it("rejects submission by anyone except the recipient", async () => {
      const { escrow, creator, outsider, agreementId } =
        await loadFixture(claimWindowFixture);
      await expectRevert(
        escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
          account: creator.account,
        }),
        "NotRecipient",
      );
      await expectRevert(
        escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
          account: outsider.account,
        }),
        "NotRecipient",
      );
    });

    it("rejects submission before the lease end and allows it exactly at the lease end", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB, recipient } = context;
      const { agreementId, timeline } = await setupActiveAgreement(
        escrow,
        creator,
        recipient,
        [creator, tenantB],
        [parseEther("1"), parseEther("1")],
      );
      await expectRevert(
        escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
          account: recipient.account,
        }),
        "ClaimWindowNotOpen",
      );
      await time.setNextBlockTimestamp(timeline.leaseEnd);
      await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
        account: recipient.account,
      });
      const claim = await escrow.read.getClaim([agreementId, 1n]);
      expect(claim.status).to.equal(ClaimStatus.PENDING);
    });

    it("allows submission exactly at the claim deadline and rejects it after", async () => {
      const { escrow, recipient, agreementId, timeline } =
        await loadFixture(claimWindowFixture);
      await time.setNextBlockTimestamp(timeline.claimDeadline);
      await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
        account: recipient.account,
      });
      await time.setNextBlockTimestamp(timeline.claimDeadline + 1n);
      await expectRevert(
        escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
          account: recipient.account,
        }),
        "ClaimWindowClosed",
      );
    });

    it("rejects submission on a non-active agreement", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB, recipient } = context;
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [creator.account.address, tenantB.account.address],
        amounts: [1n, 1n],
        recipient: recipient.account.address,
      });
      await expectRevert(
        escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
          account: recipient.account,
        }),
        "InvalidStatus",
      );
    });

    it("rejects zero amount, zero reason hash, and zero evidence hash", async () => {
      const { escrow, recipient, agreementId } =
        await loadFixture(claimWindowFixture);
      await expectRevert(
        escrow.write.submitClaim([agreementId, ...sharedClaimArgs(0n)], {
          account: recipient.account,
        }),
        "InvalidAmount",
      );
      await expectRevert(
        escrow.write.submitClaim(
          [
            agreementId,
            ClaimType.SHARED,
            ZERO_ADDRESS,
            1n,
            ZERO_HASH,
            EVIDENCE_HASH,
          ],
          { account: recipient.account },
        ),
        "MissingEvidence",
      );
      await expectRevert(
        escrow.write.submitClaim(
          [
            agreementId,
            ClaimType.SHARED,
            ZERO_ADDRESS,
            1n,
            REASON_HASH,
            ZERO_HASH,
          ],
          { account: recipient.account },
        ),
        "MissingEvidence",
      );
    });

    it("rejects malformed liable-tenant combinations", async () => {
      const { escrow, recipient, outsider, creator, agreementId } =
        await loadFixture(claimWindowFixture);
      // Shared claim must use the zero address.
      await expectRevert(
        escrow.write.submitClaim(
          [
            agreementId,
            ClaimType.SHARED,
            creator.account.address,
            1n,
            REASON_HASH,
            EVIDENCE_HASH,
          ],
          { account: recipient.account },
        ),
        "InvalidClaim",
      );
      // Individual claim must name an existing tenant.
      await expectRevert(
        escrow.write.submitClaim(
          [
            agreementId,
            ClaimType.INDIVIDUAL,
            ZERO_ADDRESS,
            1n,
            REASON_HASH,
            EVIDENCE_HASH,
          ],
          { account: recipient.account },
        ),
        "InvalidClaim",
      );
      await expectRevert(
        escrow.write.submitClaim(
          [
            agreementId,
            ClaimType.INDIVIDUAL,
            outsider.account.address,
            1n,
            REASON_HASH,
            EVIDENCE_HASH,
          ],
          { account: recipient.account },
        ),
        "InvalidClaim",
      );
      // The recipient is never a tenant, so naming it must fail the same way.
      await expectRevert(
        escrow.write.submitClaim(
          [
            agreementId,
            ClaimType.INDIVIDUAL,
            recipient.account.address,
            1n,
            REASON_HASH,
            EVIDENCE_HASH,
          ],
          { account: recipient.account },
        ),
        "InvalidClaim",
      );
    });

    it("enforces the global reservation limit across open and approved claims", async () => {
      const { escrow, recipient, tenantWallets, agreementId } =
        await loadFixture(claimWindowFixture);
      // totalFunded = 6 MON. Open 4 MON, approve it, then open 2 MON more.
      await escrow.write.submitClaim(
        [agreementId, ...sharedClaimArgs(parseEther("4"))],
        {
          account: recipient.account,
        },
      );
      // Approve claim 1 with a strict majority (2 of 3).
      await escrow.write.voteClaim([agreementId, 1n, true], {
        account: tenantWallets[0].account,
      });
      await escrow.write.voteClaim([agreementId, 1n, true], {
        account: tenantWallets[1].account,
      });
      await escrow.write.submitClaim(
        [agreementId, ...sharedClaimArgs(parseEther("2"))],
        {
          account: recipient.account,
        },
      );
      // Approved (4) + open (2) == funded (6): even 1 more wei must fail.
      await expectRevert(
        escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
          account: recipient.account,
        }),
        "ClaimExceedsAvailableDeposit",
      );
    });

    it("enforces the per-tenant individual reservation limit", async () => {
      const { escrow, recipient, creator, agreementId } =
        await loadFixture(claimWindowFixture);
      // Creator funded exactly 1 MON.
      await escrow.write.submitClaim(
        [
          agreementId,
          ClaimType.INDIVIDUAL,
          creator.account.address,
          parseEther("1"),
          REASON_HASH,
          EVIDENCE_HASH,
        ],
        { account: recipient.account },
      );
      await expectRevert(
        escrow.write.submitClaim(
          [
            agreementId,
            ClaimType.INDIVIDUAL,
            creator.account.address,
            1n,
            REASON_HASH,
            EVIDENCE_HASH,
          ],
          { account: recipient.account },
        ),
        "IndividualClaimExceedsTenantBalance",
      );
    });

    it("accepts exactly 32 lifetime claims and rejects the 33rd, counting withdrawn claims", async () => {
      const { escrow, recipient, agreementId } =
        await loadFixture(claimWindowFixture);
      for (let i = 0; i < 32; i++) {
        await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
          account: recipient.account,
        });
      }
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.claimCount).to.equal(32);
      await expectRevert(
        escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
          account: recipient.account,
        }),
        "TooManyClaims",
      );
      // Withdrawing claims does not free claim IDs: the limit is lifetime.
      await escrow.write.withdrawPendingClaim([agreementId, 1n], {
        account: recipient.account,
      });
      await escrow.write.withdrawPendingClaim([agreementId, 2n], {
        account: recipient.account,
      });
      await expectRevert(
        escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
          account: recipient.account,
        }),
        "TooManyClaims",
      );
      const after = await escrow.read.getAgreement([agreementId]);
      expect(after.claimCount).to.equal(32); // claimCount never decreases
    });
  });

  describe("pending claim withdrawal", () => {
    it("withdraws a pending shared claim and releases the global reservation", async () => {
      const { escrow, recipient, agreementId } =
        await loadFixture(claimWindowFixture);
      const amount = parseEther("1.5");
      await escrow.write.submitClaim(
        [agreementId, ...sharedClaimArgs(amount)],
        {
          account: recipient.account,
        },
      );
      await escrow.write.withdrawPendingClaim([agreementId, 1n], {
        account: recipient.account,
      });

      const events = await escrow.getEvents.ClaimWithdrawn();
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.amount).to.equal(amount);

      const claim = await escrow.read.getClaim([agreementId, 1n]);
      expect(claim.status).to.equal(ClaimStatus.WITHDRAWN);
      // Historical values are untouched.
      expect(claim.amount).to.equal(amount);
      expect(claim.reasonHash).to.equal(REASON_HASH);

      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.totalOpenClaimAmount).to.equal(0n);
      expect(agreement.totalApprovedClaims).to.equal(0n);
      expect(agreement.unresolvedClaimCount).to.equal(0);
      expect(agreement.claimCount).to.equal(1);
    });

    it("withdraws a pending individual claim and releases the tenant reservation", async () => {
      const { escrow, recipient, tenantB, agreementId } =
        await loadFixture(claimWindowFixture);
      await escrow.write.submitClaim(
        [
          agreementId,
          ClaimType.INDIVIDUAL,
          tenantB.account.address,
          parseEther("1"),
          REASON_HASH,
          EVIDENCE_HASH,
        ],
        { account: recipient.account },
      );
      await escrow.write.withdrawPendingClaim([agreementId, 1n], {
        account: recipient.account,
      });
      const liable = await escrow.read.getTenant([
        agreementId,
        tenantB.account.address,
      ]);
      expect(liable.openIndividualClaimAmount).to.equal(0n);
      expect(liable.approvedIndividualClaims).to.equal(0n);
    });

    it("does not reuse a withdrawn claim's ID", async () => {
      const { escrow, recipient, agreementId } =
        await loadFixture(claimWindowFixture);
      await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
        account: recipient.account,
      });
      await escrow.write.withdrawPendingClaim([agreementId, 1n], {
        account: recipient.account,
      });
      await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(2n)], {
        account: recipient.account,
      });
      const withdrawn = await escrow.read.getClaim([agreementId, 1n]);
      const next = await escrow.read.getClaim([agreementId, 2n]);
      expect(withdrawn.status).to.equal(ClaimStatus.WITHDRAWN);
      expect(next.status).to.equal(ClaimStatus.PENDING);
      expect(next.amount).to.equal(2n);
    });

    it("rejects withdrawal by non-recipients and of non-pending claims", async () => {
      const { escrow, recipient, creator, tenantWallets, agreementId } =
        await loadFixture(claimWindowFixture);
      await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
        account: recipient.account,
      });
      await expectRevert(
        escrow.write.withdrawPendingClaim([agreementId, 1n], {
          account: creator.account,
        }),
        "NotRecipient",
      );
      // Approve claim 1 (2 of 3 YES), then withdrawal must fail.
      await escrow.write.voteClaim([agreementId, 1n, true], {
        account: tenantWallets[0].account,
      });
      await escrow.write.voteClaim([agreementId, 1n, true], {
        account: tenantWallets[1].account,
      });
      await expectRevert(
        escrow.write.withdrawPendingClaim([agreementId, 1n], {
          account: recipient.account,
        }),
        "InvalidClaim",
      );
      // Reject claim 2 (2 of 3 NO), then withdrawal must fail.
      await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
        account: recipient.account,
      });
      await escrow.write.voteClaim([agreementId, 2n, false], {
        account: tenantWallets[0].account,
      });
      await escrow.write.voteClaim([agreementId, 2n, false], {
        account: tenantWallets[1].account,
      });
      await expectRevert(
        escrow.write.withdrawPendingClaim([agreementId, 2n], {
          account: recipient.account,
        }),
        "InvalidClaim",
      );
      // Withdrawn claim cannot be withdrawn twice.
      await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
        account: recipient.account,
      });
      await escrow.write.withdrawPendingClaim([agreementId, 3n], {
        account: recipient.account,
      });
      await expectRevert(
        escrow.write.withdrawPendingClaim([agreementId, 3n], {
          account: recipient.account,
        }),
        "InvalidClaim",
      );
    });
  });

  describe("voting", () => {
    async function pendingClaimFixture() {
      const context = await claimWindowFixture();
      const { escrow, recipient, agreementId } = context;
      await escrow.write.submitClaim(
        [agreementId, ...sharedClaimArgs(parseEther("1"))],
        {
          account: recipient.account,
        },
      );
      return { ...context, claimId: 1n };
    }

    it("records YES and NO votes with events and immutable vote state", async () => {
      const { escrow, tenantWallets, agreementId, claimId } =
        await loadFixture(pendingClaimFixture);
      await escrow.write.voteClaim([agreementId, claimId, true], {
        account: tenantWallets[0].account,
      });
      const yesEvents = await escrow.getEvents.ClaimVoted();
      expect(yesEvents).to.have.lengthOf(1);
      expect(yesEvents[0].args.support).to.equal(true);

      await escrow.write.voteClaim([agreementId, claimId, false], {
        account: tenantWallets[1].account,
      });

      const claim = await escrow.read.getClaim([agreementId, claimId]);
      expect(claim.yesVotes).to.equal(1);
      expect(claim.noVotes).to.equal(1);
      expect(
        await escrow.read.getVote([
          agreementId,
          claimId,
          tenantWallets[0].account.address,
        ]),
      ).to.equal(1);
      expect(
        await escrow.read.getVote([
          agreementId,
          claimId,
          tenantWallets[1].account.address,
        ]),
      ).to.equal(2);
      expect(
        await escrow.read.getVote([
          agreementId,
          claimId,
          tenantWallets[2].account.address,
        ]),
      ).to.equal(0);
    });

    it("rejects votes from non-tenants and the recipient", async () => {
      const { escrow, outsider, recipient, agreementId, claimId } =
        await loadFixture(pendingClaimFixture);
      await expectRevert(
        escrow.write.voteClaim([agreementId, claimId, true], {
          account: outsider.account,
        }),
        "NotTenant",
      );
      await expectRevert(
        escrow.write.voteClaim([agreementId, claimId, true], {
          account: recipient.account,
        }),
        "NotTenant",
      );
    });

    it("rejects duplicate votes and vote mutation", async () => {
      const { escrow, tenantWallets, agreementId, claimId } =
        await loadFixture(pendingClaimFixture);
      await escrow.write.voteClaim([agreementId, claimId, true], {
        account: tenantWallets[0].account,
      });
      await expectRevert(
        escrow.write.voteClaim([agreementId, claimId, true], {
          account: tenantWallets[0].account,
        }),
        "AlreadyVoted",
      );
      // Changing the choice is also a duplicate vote.
      await expectRevert(
        escrow.write.voteClaim([agreementId, claimId, false], {
          account: tenantWallets[0].account,
        }),
        "AlreadyVoted",
      );
    });

    it("rejects votes on missing, withdrawn, approved, and rejected claims", async () => {
      const { escrow, recipient, tenantWallets, agreementId, claimId } =
        await loadFixture(pendingClaimFixture);
      await expectRevert(
        escrow.write.voteClaim([agreementId, 99n, true], {
          account: tenantWallets[0].account,
        }),
        "InvalidClaim",
      );
      // Withdrawn claim.
      await escrow.write.withdrawPendingClaim([agreementId, claimId], {
        account: recipient.account,
      });
      await expectRevert(
        escrow.write.voteClaim([agreementId, claimId, true], {
          account: tenantWallets[0].account,
        }),
        "InvalidClaim",
      );
      // Approved claim (claim 2, 2/3 YES): the third tenant cannot vote afterwards.
      await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
        account: recipient.account,
      });
      await escrow.write.voteClaim([agreementId, 2n, true], {
        account: tenantWallets[0].account,
      });
      await escrow.write.voteClaim([agreementId, 2n, true], {
        account: tenantWallets[1].account,
      });
      await expectRevert(
        escrow.write.voteClaim([agreementId, 2n, true], {
          account: tenantWallets[2].account,
        }),
        "InvalidClaim",
      );
      // Rejected claim (claim 3, 2/3 NO): the third tenant cannot vote afterwards.
      await escrow.write.submitClaim([agreementId, ...sharedClaimArgs(1n)], {
        account: recipient.account,
      });
      await escrow.write.voteClaim([agreementId, 3n, false], {
        account: tenantWallets[0].account,
      });
      await escrow.write.voteClaim([agreementId, 3n, false], {
        account: tenantWallets[1].account,
      });
      await expectRevert(
        escrow.write.voteClaim([agreementId, 3n, true], {
          account: tenantWallets[2].account,
        }),
        "InvalidClaim",
      );
    });

    it("allows voting exactly at the settlement deadline and rejects it after", async () => {
      const { escrow, tenantWallets, agreementId, claimId, timeline } =
        await loadFixture(pendingClaimFixture);
      await time.setNextBlockTimestamp(timeline.settlementDeadline);
      await escrow.write.voteClaim([agreementId, claimId, true], {
        account: tenantWallets[0].account,
      });
      await time.setNextBlockTimestamp(timeline.settlementDeadline + 1n);
      await expectRevert(
        escrow.write.voteClaim([agreementId, claimId, true], {
          account: tenantWallets[1].account,
        }),
        "VotingClosed",
      );
    });

    it("applies the exact strict-majority and impossibility thresholds for 2..8 tenants", async () => {
      // Sequential agreements on one escrow; each tenant count gets a fresh agreement.
      const { escrow, creator, recipient, extra } =
        await loadFixture(deployEscrowFixture);
      for (const count of [2, 3, 4, 5, 8]) {
        const tenantWallets = [creator, ...extra.slice(0, count - 1)];
        const amounts = tenantWallets.map(() => parseEther("1"));
        const { agreementId, timeline } = await setupActiveAgreement(
          escrow,
          creator,
          recipient,
          tenantWallets,
          amounts,
        );
        await time.increaseTo(timeline.leaseEnd);

        const requiredApprovals = Math.floor(count / 2) + 1;
        const rejectionThreshold = count - requiredApprovals + 1;

        // Approval path: claim 1. Not approved at threshold-1, approved at threshold.
        await escrow.write.submitClaim(
          [agreementId, ...sharedClaimArgs(parseEther("0.5"))],
          {
            account: recipient.account,
          },
        );
        for (let v = 0; v < requiredApprovals; v++) {
          await escrow.write.voteClaim([agreementId, 1n, true], {
            account: tenantWallets[v].account,
          });
          const claim = await escrow.read.getClaim([agreementId, 1n]);
          if (v < requiredApprovals - 1) {
            expect(
              claim.status,
              `n=${count}, yes=${v + 1}: premature approval`,
            ).to.equal(ClaimStatus.PENDING);
          } else {
            expect(
              claim.status,
              `n=${count}, yes=${v + 1}: should approve`,
            ).to.equal(ClaimStatus.APPROVED);
          }
        }

        // Rejection path: claim 2. Not rejected before the impossibility point.
        await escrow.write.submitClaim(
          [agreementId, ...sharedClaimArgs(parseEther("0.5"))],
          {
            account: recipient.account,
          },
        );
        for (let v = 0; v < rejectionThreshold; v++) {
          await escrow.write.voteClaim([agreementId, 2n, false], {
            account: tenantWallets[v].account,
          });
          const claim = await escrow.read.getClaim([agreementId, 2n]);
          if (v < rejectionThreshold - 1) {
            expect(
              claim.status,
              `n=${count}, no=${v + 1}: premature rejection`,
            ).to.equal(ClaimStatus.PENDING);
          } else {
            expect(
              claim.status,
              `n=${count}, no=${v + 1}: should reject`,
            ).to.equal(ClaimStatus.REJECTED);
          }
        }
      }
    });

    it("moves amounts from open to approved buckets on shared approval", async () => {
      const { escrow, tenantWallets, agreementId, claimId } =
        await loadFixture(pendingClaimFixture);
      await escrow.write.voteClaim([agreementId, claimId, true], {
        account: tenantWallets[0].account,
      });
      await escrow.write.voteClaim([agreementId, claimId, true], {
        account: tenantWallets[1].account,
      });
      const events = await escrow.getEvents.ClaimApproved();
      expect(events).to.have.lengthOf(1);
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.totalOpenClaimAmount).to.equal(0n);
      expect(agreement.totalApprovedClaims).to.equal(parseEther("1"));
      expect(agreement.sharedApprovedClaims).to.equal(parseEther("1"));
      expect(agreement.unresolvedClaimCount).to.equal(0);
    });

    it("moves amounts into the liable tenant's approved bucket on individual approval", async () => {
      const { escrow, recipient, tenantB, tenantWallets, agreementId } =
        await loadFixture(claimWindowFixture);
      const amount = parseEther("1.25");
      await escrow.write.submitClaim(
        [
          agreementId,
          ClaimType.INDIVIDUAL,
          tenantB.account.address,
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
        account: tenantWallets[2].account,
      });
      const liable = await escrow.read.getTenant([
        agreementId,
        tenantB.account.address,
      ]);
      expect(liable.openIndividualClaimAmount).to.equal(0n);
      expect(liable.approvedIndividualClaims).to.equal(amount);
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.totalApprovedClaims).to.equal(amount);
      expect(agreement.sharedApprovedClaims).to.equal(0n);
    });

    it("releases reservations on rejection without touching approved totals", async () => {
      const { escrow, recipient, tenantB, tenantWallets, agreementId } =
        await loadFixture(claimWindowFixture);
      await escrow.write.submitClaim(
        [
          agreementId,
          ClaimType.INDIVIDUAL,
          tenantB.account.address,
          parseEther("2"),
          REASON_HASH,
          EVIDENCE_HASH,
        ],
        { account: recipient.account },
      );
      await escrow.write.voteClaim([agreementId, 1n, false], {
        account: tenantWallets[0].account,
      });
      await escrow.write.voteClaim([agreementId, 1n, false], {
        account: tenantWallets[1].account,
      });
      const events = await escrow.getEvents.ClaimRejected();
      expect(events).to.have.lengthOf(1);
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.totalOpenClaimAmount).to.equal(0n);
      expect(agreement.totalApprovedClaims).to.equal(0n);
      const liable = await escrow.read.getTenant([
        agreementId,
        tenantB.account.address,
      ]);
      expect(liable.openIndividualClaimAmount).to.equal(0n);
      expect(liable.approvedIndividualClaims).to.equal(0n);
    });
  });

  describe("post-deadline pending claim finalization", () => {
    async function pendingPastDeadlineFixture() {
      const context = await claimWindowFixture();
      const { escrow, recipient, tenantWallets, agreementId } = context;
      // Claim 1: one YES (below the 2-of-3 threshold), left pending.
      await escrow.write.submitClaim(
        [
          agreementId,
          ClaimType.SHARED,
          ZERO_ADDRESS,
          parseEther("1"),
          REASON_HASH,
          EVIDENCE_HASH,
        ],
        { account: recipient.account },
      );
      await escrow.write.voteClaim([agreementId, 1n, true], {
        account: tenantWallets[0].account,
      });
      return { ...context, claimId: 1n };
    }

    it("rejects finalization before and exactly at the settlement deadline", async () => {
      const { escrow, creator, agreementId, claimId, timeline } =
        await loadFixture(pendingPastDeadlineFixture);
      await expectRevert(
        escrow.write.finalizePendingClaim([agreementId, claimId], {
          account: creator.account,
        }),
        "VotingStillOpen",
      );
      await time.setNextBlockTimestamp(timeline.settlementDeadline);
      await expectRevert(
        escrow.write.finalizePendingClaim([agreementId, claimId], {
          account: creator.account,
        }),
        "VotingStillOpen",
      );
    });

    it("rejects a below-threshold pending claim after the deadline with full accounting release", async () => {
      const { escrow, creator, agreementId, claimId, timeline } =
        await loadFixture(pendingPastDeadlineFixture);
      await time.increaseTo(timeline.settlementDeadline + 1n);
      await escrow.write.finalizePendingClaim([agreementId, claimId], {
        account: creator.account,
      });
      const claim = await escrow.read.getClaim([agreementId, claimId]);
      expect(claim.status).to.equal(ClaimStatus.REJECTED);
      const events = await escrow.getEvents.ClaimRejected();
      expect(events).to.have.lengthOf(1);
      const agreement = await escrow.read.getAgreement([agreementId]);
      // Identical accounting to a vote-based rejection.
      expect(agreement.totalOpenClaimAmount).to.equal(0n);
      expect(agreement.totalApprovedClaims).to.equal(0n);
      expect(agreement.unresolvedClaimCount).to.equal(0);
    });

    it("may be called by any participant but not by outsiders", async () => {
      const {
        escrow,
        recipient,
        outsider,
        deployer,
        agreementId,
        claimId,
        timeline,
      } = await loadFixture(pendingPastDeadlineFixture);
      await time.increaseTo(timeline.settlementDeadline + 1n);
      await expectRevert(
        escrow.write.finalizePendingClaim([agreementId, claimId], {
          account: outsider.account,
        }),
        "NotParticipant",
      );
      await expectRevert(
        escrow.write.finalizePendingClaim([agreementId, claimId], {
          account: deployer.account,
        }),
        "NotParticipant",
      );
      // The recipient is a participant.
      await escrow.write.finalizePendingClaim([agreementId, claimId], {
        account: recipient.account,
      });
      const claim = await escrow.read.getClaim([agreementId, claimId]);
      expect(claim.status).to.equal(ClaimStatus.REJECTED);
    });

    it("rejects repeat finalization, finalizing resolved claims, and voting afterwards", async () => {
      const { escrow, creator, tenantWallets, agreementId, claimId, timeline } =
        await loadFixture(pendingPastDeadlineFixture);
      await time.increaseTo(timeline.settlementDeadline + 1n);
      await escrow.write.finalizePendingClaim([agreementId, claimId], {
        account: creator.account,
      });
      await expectRevert(
        escrow.write.finalizePendingClaim([agreementId, claimId], {
          account: creator.account,
        }),
        "InvalidClaim",
      );
      await expectRevert(
        escrow.write.voteClaim([agreementId, claimId, true], {
          account: tenantWallets[1].account,
        }),
        "VotingClosed",
      );
    });
  });
});
