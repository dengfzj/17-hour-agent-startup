# Launch Runbook

This runbook turns Local Growth OS from a production-shaped workbench into a paid concierge pilot operation. It does not declare the product ready for broad self-serve SaaS. The revenue path is:

1. Deploy the app.
2. Configure live billing and provider accounts.
3. Sell a scoped pilot.
4. Confirm live payment through Stripe webhook-created onboarding.
5. Collect customer materials.
6. Operator-review, preview, import, and generate the first delivery pack.
7. Deliver the pack, record the business outcome, and renew or expand.

## Machine Check

Run before sending the public checkout link to any real buyer:

```bash
npm run lint
npm test
npm run build
npm run doctor:production
npm run launch:readiness
npm run launch:smoke -- https://your-public-app.example
npm run launch:packet
```

`npm run doctor:production` checks required production environment variables and their launch-safe shape. Public HTTPS URLs, `APP_ORIGIN` containing the deployed origin, Postgres `DATABASE_URL`, PEM JWT public key plus issuer/audience, live-mode Stripe secret, `whsec_` webhook secret, and `price_` plan IDs are blockers for the first scoped paid pilot. Email, SMS, and Google Business Profile checks are advisory unless `REQUIRE_EMAIL_PROVIDER=true`, `REQUIRE_TWILIO=true`, or `REQUIRE_GOOGLE_BUSINESS_PROFILE=true` is set for a pilot that promises those live integrations. `npm run launch:readiness` adds the operator runbook, webhook URL list, manual signoffs, and a blocker if broad public self-serve checkout is enabled before scoped pilot proof exists.

`npm run launch:smoke -- https://your-public-app.example` verifies the deployed public origin is reachable and returns the expected health, pricing, checkout, pilot terms, privacy, and refund pages.

`npm run launch:packet` reads the current workspace and prints the day-of-launch operating packet: machine blockers, live URLs, first two paid pilot targets, open checkout pressure, delivery risk, customer actions, renewal evidence, and proof rules.

Passing these commands means the deployment is ready for a live smoke test. It does not mean the product has made money or is safe for broad self-service.

For the first controlled concierge pilot, provider advisories may remain open only if the customer scope uses manual email/calls and customer-supplied CSVs. Do not promise automated email/SMS or live Google Business Profile import/reply until the corresponding provider check is green or explicitly required and passing.

## Required URLs

Replace the origin below with the deployed `PUBLIC_API_BASE_URL`.

| Purpose | URL | Configure in |
|---|---|---|
| Public checkout | `${PUBLIC_API_BASE_URL}/buy` and `${PUBLIC_API_BASE_URL}/buy?handoff=<token>` | Sales emails after qualification |
| Pilot terms | `${PUBLIC_API_BASE_URL}/legal/pilot-terms` | Checkout confirmation |
| Privacy and consent | `${PUBLIC_API_BASE_URL}/legal/privacy` | Checkout confirmation |
| Refunds and cancellation | `${PUBLIC_API_BASE_URL}/legal/refunds` | Checkout confirmation |
| Health check | `${PUBLIC_API_BASE_URL}/api/health` | Render health check and deploy verification |
| Stripe webhook | `${PUBLIC_API_BASE_URL}/api/billing/webhook` | Stripe Dashboard |
| Email unsubscribe | `${PUBLIC_API_BASE_URL}/api/webhooks/email/unsubscribe` | Postmark or SendGrid |
| Twilio inbound | `${PUBLIC_API_BASE_URL}/api/webhooks/twilio/inbound` | Twilio Messaging Service |
| Customer onboarding | `${PUBLIC_API_BASE_URL}/onboarding/<customerAccessToken>` | Sent only to paid customer contact |
| Customer recovery action | `${PUBLIC_API_BASE_URL}/recovery/<token>` | Sent manually after an approved quote or recovery offer |

## Revenue Launch Phases

### 1. Deploy

Actions:

- Push the same commit that passed `npm run lint`, `npm test`, and `npm run build`.
- Deploy with `render.yaml` or an equivalent single-service host.
- Attach managed Postgres and verify the workspace table from `db/migrations/001_workspace_jsonb.sql`.
- Set `PUBLIC_API_BASE_URL` to the public HTTPS origin.
- Set `APP_ORIGIN` to include the same origin.

