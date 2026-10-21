import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, forkJoin, Observable, of, switchMap, tap, timer } from 'rxjs';
import { AdminApiService } from '../data/admin-api.service';
import { AdminSessionService } from '../data/admin-session.service';
import { ToastService } from '../data/toast.service';
import { dayLock, formatInr, formatInr2, planTotals, toWhole } from '../data/reward-plan.calc';
import {
  BudgetKey,
  dayNoOf,
  DAY_COUNT,
  LiveRow,
  PreviewResult,
  RewardPlan,
  ValidationIssue,
} from '../data/reward-plan.models';
import { ModalComponent } from '../shell/modal.component';
import { liveKey, PoolCardComponent } from './pool-card.component';

const LIVE_REFRESH_MS = 30_000;
type Busy = 'save' | 'validate' | 'preview' | 'publish';

const BUDGET_FIELDS: { key: BudgetKey; label: string }[] = [
  { key: 'totalBudget', label: 'Total approved budget (Rs)' },
  { key: 'razorpayCost', label: 'Razorpay cost (Rs)' },
  { key: 'softwareCost', label: 'Software cost (Rs)' },
  { key: 'miscReserve', label: 'Misc reserve (Rs)' },
  { key: 'razorpayTxnBudget', label: 'Razorpay transaction budget (Rs)' },
];

/** Maps a server issue to the field it belongs to; unlocated issues go to the general list. */
function issueKey(i: ValidationIssue): string {
  if (i.poolCode && i.tierNo != null && i.dayNo != null) return `count.${i.poolCode}.${i.tierNo}.${i.dayNo}`;
  if (i.poolCode && i.tierNo != null) return `amount.${i.poolCode}.${i.tierNo}`;
  if (i.poolCode) return `pool.${i.poolCode}`;
  return 'general';
}

