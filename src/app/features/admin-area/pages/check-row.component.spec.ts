import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CheckRowComponent } from './check-row.component';

@Component({
  imports: [CheckRowComponent],
  template: `<table><tbody><tr appCheckRow [check]="check()"></tr></tbody></table>`,
})
class HostComponent {
  readonly check = signal(0);
}

describe('CheckRowComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function render(value: number): { cell: HTMLElement; text: string } {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.check.set(value);
    fixture.detectChanges();
    const cell = fixture.nativeElement.querySelector('td') as HTMLElement;
    return { cell, text: cell.textContent!.replace(/\s+/g, ' ').trim() };
  }

  it('is green and shows 0 when the pool balances', () => {
    const { cell, text } = render(0);
    expect(cell.classList.contains('a-ok')).toBe(true);
    expect(cell.classList.contains('a-bad')).toBe(false);
    expect(text).toBe('0');
  });

  it('is red and shows the difference otherwise', () => {
    const under = render(2500);
    expect(under.cell.classList.contains('a-bad')).toBe(true);
    expect(under.text).toContain('2,500');
    const over = render(-1000);
    expect(over.cell.classList.contains('a-bad')).toBe(true);
    expect(over.text).toContain('Over-allocated');
  });

  it('announces changes politely', () => {
    expect(render(0).cell.getAttribute('aria-live')).toBe('polite');
  });
});
