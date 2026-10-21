import { describe, expect, it } from 'vitest';
import {
  availableBudget,
  dayLabel,
  dayLock,
  formatInr,
  planTotals,
  poolAmount,
  toWhole,
} from './reward-plan.calc';
import { v32Plan } from './reward-plan.testing';

describe('reward plan calculations (v3.2 fixtures)', () => {
  const plan = v32Plan();
  const totals = planTotals(plan);
  const y11 = totals.pools[0];
  const y21 = totals.pools[1];

  it('derives the distributable budget', () => {
    expect(availableBudget(plan)).toBe(800000);
    expect(totals.available).toBe(800000);
  });

  it('splits the pools by share', () => {
    expect(poolAmount(800000, 40)).toBe(320000);
    expect(poolAmount(800000, 60)).toBe(480000);
  });

  it('Y11 = 618 winners and Rs 3,20,000', () => {
    expect(y11.winners).toBe(618);
    expect(y11.total).toBe(320000);
    expect(y11.check).toBe(0);
  });

  it('Y21 = 788 winners and Rs 4,80,000', () => {
    expect(y21.winners).toBe(788);
    expect(y21.total).toBe(480000);
    expect(y21.check).toBe(0);
  });

  it('has 1,406 winners in total and per-day sums', () => {
    expect(totals.winners).toBe(1406);
    expect(y11.dayWinners.reduce((a, b) => a + b, 0)).toBe(618);
    expect(y11.dayWinners[0]).toBe(14 + 55 + 18);
  });

  it('reports a non-zero check when counts drift', () => {
    const p = v32Plan();
    p.pools[0].tiers[0].dayCounts[0] += 1;
    expect(planTotals(p).pools[0].check).toBe(-1000);
  });

  it('sums the shares and computes the Razorpay cost and headroom', () => {
    expect(totals.sharesTotal).toBe(100);
    expect(totals.razorpayCost).toBe(33181.6);
    expect(totals.razorpayHeadroom).toBeCloseTo(1818.4, 2);
  });

  it('formats money in en-IN grouping', () => {
    expect(formatInr(800000)).toBe('8,00,000');
    expect(formatInr(320000)).toBe('3,20,000');
  });

  it('labels days from the start date and locks past days', () => {
    expect(dayLabel('2026-10-12', 0)).toBe('Mon 12 Oct');
    expect(dayLabel('2026-10-12', 6)).toBe('Sun 18 Oct');
    expect(dayLock('2026-10-12', 0, '2026-10-13')).toBe('past');
    expect(dayLock('2026-10-12', 1, '2026-10-13')).toBe('today');
    expect(dayLock('2026-10-12', 2, '2026-10-13')).toBe('future');
  });

  it('coerces input to whole non-negative numbers', () => {
    expect(toWhole('12,5')).toBe(125);
    expect(toWhole('-4')).toBe(4);
    expect(toWhole('')).toBe(0);
    expect(toWhole(3.9)).toBe(3);
  });
});
