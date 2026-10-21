import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_CONFIG } from '../config/campaign.config';
import { ContestEntryRequest, EntryOutcome } from '../models/contest.models';
import { ContestApiService } from './contest-api.service';

const body: ContestEntryRequest = {
  name: 'Hari', email: 'h@x.io', phone: '9876543210', imei: '490154203237518',
  termsAccepted: true, termsVersion: 'v1', campaignId: 'C',
};

describe('ContestApiService', () => {
  let api: ContestApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: CAMPAIGN_CONFIG,
          useValue: {
            rewardsApiBaseUrl: '/api/',
            requestTimeoutMs: 25,
            appKey: 'test-app-key',
            useMockApi: false,
          },
        },
      ],
    });
    api = TestBed.inject(ContestApiService);
    http = TestBed.inject(HttpTestingController);
  });

  const call = (): EntryOutcome[] => {
    const out: EntryOutcome[] = [];
    api.submitEntry(body, 'key-1').subscribe((o) => out.push(o));
    return out;
  };

  it('sends Idempotency-Key and maps a win', () => {
    const out = call();
    const req = http.expectOne('/api/contest/entries');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
    expect(req.request.headers.get('x-app-key')).toBe('test-app-key');
    expect(req.request.body).not.toHaveProperty('termsAcceptedAt');
    req.flush({ status: 'won', amount: 500, referenceId: 'R1' });
    expect(out[0]).toMatchObject({ kind: 'won', amount: 500, referenceId: 'R1' });
  });

  it('checks health and loads claim links with the configured app key', () => {
    api.checkHealth().subscribe();
    const health = http.expectOne('/api/health');
    expect(health.request.headers.has('x-app-key')).toBe(false);
    health.flush({ status: 'ok' });

    api.getClaim('claim/token').subscribe();
    const req = http.expectOne('/api/contest/claims/claim%2Ftoken');
    expect(req.request.headers.get('x-app-key')).toBe('test-app-key');
    req.flush({ status: 'pending', amount: 500, canRequestNewLink: false });
  });

  it('requests a replacement claim link from the new-link endpoint', () => {
    api.requestNewClaimLink('claim/token').subscribe();
    const req = http.expectOne('/api/contest/claims/claim%2Ftoken/new-link');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('x-app-key')).toBe('test-app-key');
    expect(req.request.body).toEqual({});
    req.flush({
      status: 'link_ready',
      amount: 500,
      payoutUrl: 'https://example.com/claim',
      canRequestNewLink: false,
    });
  });

  it('maps duplicate from body and from HTTP 409', () => {
    let out = call();
    http.expectOne('/api/contest/entries').flush({ status: 'duplicate' });
    expect(out[0].kind).toBe('duplicate');

    out = call();
    http.expectOne('/api/contest/entries').flush(null, { status: 409, statusText: 'Conflict' });
    expect(out[0].kind).toBe('duplicate');
  });

  it('maps not_won', () => {
    const out = call();
    http.expectOne('/api/contest/entries').flush({ status: 'not_won' });
    expect(out[0].kind).toBe('not_won');
  });

  it('maps rejected', () => {
    const out = call();
    http.expectOne('/api/contest/entries').flush({ status: 'rejected' });
    expect(out[0].kind).toBe('rejected');
  });

  it('maps campaign_closed', () => {
    const out = call();
    http.expectOne('/api/contest/entries').flush({ status: 'campaign_closed' });
    expect(out[0].kind).toBe('campaign_closed');
  });

  it('maps model_not_eligible', () => {
    const out = call();
    http.expectOne('/api/contest/entries').flush({ status: 'model_not_eligible' });
    expect(out[0].kind).toBe('model_not_eligible');
  });

  it('maps 5xx and network errors', () => {
    let out = call();
    http.expectOne('/api/contest/entries').flush(null, { status: 503, statusText: 'Unavailable' });
    expect(out[0].kind).toBe('server_error');

    out = call();
    http.expectOne('/api/contest/entries').error(new ProgressEvent('error'), { status: 0 });
    expect(out[0].kind).toBe('network_error');
  });

  it('treats a malformed win as a server error', () => {
    const out = call();
    http.expectOne('/api/contest/entries').flush({ status: 'won' });
    expect(out[0].kind).toBe('server_error');
  });

  it('does not retry a timed-out submission', async () => {
    let result: EntryOutcome | undefined;
    api.submitEntry(body, 'timeout-attempt').subscribe((outcome) => (result = outcome));
    const request = http.expectOne('/api/contest/entries');
    expect(request.request.headers.get('Idempotency-Key')).toBe('timeout-attempt');

    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    expect(result?.kind).toBe('network_error');
    http.expectNone('/api/contest/entries');
  });
});
