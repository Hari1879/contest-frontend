/**
 * Extracts the claim token (last path segment) from a claimUrl returned by the API.
 * Returns null unless the URL is same-origin, so a tampered/foreign URL is never followed.
 */
export function claimTokenFromUrl(claimUrl: string | undefined, origin = window.location.origin): string | null {
  if (!claimUrl || typeof claimUrl !== 'string') return null;
  try {
    const url = new URL(claimUrl.trim(), origin);
    if (url.origin !== origin) return null;
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (!last) return null;
    const token = decodeURIComponent(last);
    return token && token.length <= 512 && !token.includes('/') ? token : null;
  } catch {
    return null;
  }
}

const PAYOUT_HOSTS = ['razorpay.com', 'rzp.io'];

/** Returns the URL only if it is https on razorpay.com / rzp.io (or a subdomain), else null. */
export function safeRazorpayUrl(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    return PAYOUT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? url.toString() : null;
  } catch {
    return null;
  }
}
