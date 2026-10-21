import { DAY_COUNT, PoolPlan, RewardPlan } from './reward-plan.models';

export interface PoolTotals {
  poolCode: string;
  /** Winners per tier (sum over days), in tier order. */
  tierWinners: number[];
  /** Rs per tier. */
  tierTotals: number[];
  /** Winners per day (sum over tiers). */
  dayWinners: number[];
  winners: number;
  total: number;
  poolAmount: number;
  /** poolAmount - total; must be 0. */
  check: number;
}

export interface PlanTotals {
  available: number;
  pools: PoolTotals[];
  winners: number;
  sharesTotal: number;
  razorpayCost: number;
  /** Transaction budget - winners * unit cost; negative means under-budgeted. */
  razorpayHeadroom: number;
}

type Totalable = Pick<
  RewardPlan,
  'totalBudget' | 'razorpayCost' | 'softwareCost' | 'miscReserve' | 'razorpayTxnBudget' | 'razorpayTxnUnitCost' | 'pools'
>;

export function availableBudget(p: Pick<RewardPlan, 'totalBudget' | 'razorpayCost' | 'softwareCost' | 'miscReserve'>): number {
  return round2(p.totalBudget - p.razorpayCost - p.softwareCost - p.miscReserve);
}

export function poolAmount(available: number, sharePct: number): number {
  return round2((available * sharePct) / 100);
}

export function poolTotals(pool: PoolPlan, amount: number): PoolTotals {
  const tierWinners = pool.tiers.map((t) => sum(t.dayCounts));
  const tierTotals = pool.tiers.map((t, i) => tierWinners[i] * t.amount);
  const dayWinners = Array.from({ length: DAY_COUNT }, (_, d) => sum(pool.tiers.map((t) => t.dayCounts[d] ?? 0)));
  const total = sum(tierTotals);
  return {
    poolCode: pool.poolCode,
    tierWinners,
    tierTotals,
    dayWinners,
    winners: sum(tierWinners),
    total,
    poolAmount: amount,
    check: round2(amount - total),
  };
}

export function planTotals(plan: Totalable): PlanTotals {
  const available = availableBudget(plan);
  const pools = plan.pools.map((p) => poolTotals(p, poolAmount(available, p.sharePct)));
  const winners = sum(pools.map((p) => p.winners));
  const razorpayCost = round2(winners * plan.razorpayTxnUnitCost);
  return {
    available,
    pools,
    winners,
    sharesTotal: round2(sum(plan.pools.map((p) => p.sharePct))),
    razorpayCost,
    razorpayHeadroom: round2(plan.razorpayTxnBudget - razorpayCost),
  };
}

/** ISO date + n days, as a short label such as "Mon 12 Oct". */
export function dayLabel(startIso: string, dayIndex: number): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(addDays(startIso, dayIndex))
    .replace(',', '');
}

export function dayIso(startIso: string, dayIndex: number): string {
  return addDays(startIso, dayIndex).toISOString().slice(0, 10);
}

export type DayLock = 'past' | 'today' | 'future';

export function dayLock(startIso: string, dayIndex: number, todayIso: string): DayLock {
  const iso = dayIso(startIso, dayIndex);
  return iso < todayIso ? 'past' : iso === todayIso ? 'today' : 'future';
}

/** Whole, non-negative integer from user text; empty or invalid becomes 0. */
export function toWhole(value: string | number): number {
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** 800000 → "8,00,000" */
export function formatInr(n: number): string {
  return INR.format(n);
}

export const formatInr2 = (n: number): string =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function addDays(startIso: string, n: number): Date {
  const d = new Date(`${startIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number): number => Math.round(n * 100) / 100;