Acceptance:

- `/api/health` returns `{ "ok": true }` from the public internet.
- The deployed `/buy` page loads without calling localhost.
- `npm run launch:smoke -- ${PUBLIC_API_BASE_URL}` passes against the public origin.
- `npm run doctor:production` is clean in the production shell.

### 2. Configure Billing

Actions:

- Set a live `STRIPE_SECRET_KEY`.
- Run `npm run stripe:bootstrap` against the live Stripe account.
- Paste every printed `STRIPE_PRICE_*` variable into production.
- Configure Stripe Customer Portal, invoice branding, tax settings, and refund handling.
- Configure the Stripe webhook to `${PUBLIC_API_BASE_URL}/api/billing/webhook`.

Acceptance:

- `npm run launch:readiness` reports config ready for live smoke test.
- Stripe Dashboard shows the webhook endpoint.
- A live Checkout completion creates or updates the subscription and onboarding record.

### 3. Configure Auth and Providers

Actions:

- Configure a hosted auth provider.
- Set `JWT_PUBLIC_KEY`, `JWT_ISSUER`, and `JWT_AUDIENCE`.
- Configure Postmark or SendGrid with a verified sender and unsubscribe route.
- Set `EMAIL_WEBHOOK_SECRET` and configure the email provider to send it as `x-local-growth-webhook-secret` or `Authorization: Bearer <secret>`.
- Configure Twilio with a Messaging Service and inbound STOP/START route.
- Confirm Twilio sends `X-Twilio-Signature` to the inbound webhook and that invalid signatures return HTTP 403.
- Configure Google Business Profile access only for customers where live review import or reply posting is promised.

Acceptance:

- Internal API routes require valid production JWTs.
- The deployed operator frontend injects a hosted-auth Bearer token into API calls. The token must include an `organization_id` or `org_id` claim matching the workspace `business.id`.
- Email unsubscribe and Twilio STOP/START change customer consent state.
- Email unsubscribe requests are accepted only with the configured shared webhook secret in production.
- Twilio STOP/START requests are accepted only with valid provider signatures in production.
- Google review import is tested on a safe account before it is promised as live delivery.

### 4. Qualify and Sell

Actions:

- Import qualified businesses into the Launch page prospect queue from `docs/examples/prospect-list-template.csv`.
- Work the highest fit scores first and log each sales touch in the Launch page activity form.
- Generate a manual outreach pack before sending email, calling, or drafting scope.
- Qualify the prospect by city, vertical, average job value, review volume, and owner approval.
- Choose one offer: BidFlow Local pilot or ReputeLoop pilot.
- Download or adapt the generated scope draft so it names deliverables, timeline, setup fee, monthly plan, and manual approval rules.
- Review `/legal/pilot-terms`, `/legal/privacy`, and `/legal/refunds` with the customer or replace them with a signed order form.
- Use `Checkout link` in the Launch page only after the fit call or written scope, then send the generated `/buy?handoff=<token>` link to the approved buyer.
- Treat checkout handoff links as 7-day scoped approvals. If the buyer goes stale, refresh the scope and generate a new handoff instead of reusing an old link.

Acceptance:

- The prospect record is at least `contacted` before a discovery call and `scope_sent` before the checkout link is sent.
- Status movement is backed by `sales_activity_recorded` audit entries, not only a manual status edit.
- Checkout handoffs are generated through `POST /api/sales-prospects/:prospectId/checkout-handoff`, logged as `checkout_sent`, and visible in the prospect record before the customer is counted as an active close opportunity.
- `checkout_sent` means a scoped payment link exists. It is not paid revenue.
- Production public checkout accepts scoped handoffs by default; broad self-serve checkout stays disabled unless `ENABLE_PUBLIC_SELF_SERVE_CHECKOUT=true` is intentionally set.
- Any generated outreach pack is treated as a draft; no email/SMS/review reply is sent automatically.
- The customer pays through live Stripe.
- Public checkout includes pilot scope, human review, terms, privacy, and refund acknowledgements; API requests missing these acknowledgements are rejected.
- Stripe webhook metadata marks the matching checkout handoff `paid`, writes `sales_checkout_paid`, and advances the prospect to `won`.
- `GET /api/onboarding` shows the customer, product, plan, and owner email.
- `payment_received` and `workspace_activated` are complete from server-side Stripe/onboarding state.

