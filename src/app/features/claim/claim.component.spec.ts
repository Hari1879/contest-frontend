import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimStatusResponse } from '../../core/models/contest.models';
import { ContestApiService } from '../../core/services/contest-api.service';
import { ClaimComponent, EXTERNAL_NAVIGATE } from './claim.component';

const PAYOUT = 'https://rzp.io/i/abc';
const res = (r: Partial<ClaimStatusResponse>) =>
  of({ status: 'pending', amount: 500, canRequestNewLink: false, ...r } as ClaimStatusResponse);
const tooMany = () => throwError(() => new HttpErrorResponse({ status: 429 }));

describe('ClaimComponent', () => {
  let getClaim: ReturnType<typeof vi.fn>;
  let requestNewClaimLink: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<ClaimComponent>;

  const create = (): void => {
    fixture = TestBed.createComponent(ClaimComponent);
    fixture.detectChanges();
  };
  const text = (): string => {
    fixture.detectChanges();
    return fixture.nativeElement.textContent as string;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    getClaim = vi.fn();
    requestNewClaimLink = vi.fn();
    navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [ClaimComponent],
      providers: [
        { provide: ContestApiService, useValue: { getClaim, requestNewClaimLink } },
        { provide: EXTERNAL_NAVIGATE, useValue: navigate },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ token: 'tok' }) } } },
      ],
    });
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  it('rejects a non-razorpay payoutUrl and never redirects', async () => {
    getClaim.mockReturnValue(res({ status: 'link_ready', payoutUrl: 'https://evil.example/pay' }));
    create();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(navigate).not.toHaveBeenCalled();
    expect(text()).toContain('invalid payout link');
  });

  it('auto-redirects once after 3 seconds, then only shows the button', async () => {
    getClaim.mockReturnValue(res({ status: 'link_ready', payoutUrl: PAYOUT }));
    create();
    expect(text()).toContain('Taking you to Razorpay in 3 seconds...');
    await vi.advanceTimersByTimeAsync(3000);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(PAYOUT);

    fixture.destroy();
    create(); // reload / Back: flag is set
    await vi.advanceTimersByTimeAsync(10_000);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Continue now');
    expect(text()).not.toContain('Taking you to Razorpay');
  });

  it('Continue now redirects immediately', async () => {
    getClaim.mockReturnValue(res({ status: 'link_ready', payoutUrl: PAYOUT }));
    create();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(PAYOUT);
    await vi.advanceTimersByTimeAsync(5000);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('polls every 3s, then stops once paid', async () => {
    getClaim
      .mockReturnValueOnce(res({ status: 'pending' }))
      .mockReturnValueOnce(res({ status: 'processing' }))
      .mockReturnValue(res({ status: 'paid' }));
    create();
    await vi.advanceTimersByTimeAsync(6000);
    expect(getClaim).toHaveBeenCalledTimes(3);
    expect(text()).toContain('Reward sent');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getClaim).toHaveBeenCalledTimes(3);
  });

  it('slows to 10s after a minute and stops after 10 minutes', async () => {
    getClaim.mockReturnValue(res({ status: 'pending' }));
    create();
    await vi.advanceTimersByTimeAsync(60_000);
    const fast = getClaim.mock.calls.length;
    expect(fast).toBeGreaterThanOrEqual(20);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getClaim.mock.calls.length - fast).toBeLessThanOrEqual(3);

    await vi.advanceTimersByTimeAsync(11 * 60_000);
    const total = getClaim.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getClaim.mock.calls.length).toBe(total);
    expect(text()).toContain('Still working. Refresh this page in a minute.');
  });

  it('backs off on 429 without showing a failure', async () => {
    getClaim.mockReturnValueOnce(tooMany()).mockReturnValue(res({ status: 'pending' }));
    create();
    await vi.advanceTimersByTimeAsync(3000);
    expect(getClaim).toHaveBeenCalledTimes(1); // normal 3s cadence is stretched
    await vi.advanceTimersByTimeAsync(2100);
    expect(getClaim).toHaveBeenCalledTimes(2);
    expect(text()).not.toContain('not valid');
    expect(fixture.nativeElement.querySelector('.alert-error')).toBeNull();
  });

  it('pauses while hidden and checks immediately when visible again', async () => {
    getClaim.mockReturnValue(res({ status: 'pending' }));
    create();
    const vis = vi.spyOn(document, 'visibilityState', 'get');
    vis.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    const before = getClaim.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getClaim.mock.calls.length).toBe(before);

    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(getClaim.mock.calls.length).toBe(before + 1);
    vis.mockRestore();
  });

  it('requests a new link when expired and polls again', async () => {
    getClaim.mockReturnValue(res({ status: 'expired', canRequestNewLink: true }));
    requestNewClaimLink.mockReturnValue(res({ status: 'pending' }));
    create();
    expect(text()).toContain('Get a new link');
    getClaim.mockReturnValue(res({ status: 'paid' }));
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(requestNewClaimLink).toHaveBeenCalledWith('tok');
    await vi.advanceTimersByTimeAsync(3000);
    expect(text()).toContain('Reward sent');
  });
});
