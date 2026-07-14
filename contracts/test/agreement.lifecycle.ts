import { expect } from "chai";
import { parseEther } from "viem";
import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import {
  AgreementStatus,
  createAgreement,
  deployEscrowFixture,
  expectRevert,
  futureTimeline,
  OTHER_HASH,
  TERMS_HASH,
  ZERO_ADDRESS,
  ZERO_HASH,
} from "./helpers";

describe("SharedDepositEscrow — agreement lifecycle", () => {
  describe("creation", () => {
    it("creates a valid agreement, stores exact state, and emits AgreementCreated", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      const timeline = await futureTimeline();
      const amounts = [parseEther("1.5"), parseEther("0.5")];

      const agreementId = await createAgreement(escrow, creator, {
        tenants: [creator.account.address, tenantB.account.address],
        amounts,
        recipient: recipient.account.address,
        timeline,
      });

      const events = await escrow.getEvents.AgreementCreated();
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.agreementId).to.equal(agreementId);
      expect(events[0].args.creator?.toLowerCase()).to.equal(
        creator.account.address.toLowerCase(),
      );
      expect(events[0].args.recipient?.toLowerCase()).to.equal(
        recipient.account.address.toLowerCase(),
      );
      expect(events[0].args.termsHash).to.equal(TERMS_HASH);
      // The stored total is recomputed onchain from individual amounts; there is no
      // caller-supplied total parameter that could be forged.
      expect(events[0].args.totalRequired).to.equal(amounts[0] + amounts[1]);

      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.creator.toLowerCase()).to.equal(
        creator.account.address.toLowerCase(),
      );
      expect(agreement.recipient.toLowerCase()).to.equal(
        recipient.account.address.toLowerCase(),
      );
      expect(agreement.termsHash).to.equal(TERMS_HASH);
      expect(agreement.leaseStart).to.equal(timeline.leaseStart);
      expect(agreement.leaseEnd).to.equal(timeline.leaseEnd);
      expect(agreement.fundingDeadline).to.equal(timeline.fundingDeadline);
      expect(agreement.claimDeadline).to.equal(timeline.claimDeadline);
      expect(agreement.settlementDeadline).to.equal(
        timeline.settlementDeadline,
      );
      expect(agreement.tenantCount).to.equal(2);
      expect(agreement.requiredApprovals).to.equal(2);
      expect(agreement.totalRequired).to.equal(amounts[0] + amounts[1]);
      expect(agreement.totalFunded).to.equal(0n);
      expect(agreement.totalCancelledFundingWithdrawn).to.equal(0n);
      expect(agreement.recipientAccepted).to.equal(false);
      expect(agreement.status).to.equal(AgreementStatus.FUNDING);

      const tenantList = await escrow.read.getAgreementTenants([agreementId]);
      expect(tenantList.map((a) => a.toLowerCase())).to.deep.equal([
        creator.account.address.toLowerCase(),
        tenantB.account.address.toLowerCase(),
      ]);

      const tenant = await escrow.read.getTenant([
        agreementId,
        tenantB.account.address,
      ]);
      expect(tenant.requiredAmount).to.equal(amounts[1]);
      expect(tenant.fundedAmount).to.equal(0n);
      expect(tenant.index).to.equal(1);
      expect(tenant.exists).to.equal(true);
      expect(tenant.accepted).to.equal(false);
    });

    it("assigns sequential agreement IDs starting at 1", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      const base = {
        tenants: [creator.account.address, tenantB.account.address],
        amounts: [1n, 1n],
        recipient: recipient.account.address,
      };
      const first = await createAgreement(escrow, creator, base);
      const second = await createAgreement(escrow, creator, base);
      const third = await createAgreement(escrow, creator, base);
      expect(first).to.equal(1n);
      expect(second).to.equal(2n);
      expect(third).to.equal(3n);
      expect(await escrow.read.nextAgreementId()).to.equal(4n);
    });

    it("computes the strict-majority threshold for 2 through 8 tenants", async () => {
      const { escrow, creator, recipient, extra } =
        await loadFixture(deployEscrowFixture);
      for (let count = 2; count <= 8; count++) {
        const tenants = [
          creator.account.address,
          ...extra.slice(0, count - 1).map((w) => w.account.address),
        ];
        const agreementId = await createAgreement(escrow, creator, {
          tenants,
          amounts: tenants.map(() => 1n),
          recipient: recipient.account.address,
        });
        const agreement = await escrow.read.getAgreement([agreementId]);
        expect(agreement.requiredApprovals, `tenantCount=${count}`).to.equal(
          Math.floor(count / 2) + 1,
        );
      }
    });

    it("rejects a creator that is not a listed tenant", async () => {
      const { escrow, creator, tenantB, tenantC, recipient } =
        await loadFixture(deployEscrowFixture);
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [tenantB.account.address, tenantC.account.address],
          amounts: [1n, 1n],
          recipient: recipient.account.address,
        }),
        "CreatorMustBeTenant",
      );
    });

    it("rejects fewer than 2 tenants", async () => {
      const { escrow, creator, recipient } =
        await loadFixture(deployEscrowFixture);
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [creator.account.address],
          amounts: [1n],
          recipient: recipient.account.address,
        }),
        "InvalidTenantCount",
      );
    });

    it("rejects more than 8 tenants", async () => {
      const { escrow, creator, recipient, extra } =
        await loadFixture(deployEscrowFixture);
      const tenants = [
        creator.account.address,
        ...extra.slice(0, 8).map((w) => w.account.address),
      ];
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants,
          amounts: tenants.map(() => 1n),
          recipient: recipient.account.address,
        }),
        "InvalidTenantCount",
      );
    });

    it("rejects duplicate tenants", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [
            creator.account.address,
            tenantB.account.address,
            tenantB.account.address,
          ],
          amounts: [1n, 1n, 1n],
          recipient: recipient.account.address,
        }),
        "DuplicateTenant",
      );
    });

    it("rejects a zero tenant address", async () => {
      const { escrow, creator, recipient } =
        await loadFixture(deployEscrowFixture);
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [creator.account.address, ZERO_ADDRESS],
          amounts: [1n, 1n],
          recipient: recipient.account.address,
        }),
        "InvalidAddress",
      );
    });

    it("rejects a zero recipient", async () => {
      const { escrow, creator, tenantB } =
        await loadFixture(deployEscrowFixture);
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [creator.account.address, tenantB.account.address],
          amounts: [1n, 1n],
          recipient: ZERO_ADDRESS,
        }),
        "InvalidAddress",
      );
    });

    it("rejects a recipient that is also a tenant", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [
            creator.account.address,
            recipient.account.address,
            tenantB.account.address,
          ],
          amounts: [1n, 1n, 1n],
          recipient: recipient.account.address,
        }),
        "RecipientCannotBeTenant",
      );
    });

    it("rejects a zero contribution", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [creator.account.address, tenantB.account.address],
          amounts: [1n, 0n],
          recipient: recipient.account.address,
        }),
        "InvalidAmount",
      );
    });

    it("rejects mismatched tenant/amount array lengths", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [creator.account.address, tenantB.account.address],
          amounts: [1n],
          recipient: recipient.account.address,
        }),
        "InvalidTenantCount",
      );
    });

    it("rejects a zero terms hash", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [creator.account.address, tenantB.account.address],
          amounts: [1n, 1n],
          recipient: recipient.account.address,
          termsHash: ZERO_HASH,
        }),
        "InvalidTermsHash",
      );
    });

    it("rejects a funding deadline that is not in the future", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      const now = BigInt(await time.latest());
      const timeline = await futureTimeline();
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [creator.account.address, tenantB.account.address],
          amounts: [1n, 1n],
          recipient: recipient.account.address,
          // The next block's timestamp is strictly greater than `now`, so a deadline
          // equal to `now` is already in the past when the transaction executes.
          timeline: { ...timeline, fundingDeadline: now },
        }),
        "InvalidTimeline",
      );
    });

    it("rejects fundingDeadline after leaseEnd", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      const timeline = await futureTimeline();
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [creator.account.address, tenantB.account.address],
          amounts: [1n, 1n],
          recipient: recipient.account.address,
          timeline: { ...timeline, fundingDeadline: timeline.leaseEnd + 1n },
        }),
        "InvalidTimeline",
      );
    });

    it("rejects leaseStart after leaseEnd", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      const timeline = await futureTimeline();
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [creator.account.address, tenantB.account.address],
          amounts: [1n, 1n],
          recipient: recipient.account.address,
          timeline: { ...timeline, leaseStart: timeline.leaseEnd + 1n },
        }),
        "InvalidTimeline",
      );
    });

    it("rejects claimDeadline at or before leaseEnd", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      const timeline = await futureTimeline();
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [creator.account.address, tenantB.account.address],
          amounts: [1n, 1n],
          recipient: recipient.account.address,
          timeline: { ...timeline, claimDeadline: timeline.leaseEnd },
        }),
        "InvalidTimeline",
      );
    });

    it("rejects settlementDeadline at or before claimDeadline", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      const timeline = await futureTimeline();
      await expectRevert(
        createAgreement(escrow, creator, {
          tenants: [creator.account.address, tenantB.account.address],
          amounts: [1n, 1n],
          recipient: recipient.account.address,
          timeline: { ...timeline, settlementDeadline: timeline.claimDeadline },
        }),
        "InvalidTimeline",
      );
    });

    it("reverts view lookups for unknown agreements and non-tenants", async () => {
      const { escrow, creator, tenantB, recipient, outsider } =
        await loadFixture(deployEscrowFixture);
      await expectRevert(escrow.read.getAgreement([999n]), "InvalidAgreement");
      await expectRevert(
        escrow.read.getAgreementTenants([999n]),
        "InvalidAgreement",
      );
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [creator.account.address, tenantB.account.address],
        amounts: [1n, 1n],
        recipient: recipient.account.address,
      });
      await expectRevert(
        escrow.read.getTenant([agreementId, outsider.account.address]),
        "NotTenant",
      );
    });
  });

  describe("acceptance", () => {
    async function acceptanceFixture() {
      const context = await deployEscrowFixture();
      const { escrow, creator, tenantB, recipient } = context;
      const timeline = await futureTimeline();
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [creator.account.address, tenantB.account.address],
        amounts: [parseEther("1"), parseEther("2")],
        recipient: recipient.account.address,
        timeline,
      });
      return { ...context, agreementId, timeline };
    }

    it("lets a listed tenant accept once and emits TenantAccepted", async () => {
      const { escrow, creator, agreementId } =
        await loadFixture(acceptanceFixture);
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: creator.account,
      });
      const events = await escrow.getEvents.TenantAccepted();
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.tenant?.toLowerCase()).to.equal(
        creator.account.address.toLowerCase(),
      );
      const tenant = await escrow.read.getTenant([
        agreementId,
        creator.account.address,
      ]);
      expect(tenant.accepted).to.equal(true);
    });

    it("lets the configured recipient accept once and emits RecipientAccepted", async () => {
      const { escrow, recipient, agreementId } =
        await loadFixture(acceptanceFixture);
      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      const events = await escrow.getEvents.RecipientAccepted();
      expect(events).to.have.lengthOf(1);
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.recipientAccepted).to.equal(true);
    });

    it("rejects duplicate tenant acceptance", async () => {
      const { escrow, creator, agreementId } =
        await loadFixture(acceptanceFixture);
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: creator.account,
      });
      await expectRevert(
        escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
          account: creator.account,
        }),
        "AlreadyAccepted",
      );
    });

    it("rejects duplicate recipient acceptance", async () => {
      const { escrow, recipient, agreementId } =
        await loadFixture(acceptanceFixture);
      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      await expectRevert(
        escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
          account: recipient.account,
        }),
        "AlreadyAccepted",
      );
    });

    it("rejects acceptance from a non-tenant", async () => {
      const { escrow, outsider, agreementId } =
        await loadFixture(acceptanceFixture);
      await expectRevert(
        escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
          account: outsider.account,
        }),
        "NotTenant",
      );
    });

    it("rejects acceptAsRecipient from a wallet that is not the recipient", async () => {
      const { escrow, outsider, creator, agreementId } =
        await loadFixture(acceptanceFixture);
      await expectRevert(
        escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
          account: outsider.account,
        }),
        "NotRecipient",
      );
      await expectRevert(
        escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
          account: creator.account,
        }),
        "NotRecipient",
      );
    });

    it("rejects tenant and recipient acceptance with a mismatched terms hash", async () => {
      const { escrow, creator, recipient, agreementId } =
        await loadFixture(acceptanceFixture);
      await expectRevert(
        escrow.write.acceptAsTenant([agreementId, OTHER_HASH], {
          account: creator.account,
        }),
        "TermsMismatch",
      );
      await expectRevert(
        escrow.write.acceptAsRecipient([agreementId, OTHER_HASH], {
          account: recipient.account,
        }),
        "TermsMismatch",
      );
    });

    it("rejects acceptance after the funding deadline", async () => {
      const { escrow, creator, recipient, agreementId, timeline } =
        await loadFixture(acceptanceFixture);
      await time.increaseTo(timeline.fundingDeadline + 1n);
      await expectRevert(
        escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
          account: creator.account,
        }),
        "FundingDeadlinePassed",
      );
      await expectRevert(
        escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
          account: recipient.account,
        }),
        "FundingDeadlinePassed",
      );
    });

    it("does not activate on acceptances alone", async () => {
      const { escrow, creator, tenantB, recipient, agreementId } =
        await loadFixture(acceptanceFixture);
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: creator.account,
      });
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: tenantB.account,
      });
      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.FUNDING);
      expect(await escrow.read.isAgreementReady([agreementId])).to.equal(false);
    });
  });

  describe("funding", () => {
    async function fundingFixture() {
      const context = await deployEscrowFixture();
      const { escrow, creator, tenantB, recipient } = context;
      const timeline = await futureTimeline();
      const amounts = [parseEther("1"), parseEther("2")];
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [creator.account.address, tenantB.account.address],
        amounts,
        recipient: recipient.account.address,
        timeline,
      });
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: creator.account,
      });
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: tenantB.account,
      });
      return { ...context, agreementId, timeline, amounts };
    }

    it("rejects a deposit from a tenant that has not accepted", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB, recipient } = context;
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [creator.account.address, tenantB.account.address],
        amounts: [parseEther("1"), parseEther("1")],
        recipient: recipient.account.address,
      });
      await expectRevert(
        escrow.write.deposit([agreementId], {
          account: creator.account,
          value: 1n,
        }),
        "TenantNotAccepted",
      );
    });

    it("accepts a partial deposit and updates exact accounting", async () => {
      const { escrow, creator, agreementId, publicClient } =
        await loadFixture(fundingFixture);
      const amount = parseEther("0.25");
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: amount,
      });

      const events = await escrow.getEvents.DepositAdded();
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.amount).to.equal(amount);
      expect(events[0].args.tenantFunded).to.equal(amount);

      const tenant = await escrow.read.getTenant([
        agreementId,
        creator.account.address,
      ]);
      expect(tenant.fundedAmount).to.equal(amount);
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.totalFunded).to.equal(amount);
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(amount);
    });

    it("accumulates multiple partial deposits up to the exact contribution", async () => {
      const { escrow, creator, agreementId } =
        await loadFixture(fundingFixture);
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("0.4"),
      });
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("0.35"),
      });
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("0.25"),
      });
      const tenant = await escrow.read.getTenant([
        agreementId,
        creator.account.address,
      ]);
      expect(tenant.fundedAmount).to.equal(parseEther("1"));
      expect(
        await escrow.read.getRemainingContribution([
          agreementId,
          creator.account.address,
        ]),
      ).to.equal(0n);
    });

    it("rejects a zero-value deposit", async () => {
      const { escrow, creator, agreementId } =
        await loadFixture(fundingFixture);
      await expectRevert(
        escrow.write.deposit([agreementId], {
          account: creator.account,
          value: 0n,
        }),
        "InvalidAmount",
      );
    });

    it("rejects overfunding in a single deposit", async () => {
      const { escrow, creator, agreementId } =
        await loadFixture(fundingFixture);
      await expectRevert(
        escrow.write.deposit([agreementId], {
          account: creator.account,
          value: parseEther("1") + 1n,
        }),
        "Overfunding",
      );
    });

    it("rejects cumulative overfunding past the remaining amount", async () => {
      const { escrow, creator, agreementId } =
        await loadFixture(fundingFixture);
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("0.75"),
      });
      await expectRevert(
        escrow.write.deposit([agreementId], {
          account: creator.account,
          value: parseEther("0.25") + 1n,
        }),
        "Overfunding",
      );
    });

    it("rejects deposits from non-tenants", async () => {
      const { escrow, outsider, recipient, agreementId } =
        await loadFixture(fundingFixture);
      await expectRevert(
        escrow.write.deposit([agreementId], {
          account: outsider.account,
          value: 1n,
        }),
        "NotTenant",
      );
      await expectRevert(
        escrow.write.deposit([agreementId], {
          account: recipient.account,
          value: 1n,
        }),
        "NotTenant",
      );
    });

    it("allows a deposit exactly at the funding deadline and rejects one after it", async () => {
      const { escrow, creator, agreementId, timeline } =
        await loadFixture(fundingFixture);
      await time.setNextBlockTimestamp(timeline.fundingDeadline);
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: 1n,
      });
      await time.setNextBlockTimestamp(timeline.fundingDeadline + 1n);
      await expectRevert(
        escrow.write.deposit([agreementId], {
          account: creator.account,
          value: 1n,
        }),
        "FundingDeadlinePassed",
      );
    });

    it("rejects deposits after cancellation", async () => {
      const { escrow, creator, agreementId, timeline } =
        await loadFixture(fundingFixture);
      await time.increaseTo(timeline.fundingDeadline + 1n);
      await escrow.write.cancelExpiredFunding([agreementId], {
        account: creator.account,
      });
      await expectRevert(
        escrow.write.deposit([agreementId], {
          account: creator.account,
          value: 1n,
        }),
        "InvalidStatus",
      );
    });

    it("credits only the sender's own slot; another tenant's slot is never affected", async () => {
      const { escrow, creator, tenantB, agreementId } =
        await loadFixture(fundingFixture);
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("1"),
      });
      const other = await escrow.read.getTenant([
        agreementId,
        tenantB.account.address,
      ]);
      expect(other.fundedAmount).to.equal(0n);
      // The creator's slot is full; it cannot deposit into tenantB's slot because
      // deposit() has no tenant parameter and now rejects any further value.
      await expectRevert(
        escrow.write.deposit([agreementId], {
          account: creator.account,
          value: 1n,
        }),
        "Overfunding",
      );
    });

    it("reports the exact remaining contribution", async () => {
      const { escrow, tenantB, agreementId } =
        await loadFixture(fundingFixture);
      expect(
        await escrow.read.getRemainingContribution([
          agreementId,
          tenantB.account.address,
        ]),
      ).to.equal(parseEther("2"));
      await escrow.write.deposit([agreementId], {
        account: tenantB.account,
        value: parseEther("0.5"),
      });
      expect(
        await escrow.read.getRemainingContribution([
          agreementId,
          tenantB.account.address,
        ]),
      ).to.equal(parseEther("1.5"));
    });

    it("supports 1 wei contributions end to end", async () => {
      const context = await loadFixture(deployEscrowFixture);
      const { escrow, creator, tenantB, recipient } = context;
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [creator.account.address, tenantB.account.address],
        amounts: [1n, 1n],
        recipient: recipient.account.address,
      });
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: creator.account,
      });
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: tenantB.account,
      });
      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: 1n,
      });
      await escrow.write.deposit([agreementId], {
        account: tenantB.account,
        value: 1n,
      });
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.ACTIVE);
      expect(agreement.totalFunded).to.equal(2n);
    });
  });

  describe("activation", () => {
    async function activationFixture() {
      const context = await deployEscrowFixture();
      const { escrow, creator, tenantB, recipient } = context;
      const amounts = [parseEther("1"), parseEther("2")];
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [creator.account.address, tenantB.account.address],
        amounts,
        recipient: recipient.account.address,
      });
      return { ...context, agreementId, amounts };
    }

    it("does not activate while any tenant has not accepted", async () => {
      const { escrow, creator, tenantB, recipient, agreementId } =
        await loadFixture(activationFixture);
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: creator.account,
      });
      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("1"),
      });
      // tenantB has not accepted (and cannot fund), so the agreement stays FUNDING.
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.FUNDING);
      expect(tenantB.account.address).to.not.equal(undefined);
    });

    it("does not activate while the recipient has not accepted", async () => {
      const { escrow, creator, tenantB, agreementId } =
        await loadFixture(activationFixture);
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: creator.account,
      });
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: tenantB.account,
      });
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("1"),
      });
      await escrow.write.deposit([agreementId], {
        account: tenantB.account,
        value: parseEther("2"),
      });
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.FUNDING);
      expect(await escrow.read.isAgreementReady([agreementId])).to.equal(false);
    });

    it("does not activate while any tenant is not exactly fully funded", async () => {
      const { escrow, creator, tenantB, recipient, agreementId } =
        await loadFixture(activationFixture);
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: creator.account,
      });
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: tenantB.account,
      });
      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("1"),
      });
      await escrow.write.deposit([agreementId], {
        account: tenantB.account,
        value: parseEther("2") - 1n,
      });
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.FUNDING);
    });

    it("activates on the final qualifying deposit and emits AgreementActivated once", async () => {
      const { escrow, creator, tenantB, recipient, agreementId, publicClient } =
        await loadFixture(activationFixture);
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: creator.account,
      });
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: tenantB.account,
      });
      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("1"),
      });
      await escrow.write.deposit([agreementId], {
        account: tenantB.account,
        value: parseEther("2"),
      });

      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.ACTIVE);
      expect(agreement.totalFunded).to.equal(parseEther("3"));

      const activations = await publicClient.getContractEvents({
        address: escrow.address,
        abi: escrow.abi,
        eventName: "AgreementActivated",
        fromBlock: 0n,
      });
      expect(activations).to.have.lengthOf(1);
    });

    it("activates on the final qualifying acceptance when funding completed first", async () => {
      const { escrow, creator, tenantB, recipient, agreementId } =
        await loadFixture(activationFixture);
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: creator.account,
      });
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: tenantB.account,
      });
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("1"),
      });
      await escrow.write.deposit([agreementId], {
        account: tenantB.account,
        value: parseEther("2"),
      });
      let agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.FUNDING);

      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.ACTIVE);
    });

    it("rejects further acceptance and funding after activation", async () => {
      const { escrow, creator, tenantB, recipient, agreementId } =
        await loadFixture(activationFixture);
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: creator.account,
      });
      await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
        account: tenantB.account,
      });
      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("1"),
      });
      await escrow.write.deposit([agreementId], {
        account: tenantB.account,
        value: parseEther("2"),
      });
      await expectRevert(
        escrow.write.deposit([agreementId], {
          account: creator.account,
          value: 1n,
        }),
        "InvalidStatus",
      );
      await expectRevert(
        escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
          account: creator.account,
        }),
        "InvalidStatus",
      );
    });

    it("activates an 8-tenant agreement with unequal contributions", async () => {
      const { escrow, creator, recipient, extra, publicClient } =
        await loadFixture(deployEscrowFixture);
      const others = extra.slice(0, 7);
      const tenants = [
        creator.account.address,
        ...others.map((w) => w.account.address),
      ];
      const amounts = tenants.map(
        (_, i) => parseEther("0.1") * BigInt(i + 1) + BigInt(i),
      );
      const agreementId = await createAgreement(escrow, creator, {
        tenants,
        amounts,
        recipient: recipient.account.address,
      });
      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      const wallets = [creator, ...others];
      for (let i = 0; i < wallets.length; i++) {
        await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
          account: wallets[i].account,
        });
        await escrow.write.deposit([agreementId], {
          account: wallets[i].account,
          value: amounts[i],
        });
      }
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.ACTIVE);
      const expectedTotal = amounts.reduce((a, b) => a + b, 0n);
      expect(agreement.totalFunded).to.equal(expectedTotal);
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(expectedTotal);
    });
  });
});
