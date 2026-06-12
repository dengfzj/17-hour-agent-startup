# Product Manual Summary

Recorded on: 2026-06-11

## Product Package

Local Growth OS contains two monetizable products:

- BidFlow Local: lead scoring, quoting, proposals, quote follow-up, customer action, and revenue recovery for local service businesses.
- ReputeLoop: review-risk triage, compliant reply drafts, customer recovery, recovery links, and reputation operations.

## Main Views

- Portfolio: explains why the two directions were selected.
- BidFlow: handles leads, quotes, proposals, and quote recovery.
- ReputeLoop: handles review risk, response drafts, and customer recovery.
- Launch: manages prospects, sales activity, checkout handoffs, order forms, and the revenue command center.
- Buy: lets customers confirm handoff scope and enter Stripe Checkout.
- Onboarding: lets customers submit materials and operators deliver the first pack.
- Recovery: lets customers approve, request revision, request callback, or decline recovery actions.
- Legal: pilot terms, privacy, and refund policy pages.

## Core APIs

- `GET /api/health`
- `GET /api/plans`
- `POST /api/import/leads`
- `POST /api/import/reviews`
- `POST /api/import/prospects`
- `POST /api/sales-prospects/:prospectId/outreach-pack`
- `GET /api/sales-prospects/:prospectId/outreach-pack/download`
- `POST /api/sales-prospects/:prospectId/checkout-handoff`
- `GET /api/sales-prospects/:prospectId/checkout-handoff/order-form`
- `POST /api/public/checkout`
- `POST /api/billing/webhook`
- `GET /api/onboarding`
- `POST /api/public/onboarding/:token/submissions`
- `POST /api/onboarding/submissions/:submissionId/first-pack`
- `POST /api/onboarding/:recordId/outcomes`

## Payment and Delivery Rules

- Production defaults to scoped checkout handoffs.
- Each handoff has frozen scope, scope hash, recommended plan, and expiration.
- Order forms use only handoff scope and `server/plans.ts` pricing.
- Paid, expired, cancelled, or inactive handoffs cannot export payment order forms.
- Revenue and onboarding are created only after a Stripe webhook confirms `payment_status=paid`.
- First packs must pass human QA before they are treated as delivery evidence.

## Run Commands

```bash
npm install
npm run dev
npm run api
npm run build
npm run start
npm run lint
npm test
```

## Production Check Commands

```bash
npm run doctor:production
npm run launch:readiness
npm run launch:smoke -- https://your-public-app.example
npm run launch:packet
npm run stripe:bootstrap
```
