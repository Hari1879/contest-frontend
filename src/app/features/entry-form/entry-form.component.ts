import { Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EntryFormValue, EntryOutcome } from '../../core/models/contest.models';
import { claimTokenFromUrl } from '../../core/utils/claim-url';
import { AnalyticsService } from '../../core/services/analytics.service';
import { EntryStateService } from '../../core/services/entry-state.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { digitsOnly } from '../../core/validators/imei';
import {
  emailValidator,
  imeiValidator,
  indianMobileValidator,
  nameValidator,
} from '../../core/validators/contest.validators';
import { ImeiInputDirective } from '../../shared/imei-input.directive';
import { TermsDialogComponent } from '../../shared/terms-dialog/terms-dialog.component';

type FieldName = 'name' | 'email' | 'phone' | 'imei' | 'termsAccepted';

const MESSAGES: Record<FieldName, Record<string, string>> = {
  name: {
    required: 'Please enter your name.',
    minlength: 'Name must be at least 2 characters.',
    maxlength: 'Name can be at most 50 characters.',
    lettersOnly: 'Use letters and spaces only.',
  },
  email: {
    required: 'Please enter your email address.',
    email: 'Enter a valid email, e.g. name@example.com.',
  },
  phone: {
    required: 'Please enter your mobile number.',
    indianMobile: 'Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.',
  },
  imei: {
    required: 'Please enter your phone’s IMEI number.',
    imeiLength: 'IMEI must be exactly 15 digits.',
    imeiChecksum: 'This IMEI doesn’t look right — please double-check each digit.',
    server: 'This IMEI wasn’t accepted. Please check it matches the one on your phone’s box or dial *#06#.',
  },
  termsAccepted: {
    required: 'Please accept the Terms & Conditions to continue.',
  },
};

