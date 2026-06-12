# Real-World Launch Plan

Recorded on: 2026-06-11

## Principle

Real-world deployment, promotion, sales, and collection are handled by you. The current product provides mature local and production-shaped code, documentation, check commands, and operating paths.

## Step 1: Deploy

1. Push the code to GitHub/GitLab/Bitbucket.
2. Deploy the Node service using `render.yaml` or an equivalent platform.
3. Configure Postgres.
4. Set `PUBLIC_API_BASE_URL` and `APP_ORIGIN`.
5. Configure JWT auth.

## Step 2: Stripe

1. Configure live `STRIPE_SECRET_KEY`.
2. Run `npm run stripe:bootstrap` to create or reuse prices.
3. Set `STRIPE_PRICE_*`.
4. Configure `STRIPE_WEBHOOK_SECRET`.
5. Point the webhook to `${PUBLIC_API_BASE_URL}/api/billing/webhook`.

## Step 3: Launch Checks

```bash
npm run doctor:production
npm run launch:readiness
npm run launch:smoke -- https://your-public-app.example
npm run launch:packet
```

## Step 4: First Sales

1. Prepare 50-200 prospects using `docs/examples/prospect-list-template.csv`.
2. Sell BidFlow first to higher-ticket local service businesses.
3. Sell ReputeLoop next to review-dependent merchants.
4. Every prospect must have scope before a handoff is created.
5. Download the order form for customer confirmation.
6. The customer enters Stripe from `/buy?handoff=`.

## Step 5: Delivery

1. Start delivery only after Stripe webhook-paid evidence exists.
2. Send the customer onboarding link.
3. The customer submits lead CSV, review CSV, or notes.
4. The operator previews and imports.
5. Generate the first pack.
6. Send after QA.
7. Collect customer confirmation.
8. Record the outcome ledger entry.

## Step 6: Expand

Prove 3-5 paid pilots first, then connect email/SMS/Google automation. Do not promise automated sending or publishing before consent, provider configuration, and customer authorization are complete.
