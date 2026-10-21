import { Directive, ElementRef, forwardRef, HostListener, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { digitsOnly, formatImei } from '../core/validators/imei';

/**
 * Shows the IMEI grouped as "AA BBBBBB CCCCCC D" while the form model holds
 * the raw 15 digits (§3 — reduce manual entry errors). Keeps the caret in place
 * when editing in the middle of the value.
 */
@Directive({
  selector: 'input[appImeiInput]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ImeiInputDirective), multi: true }],
  host: { inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false' },
})
export class ImeiInputDirective implements ControlValueAccessor {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('input')
  handleInput(): void {
    const input = this.el;
    const caret = input.selectionStart ?? input.value.length;
    const digitsBeforeCaret = digitsOnly(input.value.slice(0, caret)).length;

    const digits = digitsOnly(input.value).slice(0, 15);
    const formatted = formatImei(digits);
    input.value = formatted;

    // Restore caret after the same number of digits.
    let pos = 0;
    let seen = 0;
    while (pos < formatted.length && seen < digitsBeforeCaret) {
      if (/\d/.test(formatted[pos])) seen++;
      pos++;
    }
    if (document.activeElement === input) input.setSelectionRange(pos, pos);

    this.onChange(digits);
  }

  @HostListener('blur')
  handleBlur(): void {
    this.onTouched();
  }

  writeValue(value: string | null): void {
    this.el.value = formatImei(value ?? '');
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.el.disabled = disabled;
  }
}
