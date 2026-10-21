import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, OnDestroy, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminCsrfService } from '../../../core/services/admin-csrf.service';
import { AdminApiService } from '../data/admin-api.service';

const REASONS: Record<string, string> = {
  idle: 'You were signed out after 15 minutes of inactivity.',
  expired: 'Your session expired. Sign in again.',
};

@Component({
  selector: 'app-admin-login',
  imports: [ReactiveFormsModule],
  template: `
    <form class="card stack" style="max-width: 420px; margin: 24px auto" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <h1>Admin sign in</h1>
      @if (notice()) {
        <p class="alert alert-info" role="status">{{ notice() }}</p>
      }
      @if (error()) {
        <p class="alert alert-error" role="alert">{{ error() }}</p>
      }
      <label for="adm-email">Email</label>
      <input id="adm-email" type="email" formControlName="email" autocomplete="username" />
      <label for="adm-pw">Password</label>
      <input id="adm-pw" type="password" formControlName="password" autocomplete="current-password" />
      <label for="adm-totp">Authenticator code (6 digits)</label>
      <input
        id="adm-totp"
        formControlName="totp"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
      />
      <button class="btn btn-primary" type="submit" [disabled]="busy()">Sign in</button>
    </form>
  `,
})
export class AdminLoginComponent implements OnDestroy {
  private readonly api = inject(AdminApiService);
  private readonly csrf = inject(AdminCsrfService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly noindex = inject(Meta).addTag({ name: 'robots', content: 'noindex, nofollow' });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    totp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal(REASONS[this.route.snapshot.queryParamMap.get('reason') ?? ''] ?? '');

  ngOnDestroy(): void {
    this.noindex?.remove();
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Enter your email, password and the 6-digit code from your authenticator app.');
      return;
    }
    this.error.set('');
    this.busy.set(true);
    this.api
      .login(this.form.getRawValue())
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (res) => {
          this.csrf.set(res.csrfToken);
          const target = this.route.snapshot.queryParamMap.get('returnUrl') ?? '';
          void this.router.navigateByUrl(target.startsWith('/admin') ? target : '/admin');
        },
        error: (e: unknown) =>
          this.error.set(
            e instanceof HttpErrorResponse && e.status === 429
              ? 'Too many attempts. Try again later.'
              : 'Sign-in failed. Check your details and code.',
          ),
      });
  }
}
