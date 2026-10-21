/** Strip everything that is not a digit. */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D+/g, '');
}

/**
 * Luhn checksum as used for the IMEI check digit (15th digit).
 * Returns true when the full 15-digit IMEI is valid.
 */
export function isValidLuhn(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function isValidImei(value: string | null | undefined): boolean {
  const d = digitsOnly(value);
  return d.length === 15 && isValidLuhn(d);
}

/**
 * Display format that mirrors how IMEIs are printed on boxes/receipts:
 * AA-BBBBBB-CCCCCC-D  →  "AA BBBBBB CCCCCC D"
 */
export function formatImei(value: string | null | undefined): string {
  const d = digitsOnly(value).slice(0, 15);
  const parts = [d.slice(0, 2), d.slice(2, 8), d.slice(8, 14), d.slice(14, 15)];
  return parts.filter(Boolean).join(' ');
}

/** "490154203237518" → "•••••••••••7518" style: keep last 4 digits only. */
export function maskImei(value: string): string {
  const d = digitsOnly(value);
  if (d.length <= 4) return d;
  return '•'.repeat(d.length - 4).replace(/(.{4})/g, '$1 ').trim() + ' ' + d.slice(-4);
}
