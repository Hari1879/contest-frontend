import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { delay, NEVER, Observable, of, throwError, mergeMap, timer } from 'rxjs';
import { CAMPAIGN_CONFIG } from '../config/campaign.config';
import { ContestEntryRequest, ContestEntryResponse } from '../models/contest.models';
import { isValidImei } from '../validators/imei';

/**
 * In-browser stand-in for the Rewards API, enabled only when `useMockApi` is true
 * (development). Lets the whole flow — including every error path — be exercised
 * before the provider's contract is confirmed.
 *
 * Magic phone numbers to force specific outcomes:
 *   9000000001 → campaign_closed
 *   9000000002 → HTTP 500
 *   9000000003 → network timeout
 *   9000000004 → model_not_eligible
 *   9000000005 → always win ₹8,000
 *   9000000006 → always not_won
 *   9000000007 → duplicate
 * Retrying with the same Idempotency-Key replays the original response.
 */
const replay = new Map<string, ContestEntryResponse>();
const mockClaimChecks = new Map<string, number>();

export const mockRewardsInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(CAMPAIGN_CONFIG);
  if (!config.useMockApi) {
    return next(req);
  }

  const claimMatch = req.url.match(/\/contest\/claims\/([^/?]+)$/);
  if (claimMatch && req.method === 'GET') {
    const token = decodeURIComponent(claimMatch[1]);
    const count = (mockClaimChecks.get(token) ?? 0) + 1;
    mockClaimChecks.set(token, count);
    return of(new HttpResponse({
      status: 200,
      body: count === 1
        ? {
            status: 'link_ready',
            amount: 500,
            payoutUrl: 'https://example.com/mock-payout',
            canRequestNewLink: false,
          }
        : { status: 'paid', amount: 500, canRequestNewLink: false },
    }));
  }
  if (req.method === 'POST' && /\/contest\/claims\/[^/?]+\/new-link$/.test(req.url)) {
    return of(new HttpResponse({
      status: 200,
      body: {
        status: 'link_ready',
        amount: 500,
        payoutUrl: 'https://example.com/mock-payout',
        canRequestNewLink: false,
      },
    }));
  }
  if (req.method !== 'POST' || !req.url.endsWith('/contest/entries')) return next(req);

  const body = req.body as ContestEntryRequest;
  const key = req.headers.get('Idempotency-Key') ?? '';
  const latency = 900 + Math.random() * 700;

  const ok = (res: ContestEntryResponse): Observable<HttpResponse<ContestEntryResponse>> =>
    of(new HttpResponse({ status: 200, body: res })).pipe(delay(latency));

  if (key && replay.has(key)) return ok(replay.get(key)!);

  switch (body.phone) {
    case '9000000001':
      return ok({ status: 'campaign_closed' });
    case '9000000002':
      return timer(latency).pipe(
        mergeMap(() => throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error', url: req.url }))),
      );
    case '9000000003':
      return NEVER; // the service-level timeout turns this into a network error
    case '9000000004':
      return ok({ status: 'model_not_eligible' });
    case '9000000007':
      return ok({ status: 'duplicate' });
    case '9000000008':
      return ok({ status: 'rejected' });
  }

  if (!isValidImei(body.imei)) return ok({ status: 'rejected' });

  const referenceId = 'RWD-' + Math.random().toString(36).slice(2, 8).toUpperCase() + '-' + Date.now().toString().slice(-5);

  let res: ContestEntryResponse;
  if (body.phone === '9000000006') {
    res = { status: 'not_won', referenceId };
  } else {
    const roll = Math.random();
    const tier = body.phone === '9000000005'
      ? 'PREMIUM'
      : roll < 0.3 ? 'FIRST' : roll < 0.55 ? 'SECOND' : roll < 0.7 ? 'THIRD' : roll < 0.78 ? 'PREMIUM' : undefined;
    const amount = tier === 'PREMIUM' ? 8000 : tier === 'THIRD' ? 2000 : tier === 'SECOND' ? 1000 : tier === 'FIRST' ? 500 : 0;
    res = amount
      ? {
          status: 'won',
          amount,
          tier,
          referenceId,
          claimUrl: `/api/contest/claims/${encodeURIComponent(`claim-${referenceId}`)}`,
        }
      : { status: 'not_won', referenceId };
  }
  if (key) replay.set(key, res);
  return ok(res);
};
