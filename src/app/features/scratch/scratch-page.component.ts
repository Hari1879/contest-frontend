import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  catchError,
  exhaustMap,
  finalize,
  merge,
  of,
  Subject,
  Subscription,
  takeUntil,
  timer,
} from 'rxjs';
import { ClaimStatusResponse } from '../../core/models/contest.models';
import { ContestApiService } from '../../core/services/contest-api.service';
import { EntryStateService } from '../../core/services/entry-state.service';
import { InrPipe } from '../../shared/inr.pipe';

type ClaimPhase =
  | 'idle'
  | 'pending'
  | 'link_ready'
  | 'awaiting_payment'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'network_error'
  | 'still_waiting';
type PollMode = 'link' | 'payment';

@Component({
  selector: 'app-scratch-page',
  imports: [InrPipe],
  templateUrl: './scratch-page.component.html',
  styleUrl: './scratch-page.component.scss',
})
export class ScratchPageComponent implements OnInit {
  private readonly entry = inject(EntryStateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ContestApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly state = toSignal(this.entry.state, { requireSync: true });
  private readonly manualChecks = new Subject<void>();

  protected readonly completed = computed(() => this.state().completed!);
  protected readonly outcome = computed(() => this.completed().outcome);
  protected readonly won = computed(() => this.outcome().kind === 'won');
  protected readonly amount = computed(() => {
    const o = this.outcome();
    return o.kind === 'won' ? o.amount : 0;
  });
  protected readonly premium = computed(() => {
    const o = this.outcome();
    return o.kind === 'won' && (o.tier === 'PREMIUM' || o.amount === 8000);
  });
  protected readonly revealedNow = signal(this.completed().revealed);
  protected readonly showWinDialog = signal(false);
  protected readonly claimPanel = signal(this.completed().revealed && this.won());
  protected readonly claimPhase = signal<ClaimPhase>('idle');
  protected readonly awaitingPaymentStatus = signal(false);
  protected readonly payoutUrl = signal('');
  protected readonly showFallbackLink = signal(false);
  protected readonly canRequestNewLink = signal(false);
  protected readonly checking = signal(false);
  protected readonly checkCooldown = signal(false);
  protected readonly requestingNewLink = signal(false);
  protected readonly claimError = signal('');
  protected readonly announcement = signal('');
  protected readonly confetti = Array.from({ length: 28 }, (_, i) => i);
  protected readonly coins = Array.from({ length: 36 }, (_, index) => ({
    id: index,
    left: (index * 37) % 97,
    delay: (index % 12) * 90,
    duration: 3.8 + (index % 4) * 0.2,
    drift: ((index * 17) % 81) - 40,
  }));

  protected readonly revealedLabel = computed(() =>
    this.won() ? `You won ${this.amount()} rupees!` : 'Better luck next time. No reward this time.',
  );

  private claimToken = '';
  private pollingSubscription: Subscription | null = null;
  private cooldownTimer: number | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopPolling();
      if (this.cooldownTimer !== null) window.clearTimeout(this.cooldownTimer);
      window.removeEventListener('focus', this.onPageFocus);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    });
  }

  ngOnInit(): void {
    const claimUrl = this.completed().outcome.claimUrl ?? '';
    const routeToken = this.route.snapshot.paramMap.get('token');
    this.claimToken = routeToken || this.claimTokenFromUrl(claimUrl);

    window.addEventListener('focus', this.onPageFocus);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    if (!this.completed().revealed) return;
    this.claimPanel.set(true);
    if (!this.claimToken) {
      this.showNetworkError('Your payout claim is not available yet. Please contact the store for help.');
      return;
    }
    this.startPolling('link');
  }

  protected onRevealed(): void {
    this.revealedNow.set(true);
    this.showWinDialog.set(this.won());
    this.entry.markRevealed();
    this.announcement.set(this.revealedLabel());
    if (!this.won()) return;

    this.claimPanel.set(true);
    if (!this.claimToken) {
      this.claimError.set('Your payout claim is not available yet. Please contact the store for help.');
      this.claimPhase.set('network_error');
      return;
    }
    this.claimPhase.set('pending');
  }

  protected closeWinDialog(): void {
    this.showWinDialog.set(false);
    if (this.won()) this.startPolling('link');
  }

  protected continue(): void {
    if (this.won()) {
      this.claimPanel.set(true);
      this.showWinDialog.set(false);
      this.startPolling('link');
      return;
    }
    void this.router.navigateByUrl('/confirmation', { replaceUrl: true });
  }

  protected claimPayout(): void {
    const url = this.payoutUrl();
    if (!url) {
      this.showNetworkError('The claim link is unavailable. Retry the status check.');
      return;
    }

    this.awaitingPaymentStatus.set(true);
    this.showFallbackLink.set(false);
    this.claimPhase.set('awaiting_payment');
    try {
      if (!window.open(url, '_blank', 'noopener,noreferrer')) {
        this.showFallbackLink.set(true);
      }
    } catch {
      this.showFallbackLink.set(true);
    }
    this.startPolling('payment');
  }

  protected checkNow(): void {
    if (this.checking()) return;
    this.checkCooldown.set(true);
    if (this.cooldownTimer !== null) window.clearTimeout(this.cooldownTimer);
    this.cooldownTimer = window.setTimeout(() => {
      this.checkCooldown.set(false);
      this.cooldownTimer = null;
    }, 3000);

    if (this.pollingSubscription && !this.pollingSubscription.closed) {
      this.manualChecks.next();
      return;
    }
    this.checkOnce();
  }

  protected retryStatus(): void {
    this.claimError.set('');
    this.startPolling(this.awaitingPaymentStatus() ? 'payment' : 'link');
  }

  protected requestNewLink(): void {
    if (!this.canRequestNewLink() || this.requestingNewLink() || !this.claimToken) return;
    this.requestingNewLink.set(true);
    this.claimError.set('');
    this.api.requestNewClaimLink(this.claimToken).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.requestingNewLink.set(false)),
    ).subscribe({
      next: (response) => {
        this.applyClaimResponse(response, 'link');
        if (response.status === 'pending') this.startPolling('link');
      },
      error: () => {
        this.claimPhase.set('network_error');
        this.claimError.set('We could not request a new payout link. Check your connection and retry.');
      },
    });
  }

  protected finishClaim(): void {
    this.entry.reset();
    void this.router.navigateByUrl('/', { replaceUrl: true });
  }

  private readonly onPageFocus = (): void => {
    if (this.awaitingPaymentStatus()) this.checkImmediately();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.awaitingPaymentStatus()) this.checkImmediately();
  };

  private checkImmediately(): void {
    if (this.checking()) return;
    if (this.pollingSubscription && !this.pollingSubscription.closed) {
      this.manualChecks.next();
    } else {
      this.checkOnce();
    }
  }

  private checkOnce(): void {
    if (!this.claimToken || this.checking()) return;
    this.checking.set(true);
    this.api.getClaim(this.claimToken).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.checking.set(false)),
    ).subscribe({
      next: (response) => {
        this.applyClaimResponse(response, this.awaitingPaymentStatus() ? 'payment' : 'link');
        if (response.status === 'pending' || response.status === 'processing') {
          this.startPolling(this.awaitingPaymentStatus() ? 'payment' : 'link');
        }
      },
      error: () => this.showNetworkError('We could not check your payout status. Check your connection and retry.'),
    });
  }

  private startPolling(mode: PollMode): void {
    if (!this.claimToken || (this.pollingSubscription && !this.pollingSubscription.closed)) return;
    this.awaitingPaymentStatus.set(mode === 'payment');
    if (mode === 'payment' && this.claimPhase() !== 'processing') this.claimPhase.set('awaiting_payment');
    else if (this.claimPhase() !== 'link_ready') this.claimPhase.set('pending');
    const interval = mode === 'payment' ? 5000 : 2000;
    const duration = mode === 'payment' ? 10 * 60 * 1000 : 60 * 1000;

    this.pollingSubscription = merge(timer(0, interval), this.manualChecks).pipe(
      exhaustMap(() => {
        this.checking.set(true);
        return this.api.getClaim(this.claimToken).pipe(
          catchError(() => of(null)),
          finalize(() => this.checking.set(false)),
        );
      }),
      takeUntil(timer(duration)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (response) => {
        if (!response) {
          this.showNetworkError('We could not check your payout status. Check your connection and retry.');
          this.stopPolling();
          return;
        }
        this.applyClaimResponse(response, mode);
      },
      complete: () => {
        if (this.destroyRef.destroyed) return;
        if ((mode === 'payment' && ['awaiting_payment', 'processing'].includes(this.claimPhase()))
          || (mode === 'link' && this.claimPhase() === 'pending')) {
          this.claimPhase.set('still_waiting');
        }
        this.pollingSubscription = null;
      },
    });
  }

  private applyClaimResponse(response: ClaimStatusResponse, mode: PollMode): void {
    this.canRequestNewLink.set(response.canRequestNewLink);
    this.claimError.set('');

    if (response.payoutUrl) {
      const safeUrl = this.safePayoutUrl(response.payoutUrl);
      if (!safeUrl) {
        this.showNetworkError('The payout provider returned an invalid link. Please contact support.');
        this.stopPolling();
        return;
      }
      this.payoutUrl.set(safeUrl);
    }

    switch (response.status) {
      case 'pending':
        this.claimPhase.set(mode === 'payment' ? 'awaiting_payment' : 'pending');
        break;
      case 'link_ready':
        if (!this.payoutUrl()) {
          this.showNetworkError('The payout link is not available yet. Retry the status check.');
          this.stopPolling();
        } else if (mode === 'payment') {
          this.claimPhase.set('awaiting_payment');
        } else {
          this.claimPhase.set('link_ready');
          this.stopPolling();
        }
        break;
      case 'processing':
        this.claimPhase.set('processing');
        if (mode === 'link') {
          this.stopPolling();
          this.startPolling('payment');
        }
        break;
      case 'paid':
        this.payoutUrl.set('');
        this.showFallbackLink.set(false);
        this.awaitingPaymentStatus.set(false);
        this.claimPhase.set('paid');
        this.stopPolling();
        break;
      case 'failed':
        this.awaitingPaymentStatus.set(false);
        this.claimPhase.set('failed');
        this.stopPolling();
        break;
      case 'expired':
        this.payoutUrl.set('');
        this.showFallbackLink.set(false);
        this.awaitingPaymentStatus.set(false);
        this.claimPhase.set('expired');
        this.stopPolling();
        break;
    }
  }

  private showNetworkError(message: string): void {
    this.claimError.set(message);
    this.claimPhase.set('network_error');
  }

  private stopPolling(): void {
    this.pollingSubscription?.unsubscribe();
    this.pollingSubscription = null;
    this.checking.set(false);
  }

  private claimTokenFromUrl(value: string): string {
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin) return '';
      const match = url.pathname.match(/\/contest\/claims\/([^/]+)\/?$/);
      return match ? decodeURIComponent(match[1]) : '';
    } catch {
      return '';
    }
  }

  private safePayoutUrl(value: string): string {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.toString() : '';
    } catch {
      return '';
    }
  }
}
