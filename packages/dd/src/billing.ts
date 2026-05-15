/**
 * Service-specific billing config for dd. Pay-per-report tier uses one-time
 * Stripe price; quantity at checkout becomes credits.
 */
import type { BillingConfig } from '@czagents/shared';

const PAY_PER_REPORT_PRICE = 'price_1TUl5WRwLTHt42lJMSCL6Rzl';

export const DD_BILLING: BillingConfig = {
  service: 'dd',
  priceTiers: {
    // Pay-per-report — €0.50 each, no monthly quota, credits = quantity at checkout
    [PAY_PER_REPORT_PRICE]: {
      kind: 'pay-per-report',
      monthly_quota: null,
      credits_per_purchase: 1,
    },
    // Pro — €49/mo, 200 reports/month
    'price_1TQDUORwLTHt42lJlUjsibmG': {
      kind: 'pro',
      monthly_quota: 200,
      credits_per_purchase: null,
    },
    // Agency — €199/mo, 1,500 reports/month
    'price_1TQDUURwLTHt42lJgTScFVDZ': {
      kind: 'agency',
      monthly_quota: 1_500,
      credits_per_purchase: null,
    },
  },
  payPerReportPriceId: PAY_PER_REPORT_PRICE,
};
