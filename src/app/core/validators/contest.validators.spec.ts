import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { emailValidator, imeiValidator, indianMobileValidator, nameValidator } from './contest.validators';

const run = (v: ReturnType<typeof nameValidator>, value: string) => v(new FormControl(value));

describe('contest validators', () => {
  it('name: letters/spaces, 2–50', () => {
    expect(run(nameValidator(), 'Hari GM')).toBeNull();
    expect(run(nameValidator(), 'A')).toEqual({ minlength: true });
    expect(run(nameValidator(), 'Hari123')).toEqual({ lettersOnly: true });
    expect(run(nameValidator(), 'a'.repeat(51))).toEqual({ maxlength: true });
  });

  it('phone: ^[6-9]\\d{9}$', () => {
    expect(run(indianMobileValidator(), '9876543210')).toBeNull();
    expect(run(indianMobileValidator(), '5876543210')).toEqual({ indianMobile: true });
    expect(run(indianMobileValidator(), '98765')).toEqual({ indianMobile: true });
  });

  it('email', () => {
    expect(run(emailValidator(), 'a@b.co')).toBeNull();
    expect(run(emailValidator(), 'a@b')).toEqual({ email: true });
  });

  it('imei: length then checksum', () => {
    expect(run(imeiValidator(), '490154203237518')).toBeNull();
    expect(run(imeiValidator(), '4901542032')).toEqual({ imeiLength: { actual: 10 } });
    expect(run(imeiValidator(), '490154203237519')).toEqual({ imeiChecksum: true });
  });
});
