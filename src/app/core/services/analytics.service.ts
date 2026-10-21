import { Injectable, isDevMode } from '@angular/core';

/** Funnel events (§9 Analytics): landing → form started → submitted → revealed. */
export type FunnelEvent =
  | 'landing_viewed'
  | 'form_started'
  | 'form_submitted'
  | 'entry_outcome'
  | 'scratch_revealed'
  | 'confirmation_viewed';

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

/**
 * Vendor-agnostic analytics. Pushes to `window.dataLayer` (GTM/GA4) when present.
 * Never sends PII (name/email/phone/IMEI).
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly sent = new Set<string>();

  track(event: FunnelEvent, props: Record<string, string | number | boolean> = {}): void {
    const payload = { event: `contest_${event}`, ...props, ts: Date.now() };
    if (typeof window !== 'undefined' && Array.isArray(window.dataLayer)) {
      window.dataLayer.push(payload);
    }
    if (isDevMode()) console.debug('[analytics]', payload);
  }

  /** Track an event at most once per page session (e.g. form_started). */
  trackOnce(event: FunnelEvent, props?: Record<string, string | number | boolean>): void {
    if (this.sent.has(event)) return;
    this.sent.add(event);
    this.track(event, props);
  }
}
