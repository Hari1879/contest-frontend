import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
});