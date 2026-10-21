// Shapes mirror contest-backend docs/admin-api-contract.md; decimal strings are converted to numbers.
export type AdminRole = 'admin' | 'approver';
export type PlanStatus = 'draft' | 'published' | 'archived';

export const DAY_COUNT = 7;
/** Contract `dayNo` is 1-based (Day 1..7); `dayCounts` is 0-based. */
export const dayNoOf = (dayIndex: number): number => dayIndex + 1;

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
}

export interface LoginResponse {
  csrfToken: string;
  user: AdminUser;
}

export interface TierPlan {
  tierNo: number;
  label: string;
  amount: number;
  /** Seven winner counts, Day 1 to Day 7. */
  dayCounts: number[];
}

export interface PoolPlan {
  poolCode: string;
  sharePct: number;
  tiers: TierPlan[];
}

export interface RewardPlan {
  id: string;
  version: number;
  status: PlanStatus;
  startDate: string;
  totalBudget: number;
  razorpayCost: number;
  softwareCost: number;
  miscReserve: number;
  razorpayTxnBudget: number;
  razorpayTxnUnitCost: number;
  rewardPool: number;
  rowVersion: number;
  pools: PoolPlan[];
}

export type BudgetKey = 'totalBudget' | 'razorpayCost' | 'softwareCost' | 'miscReserve' | 'razorpayTxnBudget';

export interface ValidationIssue {
  code: string;
  message: string;
  poolCode?: string;
  tierNo?: number;
  dayNo?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface PreviewChange {
  poolCode: string;
  tierNo: number;
  dayNo: number;
  added: number;
  removed: number;
  repriced: number;
}

export interface BlockedBucket {
  poolCode?: string;
  tierNo?: number;
  dayNo?: number;
  claimed?: number;
  target?: number;
  reason: string;
  currentStartDate?: string;
  requestedStartDate?: string;
}

export interface PreviewResult {
  changes: PreviewChange[];
  blocked: BlockedBucket[];
  validation: ValidationResult;
}

export type PublishResult =
  | { published: true; planId: string; rowVersion: number }
  | { submitted: true; message: string; rowVersion: number };

export interface LiveRow {
  dayNo: number;
  poolCode: string;
  tierNo: number;
  planned: number;
  released: number;
  available: number;
  claimed: number;
  paid: number;
  failed: number;
  remaining: number;
  moneyCommitted: number;
  moneyPaid: number;
}

export interface ModelMapping {
  modelName: string;
  poolCode: string | null;
  active: boolean;
}

export interface AuditEntry {
  id: number | string;
  adminId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}