### 5. Collect Customer Materials

Actions:

- Send the private `/onboarding/<customerAccessToken>` link only to the paid owner or approved contact.
- Ask for one of the supported material types: `lead_csv`, `review_csv`, or `general_notes`.
- Tell the customer that submission starts operator review. It does not import data, send messages, publish replies, or prove revenue.

Acceptance:

- The submission status is `submitted`.
- The onboarding status is `materials_submitted`.
- Public onboarding shows customer-safe submission summaries only; it does not expose CSV body text, Stripe IDs, or `customerAccessToken`.

### 6. Operator Review and Import

Actions:

- Review every submitted material in the internal queue.
- Mark unusable material as `rejected` with customer follow-up notes outside the app.
- For CSV material, run preview first.
- Import only `lead_csv` or `review_csv` submissions where preview has no row errors.
- Do not import `general_notes`.

Acceptance:

- Preview shows no row-level errors before import.
- Import writes `importedRecordIds`, marks the submission `imported`, and writes an audit event.
- No customer-facing checklist item is treated as operator approval.

### 7. First Delivery Pack

Actions:

- Generate first pack only from an imported submission.
- For BidFlow, verify estimate, scope, proposal language, and follow-up sequence.
- For ReputeLoop, verify public-safe response, recovery offer, risk notes, and manager approval needs.
- Download the Markdown delivery pack and QA it before sending.
- Mark the first pack `QA approved` in Onboarding with the approver email and QA note.
- After QA approval, mark the first pack `sent` with sent-by email, delivery summary, and renewal evidence note.
- Generate a `/recovery/<token>` link only after the quote or recovery plan is approved for customer action.
- Send the link manually through an approved channel and watch for approve, revision, callback, or decline.
- Ask the customer to respond on `/onboarding/<customerAccessToken>` with accept, revision request, or call request.
- Record the customer-visible result in the Launch page outcome ledger.

Acceptance:

- The matching onboarding checklist advances through first-pack review.
- The record reaches `ready_for_pilot` only after operator-controlled work is complete.
- A human approves the pack before customer delivery.
- Onboarding delivery evidence shows owner, SLA due date, QA approver, sent timestamp, and customer response.
- Recovery link responses update the matching lead/proposal/estimate or feedback case/recovery offer and write audit evidence.
- The outcome ledger contains evidence before the pilot is used for renewal, testimonial, or case-study claims.

### 8. Outcome Tracking

Actions:

- Run `npm run launch:packet` at the start of each operating day and after every live Stripe payment or first-pack customer response.
- Track paid pilots, setup revenue, MRR, leads scored, delivery packs sent, approved review replies, recovery cases, won jobs, saved hours, and recovered customer conversations.
- Use the Launch page revenue payment ledger or `/api/revenue-summary` for paid pilots, setup revenue, booked MRR, and gross collected. Do not use estimated pipeline or outcome notes as payment evidence.
- Use recovery link responses as customer action evidence for quote approval or customer recovery, not as setup revenue or MRR evidence.
- Use onboarding delivery acceptance as first-pack delivery proof; use the outcome ledger for business impact; use Stripe revenue payments for collection proof.
- Treat `refunded` or `disputed` revenue payment rows as operator follow-up items; they remain in the ledger for evidence but are excluded from revenue summary totals.
- Review weekly.
- Ask for a testimonial only after honest delivery and without review incentives.

Acceptance:

- A pilot is counted as successful only when there is a real customer outcome: won job, recovered customer, approved review reply, repeat booking opportunity, or clear owner time savings.
- Outcome claims must be backed by a Launch page outcome ledger entry.
- Pivot if fewer than two paid pilots close after 200 targeted contacts.

## Stop Rules

Do not broaden the checkout link beyond qualified prospects if any of these are true:

- `npm run launch:readiness` has launch blockers.
- Stripe live webhook has not created an onboarding record.
- Auth, provider credentials, or consent routes are not configured for the promised workflow.
- Legal terms, privacy policy, refund language, and consent copy are not published.
- Customer material has not been operator-reviewed.
- The first delivery pack has not been human-approved.
- You cannot name the operator responsible for the paid customer and SLA.
