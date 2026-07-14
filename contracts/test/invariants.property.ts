import { expect } from "chai";
import { parseEther, type Address } from "viem";
import { time } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import {
  AgreementStatus,
  createAgreement,
  deployEscrowFixture,
  futureTimeline,
  TERMS_HASH,
} from "./helpers";

/** Deterministic PRNG (mulberry32) so every run reproduces the same scenarios. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Random wei amount from 1 wei up to ~100 MON, biased toward small dust values. */
function randomAmount(rng: () => number): bigint {
  const bucket = randomInt(rng, 0, 3);
  if (bucket === 0) return BigInt(randomInt(rng, 1, 1000)); // wei-level dust
  if (bucket === 1) return BigInt(randomInt(rng, 1, 1_000_000_000)); // gwei-level
  if (bucket === 2) return parseEther("1") + BigInt(randomInt(rng, 0, 999)); // ~1 MON
  return parseEther(String(randomInt(rng, 1, 100))); // 1..100 MON
}

function randomChunk(rng: () => number, remaining: bigint): bigint {
  if (remaining <= 1n) return remaining;
  const divisor = BigInt(randomInt(rng, 1, 4));
  const chunk = remaining / divisor;
  return chunk === 0n ? remaining : chunk;
}

const SCENARIOS = 20;
const SEED = 0xc0ffee;

