# Launch Runbook Summary

Recorded on: 2026-06-11

## Purpose

This runbook moves Local Growth OS from local product readiness toward real paid concierge pilot launch checks.

## Required Environment

- `NODE_ENV=production`
- `DATABASE_URL`
- `PUBLIC_API_BASE_URL`
- `APP_ORIGIN`
- `JWT_PUBLIC_KEY`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_*`

## Check Sequence

```bash
npm run doctor:production
npm run launch:readiness
npm run launch:smoke -- https://your-public-app.example
npm run launch:packet
```

## Scoped Pilot Defaults

- `ENABLE_PUBLIC_SELF_SERVE_CHECKOUT=false`
- Send `/buy?handoff=` only to prospects with confirmed scope.
- Download and send the order form before payment.
- If provider advisories remain open, promise only manual email/calls/CSV import, not automated email/SMS/Google actions.

## Pre-Launch Blockers

- No public HTTPS URL.
- Missing Postgres.
- Missing production JWT configuration.
- Missing live Stripe.
- Missing webhook secret.
- Missing `price_` plan IDs.

## First Launch Day

1. Import the prospect list.
2. Log every sales activity.
3. Create checkout handoff after `scope_sent`.
4. Download and send the order form.
5. Wait for Stripe webhook-paid evidence.
6. Move into onboarding and first-pack delivery.
