import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, finalize, map, of, Subject, switchMap, tap } from 'rxjs';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { ContestApiService } from '../../core/services/contest-api.service';

type ActivityRow = Record<string, unknown>;
type ActivityPage = {
  participants: ActivityRow[];
  transactions: ActivityRow[];
  successfulPayouts: ActivityRow[];
  page: number;
  total?: number;
  hasNext?: boolean;
};
type LoadResult = { kind: 'success'; result: ActivityPage } | { kind: 'error'; message: string };
type ActivityTab = 'participants' | 'transactions' | 'successfulPayouts';
type ActivityPeriod = '' | 'last7days' | 'custom';
type ActivityFilters = {
  period?: string;
  fromDate?: string;
  toDate?: string;
  entryStatus?: string;
  model?: string;
  amount?: string;
  tier?: string;
  payoutStatus?: string;
};
const PAGE_SIZE = 50;
const HIDDEN_COLUMNS = new Set(['payoutattempts', 'pool']);

const PRIORITY_COLUMNS = [
  'submittedAt', 'createdAt', 'timestamp', 'name', 'firstName', 'email', 'phone', 'imei',
  'model', 'product', 'storeId', 'status', 'outcome', 'amount', 'tier', 'referenceId',
];

@Component({
  selector: 'app-admin-daily-activity',
  templateUrl: './daily-activity.component.html',
  styleUrl: './daily-activity.component.scss',
})
export class DailyActivityComponent {
  private readonly api = inject(ContestApiService);
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refreshRequests = new Subject<void>();

  protected readonly tabs: ActivityTab[] = ['participants', 'transactions', 'successfulPayouts'];
  protected readonly page = signal(1);
  protected readonly period = signal<ActivityPeriod>('custom');
  protected readonly fromDate = signal(localDate());
  protected readonly toDate = signal(localDate());
  protected readonly filtersExpanded = signal(false);
  protected readonly entryStatus = signal('');
  protected readonly model = signal('');
  protected readonly amount = signal('');
  protected readonly tier = signal('');
  protected readonly payoutStatus = signal('');
  protected readonly participants = signal<ActivityRow[]>([]);
  protected readonly transactions = signal<ActivityRow[]>([]);
  protected readonly successfulPayouts = signal<ActivityRow[]>([]);
  protected readonly activeTab = signal<ActivityTab>('participants');
  protected readonly total = signal<number | null>(null);
  protected readonly hasNext = signal(false);
  protected readonly loading = signal(false);
  protected readonly loggingOut = signal(false);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly filterError = signal('');
  protected readonly advancedFilterCount = computed(() =>
    [this.entryStatus(), this.model(), this.amount(), this.tier(), this.payoutStatus()].filter(Boolean).length,
  );
  protected readonly rows = computed(() => {
    switch (this.activeTab()) {
      case 'transactions': return this.transactions();
      case 'successfulPayouts': return this.successfulPayouts();
      default: return this.participants();
    }
  });
  protected readonly columns = computed(() => {
    const available = new Set(
      this.rows()
        .flatMap((row) => Object.keys(row))
        .filter((column) => !HIDDEN_COLUMNS.has(column.replace(/[._-]/g, '').toLowerCase())),
    );
    const preferred = PRIORITY_COLUMNS.filter((column) => available.delete(column));
    return [...preferred, ...Array.from(available).sort((a, b) => a.localeCompare(b))];
  });
  protected readonly winnerCount = computed(() => this.participants().filter(isWinner).length);

