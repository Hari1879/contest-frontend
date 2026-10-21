import { Component, DestroyRef, inject, OnDestroy, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminEventsService, ConflictBucket } from '../../../core/services/admin-events.service';
import { AdminSessionService } from '../data/admin-session.service';
import { ToastService } from '../data/toast.service';
import { ModalComponent } from './modal.component';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ModalComponent],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin.scss',
  encapsulation: ViewEncapsulation.None,
})
export class AdminShellComponent implements OnInit, OnDestroy {
  private readonly session = inject(AdminSessionService);
  private readonly events = inject(AdminEventsService);
  private readonly meta = inject(Meta);
  private readonly noindex = this.meta.addTag({ name: 'robots', content: 'noindex, nofollow' });

  protected readonly toast = inject(ToastService);
  protected readonly user = this.session.user;
  protected readonly conflict = signal<{ message: string; buckets: ConflictBucket[] } | null>(null);

  constructor() {
    this.events.events.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((e) => {
      switch (e.kind) {
        case 'unauthorized':
          this.session.signOut('expired');
          break;
        case 'conflict':
          this.conflict.set({ message: e.message, buckets: e.buckets });
          break;
        case 'error':
          this.toast.error(e.message);
          break;
      }
    });
  }

  ngOnInit(): void {
    this.session.startIdleWatch();
  }

  ngOnDestroy(): void {
    this.session.stopIdleWatch();
    this.noindex?.remove();
  }

  protected signOut(): void {
    this.session.signOut();
  }

  protected reload(): void {
    window.location.reload();
  }
}
