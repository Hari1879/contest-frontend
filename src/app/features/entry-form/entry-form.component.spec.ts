import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryState } from '../../core/services/entry-state.service';
import { EntryStateService } from '../../core/services/entry-state.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { EntryFormComponent } from './entry-form.component';

describe('EntryFormComponent', () => {
  let fixture: ComponentFixture<EntryFormComponent>;
  let submit: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const state = new BehaviorSubject<EntryState>({
      submitting: false,
      lastOutcome: null,
      completed: null,
      storeId: null,
    });
    submit = vi.fn(() => of({ kind: 'rejected' }));
    await TestBed.configureTestingModule({
      imports: [EntryFormComponent],
      providers: [
        provideRouter([]),
        {
          provide: EntryStateService,
          useValue: {
            state: state.asObservable(),
            clearOutcome: vi.fn(),
            clearSubmissionAttempt: vi.fn(),
            submit,
          },
        },
        { provide: AnalyticsService, useValue: { trackOnce: vi.fn(), track: vi.fn() } },
        { provide: NetworkStatusService, useValue: { online: signal(true) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EntryFormComponent);
    fixture.detectChanges();
  });

  function enterValidDetails(): void {
    const component = fixture.componentInstance as unknown as { form: { setValue(value: unknown): void } };
    component.form.setValue({
      name: 'Hari Murugavel',
      email: 'hari@example.com',
      phone: '9876543210',
      imei: '490154203237518',
      termsAccepted: true,
    });
    fixture.detectChanges();
  }

  it('shows the formatted IMEI and final-entry warning before submitting', () => {
    enterValidDetails();
    (fixture.componentInstance as unknown as { submit(): void }).submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Check your IMEI:');
    expect(fixture.nativeElement.textContent).toContain('49 015420 323751 8');
    expect(fixture.nativeElement.textContent).toContain('You can enter only once per device and the result is final.');
    expect(fixture.nativeElement.textContent).toContain('Edit');
    expect(fixture.nativeElement.textContent).toContain('Confirm & Submit');
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps a rejected IMEI on the existing inline error path', () => {
    enterValidDetails();
    (fixture.componentInstance as unknown as { submit(): void }).submit();
    fixture.detectChanges();
    const confirmButton = fixture.nativeElement.querySelector('.confirm-actions .btn-primary') as HTMLButtonElement;
    confirmButton.click();
    fixture.detectChanges();

    expect(submit).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('This IMEI wasn’t accepted.');
    expect(fixture.nativeElement.textContent).not.toContain('This device has already been entered.');
  });

  function confirm(): void {
    enterValidDetails();
    (fixture.componentInstance as unknown as { submit(): void }).submit();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.confirm-actions .btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('navigates a win to /claim/:token with replaceUrl', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    submit.mockReturnValue(of({ kind: 'won', amount: 500, claimUrl: `${window.location.origin}/claim/tok123` }));
    confirm();

    expect(navigate).toHaveBeenCalledWith(['/claim', 'tok123'], { replaceUrl: true });
  });

  it('rejects a foreign-origin claimUrl with a safe error and no navigation', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    submit.mockReturnValue(of({ kind: 'won', amount: 500, claimUrl: 'https://evil.example/claim/tok123' }));
    confirm();

    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('Something went wrong');
    expect(fixture.nativeElement.textContent).toContain('could not open your claim page');
  });

  it('shows the server message for a 4xx rejection', () => {
    submit.mockReturnValue(of({ kind: 'rejected', message: 'IMEI is blacklisted.' }));
    confirm();

    expect(fixture.nativeElement.textContent).toContain('IMEI is blacklisted.');
    expect(fixture.nativeElement.textContent).not.toContain('This IMEI wasn’t accepted.');
  });
});
