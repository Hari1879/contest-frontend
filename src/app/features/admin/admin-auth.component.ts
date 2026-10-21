import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, Observable } from 'rxjs';
import { AdminAuthService, AdminLoginResponse } from '../../core/services/admin-auth.service';
import { SignupResponse, SignupService } from '../../core/services/signup.service';

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

@Component({
  selector: 'app-admin-auth',
  imports: [RouterLink],
  templateUrl: './admin-auth.component.html',
  styleUrl: './admin-auth.component.scss',
})
export class AdminAuthComponent {
  private readonly api = inject(AdminAuthService);
  private readonly signupApi = inject(SignupService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly mode = signal<AuthMode>('login');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly resetToken = signal('');
  protected readonly verified = signal(false);
  protected readonly resetComplete = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');

  constructor() {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      this.mode.set(data['authMode'] as AuthMode);
      this.error.set('');
      this.success.set('');
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.verified.set(params.get('verified') === '1');
      this.resetComplete.set(params.get('reset') === '1');
      this.resetToken.set(params.get('token') ?? '');
      if (params.get('reason') === 'session-required') {
        this.error.set('Please sign in to access the admin activity screen.');
      }
    });
  }

  protected setEmail(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  protected setPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected setNewPassword(event: Event): void {
    this.newPassword.set((event.target as HTMLInputElement).value);
  }

  protected setConfirmPassword(event: Event): void {
    this.confirmPassword.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.loading()) return;
    this.error.set('');
    this.success.set('');

    if (this.mode() === 'reset') {
      if (!this.resetToken()) {
        this.error.set('This reset link is missing or invalid. Request a new one.');
        return;
      }
      if (!this.checkPassword(this.newPassword(), this.confirmPassword())) return;
      this.execute(this.api.resetPassword(this.resetToken(), this.newPassword()), () => {
        void this.router.navigate(['/admin/login'], { queryParams: { reset: 1 } });
      });
      return;
    }

    if (this.mode() === 'forgot') {
      this.execute(this.api.forgotPassword(this.email().trim()), () => {
        this.success.set('If a verified account exists for that address, a reset link is on its way.');
      });
      return;
    }

    if (this.mode() === 'signup') {
      if (!this.validateSignup()) return;
      this.execute(this.signupApi.initiateSignup(this.email().trim(), this.password()), (response) => {
        const signup = response as SignupResponse;
        if (!signup || (signup.status !== 'pending' && signup.status !== 'approved')) {
          this.error.set('We could not confirm your signup. Please try again.');
          return;
        }
        this.password.set('');
        this.confirmPassword.set('');
        this.success.set(signup.status === 'pending'
          ? 'Your signup request is pending. Please check your email for updates.'
          : 'Your account is active.');
      });
      return;
    }

    this.execute(this.api.login(this.email().trim(), this.password()), (response) => {
      const login = response as AdminLoginResponse;
      if (!login?.token || !login.user?.email) {
        this.error.set('The server returned an incomplete sign-in response. Please try again.');
        return;
      }
      this.api.saveToken(login.token);
      void this.router.navigateByUrl('/admin/daily-activity');
    });
  }

  private checkPassword(password: string, confirmation?: string): boolean {
    if (password.length < 12) {
      this.error.set('Use a password with at least 12 characters.');
      return false;
    }
    if (confirmation !== undefined && password !== confirmation) {
      this.error.set('The passwords do not match.');
      return false;
    }
    return true;
  }

  private validateSignup(): boolean {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim())) {
      this.error.set('Enter a valid email address.');
      return false;
    }
    if (this.password().length < 12 || this.password().length > 72) {
      this.error.set('Choose a password between 12 and 72 characters.');
      return false;
    }
    if (this.password() !== this.confirmPassword()) {
      this.error.set('The passwords do not match.');
      return false;
    }
    return true;
  }

  private execute(request: Observable<unknown>, onSuccess: (response: unknown) => void): void {
    this.loading.set(true);
    request.pipe(
      finalize(() => this.loading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: onSuccess,
      error: (error: unknown) => this.showRequestError(error),
    });
  }

  private showRequestError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 0) {
      this.error.set('Could not reach the server. Check your connection and try again.');
      return;
    }
    switch (this.mode()) {
      case 'login':
        this.error.set('Sign-in failed. Check your details and confirm your email address is verified.');
        break;
      case 'signup':
        this.showSignupError(error);
        break;
      case 'reset':
        this.error.set('That reset link may have expired or already been used. Request a new one.');
        break;
      default:
        this.error.set('Could not send the reset link. Try again shortly.');
    }
  }

  private showSignupError(error: unknown): void {
    const response = error instanceof HttpErrorResponse ? error.error : null;
    const message = typeof response === 'string'
      ? response
      : typeof response === 'object' && response !== null
        ? ['message', 'detail', 'error']
          .map((key) => key in response ? String(response[key]) : '')
          .filter(Boolean)
          .join(' ')
        : '';
    if ((error instanceof HttpErrorResponse && error.status === 409)
      || /duplicate|already exists|already registered|pending/i.test(message)) {
      this.error.set('An account or signup request already exists for this email. Please check your inbox for updates.');
      return;
    }
    if (error instanceof HttpErrorResponse && [400, 422].includes(error.status)) {
      this.error.set('Please check your email and password, then try again.');
      return;
    }
    this.error.set('We could not process your signup right now. Please try again shortly.');
  }
}