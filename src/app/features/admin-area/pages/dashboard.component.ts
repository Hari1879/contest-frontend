import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, forkJoin, switchMap, tap, timer } from 'rxjs';
import { AdminApiService } from '../data/admin-api.service';
import { formatInr } from '../data/reward-plan.calc';
import { LiveRow } from '../data/reward-plan.models';
import { ToastService } from '../data/toast.service';

const REFRESH_MS = 30_000;

@Component({
  selector: 'app-dashboard',
  template: `
    <h1>Dashboard</h1>
    @if (loading()) {
      <div class="card stack" aria-busy="true">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="a-skel"></div>
        }
      </div>
    } @else if (data(); as d) {
      <section class="card" aria-labelledby="money-h">
        <h2 id="money-h">Money</h2>
        <div class="a-row">
          <div>Reward pool <strong>Rs {{ fmt(d.pool) }}</strong></div>
          <div>Committed <strong>Rs {{ fmt(d.committed) }}</strong></div>
          <div>Paid <strong>Rs {{ fmt(d.paid) }}</strong></div>
        </div>
        <p class="small muted">Committed</p>
        <div class="a-bar" role="progressbar" aria-label="Committed of pool" [attr.aria-valuenow]="pct(d.committed, d.pool)" aria-valuemin="0" aria-valuemax="100"><i [style.width.%]="pct(d.committed, d.pool)"></i></div>
        <p class="small muted">Paid</p>
        <div class="a-bar" role="progressbar" aria-label="Paid of pool" [attr.aria-valuenow]="pct(d.paid, d.pool)" aria-valuemin="0" aria-valuemax="100"><i [style.width.%]="pct(d.paid, d.pool)"></i></div>
      </section>

      @if (!rows().length) {
        <div class="card a-empty">No reward slots are planned yet.</div>
      } @else {
        <section class="card a-scroll" aria-labelledby="slots-h">
          <h2 id="slots-h">Live slot status</h2>
          <table class="a-table">
            <thead>
              <tr>
                <th scope="col" class="l">Day / pool / tier</th>
                <th scope="col">Planned</th>
                <th scope="col">Released</th>
                <th scope="col">Available</th>
                <th scope="col">Claimed</th>
                <th scope="col">Paid</th>
                <th scope="col">Failed</th>
                <th scope="col" class="l">Claimed progress</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track $index) {
                <tr>
                  <th scope="row" class="l">Day {{ r.dayNo }} · {{ r.poolCode }} · Tier {{ r.tierNo }}</th>
                  <td>{{ r.planned }}</td>
                  <td>{{ r.released }}</td>
                  <td>{{ r.available }}</td>
                  <td>{{ r.claimed }}</td>
                  <td>{{ r.paid }}</td>
                  <td [class.a-bad]="r.failed > 0">{{ r.failed }}</td>
                  <td class="l">
                    <div class="a-bar" role="progressbar" [attr.aria-label]="'Day ' + r.dayNo + ' ' + r.poolCode + ' tier ' + r.tierNo + ' claimed'" [attr.aria-valuenow]="rowPct(r)" aria-valuemin="0" aria-valuemax="100"><i [style.width.%]="rowPct(r)"></i></div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }
      <p class="small muted">Refreshes every 30 seconds.</p>
    } @else {
      <div class="card a-empty">Dashboard data is unavailable.</div>
    }
  `,
})
export class DashboardComponent {
  private readonly toast = inject(ToastService);
  protected readonly data = signal<{ pool: number; committed: number; paid: number } | null>(null);
  protected readonly rows = signal<LiveRow[]>([]);
  protected readonly loading = computed(() => this.firstLoad());
  private readonly firstLoad = signal(true);
  protected readonly fmt = formatInr;

  constructor() {
    const api = inject(AdminApiService);
    timer(0, REFRESH_MS)
      .pipe(
        switchMap(() =>
          forkJoin([api.getLive(), api.getPublished()]).pipe(
            catchError(() => {
              this.toast.error('Could not refresh the dashboard.');
              this.firstLoad.set(false);
              return EMPTY;
            }),
          ),
        ),
        tap(([rows, published]) => {
          this.rows.set(rows);
          this.data.set({
            pool: published?.rewardPool ?? 0,
            committed: rows.reduce((a, r) => a + r.moneyCommitted, 0),
            paid: rows.reduce((a, r) => a + r.moneyPaid, 0),
          });
          this.firstLoad.set(false);
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe();
  }

  protected pct(part: number, whole: number): number {
    return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
  }

  protected rowPct(r: LiveRow): number {
    return this.pct(r.claimed, r.planned);
  }
}
