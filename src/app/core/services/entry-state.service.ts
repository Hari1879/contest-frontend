import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, finalize, Observable, tap } from 'rxjs';
import { CAMPAIGN_CONFIG } from '../config/campaign.config';
import { TERMS_VERSION } from '../config/terms';
import {
  CompletedEntry,
  ContestEntryRequest,
  EntryFormValue,
  EntryOutcome,
  isRevealable,
} from '../models/contest.models';
import { digitsOnly, maskImei } from '../validators/imei';
import { AnalyticsService } from './analytics.service';
import { ContestApiService } from './contest-api.service';

export interface EntryState {
  submitting: boolean;
  /** Last non-revealable outcome for the UI to explain. */
  lastOutcome: EntryOutcome | null;
  /** Successful submission awaiting / after reveal. */
  completed: CompletedEntry | null;
  storeId: string | null;
}

const STORAGE_KEY = 'contest.completedEntry';

/**
 * Flow state for the single contest journey. A BehaviorSubject service is enough
 * for this scope (§8) — no NgRx.
 *
 * Persistence keeps the masked result and short-lived claim capability in
 * sessionStorage. Payout URLs and personal entry data are never persisted (§9).
 */
@Injectable({ providedIn: 'root' })
export class EntryStateService {
  private readonly api = inject(ContestApiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly config = inject(CAMPAIGN_CONFIG);

  private readonly state$ = new BehaviorSubject<EntryState>({
    submitting: false,
    lastOutcome: null,
    completed: this.restore(),
    storeId: null,
  });

  readonly state: Observable<EntryState> = this.state$.asObservable();

  /** Idempotency key is reused for retries of an identical payload (§7 network failure). */
  private idempotency: { fingerprint: string; key: string } | null = null;

  get snapshot(): EntryState {
    return this.state$.value;
  }

  setStoreId(storeId: string | null): void {
    const clean = storeId?.trim().slice(0, 64) || null;
    if (clean && !/^[\w-]+$/.test(clean)) return;
    this.patch({ storeId: clean });
  }

  submit(form: EntryFormValue): Observable<EntryOutcome> {
    const body: ContestEntryRequest = {
      name: form.name.trim().replace(/\s+/g, ' '),
      email: form.email.trim().toLowerCase(),
      phone: digitsOnly(form.phone),
      imei: digitsOnly(form.imei),
      termsAccepted: true,
      termsVersion: form.termsVersion || TERMS_VERSION,
      ...(form.termsAcceptedAt ? { termsAcceptedAt: form.termsAcceptedAt } : {}),
      campaignId: this.config.campaignId,
      ...(this.snapshot.storeId ? { storeId: this.snapshot.storeId } : {}),
    };

    const key = this.idempotencyKeyFor(body);
    this.patch({ submitting: true, lastOutcome: null });
    this.analytics.track('form_submitted', { hasStore: !!body.storeId });

    return this.api.submitEntry(body, key).pipe(
      tap((outcome) => {
        this.analytics.track('entry_outcome', {
          outcome: outcome.kind,
          ...(outcome.kind === 'won' ? { amount: outcome.amount } : {}),
        });
        if (isRevealable(outcome)) {
          const completed: CompletedEntry = {
            outcome,
            maskedImei: maskImei(body.imei),
            firstName: body.name.split(' ')[0],
            revealed: false,
            submittedAt: new Date().toISOString(),
          };
          this.idempotency = null;
          this.persist(completed);
          this.patch({ completed, lastOutcome: null });
        } else {
          // Business rejections are final for this payload → fresh key next time.
          if (outcome.kind !== 'network_error' && outcome.kind !== 'server_error') {
            this.idempotency = null;
          }
          this.patch({ lastOutcome: outcome });
        }
      }),
      finalize(() => this.patch({ submitting: false })),
    );
  }

  markRevealed(): void {
    const c = this.snapshot.completed;
    if (!c || c.revealed) return;
    const completed = { ...c, revealed: true };
    this.persist(completed);
    this.patch({ completed });
    this.analytics.track('scratch_revealed', {
      outcome: c.outcome.kind,
      ...(c.outcome.kind === 'won' ? { amount: c.outcome.amount } : {}),
    });
  }

  clearOutcome(): void {
    this.patch({ lastOutcome: null });
  }

  clearSubmissionAttempt(): void {
    this.idempotency = null;
  }

  /** End of flow — wipe everything (§9: clear once the flow ends). */
  reset(): void {
    this.idempotency = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    this.patch({ completed: null, lastOutcome: null, submitting: false });
  }

  private idempotencyKeyFor(body: ContestEntryRequest): string {
    const fingerprint = [body.name, body.email, body.phone, body.imei, body.campaignId].join('|');
    if (this.idempotency?.fingerprint !== fingerprint) {
      this.idempotency = { fingerprint, key: newUuid() };
    }
    return this.idempotency.key;
  }

  private patch(p: Partial<EntryState>): void {
    this.state$.next({ ...this.state$.value, ...p });
  }

  private persist(c: CompletedEntry): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch {
      /* private mode / blocked storage — in-memory state still works */
    }
  }

  private restore(): CompletedEntry | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CompletedEntry & { payoutUrl?: string };
      if (!isRevealable(parsed?.outcome)) return null;
      const { payoutUrl: _legacyPayoutUrl, ...safe } = parsed;
      if (_legacyPayoutUrl) {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
        } catch {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
      return safe;
    } catch {
      return null;
    }
  }
}

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
