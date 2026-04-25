/**
 * Service-specific billing config for sanctions.
 * Stripe price IDs from docs/stripe-billing.md, also stored in memory cz-agents-mcp.md.
 */
import type { BillingConfig } from '@czagents/shared';

export const SANCTIONS_BILLING: BillingConfig = {
  service: 'sanctions',
  priceTiers: {
    // Starter — €19/mo, 5,000 lookups/month
    'price_1TQDU3RwLTHt42lJkfnS6lVX': {
      kind: 'starter',
      monthly_quota: 5_000,
      credits_per_purchase: null,
    },
    // Pro — €99/mo, 50,000 lookups/month
    'price_1TQDUCRwLTHt42lJXgXqjmQ3': {
      kind: 'pro',
      monthly_quota: 50_000,
      credits_per_purchase: null,
    },
  },
};
