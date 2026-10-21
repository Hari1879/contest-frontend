import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, switchMap } from 'rxjs';
import { CAMPAIGN_CONFIG } from '../../../core/config/campaign.config';
import {
  AdminUser,
  AuditEntry,
  LiveRow,
  LoginResponse,
  ModelMapping,
  PreviewResult,
  PublishResult,
  RewardPlan,
  ValidationResult,
} from './reward-plan.models';

export interface AuditQuery {
  from: string;
  to: string;
  action: string;
  page: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  totp: string;
}

type Raw<T, K extends keyof T> = Omit<T, K> & Record<K, string | number>;
type RawPlan = Raw<
  RewardPlan,
  'totalBudget' | 'razorpayCost' | 'softwareCost' | 'miscReserve' | 'razorpayTxnBudget' | 'razorpayTxnUnitCost' | 'rewardPool'
> & { pools: (Omit<RewardPlan['pools'][number], 'sharePct'> & { sharePct: string | number })[] };
type RawLive = Raw<LiveRow, 'moneyCommitted' | 'moneyPaid'>;

/** NUMERIC columns arrive as decimal strings. */
function normalizePlan(p: RawPlan): RewardPlan {
  return {
    ...p,
    totalBudget: Number(p.totalBudget),
    razorpayCost: Number(p.razorpayCost),
    softwareCost: Number(p.softwareCost),
    miscReserve: Number(p.miscReserve),
    razorpayTxnBudget: Number(p.razorpayTxnBudget),
    razorpayTxnUnitCost: Number(p.razorpayTxnUnitCost),
    rewardPool: Number(p.rewardPool),
    pools: p.pools.map((pool) => ({ ...pool, sharePct: Number(pool.sharePct) })),
  };
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(CAMPAIGN_CONFIG).rewardsApiBaseUrl.replace(/\/+$/, '')}/admin`;

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, body, { withCredentials: true });
  }

  logout(): Observable<unknown> {
    return this.http.post(`${this.base}/auth/logout`, null, { withCredentials: true });
  }

  me(): Observable<AdminUser> {
    return this.http.get<AdminUser>(`${this.base}/auth/me`, { withCredentials: true });
  }

  /** Contest "today" (contest timezone), from the reconciliation report; admin role only. */
  contestDate(): Observable<string> {
    return this.http
      .get<{ date: string }>(`${this.base}/reconciliation`, { withCredentials: true })
      .pipe(map((r) => r.date));
  }

  getPublished(): Observable<RewardPlan | null> {
    return this.http
      .get<RawPlan | null>(`${this.base}/reward-plan/published`, { withCredentials: true })
      .pipe(map((p) => (p ? normalizePlan(p) : null)));
  }

  getDraft(): Observable<RewardPlan> {
    return this.http
      .get<RawPlan>(`${this.base}/reward-plan/draft`, { withCredentials: true })
      .pipe(map(normalizePlan));
  }

  saveDraft(plan: RewardPlan): Observable<RewardPlan> {
    const body = {
      expectedRowVersion: plan.rowVersion,
      startDate: plan.startDate,
      totalBudget: plan.totalBudget,
      razorpayCost: plan.razorpayCost,
      softwareCost: plan.softwareCost,
      miscReserve: plan.miscReserve,
      razorpayTxnBudget: plan.razorpayTxnBudget,
      razorpayTxnUnitCost: plan.razorpayTxnUnitCost,
      pools: plan.pools.map((p) => ({
        poolCode: p.poolCode,
        sharePct: p.sharePct,
        tiers: p.tiers.map((t) => ({ tierNo: t.tierNo, label: t.label, amount: t.amount, dayCounts: t.dayCounts })),
      })),
    };
    return this.http
      .put<RawPlan>(`${this.base}/reward-plan/draft`, body, { withCredentials: true })
      .pipe(map(normalizePlan));
  }

  /** Validates the stored draft; save first. */
  validate(): Observable<ValidationResult> {
    return this.http.post<ValidationResult>(`${this.base}/reward-plan/draft/validate`, null, { withCredentials: true });
  }

  previewDiff(): Observable<PreviewResult> {
    return this.http.post<PreviewResult>(`${this.base}/reward-plan/draft/preview-diff`, null, { withCredentials: true });
  }

  publish(expectedDraftVersion: number, allowNoTimeOverride: boolean): Observable<PublishResult> {
    return this.http.post<PublishResult>(
      `${this.base}/reward-plan/publish`,
      { expectedDraftVersion, confirmText: 'PUBLISH', allowNoTimeOverride },
      { withCredentials: true },
    );
  }

  getLive(): Observable<LiveRow[]> {
    return this.http
      .get<RawLive[]>(`${this.base}/reward-plan/live-status`, { withCredentials: true })
      .pipe(map((rows) => rows.map((r) => ({ ...r, moneyCommitted: Number(r.moneyCommitted), moneyPaid: Number(r.moneyPaid) }))));
  }

  getModels(): Observable<ModelMapping[]> {
    return this.http.get<ModelMapping[]>(`${this.base}/model-pool-map`, { withCredentials: true });
  }

  /** The PUT response is snake_case, so the list is re-read afterwards. */
  saveModels(mappings: ModelMapping[]): Observable<ModelMapping[]> {
    return this.http
      .put(`${this.base}/model-pool-map`, { mappings }, { withCredentials: true })
      .pipe(switchMap(() => this.getModels()));
  }

  getAudit(q: AuditQuery): Observable<AuditEntry[]> {
    let params = new HttpParams().set('page', q.page);
    if (q.from) params = params.set('from', new Date(`${q.from}T00:00:00`).toISOString());
    if (q.to) params = params.set('to', new Date(`${q.to}T23:59:59.999`).toISOString());
    if (q.action) params = params.set('action', q.action);
    return this.http.get<AuditEntry[]>(`${this.base}/audit-log`, { params, withCredentials: true });
  }
}