@Component({
  selector: 'app-reward-plan',
  imports: [PoolCardComponent, ModalComponent],
  templateUrl: './reward-plan.component.html',
})
export class RewardPlanComponent {
  private readonly api = inject(AdminApiService);
  private readonly session = inject(AdminSessionService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly budgetFields = BUDGET_FIELDS;
  protected readonly fmt = formatInr;
  protected readonly fmt2 = formatInr2;

  protected readonly plan = signal<RewardPlan | null>(null);
  private readonly savedJson = signal('');
  private readonly liveRows = signal<LiveRow[]>([]);
  protected readonly today = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly busy = signal<Busy | null>(null);
  protected readonly serverErrors = signal<ValidationIssue[]>([]);
  protected readonly warnings = signal<ValidationIssue[]>([]);
  protected readonly validated = signal(false);
  protected readonly preview = signal<PreviewResult | null>(null);
  protected readonly lastPreview = signal<PreviewResult | null>(null);
  protected readonly publishOpen = signal(false);
  protected readonly confirmText = signal('');
  protected readonly allowNoTime = signal(false);
  /** Approvers cannot read the draft, so they enter the draft version they are approving. */
  protected readonly approveVersion = signal(0);

  protected readonly isAdmin = computed(() => this.session.user()?.role === 'admin');
  protected readonly live = computed(
    () => new Map(this.liveRows().map((r) => [liveKey(r.poolCode, r.tierNo, r.dayNo), r] as const)),
  );
  protected readonly totals = computed(() => {
    const p = this.plan();
    return p ? planTotals(p) : null;
  });
  protected readonly totalPayout = computed(() => (this.totals()?.pools ?? []).reduce((a, p) => a + p.total, 0));
  protected readonly dirty = computed(() => {
    const p = this.plan();
    return !!p && JSON.stringify(p) !== this.savedJson();
  });
  private readonly clientErrors = computed(() => {
    const t = this.totals();
    const errors: { key: string; message: string }[] = [];
    if (t && t.sharesTotal !== 100) errors.push({ key: 'shares', message: 'Pool shares must total 100.' });
    if (t && t.available < 0) errors.push({ key: 'budget', message: 'Costs exceed the total approved budget.' });
    return errors;
  });
  protected readonly errorMap = computed(() => {
    const map = new Map<string, string>();
    for (const e of this.clientErrors()) map.set(e.key, e.message);
    for (const e of this.serverErrors()) {
      const k = issueKey(e);
      map.set(k, map.has(k) ? `${map.get(k)} ${e.message}` : e.message);
    }
    return map;
  });
  protected readonly generalErrors = computed(() => this.serverErrors().filter((e) => issueKey(e) === 'general'));
  protected readonly checksOk = computed(() => {
    const t = this.totals();
    return !!t && t.pools.every((p) => p.check === 0) && this.clientErrors().length === 0;
  });
  protected readonly canPublish = computed(() => {
    if (this.busy() !== null || !this.validated()) return false;
    return this.isAdmin() ? !this.dirty() && this.checksOk() : this.approveVersion() > 0;
  });
  protected readonly confirmed = computed(() => this.confirmText() === 'PUBLISH');
  protected readonly noTimeBlocked = computed(
    () => !!this.lastPreview()?.blocked.some((b) => b.reason === 'no_release_time_remaining'),
  );

  constructor() {
    this.load();
    timer(LIVE_REFRESH_MS, LIVE_REFRESH_MS)
      .pipe(
        switchMap(() => this.api.getLive().pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => rows && this.liveRows.set(rows));
  }

  @HostListener('window:beforeunload', ['$event'])
  protected warnUnsaved(event: BeforeUnloadEvent): void {
    if (this.dirty()) event.preventDefault();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    const plan$ = this.isAdmin() ? this.api.getDraft() : this.api.getPublished();
    const today$ = this.isAdmin() ? this.api.contestDate().pipe(catchError(() => of(null))) : of(null);
    forkJoin([plan$, this.api.getLive(), today$])
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ([plan, live, today]) => {
          if (plan) this.adopt(plan);
          else this.plan.set(null);
          this.liveRows.set(live);
          this.today.set(today);
          if (this.isAdmin() && !today) {
            this.toast.error('Contest date unavailable; day columns are read-only.');
          }
        },
        error: () => {
          this.loadError.set(true);
          this.toast.error('Could not load the reward plan.');
        },
      });
  }

  // ---- edits ----
  protected setBudget(key: BudgetKey, value: string): void {
    this.mutate(() => true, (p) => (p[key] = toWhole(value)));
  }

  protected setShare(pool: number, value: string): void {
    this.mutate((k) => k === 'general', (p) => (p.pools[pool].sharePct = Math.min(100, toWhole(value))));
  }

  protected setAmount(pool: number, e: { tier: number; value: string }): void {
    const code = this.plan()!.pools[pool].poolCode;
    const tierNo = this.plan()!.pools[pool].tiers[e.tier].tierNo;
    this.mutate((k) => k === `amount.${code}.${tierNo}`, (p) => (p.pools[pool].tiers[e.tier].amount = toWhole(e.value)));
  }

  protected setCount(pool: number, e: { tier: number; day: number; value: string }): void {
    const { poolCode, tiers } = this.plan()!.pools[pool];
    const key = `count.${poolCode}.${tiers[e.tier].tierNo}.${dayNoOf(e.day)}`;
    this.mutate((k) => k === key, (p) => this.writeCount(p, pool, e.tier, e.day, e.value));
  }

  /** Pastes a tab/newline separated block (rows = tiers, columns = days) from Excel. */
  protected paste(pool: number, e: { tier: number; day: number; text: string }): void {
    const rows = e.text
      .trim()
      .split(/\r?\n/)
      .map((r) => r.split('\t'));
    this.mutate(() => true, (p) => {
      rows.forEach((cells, r) =>
        cells.forEach((cell, c) => {
          if (e.tier + r < p.pools[pool].tiers.length && e.day + c < DAY_COUNT) {
            this.writeCount(p, pool, e.tier + r, e.day + c, cell);
          }
        }),
      );
    });
  }