  constructor() {
    this.refreshRequests.pipe(
      switchMap(() => {
        this.loading.set(true);
        this.error.set('');
        const filters: ActivityFilters = {
          ...(this.period() === 'last7days' ? { period: 'last7days' } : {}),
          ...(this.period() === 'custom' ? { fromDate: this.fromDate(), toDate: this.toDate() } : {}),
          ...(this.entryStatus() ? { entryStatus: this.entryStatus() } : {}),
          ...(this.model() ? { model: this.model() } : {}),
          ...(this.amount() ? { amount: this.amount() } : {}),
          ...(this.tier() ? { tier: this.tier() } : {}),
          ...(this.payoutStatus() ? { payoutStatus: this.payoutStatus() } : {}),
        };
        return this.api.getDailyActivity(this.page(), PAGE_SIZE, filters, this.auth.token).pipe(
          map((response): LoadResult => ({
            kind: 'success',
            result: extractPage(response, this.page(), PAGE_SIZE),
          })),
          catchError((error: unknown) => of<LoadResult>({
            kind: 'error',
            message: error instanceof HttpErrorResponse && error.status === 401
              ? 'Your admin session has expired. Sign in again to continue.'
              : 'Could not load daily activity. Check your connection and try again.',
          })),
          tap((result) => {
            if (result.kind === 'error' && result.message.startsWith('Your admin session')) {
              this.auth.clearToken();
              void this.router.navigate(['/admin/login'], {
                queryParams: { returnUrl: '/admin/daily-activity', reason: 'session-required' },
              });
            }
          }),
          finalize(() => this.loading.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((result) => {
      if (!result) return;
      this.loaded.set(true);
      if (result.kind === 'error') {
        this.participants.set([]);
        this.transactions.set([]);
        this.successfulPayouts.set([]);
        this.error.set(result.message);
        return;
      }
      this.participants.set(result.result.participants);
      this.transactions.set(result.result.transactions);
      this.successfulPayouts.set(result.result.successfulPayouts);
      this.page.set(result.result.page);
      this.total.set(result.result.total ?? null);
      this.hasNext.set(result.result.hasNext ?? result.result.participants.length === PAGE_SIZE);
    });
    this.refresh();
  }

  protected setEntryStatus(event: Event): void {
    this.entryStatus.set((event.target as HTMLSelectElement).value);
  }

  protected setModel(event: Event): void {
    this.model.set((event.target as HTMLSelectElement).value);
  }

  protected setAmount(event: Event): void {
    this.amount.set((event.target as HTMLSelectElement).value);
  }

  protected setTier(event: Event): void {
    this.tier.set((event.target as HTMLSelectElement).value);
  }

  protected setPayoutStatus(event: Event): void {
    this.payoutStatus.set((event.target as HTMLSelectElement).value);
  }

  protected toggleAdvancedFilters(): void {
    this.filtersExpanded.update((expanded) => !expanded);
  }

  protected setPeriod(event: Event): void {
    const period = (event.target as HTMLSelectElement).value as ActivityPeriod;
    this.period.set(period);
    this.filterError.set('');
    if (period !== 'custom') {
      this.fromDate.set('');
      this.toDate.set('');
    }
  }

  protected setFromDate(event: Event): void {
    this.fromDate.set((event.target as HTMLInputElement).value);
    this.filterError.set('');
  }

  protected setToDate(event: Event): void {
    this.toDate.set((event.target as HTMLInputElement).value);
    this.filterError.set('');
  }

  protected applyFilters(event: Event): void {
    event.preventDefault();
    if (this.period() === 'custom') {
      if (!this.fromDate() || !this.toDate()) {
        this.filterError.set('Select both a start date and an end date.');
        return;
      }
      if (this.fromDate() > this.toDate()) {
        this.filterError.set('The start date must be on or before the end date.');
        return;
      }
    }
    this.filterError.set('');
    this.page.set(1);
    this.refresh();
  }

  protected refresh(event?: Event): void {
    event?.preventDefault();
    this.refreshRequests.next();
  }

  protected logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.auth.logout().pipe(
      catchError(() => of(null)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      this.auth.clearToken();
      void this.router.navigate(['/admin/login']);
    });
  }

  protected previousPage(): void {
    if (this.page() <= 1 || this.loading()) return;
    this.page.update((page) => page - 1);
    this.refresh();
  }

  protected nextPage(): void {
    if (!this.hasNext() || this.loading()) return;
    this.page.update((page) => page + 1);
    this.refresh();
  }

  protected selectTab(tab: ActivityTab): void {
    this.activeTab.set(tab);
  }

  protected tabLabel(tab: ActivityTab): string {
    switch (tab) {
      case 'transactions': return 'Transactions';
      case 'successfulPayouts': return 'Successful payouts';
      default: return 'Participants';
    }
  }

  protected tabCount(tab: ActivityTab): number {
    switch (tab) {
      case 'transactions': return this.transactions().length;
      case 'successfulPayouts': return this.successfulPayouts().length;
      default: return this.participants().length;
    }
  }

  protected labelFor(column: string): string {
    return column
      .replace(/[._-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  protected display(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return JSON.stringify(value);
  }
}

function extractPage(response: unknown, requestedPage: number, limit: number): ActivityPage {
  const record = isRecord(response) ? response : {};
  const metadata = isRecord(record['pagination'])
    ? record['pagination']
    : isRecord(record['meta']) ? record['meta'] : record;
  const page = numberValue(metadata['page']) ?? requestedPage;
  const total = numberValue(metadata['total']) ?? numberValue(metadata['totalCount']);
  const totalPages = numberValue(metadata['totalPages']) ?? numberValue(metadata['lastPage']);
  const explicitHasNext = typeof metadata['hasNextPage'] === 'boolean'
    ? metadata['hasNextPage']
    : typeof metadata['hasNext'] === 'boolean' ? metadata['hasNext'] : undefined;
  const hasNext = explicitHasNext
    ?? (totalPages !== undefined ? page < totalPages : total !== undefined ? page * limit < total : undefined);
  return {
    participants: findRows(response, 'participants') ?? extractRows(response),
    transactions: findRows(response, 'transactions') ?? [],
    successfulPayouts: findRows(response, 'successfulPayouts') ?? [],
    page,
    total,
    hasNext,
  };
}

function extractRows(response: unknown): ActivityRow[] {
  if (Array.isArray(response)) return response.filter(isRecord).map((row) => flattenRecord(row));
  if (!isRecord(response)) return [];
  for (const key of ['entries', 'activity', 'records', 'results', 'data', 'items']) {
    const value = response[key];
    if (Array.isArray(value)) return value.filter(isRecord).map((row) => flattenRecord(row));
    if (isRecord(value)) {
      const nested = extractRows(value);
      if (nested.length || Array.isArray(value['items'])) return nested;
    }
  }
  return [];
}

function findRows(response: unknown, key: string): ActivityRow[] | undefined {
  if (!isRecord(response)) return undefined;
  const value = response[key];
  if (Array.isArray(value)) return value.filter(isRecord).map((row) => flattenRecord(row));
  if (isRecord(value)) return findRows(value, key);
  if (isRecord(response['data'])) return findRows(response['data'], key);
  return undefined;
}

function flattenRecord(record: ActivityRow, prefix = '', depth = 0): ActivityRow {
  const flattened: ActivityRow = {};
  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value) && depth < 2) Object.assign(flattened, flattenRecord(value, path, depth + 1));
    else flattened[path] = value;
  }
  return flattened;
}

function isRecord(value: unknown): value is ActivityRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isWinner(row: ActivityRow): boolean {
  const amount = Number(row['amount'] ?? row['outcome.amount']);
  const status = stringValue(row['status'] ?? row['outcome.status'] ?? row['outcome.kind']).toLowerCase();
  return amount > 0 || status === 'won';
}

function localDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
