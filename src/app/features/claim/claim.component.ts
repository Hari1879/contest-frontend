import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, InjectionToken, OnInit, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ClaimStatusResponse } from '../../core/models/contest.models';
import { ContestApiService } from '../../core/services/contest-api.service';
import { safeRazorpayUrl } from '../../core/utils/claim-url';
import { InrPipe } from '../../shared/inr.pipe';

type Phase =
  | 'loading'
  | 'pending'
  | 'processing'
  | 'link_ready'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'error'
  | 'stalled';

export const FAST_POLL_MS = 3000;
export const SLOW_POLL_MS = 10_000;
export const FAST_POLL_WINDOW_MS = 60_000;
export const MAX_POLL_MS = 10 * 60_000;
export const REDIRECT_DELAY_MS = 3000;
export const BACKOFF_START_MS = 5000;
export const BACKOFF_MAX_MS = 60_000;

/** Same-tab navigation to the payout page; replaceable in tests. */
export const EXTERNAL_NAVIGATE = new InjectionToken<(url: string) => void>('EXTERNAL_NAVIGATE', {
  providedIn: 'root',
  factory: () => (url: string) => window.location.assign(url),
});

const REDIRECT_FLAG = 'contest.claimRedirected.';

@Component({
  selector: 'app-claim',
  imports: [InrPipe],
  template: `
    <main class="claim stack" aria-live="polite">
      @switch (phase()) {
        @case ('loading') {
          <p><span class="spinner" aria-hidden="true"></span> Checking your reward…</p>
        }
        @case ('pending') {
          <h1>You won{{ amount() ? ' ' + (amount() | inr) : '' }}! 🎉</h1>
          <p><span class="spinner" aria-hidden="true"></span> We're getting your payout ready. This usually takes a few seconds — please keep this page open.</p>
        }
        @case ('processing') {
          <h1>Payout in progress</h1>
          <p><span class="spinner" aria-hidden="true"></span> Your payment is being processed. This page updates automatically.</p>
        }
        @case ('link_ready') {
          <h1>You won{{ amount() ? ' ' + (amount() | inr) : '' }}! 🎉</h1>
          @if (redirectScheduled()) {
            <p>Taking you to Razorpay in 3 seconds...</p>
          } @else {
            <p>Continue to Razorpay to receive your reward.</p>
          }
          <button type="button" class="btn btn-primary" (click)="continueNow()">Continue now</button>
        }
        @case ('paid') {
          <h1>Reward sent{{ amount() ? ': ' + (amount() | inr) : '' }} ✅</h1>
          <p>Your payout was successful. Thank you for participating!</p>
        }
        @case ('failed') {
          <h1>Payout failed</h1>
          <p>We could not complete your payout. Please contact the store for help.</p>
        }
        @case ('expired') {
          <h1>Your payout link expired</h1>
          @if (canRequestNewLink()) {
            <button type="button" class="btn btn-primary" [disabled]="requestingNewLink()" (click)="getNewLink()">
              Get a new link
            </button>
          } @else {
            <p>Please contact the store for help.</p>
          }
        }
        @case ('stalled') {
          <p>Still working. Refresh this page in a minute.</p>
        }
        @case ('error') {
          <div class="alert alert-error" role="alert"><p>{{ errorMessage() }}</p></div>
        }
      }
      @if (connectionIssue()) {
        <p class="muted small">Connection issue — retrying…</p>
      }
    </main>
  `,
  styles: `
    .claim { max-width: 480px; margin: 0 auto; padding: 32px 16px; text-align: center; }
  `,
})
export class ClaimComponent implements OnInit {
  private readonly api = inject(ContestApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly meta = inject(Meta);
  private readonly navigate = inject(EXTERNAL_NAVIGATE);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly phase = signal<Phase>('loading');
  protected readonly amount = signal(0);
  protected readonly canRequestNewLink = signal(false);
  protected readonly requestingNewLink = signal(false);
  protected readonly redirectScheduled = signal(false);
  protected readonly connectionIssue = signal(false);
  protected readonly errorMessage = signal('');

  private token = '';
  private payoutUrl = '';
  private pollStart = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private redirectTimer: ReturnType<typeof setTimeout> | null = null;
  private request: Subscription | null = null;
  private backoffMs = 0;
  private readonly referrerTag = this.meta.addTag({ name: 'referrer', content: 'no-referrer' });

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pageshow', this.onPageShow);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('pageshow', this.onPageShow);
      this.clearPoll();
      this.clearRedirect();
      this.request?.unsubscribe();
      if (this.referrerTag) this.meta.removeTagElement(this.referrerTag);
    });
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!this.token) {
      this.fail('This claim link is not valid.');
      return;
    }
    this.pollStart = Date.now();
    this.check();
  }

  protected continueNow(): void {
    this.redirect();
  }

  protected getNewLink(): void {
    if (this.requestingNewLink()) return;
    this.requestingNewLink.set(true);
    this.sendNewLinkRequest();
  }

  private sendNewLinkRequest(): void {
    this.request = this.api.requestNewClaimLink(this.token).subscribe({
      next: (res) => {
        this.requestingNewLink.set(false);
        this.backoffMs = 0;
        this.clearRedirectFlag();
        this.pollStart = Date.now();
        this.apply(res);
      },
      error: (err: unknown) => {
        if (this.isRateLimited(err)) {
          this.nextBackoff();
          this.pollTimer = setTimeout(() => this.sendNewLinkRequest(), this.backoffMs);
          return;
        }
        this.requestingNewLink.set(false);
        this.connectionIssue.set(true);
      },
    });
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      this.clearPoll();
      return;
    }
    this.resumeCheck();
  };

  private readonly onPageShow = (e: PageTransitionEvent): void => {
    if (e.persisted) this.resumeCheck();
  };

  private resumeCheck(): void {
    const p = this.phase();
    if (p === 'paid' || p === 'failed' || p === 'error' || this.requestingNewLink()) return;
    this.check();
  }

  private check(): void {
    this.clearPoll();
    this.request?.unsubscribe();
    this.request = this.api.getClaim(this.token).subscribe({
      next: (res) => {
        this.backoffMs = 0;
        this.connectionIssue.set(false);
        this.apply(res);
      },
      error: (err: unknown) => this.onCheckError(err),
    });
  }

  private onCheckError(err: unknown): void {
    if (this.isRateLimited(err)) {
      this.nextBackoff();
      this.schedule();
      return;
    }
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    if (status >= 400 && status < 500) {
      this.fail('This claim link is not valid or has expired. Please contact the store.');
      return;
    }
    this.connectionIssue.set(true);
    this.schedule();
  }

  private apply(res: ClaimStatusResponse): void {
    if (!res || typeof res !== 'object') {
      this.connectionIssue.set(true);
      this.schedule();
      return;
    }
    this.amount.set(Number(res.amount) || 0);
    this.canRequestNewLink.set(!!res.canRequestNewLink);
    switch (res.status) {
      case 'pending':
      case 'processing':
        this.phase.set(res.status);
        this.schedule();
        break;
      case 'link_ready': {
        const url = safeRazorpayUrl(res.payoutUrl);
        if (!url) {
          this.fail('We received an invalid payout link. Please contact the store for help.');
          return;
        }
        this.payoutUrl = url;
        this.phase.set('link_ready');
        this.armRedirect();
        break;
      }
      case 'paid':
      case 'failed':
      case 'expired':
        this.clearRedirect();
        this.phase.set(res.status);
        break;
      default:
        this.connectionIssue.set(true);
        this.schedule();
    }
  }

  private schedule(): void {
    this.clearPoll();
    if (document.visibilityState === 'hidden') return;
    const elapsed = Date.now() - this.pollStart;
    if (elapsed >= MAX_POLL_MS) {
      this.phase.set('stalled');
      return;
    }
    const base = elapsed < FAST_POLL_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS;
    this.pollTimer = setTimeout(() => this.check(), Math.max(base, this.backoffMs));
  }

  private nextBackoff(): void {
    this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : BACKOFF_START_MS, BACKOFF_MAX_MS);
  }

  private isRateLimited(err: unknown): boolean {
    return err instanceof HttpErrorResponse && err.status === 429;
  }

  private armRedirect(): void {
    if (this.redirectTimer || this.hasRedirected()) return;
    this.redirectScheduled.set(true);
    this.redirectTimer = setTimeout(() => this.redirect(), REDIRECT_DELAY_MS);
  }

  private redirect(): void {
    if (!this.payoutUrl) return;
    this.clearRedirect();
    this.markRedirected();
    this.navigate(this.payoutUrl);
  }

  private clearRedirect(): void {
    if (this.redirectTimer) clearTimeout(this.redirectTimer);
    this.redirectTimer = null;
    this.redirectScheduled.set(false);
  }

  private clearPoll(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private fail(message: string): void {
    this.clearPoll();
    this.clearRedirect();
    this.errorMessage.set(message);
    this.phase.set('error');
  }

  private hasRedirected(): boolean {
    try {
      return sessionStorage.getItem(REDIRECT_FLAG + this.token) === '1';
    } catch {
      return true; // can't remember a redirect, so never auto-redirect (avoids loops)
    }
  }

  private markRedirected(): void {
    try {
      sessionStorage.setItem(REDIRECT_FLAG + this.token, '1');
    } catch {
      /* storage unavailable */
    }
  }

  private clearRedirectFlag(): void {
    try {
      sessionStorage.removeItem(REDIRECT_FLAG + this.token);
    } catch {
      /* storage unavailable */
    }
  }
}
