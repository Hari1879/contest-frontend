import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AdminCsrfService } from '../../../core/services/admin-csrf.service';
import { AdminApiService } from './admin-api.service';
import { AdminUser } from './reward-plan.models';

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;

@Injectable({ providedIn: 'root' })
export class AdminSessionService {
  private readonly api = inject(AdminApiService);
  private readonly csrf = inject(AdminCsrfService);
  private readonly router = inject(Router);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly onActivity = (): void => this.armTimer();

  readonly user = signal<AdminUser | null>(null);

  loadMe(): Observable<AdminUser> {
    return this.api.me().pipe(tap((u) => this.user.set(u)));
  }

  startIdleWatch(): void {
    this.stopIdleWatch();
    for (const e of ACTIVITY_EVENTS) document.addEventListener(e, this.onActivity, { passive: true });
    this.armTimer();
  }

  stopIdleWatch(): void {
    for (const e of ACTIVITY_EVENTS) document.removeEventListener(e, this.onActivity);
    clearTimeout(this.timer);
  }

  /** Clears local state and returns to login; the server session is ended best-effort. */
  signOut(reason: 'idle' | 'expired' | 'signed-out' = 'signed-out'): void {
    this.stopIdleWatch();
    if (reason !== 'expired') this.api.logout().subscribe({ error: () => undefined });
    this.csrf.clear();
    this.user.set(null);
    void this.router.navigate(['/admin/login'], { queryParams: { reason } });
  }

  private armTimer(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.signOut('idle'), IDLE_TIMEOUT_MS);
  }
}
