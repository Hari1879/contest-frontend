import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, timeout, TimeoutError } from 'rxjs';
import { CAMPAIGN_CONFIG } from '../config/campaign.config';
import {
  ClaimStatusResponse,
  ContestEntryRequest,
  ContestEntryResponse,
  EntryOutcome,
} from '../models/contest.models';

/**
 * Single integration point with the Rewards API (§7).
 * Every response/failure is normalised into an EntryOutcome — the component
 * layer never sees raw HTTP errors.
 */
@Injectable({ providedIn: 'root' })
export class ContestApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(CAMPAIGN_CONFIG);
  private get apiBaseUrl(): string {
    return this.config.rewardsApiBaseUrl.replace(/\/+$/, '');
  }

  checkHealth(): Observable<unknown> {
    return this.http.get<unknown>(`${this.apiBaseUrl}/health`).pipe(timeout(this.config.requestTimeoutMs));
  }

  getClaim(token: string): Observable<ClaimStatusResponse> {
    return this.http
      .get<ClaimStatusResponse>(`${this.apiBaseUrl}/contest/claims/${encodeURIComponent(token)}`, {
        headers: this.config.appKey ? { 'x-app-key': this.config.appKey } : {},
        cache: 'no-store',
      })
      .pipe(timeout(this.config.requestTimeoutMs));
  }

  requestNewClaimLink(token: string): Observable<ClaimStatusResponse> {
    return this.http
      .post<ClaimStatusResponse>(
        `${this.apiBaseUrl}/contest/claims/${encodeURIComponent(token)}/new-link`,
        {},
        { headers: this.config.appKey ? { 'x-app-key': this.config.appKey } : {}, cache: 'no-store' },
      )
      .pipe(timeout(this.config.requestTimeoutMs));
  }

  getDailyActivity(
    page: number,
    limit: number,
    filters: {
      period?: string;
      fromDate?: string;
      toDate?: string;
      entryStatus?: string;
      model?: string;
      amount?: string;
      tier?: string;
      payoutStatus?: string;
    } = {},
    authToken = '',
  ): Observable<unknown> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (filters.period) params = params.set('period', filters.period);
    if (filters.fromDate) params = params.set('fromDate', filters.fromDate);
    if (filters.toDate) params = params.set('toDate', filters.toDate);
    if (filters.entryStatus) params = params.set('entryStatus', filters.entryStatus);
    if (filters.model) params = params.set('model', filters.model);
    if (filters.amount) params = params.set('amount', filters.amount);
    if (filters.tier) params = params.set('tier', filters.tier);
    if (filters.payoutStatus) params = params.set('payoutStatus', filters.payoutStatus);
    return this.http
      .get<unknown>(`${this.apiBaseUrl}/admin/daily-activity`, {
        params,
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      })
      .pipe(timeout(this.config.requestTimeoutMs));
  }

  submitEntry(body: ContestEntryRequest, idempotencyKey: string): Observable<EntryOutcome> {
    return this.http
      .post<ContestEntryResponse>(`${this.apiBaseUrl}/contest/entries`, body, {
        headers: {
          'Idempotency-Key': idempotencyKey,
          ...(this.config.appKey ? { 'x-app-key': this.config.appKey } : {}),
        },
      })
      .pipe(
        timeout(this.config.requestTimeoutMs),
        map((res) => this.mapResponse(res)),
        catchError((err: unknown) => of(this.mapError(err))),
      );
  }

  private mapResponse(res: ContestEntryResponse | null): EntryOutcome {
    if (!res || typeof res !== 'object') return { kind: 'server_error' };
    const message = res.message || undefined;
    switch (res.status) {
      case 'won': {
        // A 2xx win is never downgraded to an error; the claim page shows the authoritative amount.
        const amount = Number(res.amount);
        return {
          kind: 'won',
          amount: Number.isFinite(amount) ? amount : 0,
          tier: res.tier,
          referenceId: res.referenceId,
          claimUrl: res.claimUrl,
          message,
        };
      }
      case 'not_won':
        return { kind: 'not_won', referenceId: res.referenceId ?? '—', message };
      case 'duplicate':
      case 'rejected':
      case 'campaign_closed':
      case 'model_not_eligible':
        return { kind: res.status, message };
      default:
        return { kind: 'server_error' };
    }
  }

  private mapError(err: unknown): EntryOutcome {
    if (err instanceof TimeoutError) return { kind: 'network_error' };
    if (err instanceof HttpErrorResponse) {
      // Provider may signal business outcomes via HTTP status + body — honour the body first.
      const body = err.error as Partial<ContestEntryResponse> | null;
      if (body && typeof body === 'object' && typeof body.status === 'string') {
        const mapped = this.mapResponse(body as ContestEntryResponse);
        if (mapped.kind !== 'server_error') return mapped;
      }
      if (err.status === 0) return { kind: 'network_error' };
      const message = typeof body?.message === 'string' && body.message ? body.message : undefined;
      if (err.status === 409) return { kind: 'duplicate', message };
      if (err.status === 429) return { kind: 'rate_limited', message };
      if (err.status >= 400 && err.status < 500) return { kind: 'rejected', message };
      return { kind: 'server_error' };
    }
    return { kind: 'server_error' };
  }
}