@Component({
  selector: 'app-entry-form',
  imports: [ReactiveFormsModule, RouterLink, ImeiInputDirective, TermsDialogComponent],
  templateUrl: './entry-form.component.html',
  styleUrl: './entry-form.component.scss',
})
export class EntryFormComponent {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly router = inject(Router);
  private readonly entry = inject(EntryStateService);
  private readonly analytics = inject(AnalyticsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly network = inject(NetworkStatusService);
  protected readonly state = toSignal(this.entry.state, { requireSync: true });

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, nameValidator()]],
    email: ['', [Validators.required, emailValidator()]],
    phone: ['', [Validators.required, indianMobileValidator()]],
    imei: ['', [Validators.required, imeiValidator()]],
    termsAccepted: [false, Validators.requiredTrue],
  });

  protected readonly termsOpen = signal(false);
  private termsVersion = '';
  private termsAcceptedAt = '';

  protected readonly submitAttempted = signal(false);
  protected readonly confirming = signal(false);
  protected readonly imeiRejected = signal(false);
  private readonly serverMessage = signal('');
  protected readonly failureMessage = signal('');
  protected readonly liveMessage = signal('');
  protected readonly failure = signal<EntryOutcome | null>(null);
  protected readonly imeiDigits = toSignal(this.form.controls.imei.valueChanges, { initialValue: '' });
  protected readonly termsChecked = toSignal(this.form.controls.termsAccepted.valueChanges, {
    initialValue: false,
  });
  private lastObservedImei = '';

  constructor() {
    this.entry.clearOutcome();
    this.form.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      this.entry.clearSubmissionAttempt();
      this.failure.set(null);
      this.failureMessage.set('');
      const currentImei = this.imeiDigits();
      if (currentImei !== this.lastObservedImei) {
        this.imeiRejected.set(false);
        this.serverMessage.set('');
        this.lastObservedImei = currentImei;
      }
      this.analytics.trackOnce('form_started');
    });
  }

  protected showError(name: FieldName): boolean {
    const c = this.form.controls[name];
    if (name === 'imei' && this.imeiRejected()) return true;
    return c.invalid && (c.touched || this.submitAttempted());
  }

  protected errorFor(name: FieldName): string {
    if (name === 'imei' && this.imeiRejected()) return this.serverMessage() || MESSAGES.imei['server'];
    const errors = this.form.controls[name].errors;
    if (!errors) return '';
    const key = Object.keys(errors)[0];
    return MESSAGES[name][key] ?? 'Please check this field.';
  }

  protected openTerms(e?: Event): void {
    e?.preventDefault();
    this.termsOpen.set(true);
  }

  protected formattedImei(): string {
    return this.imeiDigits().replace(/^(\d{2})(\d{6})(\d{6})(\d)$/, '$1 $2 $3 $4');
  }

  protected acceptTerms(version: string): void {
    this.termsVersion = version;
    this.termsAcceptedAt = new Date().toISOString();
    this.termsOpen.set(false);
    this.form.controls.termsAccepted.setValue(true);
    this.form.controls.termsAccepted.markAsTouched();
  }

  protected onPhoneInput(ctrl: AbstractControl): void {
    // Accept pasted "+91 98765 43210" style values.
    let d = digitsOnly(ctrl.value as string);
    if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
    if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
    if (d !== ctrl.value) ctrl.setValue(d.slice(0, 10));
  }

  protected submit(): void {
    if (this.state().submitting) return; // guard against double submit
    this.submitAttempted.set(true);
    this.failure.set(null);
    this.failureMessage.set('');
    this.form.markAllAsTouched();

    if (this.imeiRejected()) {
      this.announce(this.errorFor('imei'));
      this.focus('imei');
      return;
    }

    if (this.form.invalid) {
      const count = Object.values(this.form.controls).filter((c) => c.invalid).length;
      this.announce(`Please fix ${count} ${count === 1 ? 'field' : 'fields'} before submitting.`);
      this.focusFirstInvalid();
      return;
    }
    this.confirming.set(true);
  }

  protected confirmAndSubmit(): void {
    if (this.state().submitting) return;
    this.failure.set(null);
    this.failureMessage.set('');
    if (!this.network.online()) {
      this.failure.set({ kind: 'network_error' });
      this.announce('You appear to be offline. Connect to the internet and try again.');
      return;
    }
    this.entry
      .submit({
        ...(this.form.getRawValue() as EntryFormValue),
        termsVersion: this.termsVersion,
        termsAcceptedAt: this.termsAcceptedAt,
      })
      .subscribe((outcome) => this.handle(outcome));
  }

  private handle(outcome: EntryOutcome): void {
    switch (outcome.kind) {
      case 'won': {
        const token = claimTokenFromUrl(outcome.claimUrl);
        if (!token) {
          this.confirming.set(false);
          this.failure.set(outcome);
          this.failureMessage.set(
            'Congratulations, you won! We could not open your claim page automatically. Please contact the store with your entry details.',
          );
          this.announce(this.failureMessage());
          return;
        }
        this.form.reset(); // drop PII from memory as soon as it's no longer needed
        void this.router.navigate(['/claim', token], { replaceUrl: true });
        return;
      }
      case 'not_won':
      case 'duplicate':
      case 'campaign_closed':
      case 'model_not_eligible':
        void this.router.navigateByUrl('/status');
        return;
      case 'rejected': {
        this.serverMessage.set(outcome.message ?? '');
        this.imeiRejected.set(true);
        this.confirming.set(false);
        this.announce(this.errorFor('imei'));
        this.focus('imei');
        return;
      }
      default:
        this.failure.set(outcome);
        if (outcome.kind === 'rate_limited') {
          this.failureMessage.set(outcome.message || 'Too many attempts. Please wait a moment and try again.');
        }
        this.announce(
          this.failureMessage() ||
            (outcome.kind === 'network_error'
              ? 'We couldn’t reach the server. Check your connection and try again.'
              : 'Something went wrong on our side. Please try again.'),
        );
    }
  }

  private announce(msg: string): void {
    // Clear first so repeated identical messages are re-announced.
    this.liveMessage.set('');
    setTimeout(() => this.liveMessage.set(msg), 50);
  }

  private focusFirstInvalid(): void {
    const order: FieldName[] = ['name', 'email', 'phone', 'imei', 'termsAccepted'];
    const firstInvalid = order.find((n) => this.form.controls[n].invalid);
    if (firstInvalid) this.focus(firstInvalid);
  }

  private focus(name: FieldName): void {
    this.host.nativeElement.querySelector<HTMLElement>(`#f-${name}`)?.focus();
  }
}
