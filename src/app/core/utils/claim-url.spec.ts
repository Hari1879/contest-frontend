import { describe, expect, it } from 'vitest';
import { claimTokenFromUrl, safeRazorpayUrl } from './claim-url';

const ORIGIN = 'https://contest.example';

describe('claimTokenFromUrl', () => {
  it('takes the last path segment of a same-origin url', () => {
    expect(claimTokenFromUrl(`${ORIGIN}/claim/abc-123/`, ORIGIN)).toBe('abc-123');
    expect(claimTokenFromUrl('/claim/abc', ORIGIN)).toBe('abc');
  });

  it('rejects foreign origins and junk', () => {
    expect(claimTokenFromUrl('https://evil.example/claim/abc', ORIGIN)).toBeNull();
    expect(claimTokenFromUrl('http://contest.example/claim/abc', ORIGIN)).toBeNull();
    expect(claimTokenFromUrl(undefined, ORIGIN)).toBeNull();
    expect(claimTokenFromUrl(`${ORIGIN}/`, ORIGIN)).toBeNull();
  });
});

describe('safeRazorpayUrl', () => {
  it('accepts https razorpay hosts and subdomains', () => {
    for (const u of ['https://razorpay.com/x', 'https://rzp.io/i/abc', 'https://api.razorpay.com/x', 'https://pay.rzp.io/y']) {
      expect(safeRazorpayUrl(u)).not.toBeNull();
    }
  });

  it('rejects everything else', () => {
    for (const u of [
      'http://razorpay.com/x',
      'https://evilrazorpay.com/x',
      'https://razorpay.com.evil.io/x',
      'https://razorpay.com@evil.io/x',
      'javascript:alert(1)',
      'https://example.com',
      '',
    ]) {
      expect(safeRazorpayUrl(u)).toBeNull();
    }
  });
});
