import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EntryStateService } from '../../core/services/entry-state.service';

/** Dedicated screens for expected non-winning business outcomes. */
@Component({
  selector: 'app-status',
  imports: [RouterLink],
  template: `
    @let kind = outcome()?.kind;
    <section class="card status" role="alert">
      @switch (kind) {
        @case ('not_won') {
          <h1>Thanks for participating, better luck next time.</h1>
          <p>Your entry is final.</p>
        }
        @case ('duplicate') {
          <h1>This device has already been entered.</h1>
        }
        @case ('model_not_eligible') {
          <h1>This IMEI isn't eligible for this contest. Please check the number or contact the store.</h1>
        }
        @case ('campaign_closed') {
          <h1>The contest isn't running right now.</h1>
        }
      }
      <div class="actions">
        <a class="btn btn-ghost" routerLink="/">Back to home</a>
      </div>
    </section>
  `,
  styles: `
    .status { text-align: center; }
    .icon { font-size: 44px; margin-bottom: 8px; }
    h1 { font-size: 22px; }
    .actions { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
  `,
})
export class StatusComponent {
  private readonly state = toSignal(inject(EntryStateService).state, { requireSync: true });
  protected readonly outcome = computed(() => this.state().lastOutcome);
}
