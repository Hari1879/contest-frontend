import { describe, expect, it } from 'vitest';
import { formatImei, isValidImei, isValidLuhn, maskImei } from './imei';

describe('IMEI helpers', () => {
  it('accepts a valid 15-digit IMEI (Luhn)', () => {
    expect(isValidImei('490154203237518')).toBe(true);
    expect(isValidImei('35-209900-176148-1')).toBe(true);
  });

  it('rejects wrong check digit', () => {
    expect(isValidImei('490154203237519')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidImei('49015420323751')).toBe(false);
    expect(isValidImei('4901542032375180')).toBe(false);
  });

  it('computes Luhn correctly', () => {
    expect(isValidLuhn('79927398713')).toBe(true);
    expect(isValidLuhn('79927398710')).toBe(false);
  });

  it('formats as AA BBBBBB CCCCCC D', () => {
    expect(formatImei('490154203237518')).toBe('49 015420 323751 8');
    expect(formatImei('4901')).toBe('49 01');
  });

  it('masks all but last 4 digits', () => {
    expect(maskImei('490154203237518').endsWith('7518')).toBe(true);
    expect(maskImei('490154203237518')).not.toContain('4901');
  });
});
