import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EntryOutcome } from '../../core/models/contest.models';
import { EntryState } from '../../core/services/entry-state.service';
import { EntryStateService } from '../../core/services/entry-state.service';
import { StatusComponent } from './status.component';

describe('StatusComponent', () => {
  let state: BehaviorSubject<EntryState>;
  let fixture: ComponentFixture<StatusComponent>;

  beforeEach(() => {
    state = new BehaviorSubject<EntryState>({
      submitting: false,
      lastOutcome: null,
      completed: null,
      storeId: null,
    });
    TestBed.configureTestingModule({
      imports: [StatusComponent],
      providers: [
        provideRouter([]),
        { provide: EntryStateService, useValue: { state: state.asObservable() } },
      ],
    });
    fixture = TestBed.createComponent(StatusComponent);
  });

  afterEach(() => TestBed.resetTestingModule());

  function textFor(outcome: EntryOutcome): string {
    state.next({ ...state.value, lastOutcome: outcome });
    fixture.detectChanges();
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }

  it('shows the final, friendly not-won copy', () => {
    const text = textFor({ kind: 'not_won' });
    expect(text).toContain('Thanks for participating, better luck next time.');
    expect(text).toContain('Your entry is final.');
  });

  it('shows the duplicate-device copy', () => {
    expect(textFor({ kind: 'duplicate' })).toContain('This device has already been entered.');
  });

  it('shows the ineligible-IMEI copy', () => {
    expect(textFor({ kind: 'model_not_eligible' })).toContain(
      "This IMEI isn't eligible for this contest. Please check the number or contact the store.",
    );
  });

  it('shows the campaign-closed copy', () => {
    expect(textFor({ kind: 'campaign_closed' })).toContain("The contest isn't running right now.");
  });
});