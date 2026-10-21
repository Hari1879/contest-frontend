import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { digitsOnly, isValidLuhn } from './imei';

/** Letters and spaces only, 2–50 chars (§3). Allows Unicode letters for regional names. */
export const NAME_PATTERN = /^[\p{L}][\p{L} ]{0,48}[\p{L}]$/u;

/** 10-digit Indian mobile number (§3). */
export const PHONE_PATTERN = /^[6-9]\d{9}$/;

/** Pragmatic email check — stricter than Angular's built-in (requires a dot in the domain). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function nameValidator(): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = ((c.value as string) ?? '').trim().replace(/\s+/g, ' ');
    if (!v) return null; // `required` handles empty
    if (v.length < 2) return { minlength: true };
    if (v.length > 50) return { maxlength: true };
    if (!NAME_PATTERN.test(v)) return { lettersOnly: true };
    return null;
  };
}

export function emailValidator(): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = ((c.value as string) ?? '').trim();
    if (!v) return null;
    return EMAIL_PATTERN.test(v) ? null : { email: true };
  };
}

export function indianMobileValidator(): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = digitsOnly(c.value as string);
    if (!v) return null;
    return PHONE_PATTERN.test(v) ? null : { indianMobile: true };
  };
}

/** Exactly 15 digits + Luhn check digit (§3, §4). */
export function imeiValidator(): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = digitsOnly(c.value as string);
    if (!v) return null;
    if (v.length !== 15) return { imeiLength: { actual: v.length } };
    if (!isValidLuhn(v)) return { imeiChecksum: true };
    return null;
  };
}
