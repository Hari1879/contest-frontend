/** Production environment. Never put secrets in this file — it ships to the browser. */
export const environment = {
  production: true,
  useMockApi: false,
  apiUrl: 'https://api.fangscontest.com/api',
  appKey: '9164ff218bafed3468a27498ebb82bcd0cf46b0f2f5855cf3ffd7aa76ce80858',
  // campaignId: 'MOBILE-PURCHASE-2026',
  campaignId: 'MOBILE-PURCHASE-2026-TEST',
  requestTimeoutMs: 15000,
};