describe("SharedDepositEscrow — funding-lifecycle invariants (property tests)", function () {
  // Sequential randomized scenarios need more than the default mocha budget.
  this.timeout(300_000);

  it(`holds all funding invariants across ${SCENARIOS} randomized scenarios (seed ${SEED})`, async () => {
    const rng = mulberry32(SEED);
    const { escrow, publicClient, creator, recipient, extra } =
      await deployEscrowFixture();

    for (let scenario = 0; scenario < SCENARIOS; scenario++) {
      const tenantCount = randomInt(rng, 2, 8);
      const tenantWallets = [creator, ...extra.slice(0, tenantCount - 1)];
      const tenantAddresses = tenantWallets.map(
        (w) => w.account.address as Address,
      );
      const amounts = tenantAddresses.map(() => randomAmount(rng));
      const totalRequired = amounts.reduce((a, b) => a + b, 0n);
      const timeline = await futureTimeline();

      const escrowBalanceBefore = await publicClient.getBalance({
        address: escrow.address,
      });

      const agreementId = await createAgreement(escrow, creator, {
        tenants: tenantAddresses,
        amounts,
        recipient: recipient.account.address,
        timeline,
      });

      // Everyone accepts (random order); recipient accepts somewhere in the middle.
      const order = [...tenantWallets].sort(() => rng() - 0.5);
      for (let i = 0; i < order.length; i++) {
        await escrow.write.acceptAsTenant([agreementId, TERMS_HASH], {
          account: order[i].account,
        });
        if (i === Math.floor(order.length / 2)) {
          await escrow.write.acceptAsRecipient([agreementId, TERMS_HASH], {
            account: recipient.account,
          });
        }
      }

      const funded: bigint[] = tenantAddresses.map(() => 0n);
      const complete = rng() < 0.5; // half the scenarios activate, half expire

      // Random deposit (and occasional withdrawal) rounds.
      const rounds = randomInt(rng, 3, 8);
      for (let round = 0; round < rounds; round++) {
        for (let i = 0; i < tenantWallets.length; i++) {
          const remaining = amounts[i] - funded[i];
          if (remaining === 0n) continue;
          const isLastRound = round === rounds - 1;
          let chunk =
            complete && isLastRound ? remaining : randomChunk(rng, remaining);
          // Non-completing scenarios must never activate: tenant 0 always holds back
          // at least its final wei so full funding is impossible.
          if (!complete && i === 0) {
            if (remaining <= 1n) continue;
            if (chunk >= remaining) chunk = remaining - 1n;
          }
          if (chunk === 0n) continue;
          await escrow.write.deposit([agreementId], {
            account: tenantWallets[i].account,
            value: chunk,
          });
          funded[i] += chunk;

          // Occasional pre-activation withdrawal (only when it cannot complete later
          // funding requirements would then re-deposit; keep it simple: withdraw only
          // in non-completing scenarios).
          if (!complete && funded[i] > 0n && rng() < 0.2) {
            const withdrawal = randomChunk(rng, funded[i]);
            if (withdrawal > 0n) {
              await escrow.write.withdrawFundingBeforeActivation(
                [agreementId, withdrawal],
                {
                  account: tenantWallets[i].account,
                },
              );
              funded[i] -= withdrawal;
            }
          }
        }

        // Invariants checked after every round against direct contract state.
        const agreement = await escrow.read.getAgreement([agreementId]);
        expect(
          agreement.totalFunded <= agreement.totalRequired,
          "totalFunded <= totalRequired",
        ).to.equal(true);
        expect(agreement.totalRequired).to.equal(totalRequired);
        let sumFunded = 0n;
        for (let i = 0; i < tenantAddresses.length; i++) {
          const tenant = await escrow.read.getTenant([
            agreementId,
            tenantAddresses[i],
          ]);
          expect(
            tenant.fundedAmount <= tenant.requiredAmount,
            "funded <= required",
          ).to.equal(true);
          expect(tenant.fundedAmount).to.equal(funded[i]);
          sumFunded += tenant.fundedAmount;
        }
        expect(
          agreement.totalFunded,
          "sum(tenant funded) == totalFunded",
        ).to.equal(sumFunded);
        if (agreement.status === AgreementStatus.FUNDING) {
          // Escrow holds exactly the active funding of this agreement plus whatever
          // earlier scenarios left (they always drain to zero, see below).
          const balance = await publicClient.getBalance({
            address: escrow.address,
          });
          expect(
            balance - escrowBalanceBefore,
            "escrow balance conservation",
          ).to.equal(sumFunded);
        }
      }

      const agreement = await escrow.read.getAgreement([agreementId]);

      if (complete) {
        expect(
          agreement.status,
          `scenario ${scenario} should activate`,
        ).to.equal(AgreementStatus.ACTIVE);
        expect(agreement.totalFunded).to.equal(totalRequired);
        // Active funds stay locked in this phase; drain is not possible. To keep the
        // cross-scenario balance conservation simple, account for the locked amount.
      } else {
        expect(agreement.status).to.equal(AgreementStatus.FUNDING);
        // Expire and cancel, then every funded tenant withdraws exactly once.
        await time.increaseTo(timeline.fundingDeadline + 1n);
        await escrow.write.cancelExpiredFunding([agreementId], {
          account: creator.account,
        });

        const totalFundedAtCancellation = agreement.totalFunded;
        let withdrawnSum = 0n;
        for (let i = 0; i < tenantWallets.length; i++) {
          if (funded[i] === 0n) continue;
          const balanceBefore = await publicClient.getBalance({
            address: tenantAddresses[i],
          });
          const txHash = await escrow.write.withdrawCancelledFunding(
            [agreementId],
            {
              account: tenantWallets[i].account,
            },
          );
          const receipt = await publicClient.getTransactionReceipt({
            hash: txHash,
          });
          const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
          const balanceAfter = await publicClient.getBalance({
            address: tenantAddresses[i],
          });
          // Outgoing funds went only to the same tenant that funded them.
          expect(
            balanceAfter - balanceBefore,
            "tenant received exactly its funding",
          ).to.equal(funded[i] - gasCost);
          withdrawnSum += funded[i];

          const record = await escrow.read.getTenant([
            agreementId,
            tenantAddresses[i],
          ]);
          expect(record.cancelledFundingWithdrawn).to.equal(true);
          expect(record.cancelledFundingWithdrawnAmount).to.equal(funded[i]);
          expect(
            record.fundedAmount,
            "historical fundedAmount preserved",
          ).to.equal(funded[i]);
        }

        const finalState = await escrow.read.getAgreement([agreementId]);
        expect(
          finalState.totalFunded,
          "historical totalFunded preserved",
        ).to.equal(totalFundedAtCancellation);
        expect(finalState.totalCancelledFundingWithdrawn).to.equal(
          withdrawnSum,
        );
        expect(
          finalState.totalCancelledFundingWithdrawn <= finalState.totalFunded,
          "totalCancelledFundingWithdrawn <= totalFunded",
        ).to.equal(true);

        // The cancelled agreement drained completely back to its tenants.
        const balanceEnd = await publicClient.getBalance({
          address: escrow.address,
        });
        expect(balanceEnd, "cancelled agreement fully drained").to.equal(
          escrowBalanceBefore,
        );
      }
    }
  });
});
