import { Component, computed, input, output } from '@angular/core';
import { DAY_COUNT, dayNoOf, LiveRow, PoolPlan, RewardPlan } from '../data/reward-plan.models';
import { dayLabel, dayLock, DayLock, formatInr, PoolTotals } from '../data/reward-plan.calc';
import { CheckRowComponent } from './check-row.component';

export const liveKey = (pool: string, tierNo: number, dayNo: number): string => `${pool}|${tierNo}|${dayNo}`;

@Component({
  selector: 'app-pool-card',
  imports: [CheckRowComponent],
  templateUrl: './pool-card.component.html',
})
export class PoolCardComponent {
  readonly pool = input.required<PoolPlan>();
  readonly plan = input.required<RewardPlan>();
  readonly totals = input.required<PoolTotals>();
  /** Contest "today"; null when unknown, which makes every day read-only. */
  readonly today = input<string | null>(null);
  readonly editable = input(true);
  readonly live = input<ReadonlyMap<string, LiveRow>>(new Map());
  readonly errors = input<ReadonlyMap<string, string>>(new Map());

  readonly amountChange = output<{ tier: number; value: string }>();
  readonly countChange = output<{ tier: number; day: number; value: string }>();
  readonly pasteBlock = output<{ tier: number; day: number; text: string }>();

  protected readonly days = Array.from({ length: DAY_COUNT }, (_, i) => i);
  protected readonly fmt = formatInr;
  protected readonly code = computed(() => this.pool().poolCode);

  protected label(d: number): string {
    return dayLabel(this.plan().startDate, d);
  }

  protected lock(d: number): DayLock {
    const today = this.today();
    return today ? dayLock(this.plan().startDate, d, today) : 'past';
  }

  protected readOnly(d: number): boolean {
    return !this.editable() || this.lock(d) === 'past';
  }

  protected row(tier: number, d: number): LiveRow | undefined {
    return this.live().get(liveKey(this.code(), this.pool().tiers[tier].tierNo, dayNoOf(d)));
  }

  protected statusTitle(tier: number, d: number): string {
    const s = this.row(tier, d);
    return s
      ? `Released ${s.released} · Available ${s.available} · Claimed ${s.claimed} · Paid ${s.paid}`
      : 'No live status yet';
  }

  protected cellLabel(tier: number, d: number): string {
    return `${this.code()} ${this.pool().tiers[tier].label}, ${this.label(d)}, winner count`;
  }

  protected amountErr(tier: number): string | undefined {
    return this.errors().get(`amount.${this.code()}.${this.pool().tiers[tier].tierNo}`);
  }

  protected countErr(tier: number, d: number): string | undefined {
    return this.errors().get(`count.${this.code()}.${this.pool().tiers[tier].tierNo}.${dayNoOf(d)}`);
  }

  protected onPaste(event: ClipboardEvent, tier: number, day: number): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!/[\t\n]/.test(text.trim())) return;
    event.preventDefault();
    this.pasteBlock.emit({ tier, day, text });
  }

  protected onAmount(event: Event, tier: number): void {
    const el = event.target as HTMLInputElement;
    this.amountChange.emit({ tier, value: el.value });
    this.sync(el, this.pool().tiers[tier].amount);
  }

  protected onCount(event: Event, tier: number, day: number): void {
    const el = event.target as HTMLInputElement;
    this.countChange.emit({ tier, day, value: el.value });
    this.sync(el, this.pool().tiers[tier].dayCounts[day]);
  }

  // Clamping or stripping may leave the bound value unchanged, so the DOM is synced explicitly.
  private sync(el: HTMLInputElement, value: number): void {
    if (el.value !== String(value)) el.value = String(value);
  }
}
