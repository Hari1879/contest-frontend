import { RewardPlan } from './reward-plan.models';

/**
 * v3.2 totals: Y11 = 618 winners / Rs 3,20,000, Y21 = 788 winners / Rs 4,80,000.
 * Tier amounts and the per-day split are reconstructed to hit those totals.
 */
export function v32Plan(overrides: Partial<RewardPlan> = {}): RewardPlan {
  const tiers = (amounts: number[], counts: number[][]) =>
    amounts.map((amount, i) => ({ tierNo: i + 1, label: `Tier ${i + 1}`, amount, dayCounts: counts[i] }));
  return {
    id: 'plan-1',
    version: 3,
    status: 'draft',
    startDate: '2026-10-12',
    totalBudget: 900000,
    razorpayCost: 35000,
    softwareCost: 40000,
    miscReserve: 25000,
    razorpayTxnBudget: 35000,
    razorpayTxnUnitCost: 23.6,
    rewardPool: 800000,
    rowVersion: 1,
    pools: [
      {
        poolCode: 'Y11',
        sharePct: 40,
        tiers: tiers(
          [1000, 500, 200],
          [
            [14, 14, 14, 14, 14, 15, 15],
            [55, 55, 55, 55, 56, 56, 56],
            [18, 18, 18, 19, 19, 19, 19],
          ],
        ),
      },
      {
        poolCode: 'Y21',
        sharePct: 60,
        tiers: tiers(
          [1500, 600, 250],
          [
            [17, 17, 17, 17, 17, 17, 18],
            [54, 54, 54, 54, 54, 55, 55],
            [41, 41, 41, 41, 41, 41, 42],
          ],
        ),
      },
    ],
    ...overrides,
  };
}
