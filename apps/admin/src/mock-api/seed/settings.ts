import type { Settings } from "@modelvend/admin-api/settings";

/** The defaults in docs/product-rules.md. */
export const seedSettings = (): Settings => ({
  limits: {
    requestsPerMinute: 120,
    concurrency: 10,
    queueSize: 50,
    queueWaitSeconds: 3600,
    dailySpendMicros: null,
    monthlySpendMicros: null,
    subAccounts: 10,
    topUpMinMicros: 5_000_000,
    topUpMaxMicros: 10_000_000_000,
    firstWeekDailyTopUpMicros: 500_000_000,
  },
  minMargin: 0.2,
  cardFeeRate: 0.05,
  welcomeCreditMicros: 0,
  purchasedCreditDays: 365,
  giftCreditDays: 90,
  refundWindowDays: 14,
  bonus: { enabled: false, steps: [] },
});
