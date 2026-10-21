import { Component, computed, input } from '@angular/core';
import { formatInr } from '../data/reward-plan.calc';

/** "Check vs pool (must be 0)": green at 0, otherwise red with the difference. */
@Component({
  selector: 'tr[appCheckRow]',
  template: `
    <th scope="row" class="l">Check vs pool (must be 0)</th>
    <td [attr.colspan]="colspan()" [class.a-ok]="ok()" [class.a-bad]="!ok()" aria-live="polite" aria-atomic="true">
      @if (ok()) {
        0
      } @else {
        {{ check() > 0 ? 'Unallocated' : 'Over-allocated' }}: Rs {{ amount() }}
      }
    </td>
  `,
})
export class CheckRowComponent {
  readonly check = input.required<number>();
  readonly colspan = input(10);

  protected readonly ok = computed(() => this.check() === 0);
  protected readonly amount = computed(() => formatInr(Math.abs(this.check())));
}
