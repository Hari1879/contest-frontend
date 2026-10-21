import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { AnalyticsService } from '../../core/services/analytics.service';
import { EntryStateService } from '../../core/services/entry-state.service';
import { InrPipe } from '../../shared/inr.pipe';

@Component({
  selector: 'app-confirmation',
  imports: [InrPipe, DatePipe],
  templateUrl: './confirmation.component.html',
  styleUrl: './confirmation.component.scss',
})
export class ConfirmationComponent implements OnInit {
  private readonly entry = inject(EntryStateService);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);
  private readonly state = toSignal(this.entry.state, { requireSync: true });

  protected readonly completed = computed(() => this.state().completed!);
  protected readonly outcome = computed(() => this.completed().outcome);
  protected readonly copied = signal(false);

  ngOnInit(): void {
    this.analytics.track('confirmation_viewed', { outcome: this.outcome().kind });
  }

  protected async copyRef(ref: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(ref);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* clipboard blocked — the reference is still visible to copy manually */
    }
  }

  protected done(): void {
    this.entry.reset();
    void this.router.navigateByUrl('/', { replaceUrl: true });
  }
}
