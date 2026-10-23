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
  appKey: '9164ff218bafed3468a27498ebb82bcd0cf46b0f2f5855cf3ffd7aa76ce80858',
  campaignId: 'MOBILE-PURCHASE-2026',
  requestTimeoutMs: 15000,
};
