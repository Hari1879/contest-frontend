/** Production environment. Never put secrets in this file — it ships to the browser. */
export const environment = {
  production: true,
  useMockApi: false,
  apiUrl: 'https://api.fangscontest.com/api',
  appKey: 'b8f5d6831bce2d09ba535741b53429db0e0cb189cd50fb719e38e03019c8bec6',
  campaignId: 'MOBILE-PURCHASE-2026',
  requestTimeoutMs: 15000,
};