  private writeCount(p: RewardPlan, pool: number, tier: number, day: number, raw: string): void {
    const today = this.today();
    if (!today || !this.isAdmin()) return;
    const lock = dayLock(p.startDate, day, today);
    if (lock === 'past') return;
    const { poolCode, tiers } = p.pools[pool];
    const claimed = lock === 'today' ? (this.live().get(liveKey(poolCode, tiers[tier].tierNo, dayNoOf(day)))?.claimed ?? 0) : 0;
    tiers[tier].dayCounts[day] = Math.max(claimed, toWhole(raw));
  }

  /** `clears` decides which server errors the edit makes stale. */
  private mutate(clears: (errorKey: string) => boolean, fn: (p: RewardPlan) => void): void {
    if (!this.isAdmin()) return;
    const next = structuredClone(this.plan()!);
    fn(next);
    this.plan.set(next);
    this.validated.set(false);
    this.serverErrors.update((es) => es.filter((e) => !clears(issueKey(e))));
  }

  protected onBudget(key: BudgetKey, e: Event): void {
    const el = e.target as HTMLInputElement;
    this.setBudget(key, el.value);
    el.value = String(this.plan()![key]);
  }

  protected onShare(pool: number, e: Event): void {
    const el = e.target as HTMLInputElement;
    this.setShare(pool, el.value);
    el.value = String(this.plan()!.pools[pool].sharePct);
  }

  // ---- actions ----
  protected saveDraft(): void {
    this.run('save', this.saveIfDirty(), () => this.toast.success('Draft saved.'));
  }

  /** Validate and preview act on the stored draft, so unsaved edits are saved first. */
  protected validate(): void {
    this.run('validate', this.saveIfDirty().pipe(switchMap(() => this.api.validate())), (r) => {
      this.serverErrors.set(r.errors);
      this.warnings.set(r.warnings);
      this.validated.set(r.valid);
      if (r.valid) this.toast.success('Validation passed.');
      else this.toast.error('Validation failed. See the highlighted fields.');
    });
  }

  protected openPreview(): void {
    this.run('preview', this.saveIfDirty().pipe(switchMap(() => this.api.previewDiff())), (r) => {
      this.preview.set(r);
      this.lastPreview.set(r);
    });
  }

  protected openPublish(): void {
    this.confirmText.set('');
    this.allowNoTime.set(false);
    this.publishOpen.set(true);
  }

  protected confirmPublish(): void {
    const version = this.isAdmin() ? this.plan()!.rowVersion : this.approveVersion();
    this.run('publish', this.api.publish(version, this.allowNoTime()), (r) => {
      this.publishOpen.set(false);
      this.toast.success('published' in r ? 'Plan published.' : r.message);
      this.validated.set(false);
      this.load();
    });
  }

  private saveIfDirty(): Observable<unknown> {
    const plan = this.plan();
    if (!plan || !this.isAdmin() || !this.dirty()) return of(null);
    return this.api.saveDraft(plan).pipe(
      tap((saved) => {
        const keep = this.validated();
        this.adopt(saved);
        this.validated.set(keep);
      }),
    );
  }

  private run<T>(kind: Busy, call: Observable<T>, ok: (r: T) => void): void {
    this.busy.set(kind);
    call
      .pipe(
        finalize(() => this.busy.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({ next: ok, error: (e: unknown) => this.onError(e) });
  }

  private onError(e: unknown): void {
    if (e instanceof HttpErrorResponse && (e.status >= 500 || e.status === 0) && e.status !== 503) {
      this.toast.error('The server could not be reached. Try again.');
    }
    // 400, 401, 403, 409, 429 and 503 are reported by the admin interceptor.
  }

  private adopt(plan: RewardPlan): void {
    this.plan.set(plan);
    this.savedJson.set(JSON.stringify(plan));
    this.serverErrors.set([]);
    this.warnings.set([]);
    this.validated.set(false);
  }
}
