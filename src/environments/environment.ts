/**
 * Production environment.
 *
 * `apiUrl` should point at a thin backend proxy (same origin), NOT
 * directly at the scp -r dist/contest-pwa/browser/* root@72.61.172.149:/var/www/fangscontest/Rewards provider, if the provider requires a secret/API key.
 * Never put secrets in this file — it ships to the browser.
 *
 * Per-environment values (staging/prod) should be injected at build/deploy time,
 * e.g. by generating this file in CI from pipeline variables.
 */
export const environment = {
  production: true,
  useMockApi: false,
  apiUrl: 'https://api.fangscontest.com/api',
  appKey: 'b8f5d6831bce2d09ba535741b53429db0e0cb189cd50fb719e38e03019c8bec6',
  campaignId: 'MOBILE-PURCHASE-2026',
  requestTimeoutMs: 15000,
};
