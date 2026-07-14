import { expect } from "chai";
import hre from "hardhat";
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
  TERMS_HASH,
} from "./helpers";

/** Two-tenant agreement with both tenants accepted; nothing funded yet. */
async function acceptedFixture() {
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

/** Partially funded agreement, then expired and cancelled. */
async function cancelledFixture() {
  const context = await acceptedFixture();
  const { escrow, creator, tenantB, agreementId, timeline } = context;
  await escrow.write.deposit([agreementId], {
    account: creator.account,
    value: parseEther("1"),
  });
  await escrow.write.deposit([agreementId], {
    account: tenantB.account,
    value: parseEther("0.5"),
  });
  await time.increaseTo(timeline.fundingDeadline + 1n);
  await escrow.write.cancelExpiredFunding([agreementId], {
    account: creator.account,
  });
  return context;
}

describe("SharedDepositEscrow — withdrawals and security", () => {
  describe("pre-activation withdrawal", () => {
    it("lets a tenant withdraw part of its own funding with exact accounting", async () => {
      const { escrow, creator, agreementId, publicClient } =
        await loadFixture(acceptedFixture);
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("0.8"),
      });
      const withdrawal = parseEther("0.3");

      const balanceBefore = await publicClient.getBalance({
        address: creator.account.address,
      });
      const txHash = await escrow.write.withdrawFundingBeforeActivation(
        [agreementId, withdrawal],
        { account: creator.account },
      );
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash,
      });
      const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
      const balanceAfter = await publicClient.getBalance({
        address: creator.account.address,
      });

      // The tenant received exactly the withdrawn amount (minus its own gas).
      expect(balanceAfter - balanceBefore).to.equal(withdrawal - gasCost);

      const events = await escrow.getEvents.FundingWithdrawn();
      expect(events).to.have.lengthOf(1);
      expect(events[0].args.amount).to.equal(withdrawal);

      const tenant = await escrow.read.getTenant([
        agreementId,
        creator.account.address,
      ]);
      expect(tenant.fundedAmount).to.equal(parseEther("0.5"));
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.totalFunded).to.equal(parseEther("0.5"));
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(parseEther("0.5"));
    });

    it("rejects withdrawing more than the funded amount", async () => {
      const { escrow, creator, agreementId } =
        await loadFixture(acceptedFixture);
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("0.5"),
      });
      await expectRevert(
        escrow.write.withdrawFundingBeforeActivation(
          [agreementId, parseEther("0.5") + 1n],
          {
            account: creator.account,
          },
        ),
        "InvalidAmount",
      );
    });

    it("rejects a zero-amount withdrawal", async () => {
      const { escrow, creator, agreementId } =
        await loadFixture(acceptedFixture);
      await expectRevert(
        escrow.write.withdrawFundingBeforeActivation([agreementId, 0n], {
          account: creator.account,
        }),
        "InvalidAmount",
      );
    });

    it("rejects withdrawal by an unfunded tenant", async () => {
      const { escrow, tenantB, agreementId } =
        await loadFixture(acceptedFixture);
      await expectRevert(
        escrow.write.withdrawFundingBeforeActivation([agreementId, 1n], {
          account: tenantB.account,
        }),
        "InvalidAmount",
      );
    });

    it("rejects withdrawal by a non-tenant", async () => {
      const { escrow, outsider, agreementId } =
        await loadFixture(acceptedFixture);
      await expectRevert(
        escrow.write.withdrawFundingBeforeActivation([agreementId, 1n], {
          account: outsider.account,
        }),
        "NotTenant",
      );
    });

    it("rejects withdrawal after activation", async () => {
      const { escrow, creator, tenantB, recipient, agreementId } =
        await loadFixture(acceptedFixture);
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
        escrow.write.withdrawFundingBeforeActivation([agreementId, 1n], {
          account: creator.account,
        }),
        "InvalidStatus",
      );
    });

    it("makes a ready agreement unready until the amount is redeposited", async () => {
      const { escrow, creator, tenantB, recipient, agreementId } =
        await loadFixture(acceptedFixture);
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("1"),
      });
      // Creator withdraws after fully funding; later completion must still activate.
      await escrow.write.withdrawFundingBeforeActivation(
        [agreementId, parseEther("0.5")],
        {
          account: creator.account,
        },
      );
      await escrow.write.deposit([agreementId], {
        account: tenantB.account,
        value: parseEther("2"),
      });
      await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
        account: recipient.account,
      });
      let agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.FUNDING);

      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("0.5"),
      });
      agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.ACTIVE);
    });

    it("reverts the whole withdrawal when the receiver rejects the transfer", async () => {
      const { escrow, creator, tenantB, recipient } =
        await loadFixture(deployEscrowFixture);
      const proxy = await hre.viem.deployContract("TenantProxy", [
        escrow.address,
      ]);
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [
          creator.account.address,
          proxy.address,
          tenantB.account.address,
        ],
        amounts: [parseEther("1"), parseEther("1"), parseEther("1")],
        recipient: recipient.account.address,
      });
      await proxy.write.acceptAsTenant([agreementId, TERMS_HASH]);
      await proxy.write.deposit([agreementId], { value: parseEther("0.6") });

      // REJECT mode: the proxy tenant refuses the incoming transfer.
      await proxy.write.setMode([1, agreementId, 0n]);
      await expectRevert(
        proxy.write.withdrawFundingBeforeActivation([
          agreementId,
          parseEther("0.6"),
        ]),
      );

      // Accounting was preserved by the revert; withdrawal works once accepting again.
      const tenant = await escrow.read.getTenant([agreementId, proxy.address]);
      expect(tenant.fundedAmount).to.equal(parseEther("0.6"));
      await proxy.write.setMode([0, agreementId, 0n]);
      await proxy.write.withdrawFundingBeforeActivation([
        agreementId,
        parseEther("0.6"),
      ]);
      const after = await escrow.read.getTenant([agreementId, proxy.address]);
      expect(after.fundedAmount).to.equal(0n);
    });

    it("blocks reentrancy into withdrawFundingBeforeActivation", async () => {
      const { escrow, creator, tenantB, recipient, publicClient } =
        await loadFixture(deployEscrowFixture);
      const proxy = await hre.viem.deployContract("TenantProxy", [
        escrow.address,
      ]);
      const agreementId = await createAgreement(escrow, creator, {
        tenants: [
          creator.account.address,
          proxy.address,
          tenantB.account.address,
        ],
        amounts: [parseEther("1"), parseEther("1"), parseEther("1")],
        recipient: recipient.account.address,
      });
      await proxy.write.acceptAsTenant([agreementId, TERMS_HASH]);
      await proxy.write.deposit([agreementId], { value: parseEther("1") });

      // REENTER_FUNDING mode: receive() re-calls withdrawFundingBeforeActivation.
      await proxy.write.setMode([2, agreementId, parseEther("0.4")]);
      await expectRevert(
        proxy.write.withdrawFundingBeforeActivation([
          agreementId,
          parseEther("0.4"),
        ]),
      );

      // Nothing was double-paid and accounting is intact.
      const tenant = await escrow.read.getTenant([agreementId, proxy.address]);
      expect(tenant.fundedAmount).to.equal(parseEther("1"));
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(parseEther("1"));
    });
  });

  describe("expiry cancellation", () => {
    it("rejects cancellation before and exactly at the funding deadline", async () => {
      const { escrow, creator, agreementId, timeline } =
        await loadFixture(acceptedFixture);
      await expectRevert(
        escrow.write.cancelExpiredFunding([agreementId], {
          account: creator.account,
        }),
        "FundingDeadlineNotPassed",
      );
      // Boundary: at exactly the deadline the agreement is still fundable, not
      // cancellable ("strictly after").
      await time.setNextBlockTimestamp(timeline.fundingDeadline);
      await expectRevert(
        escrow.write.cancelExpiredFunding([agreementId], {
          account: creator.account,
        }),
        "FundingDeadlineNotPassed",
      );
    });

    it("cancels after the deadline when called by a tenant and emits FundingCancelled", async () => {
      const { escrow, creator, agreementId, timeline } =
        await loadFixture(acceptedFixture);
      await time.increaseTo(timeline.fundingDeadline + 1n);
      await escrow.write.cancelExpiredFunding([agreementId], {
        account: creator.account,
      });
      const events = await escrow.getEvents.FundingCancelled();
      expect(events).to.have.lengthOf(1);
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.CANCELLED);
    });

    it("allows the recipient to cancel after the deadline", async () => {
      const { escrow, recipient, agreementId, timeline } =
        await loadFixture(acceptedFixture);
      await time.increaseTo(timeline.fundingDeadline + 1n);
      await escrow.write.cancelExpiredFunding([agreementId], {
        account: recipient.account,
      });
      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.status).to.equal(AgreementStatus.CANCELLED);
    });

    it("rejects cancellation by a non-participant (including the deployer)", async () => {
      const { escrow, outsider, deployer, agreementId, timeline } =
        await loadFixture(acceptedFixture);
      await time.increaseTo(timeline.fundingDeadline + 1n);
      await expectRevert(
        escrow.write.cancelExpiredFunding([agreementId], {
          account: outsider.account,
        }),
        "NotParticipant",
      );
      await expectRevert(
        escrow.write.cancelExpiredFunding([agreementId], {
          account: deployer.account,
        }),
        "NotParticipant",
      );
    });

    it("rejects cancellation of an activated agreement", async () => {
      const { escrow, creator, tenantB, recipient, agreementId, timeline } =
        await loadFixture(acceptedFixture);
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
      await time.increaseTo(timeline.fundingDeadline + 1n);
      await expectRevert(
        escrow.write.cancelExpiredFunding([agreementId], {
          account: creator.account,
        }),
        "InvalidStatus",
      );
    });

    it("rejects repeated cancellation", async () => {
      const { escrow, creator, tenantB, agreementId, timeline } =
        await loadFixture(acceptedFixture);
      await time.increaseTo(timeline.fundingDeadline + 1n);
      await escrow.write.cancelExpiredFunding([agreementId], {
        account: creator.account,
      });
      await expectRevert(
        escrow.write.cancelExpiredFunding([agreementId], {
          account: tenantB.account,
        }),
        "InvalidStatus",
      );
    });
  });

  describe("cancelled-funding withdrawal", () => {
    it("lets each funded tenant withdraw its exact recorded contribution once", async () => {
      const { escrow, creator, tenantB, agreementId, publicClient } =
        await loadFixture(cancelledFixture);
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(parseEther("1.5"));

      await escrow.write.withdrawCancelledFunding([agreementId], {
        account: creator.account,
      });
      await escrow.write.withdrawCancelledFunding([agreementId], {
        account: tenantB.account,
      });

      const events = await publicClient.getContractEvents({
        address: escrow.address,
        abi: escrow.abi,
        eventName: "CancelledFundingWithdrawn",
        fromBlock: 0n,
      });
      expect(events).to.have.lengthOf(2);
      const amounts = events.map((e) => (e.args as { amount: bigint }).amount);
      expect(amounts).to.include(parseEther("1"));
      expect(amounts).to.include(parseEther("0.5"));

      // Every escrowed wei went back out; funds went only to the funding tenants.
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(0n);
    });

    it("preserves historical fundedAmount and totalFunded after withdrawals", async () => {
      const { escrow, creator, tenantB, agreementId } =
        await loadFixture(cancelledFixture);
      await escrow.write.withdrawCancelledFunding([agreementId], {
        account: creator.account,
      });
      await escrow.write.withdrawCancelledFunding([agreementId], {
        account: tenantB.account,
      });

      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.totalFunded).to.equal(parseEther("1.5")); // unchanged history
      const creatorTenant = await escrow.read.getTenant([
        agreementId,
        creator.account.address,
      ]);
      expect(creatorTenant.fundedAmount).to.equal(parseEther("1")); // unchanged history
      const tenantBRecord = await escrow.read.getTenant([
        agreementId,
        tenantB.account.address,
      ]);
      expect(tenantBRecord.fundedAmount).to.equal(parseEther("0.5")); // unchanged history
    });

    it("records the withdrawn amount, flag, and running total", async () => {
      const { escrow, creator, tenantB, agreementId } =
        await loadFixture(cancelledFixture);
      await escrow.write.withdrawCancelledFunding([agreementId], {
        account: creator.account,
      });

      let agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.totalCancelledFundingWithdrawn).to.equal(
        parseEther("1"),
      );
      const creatorTenant = await escrow.read.getTenant([
        agreementId,
        creator.account.address,
      ]);
      expect(creatorTenant.cancelledFundingWithdrawn).to.equal(true);
      expect(creatorTenant.cancelledFundingWithdrawnAmount).to.equal(
        parseEther("1"),
      );

      await escrow.write.withdrawCancelledFunding([agreementId], {
        account: tenantB.account,
      });
      agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.totalCancelledFundingWithdrawn).to.equal(
        parseEther("1.5"),
      );
      // Invariant: never exceeds the historical funded total.
      expect(
        agreement.totalCancelledFundingWithdrawn <= agreement.totalFunded,
      ).to.equal(true);
    });

    it("rejects repeated withdrawal", async () => {
      const { escrow, creator, agreementId } =
        await loadFixture(cancelledFixture);
      await escrow.write.withdrawCancelledFunding([agreementId], {
        account: creator.account,
      });
      await expectRevert(
        escrow.write.withdrawCancelledFunding([agreementId], {
          account: creator.account,
        }),
        "AlreadyWithdrawn",
      );
    });

    it("rejects withdrawal by an unfunded tenant", async () => {
      const context = await loadFixture(acceptedFixture);
      const { escrow, creator, tenantB, agreementId, timeline } = context;
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("1"),
      });
      await time.increaseTo(timeline.fundingDeadline + 1n);
      await escrow.write.cancelExpiredFunding([agreementId], {
        account: creator.account,
      });
      await expectRevert(
        escrow.write.withdrawCancelledFunding([agreementId], {
          account: tenantB.account,
        }),
        "NothingToWithdraw",
      );
    });

    it("rejects withdrawal by non-tenants, the recipient, and the deployer", async () => {
      const { escrow, outsider, recipient, deployer, agreementId } =
        await loadFixture(cancelledFixture);
      await expectRevert(
        escrow.write.withdrawCancelledFunding([agreementId], {
          account: outsider.account,
        }),
        "NotTenant",
      );
      await expectRevert(
        escrow.write.withdrawCancelledFunding([agreementId], {
          account: recipient.account,
        }),
        "NotTenant",
      );
      await expectRevert(
        escrow.write.withdrawCancelledFunding([agreementId], {
          account: deployer.account,
        }),
        "NotTenant",
      );
    });

    it("rejects withdrawal while the agreement is not cancelled", async () => {
      const { escrow, creator, agreementId } =
        await loadFixture(acceptedFixture);
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("1"),
      });
      await expectRevert(
        escrow.write.withdrawCancelledFunding([agreementId], {
          account: creator.account,
        }),
        "InvalidStatus",
      );
    });

    it("accounts for pre-activation withdrawals in the cancelled amount", async () => {
      const { escrow, creator, tenantB, agreementId, timeline } =
        await loadFixture(acceptedFixture);
      await escrow.write.deposit([agreementId], {
        account: creator.account,
        value: parseEther("1"),
      });
      await escrow.write.withdrawFundingBeforeActivation(
        [agreementId, parseEther("0.25")],
        {
          account: creator.account,
        },
      );
      await escrow.write.deposit([agreementId], {
        account: tenantB.account,
        value: parseEther("0.1"),
      });
      await time.increaseTo(timeline.fundingDeadline + 1n);
      await escrow.write.cancelExpiredFunding([agreementId], {
        account: creator.account,
      });

      await escrow.write.withdrawCancelledFunding([agreementId], {
        account: creator.account,
      });
      const creatorTenant = await escrow.read.getTenant([
        agreementId,
        creator.account.address,
      ]);
      // 1 deposited - 0.25 withdrawn pre-activation = 0.75 recorded at cancellation.
      expect(creatorTenant.cancelledFundingWithdrawnAmount).to.equal(
        parseEther("0.75"),
      );

      const agreement = await escrow.read.getAgreement([agreementId]);
      expect(agreement.totalFunded).to.equal(parseEther("0.85"));
      expect(agreement.totalCancelledFundingWithdrawn).to.equal(
        parseEther("0.75"),
      );
      expect(
        agreement.totalCancelledFundingWithdrawn <= agreement.totalFunded,
      ).to.equal(true);
    });

    it("blocks reentrancy into withdrawCancelledFunding and preserves state on failed transfer", async () => {
      const { escrow, creator, tenantB, recipient, publicClient } =
        await loadFixture(deployEscrowFixture);
      const timeline = await futureTimeline();
      const proxy = await hre.viem.deployContract("TenantProxy", [
        escrow.address,
      ]);
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
      await proxy.write.acceptAsTenant([agreementId, TERMS_HASH]);
      await proxy.write.deposit([agreementId], { value: parseEther("1") });
      await time.increaseTo(timeline.fundingDeadline + 1n);
      await escrow.write.cancelExpiredFunding([agreementId], {
        account: creator.account,
      });

      // REENTER_CANCELLED: receive() re-calls withdrawCancelledFunding.
      await proxy.write.setMode([3, agreementId, 0n]);
      await expectRevert(proxy.write.withdrawCancelledFunding([agreementId]));

      // The revert preserved all state: flag still false, amount still withdrawable.
      let tenant = await escrow.read.getTenant([agreementId, proxy.address]);
      expect(tenant.cancelledFundingWithdrawn).to.equal(false);
      expect(tenant.cancelledFundingWithdrawnAmount).to.equal(0n);
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(parseEther("1"));

      // REJECT mode also fails safely.
      await proxy.write.setMode([1, agreementId, 0n]);
      await expectRevert(proxy.write.withdrawCancelledFunding([agreementId]));

      // After restoring normal behavior the single withdrawal succeeds exactly once.
      await proxy.write.setMode([0, agreementId, 0n]);
      await proxy.write.withdrawCancelledFunding([agreementId]);
      tenant = await escrow.read.getTenant([agreementId, proxy.address]);
      expect(tenant.cancelledFundingWithdrawn).to.equal(true);
      expect(tenant.cancelledFundingWithdrawnAmount).to.equal(parseEther("1"));
      expect(
        await publicClient.getBalance({ address: escrow.address }),
      ).to.equal(0n);
      await expectRevert(proxy.write.withdrawCancelledFunding([agreementId]));
    });
  });

  describe("direct transfers and authority", () => {
    it("rejects a plain native transfer to receive()", async () => {
      const { escrow, outsider } = await loadFixture(deployEscrowFixture);
      await expectRevert(
        outsider.sendTransaction({
          to: escrow.address,
          value: parseEther("1"),
        }),
        "DirectTransferNotAllowed",
      );
    });

    it("rejects unknown calldata via fallback(), with and without value", async () => {
      const { escrow, outsider } = await loadFixture(deployEscrowFixture);
      await expectRevert(
        outsider.sendTransaction({ to: escrow.address, data: "0xdeadbeef" }),
        "DirectTransferNotAllowed",
      );
      await expectRevert(
        outsider.sendTransaction({
          to: escrow.address,
          data: "0xdeadbeef",
          value: 1n,
        }),
        "DirectTransferNotAllowed",
      );
    });

    it("exposes no owner, admin, fee, rescue, upgrade, or privileged function in the ABI", async () => {
      const { escrow } = await loadFixture(deployEscrowFixture);
      const functionNames = escrow.abi
        .filter((item) => item.type === "function")
        .map((item) => (item as { name: string }).name.toLowerCase());
      const forbidden = [
        "owner",
        "transferownership",
        "renounceownership",
        "admin",
        "setadmin",
        "operator",
        "fee",
        "setfee",
        "withdrawfees",
        "rescue",
        "sweep",
        "emergencywithdraw",
        "pause",
        "unpause",
        "upgrade",
        "upgradeto",
        "setrecipient",
        "settenant",
        "setdeadline",
        "settermshash",
      ];
      for (const name of functionNames) {
        for (const banned of forbidden) {
          expect(
            name.includes(banned),
            `ABI function "${name}" matches banned "${banned}"`,
          ).to.equal(false);
        }
      }
    });
  });
});
