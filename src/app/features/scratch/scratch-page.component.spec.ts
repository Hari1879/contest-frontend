import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimStatusResponse } from '../../core/models/contest.models';
import { ContestApiService } from '../../core/services/contest-api.service';
import { EntryState } from '../../core/services/entry-state.service';
import { EntryStateService } from '../../core/services/entry-state.service';
import { ScratchPageComponent } from './scratch-page.component';

describe('ScratchPageComponent', () => {
  let state: BehaviorSubject<EntryState>;
  let fixture: ComponentFixture<ScratchPageComponent>;
  let markRevealed: ReturnType<typeof vi.fn>;
  let getClaim: ReturnType<typeof vi.fn>;
  let requestNewClaimLink: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    state = new BehaviorSubject<EntryState>({
      submitting: false,
      lastOutcome: null,
      completed: null,
      storeId: null,
    });
    markRevealed = vi.fn();
    getClaim = vi.fn().mockReturnValue(of({
      status: 'pending',
      amount: 500,
      canRequestNewLink: false,
    } satisfies ClaimStatusResponse));
    requestNewClaimLink = vi.fn().mockReturnValue(of({
      status: 'pending',
      amount: 500,
      canRequestNewLink: false,
    } satisfies ClaimStatusResponse));
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      disconnect(): void {}
    });
    const context = {
      globalCompositeOperation: '',
      setTransform(): void {},
      createLinearGradient: () => ({ addColorStop(): void {} }),
      fillRect(): void {},
      beginPath(): void {},
      moveTo(): void {},
      lineTo(): void {},
      stroke(): void {},
      fillText(): void {},
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    await TestBed.configureTestingModule({
      imports: [ScratchPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: EntryStateService,
          useValue: { state: state.asObservable(), markRevealed },
        },
        {
          provide: ContestApiService,
          useValue: { getClaim, requestNewClaimLink },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderPrize(amount: number, revealed = true, withClaim = false): Promise<void> {
    const tier = amount === 8000 ? 'PREMIUM' : amount === 2000 ? 'THIRD' : amount === 1000 ? 'SECOND' : 'FIRST';
    state.next({
      ...state.value,
      completed: {
        outcome: {
          kind: 'won',
          amount,
          tier,
          referenceId: 'R1',
          ...(withClaim ? { claimUrl: '/api/contest/claims/claim-token' } : {}),
        },
        maskedImei: '49******7518',
        firstName: 'Hari',
        revealed,
        submittedAt: '2026-09-28T00:00:00.000Z',
      },
    });
    fixture = TestBed.createComponent(ScratchPageComponent);
    fixture.detectChanges();
    fixture.detectChanges();
  }

  it('renders the ₹500 prize', async () => {
    await renderPrize(500);
    expect(fixture.nativeElement.querySelector('.amount').textContent).toContain('500');
  });

  it('renders the ₹1,000 prize', async () => {
    await renderPrize(1000);
    expect(fixture.nativeElement.querySelector('.amount').textContent).toContain('1,000');
  });

  it('renders the ₹2,000 prize', async () => {
    await renderPrize(2000);
    expect(fixture.nativeElement.querySelector('.amount').textContent).toContain('2,000');
  });

  it('renders the ₹8,000 PREMIUM prize with its distinct style', async () => {
    await renderPrize(8000);
    expect(fixture.nativeElement.querySelector('.amount').textContent).toContain('8,000');
    expect(fixture.nativeElement.querySelector('.prize-won.premium')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('PREMIUM REWARD');
  });

  it('keeps the result hidden until the reveal button is clicked', async () => {
    await renderPrize(500, false);
    expect(fixture.nativeElement.querySelector('.reveal-prompt')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Reveal my result');
    expect(markRevealed).not.toHaveBeenCalled();

    fixture.nativeElement.querySelector('.reveal-result').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.reveal-prompt')).toBeNull();
    expect(markRevealed).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Congratulations, Hari!');
    expect(fixture.nativeElement.querySelectorAll('.coin-pour .pour-coin')).toHaveLength(36);
  });

  it('opens the payout in a new tab and shows a fallback link if blocked', async () => {
    getClaim.mockReturnValue(of({
      status: 'link_ready',
      amount: 500,
      payoutUrl: 'https://payments.example/claim',
      canRequestNewLink: false,
    } satisfies ClaimStatusResponse));
    await renderPrize(500, true, true);
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('.claim-button')).toBeTruthy());

    vi.spyOn(window, 'open').mockReturnValue(null);
    fixture.nativeElement.querySelector('.claim-button').click();
    fixture.detectChanges();

    expect(window.open).toHaveBeenCalledWith(
      'https://payments.example/claim',
      '_blank',
      'noopener,noreferrer',
    );
    const fallback = fixture.nativeElement.querySelector('.payout-link');
    expect(fallback.getAttribute('target')).toBe('_blank');
    expect(fallback.getAttribute('rel')).toBe('noopener noreferrer');
    expect(fixture.nativeElement.textContent).toContain('browser blocked the new tab');
    expect(fixture.nativeElement.textContent).toContain('Complete the verification in the new tab');
  });

  it('offers a replacement link only when the backend permits it', async () => {
    getClaim.mockReturnValue(of({
      status: 'expired',
      amount: 500,
      canRequestNewLink: true,
    } satisfies ClaimStatusResponse));
    requestNewClaimLink.mockReturnValue(of({
      status: 'link_ready',
      amount: 500,
      payoutUrl: 'https://payments.example/new-claim',
      canRequestNewLink: false,
    } satisfies ClaimStatusResponse));
    await renderPrize(500, true, true);
    await vi.waitFor(() => expect(fixture.nativeElement.textContent).toContain('Get a new link'));

    fixture.nativeElement.querySelector('.claim-panel .btn-primary').click();
    fixture.detectChanges();

    expect(requestNewClaimLink).toHaveBeenCalledWith('claim-token');
    expect(fixture.nativeElement.querySelector('.claim-button')).toBeTruthy();
  });
});