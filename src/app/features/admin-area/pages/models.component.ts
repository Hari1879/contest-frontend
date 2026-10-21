import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { AdminApiService } from '../data/admin-api.service';
import { ToastService } from '../data/toast.service';
import { ModelMapping } from '../data/reward-plan.models';
import { ModalComponent } from '../shell/modal.component';

// Used only when neither the models nor the published plan name any pool.
const DEFAULT_POOLS = ['Y11', 'Y21'];

@Component({
  selector: 'app-models',
  imports: [ModalComponent],
  template: `
    <h1>Phone models</h1>
    @if (unassignedActive().length) {
      <p class="alert a-warn" role="alert">
        {{ unassignedActive().length }} active model(s) are not assigned to a pool and cannot win:
        {{ unassignedActive().join(', ') }}.
      </p>
    }
    @if (loading()) {
      <div class="card stack" aria-busy="true">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="a-skel"></div>
        }
      </div>
    } @else if (error()) {
      <div class="card a-empty">
        <p>Models could not be loaded.</p>
        <button type="button" class="a-btn a-btn-primary" (click)="load()">Retry</button>
      </div>
    } @else if (!models().length) {
      <div class="card a-empty">No models yet.</div>
    } @else {
      <div class="card a-scroll">
        <table class="a-table">
          <caption class="visually-hidden">Phone models and pool assignment</caption>
          <thead>
            <tr>
              <th scope="col" class="l">Model</th>
              <th scope="col">Pool</th>
              <th scope="col">Active</th>
            </tr>
          </thead>
          <tbody>
            @for (m of models(); track m.modelName) {
              <tr>
                <th scope="row" class="l">{{ m.modelName }}</th>
                <td>
                  <select
                    class="a-input"
                    [attr.aria-label]="m.modelName + ' pool'"
                    (change)="setPool(m.modelName, $any($event.target).value)"
                  >
                    <option value="" [selected]="m.poolCode === null">Unassigned</option>
                    @for (c of pools(); track c) {
                      <option [value]="c" [selected]="c === m.poolCode">{{ c }}</option>
                    }
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    [checked]="m.active"
                    [attr.aria-label]="m.modelName + ' active'"
                    (change)="setActive(m.modelName, $any($event.target).checked)"
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="a-actions">
        <button type="button" class="a-btn a-btn-primary" [disabled]="!dirty() || saving()" (click)="confirming.set(true)">
          Save changes
        </button>
        @if (dirty()) {
          <span class="a-dirty" role="status">Unsaved changes</span>
        }
      </div>
    }

    @if (confirming()) {
      <app-modal heading="Save model assignments?" (closed)="confirming.set(false)">
        <p>This changes which pool each model's customers can win from.</p>
        @if (unassignedActive().length) {
          <p class="a-err">
            {{ unassignedActive().length }} active model(s) remain unassigned.
          </p>
        }
        <div class="a-actions">
          <button type="button" class="a-btn a-btn-primary" (click)="save()">Confirm save</button>
          <form method="dialog"><button class="a-btn">Cancel</button></form>
        </div>
      </app-modal>
    }
  `,
})
export class ModelsComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly models = signal<ModelMapping[]>([]);
  private readonly planPools = signal<string[]>([]);
  protected readonly pools = computed(() => {
    const codes = new Set([...this.planPools(), ...this.models().flatMap((m) => (m.poolCode ? [m.poolCode] : []))]);
    return codes.size ? [...codes] : DEFAULT_POOLS;
  });
  private readonly saved = signal('[]');
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly saving = signal(false);
  protected readonly confirming = signal(false);
  protected readonly dirty = computed(() => JSON.stringify(this.models()) !== this.saved());
  protected readonly unassignedActive = computed(() =>
    this.models()
      .filter((m) => m.active && m.poolCode === null)
      .map((m) => m.modelName),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(false);
    forkJoin([this.api.getModels(), this.api.getPublished().pipe(catchError(() => of(null)))])
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ([m, plan]) => {
          this.planPools.set(plan?.pools.map((p) => p.poolCode) ?? []);
          this.adopt(m);
        },
        error: () => {
          this.error.set(true);
          this.toast.error('Could not load models.');
        },
      });
  }

  protected setPool(name: string, value: string): void {
    this.models.update((ms) => ms.map((m) => (m.modelName === name ? { ...m, poolCode: value || null } : m)));
  }

  protected setActive(name: string, active: boolean): void {
    this.models.update((ms) => ms.map((m) => (m.modelName === name ? { ...m, active } : m)));
  }

  protected save(): void {
    this.saving.set(true);
    this.api
      .saveModels(this.models().map(({ modelName, poolCode, active }) => ({ modelName, poolCode, active })))
      .pipe(
        finalize(() => {
          this.saving.set(false);
          this.confirming.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (m) => {
          this.adopt(m);
          this.toast.success('Models saved.');
        },
        error: () => this.toast.error('Models could not be saved.'),
      });
  }

  private adopt(m: ModelMapping[]): void {
    this.models.set(m);
    this.saved.set(JSON.stringify(m));
  }
}
