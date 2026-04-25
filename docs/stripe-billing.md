# Stripe billing — products & prices

Stripe account: `mhai.app` (`acct_1T07YORwLTHt42lJ`)
Mode: **LIVE** (real charges).

## Products

| Tier | Product ID | Price ID | Amount | Interval |
|---|---|---|---|---|
| `@czagents/sanctions` Starter | `prod_UP0gTw5taspnwS` | `price_1TQDU3RwLTHt42lJkfnS6lVX` | €19.00 | monthly |
| `@czagents/sanctions` Pro     | `prod_UP0gYbjGMwmF6I` | `price_1TQDUCRwLTHt42lJXgXqjmQ3` | €99.00 | monthly |
| `@czagents/dd` Pay-per-report | `prod_UP0gcO4zEdS2b3` | `price_1TQDUIRwLTHt42lJ6t0c9DSR` | €0.50  | one-time |
| `@czagents/dd` Pro            | `prod_UP0g32SnwhsVPh` | `price_1TQDUORwLTHt42lJlUjsibmG` | €49.00 | monthly |
| `@czagents/dd` Agency         | `prod_UP0gyspp8GqU4M` | `price_1TQDUURwLTHt42lJgTScFVDZ` | €199.00 | monthly |

## Out of scope (intentionally)

- **Free tier** — no Stripe needed. Token-issued via signup form, throttled in app layer.
- **Enterprise** — custom pricing, individually quoted.
- **Metered (usage-based)** — pay-per-report is currently a **one-time** product. For true metered (e.g. €0.50 per report, monthly invoice for actuals) switch this price to `recurring` with a `meter` once volume justifies it. Stripe MCP doesn't expose `usage_type=metered`; switch via Dashboard → Product → Add price → "Usage-based pricing".

## Wiring (TODO)

1. **Payment Links** — for low-friction signup, create Payment Links per price (Stripe MCP supports `create_payment_link`). Each Payment Link emits a `checkout.session.completed` webhook → backend issues an API token bound to the `customer` and `subscription`.

2. **Webhook handler** — `packages/sanctions/src/webhook.ts` (and `dd`) — listens for:
   - `checkout.session.completed` → mint API token, store in token DB
   - `customer.subscription.updated` → refresh quota
   - `customer.subscription.deleted` → revoke token
   - `invoice.paid` (for Agency / Pro renewals) → reset monthly counter

3. **Quota enforcement** — in HTTP transport (`http.ts`):
   - Read `Authorization: Bearer <token>` header
   - Look up token → tier + monthly quota + counter
   - Increment counter; 429 if exceeded
   - Reset counter via cron at billing-period boundary

4. **Pay-per-report flow** — for dd:
   - Customer creates Checkout Session with `price_1TQDUIRwLTHt42lJ6t0c9DSR` and quantity = N reports
   - On `checkout.session.completed` → issue token with N report credits
   - Each `get_dd_report` call decrements credits

## Audit / verification

```bash
stripe products list --limit 20
stripe prices list --product prod_UP0gTw5taspnwS
```

Or via Dashboard: <https://dashboard.stripe.com/products>.

## Test mode mirror (recommended before launch)

Before opening signup: re-create the same 5 products in **test mode** with identical price points. Use test Price IDs in CI / local dev to avoid burning real charges during integration testing.
