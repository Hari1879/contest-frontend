import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AdminApiService } from '../data/admin-api.service';
import { ToastService } from '../data/toast.service';
import { AuditEntry } from '../data/reward-plan.models';

/** The endpoint returns at most 50 rows and no total, so a full page implies a next page. */
const PAGE_SIZE = 50;

interface DiffLine {
  text: string;
  changed: boolean;
}

function lines(value: unknown): string[] {
  return value === undefined ? [] : JSON.stringify(value, null, 2).split('\n');
}

/** Marks each line that does not appear on the other side. */
function mark(own: string[], other: string[]): DiffLine[] {
  const pool = new Map<string, number>();
  for (const l of other) pool.set(l, (pool.get(l) ?? 0) + 1);
  return own.map((text) => {
    const left = pool.get(text) ?? 0;
    if (left > 0) pool.set(text, left - 1);
    return { text, changed: left === 0 };
  });
}

@Component({
  selector: 'app-audit',
  template: `
    <h1>Audit log</h1>
    <form class="card a-row" (submit)="$event.preventDefault(); search()">
      <label class="a-field">From
        <input class="a-input" type="date" [value]="from()" (input)="from.set($any($event.target).value)" />
      </label>
      <label class="a-field">To
        <input class="a-input" type="date" [value]="to()" (input)="to.set($any($event.target).value)" />
      </label>
      <label class="a-field">Action
        <input class="a-input" [value]="action()" placeholder="e.g. plan.publish" (input)="action.set($any($event.target).value)" />
      </label>
      <button class="a-btn a-btn-primary" type="submit">Apply filters</button>
    </form>

    @if (loading()) {
      <div class="card stack" aria-busy="true">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="a-skel"></div>
        }
      </div>
    } @else if (!items().length) {
      <div class="card a-empty">No audit entries match these filters.</div>
    } @else {
      <div class="card a-scroll">
        <table class="a-table">
          <caption class="visually-hidden">Audit entries</caption>
          <thead>
            <tr>
              <th scope="col" class="l">When</th>
              <th scope="col" class="l">Admin</th>
              <th scope="col" class="l">Action</th>
              <th scope="col" class="l">Entity</th>
              <th scope="col"><span class="visually-hidden">Details</span></th>
            </tr>
          </thead>
          <tbody>
            @for (e of items(); track e.id) {
              <tr>
                <th scope="row" class="l">{{ e.createdAt }}</th>
                <td class="l">{{ e.adminId ?? '-' }}</td>
                <td class="l">{{ e.action }}</td>
                <td class="l">{{ e.entity }}{{ e.entityId ? ' ' + e.entityId : '' }}</td>
                <td><button type="button" class="a-btn" (click)="selected.set(e)">View diff</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="a-actions">
        <button type="button" class="a-btn" [disabled]="page() === 1" (click)="go(page() - 1)">Previous</button>
        <span class="small muted">Page {{ page() }}</span>
        <button type="button" class="a-btn" [disabled]="!hasNext()" (click)="go(page() + 1)">Next</button>
      </div>
    }

    @if (selected(); as s) {
      <section class="card" aria-labelledby="diff-h">
        <h2 id="diff-h">{{ s.action }} on {{ s.entity }}</h2>
        <div class="a-diff">
          <div>
            <h3>Before</h3>
            <pre>@for (l of before(); track $index) {<span [class.a-rem]="l.changed">{{ l.text }}
</span>}</pre>
          </div>
          <div>
            <h3>After</h3>
            <pre>@for (l of after(); track $index) {<span [class.a-add]="l.changed">{{ l.text }}
</span>}</pre>
          </div>
        </div>
      </section>
    }
  `,
})
export class AuditComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly action = signal('');
  protected readonly page = signal(1);
  protected readonly items = signal<AuditEntry[]>([]);
  protected readonly hasNext = signal(false);
  protected readonly loading = signal(true);
  protected readonly selected = signal<AuditEntry | null>(null);
  protected readonly before = computed(() => {
    const s = this.selected();
    return s ? mark(lines(s.before), lines(s.after)) : [];
  });
  protected readonly after = computed(() => {
    const s = this.selected();
    return s ? mark(lines(s.after), lines(s.before)) : [];
  });

  constructor() {
    this.fetch();
  }

  protected search(): void {
    this.page.set(1);
    this.fetch();
  }

  protected go(page: number): void {
    this.page.set(page);
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);
    this.selected.set(null);
    this.api
      .getAudit({ from: this.from(), to: this.to(), action: this.action().trim(), page: this.page() })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (r) => {
          this.items.set(r);
          this.hasNext.set(r.length >= PAGE_SIZE);
        },
        error: () => this.toast.error('Could not load the audit log.'),
      });
  }
}
