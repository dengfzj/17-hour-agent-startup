# Product Manual

## Current Product Package

The repository now contains a runnable local product workbench plus an API boundary:

- React / TypeScript frontend: `src/`
- Business rule engines: `src/domain/engines.ts`
- Seed operating data: `src/data/seed.ts`
- Local persistent frontend store: `src/store/workspace.ts`
- API boundary and integration status checks: `server/`
- Customer-facing document renderers: `src/domain/documents.ts`
- Automated business, API, and document tests: `src/domain/engines.test.ts`, `server/app.test.ts`, `src/domain/documents.test.ts`

This is not yet a fully hosted SaaS with live customer billing, real email/SMS credentials, or completed Google OAuth consent. It is a working product workbench and production-shaped codebase that can be used for paid concierge pilots while the required accounts, tokens, and deployments are connected.

## Running Locally

Install dependencies:

```bash
npm install
```

Run the frontend:

```bash
npm run dev
```

Run the API:

```bash
npm run api
```

Run both:

```bash
npm run dev:full
```

Run production-style after building:

```bash
npm run build
npm run start
```

`npm run start` serves the API and the built React frontend from one Express process. Set `SERVE_STATIC_FRONTEND=false` only when you intentionally want an API-only runtime.

Frontend API calls default to same-origin in production builds. Set `VITE_API_BASE_URL` only for split frontend/API deployments or local Vite development.

Quality gates:

```bash
npm run lint
npm test
npm run build
npm run doctor:production
npm run launch:readiness
npm run launch:smoke -- https://your-public-app.example
npm run launch:packet
npm run stripe:bootstrap
```

## Frontend Views

### Portfolio

Purpose:

- Shows why BidFlow Local and ReputeLoop were selected.
- Displays weighted scores, customer targets, price anchors, risks, source links, and operating logs.

Use it when:

- Reviewing the investment case.
- Explaining the product choice to a collaborator or first buyer.

### BidFlow Local

Purpose:

- Turn local-service leads into approved work.

Workflow:

1. Add or select a lead.
2. Review the lead score and recommended next step.
3. Generate a revenue pack.
4. Review estimate, proposal, and follow-up sequence.
5. Mark the lead won when the customer accepts.
6. Export a proposal Markdown file for customer review or manual sending.
7. Generate a revenue recovery link only after human approval when the customer needs a simple approve/revision/callback/decline action.

Revenue mechanism:

- Faster qualification and quoting.
- Consistent proposal language.
- Automated follow-up sequence that prevents owners from forgetting warm opportunities.

Guardrails:

- Generated estimates are drafts.
- Final prices require human approval.
- Hidden conditions, permits, and scope changes are excluded by default.

### ReputeLoop

Purpose:

- Protect review conversion and recover at-risk customers.

Workflow:

1. Import or select a review.
2. Review risk score and status.
3. Generate response pack.
4. Review public-safe reply, compliance notes, case, and offer.
5. Approve response only after manager review.
6. Export a recovery-pack Markdown file for manager review or manual follow-up.
7. Generate a revenue recovery link only after manager approval when the dissatisfied customer should accept, request callback, or decline the recovery plan.

Revenue mechanism:

- Public replies protect buyer confidence.
- High-risk reviews become internal recovery tasks.
- Winback offers turn negative experiences or dormant relationships into repeat purchase opportunities.

Guardrails:

- No fake reviews.
- No review gating.
- No incentives for positive reviews.
- No public admission of legal liability.
- High-risk language requires manager approval.

### Launch

Purpose:

- Give the operator a 30-day plan to sell real paid pilots.
- Show live API pricing plans and production integration readiness when the API is running.

Includes:

- Pricing.
- Setup fees.
- Sales scripts.
- Launch sequence.
- Prospect CSV import for the first 200 qualified businesses.
- Fit-scored prospect queue with status and next-touch tracking.
- Manual outreach-pack generation with email, call, LinkedIn, and paid-pilot scope drafts.
- Sales activity ledger for logging emails, calls, replies, scope sends, checkout sends, wins, and losses.
- Prospect-specific checkout handoffs that generate `/buy?handoff=<token>` links only after a scoped fit conversation or written pilot scope.
- Paid-pilot order-form downloads that freeze the accepted scope, canonical plan pricing, payment entry, and human-review boundaries before customer payment.
- API-backed sales summary for activity volume, emails sent, calls logged, positive replies, checkout/win movement, funnel status, estimated pipeline value, and next-action priorities.
- Revenue command center for daily operating focus, open checkout pressure, delivery risk, customer actions, renewal evidence, blockers, and prioritized actions.
- Production gates.
- API connection status.
- Stripe, email, SMS, database, and Google Business Profile readiness.

### Onboarding

Purpose:

- Give paid pilot customers and operators a shared progress page after Checkout.
- Show payment-confirmed setup state from server-side onboarding records.
- Let safe checklist confirmations happen without allowing customers to bypass review.

Includes:

- Paid pilot activation records.
- Payment/workspace setup status.
- Customer-safe confirmations for submitted materials.
- Customer material submission for lead CSV, review CSV, or setup notes.
- Operator review status for submitted onboarding materials.
- Guardrails for actions that still require human approval.
- Private customer access links in the form `/onboarding/<customerAccessToken>`.

The Onboarding page is not a self-service provisioning console. Customers should not use it to change billing terms, skip contract/KYC/provider review, publish review replies, send SMS, bind production credentials, or unlock delivery before an operator has reviewed the materials.

Customer access:

- Each onboarding record can include a random `customerAccessToken`.
- `/onboarding/<token>` loads the same Onboarding view without the internal sidebar.
- `GET /api/public/onboarding/:token` returns only a customer-safe view of the matching onboarding record.
- Public onboarding responses include customer-safe submission summaries, not submitted material body text.
- `PATCH /api/public/onboarding/:token/checklist/:itemKey` can update only customer-materials checklist items.
- `POST /api/public/onboarding/:token/submissions` records customer-submitted lead CSV, review CSV, or notes for operator review.
- Public onboarding, checkout handoff, and recovery token routes use a lightweight per-process rate limit; production multi-instance deployment should move this to Redis, WAF, or edge rate limiting.
- Payment received and workspace activated checks are locked to server-side/operator state.
- Submitted materials are not automatically imported into leads, reviews, messages, or public review replies.
- First-pack review, import completion, and ready-for-pilot state remain operator-controlled.

### Public Buy

Purpose:

- Let an external prospect start a paid pilot without entering the internal operator cockpit.
- Collect business profile metadata before Stripe Checkout.
- Route the customer to Stripe only when billing configuration is live.

Includes:

- `/buy` public checkout page.
- BidFlow Growth and ReputeLoop Growth paid pilot offers.
- Business name, owner email, website, location, and industry fields.
- Prospect-specific checkout handoff links preload the buyer profile, lock the selected Growth plan, and keep the handoff tied to the internal prospect.
- Required pilot-scope, human-review, terms, privacy, and refund acknowledgements before Checkout starts.
- Public pilot policy pages at `/legal/pilot-terms`, `/legal/privacy`, and `/legal/refunds`.
- Public API endpoint `POST /api/public/checkout`.
- Public API endpoint `GET /api/public/checkout-handoff/:token`.

The public checkout API still validates `APP_ORIGIN`, requires the pilot acknowledgements, binds metadata to the current workspace organization, and fails closed until Stripe credentials and plan price IDs are configured.

## API Boundary

The API currently provides:

- `GET /api/health`
- `GET /api/integrations`
- `GET /api/plans`
- `GET /api/subscriptions`
- `GET /api/revenue-payments`
- `GET /api/revenue-summary`
- `GET /api/revenue-command`
- `GET /api/recovery-links`
- `GET /api/onboarding`
- `GET /api/onboarding/submissions`
- `GET /api/pilot-outcomes`
- `GET /api/sales-prospects`
- `GET /api/sales-activities`
- `GET /api/sales-summary`
- `GET /api/sales-prospects/:prospectId/checkout-handoffs`
- `GET /api/sales-prospects/:prospectId/checkout-handoff/order-form`
- `GET /api/sales-prospects/:prospectId/outreach-pack`
- `PATCH /api/onboarding/:recordId/checklist/:itemKey`
- `PATCH /api/onboarding/:recordId/delivery`
- `POST /api/onboarding/:recordId/outcomes`
- `PATCH /api/sales-prospects/:prospectId`
- `POST /api/sales-prospects/:prospectId/activities`
- `POST /api/sales-prospects/:prospectId/checkout-handoff`
- `POST /api/sales-prospects/:prospectId/outreach-pack`
- `GET /api/sales-prospects/:prospectId/outreach-pack/download`
- `PATCH /api/onboarding/submissions/:submissionId`
- `POST /api/onboarding/submissions/:submissionId/preview`
- `POST /api/onboarding/submissions/:submissionId/import`
- `POST /api/onboarding/submissions/:submissionId/first-pack`
- `GET /api/onboarding/submissions/:submissionId/delivery-pack`
- `GET /api/public/onboarding/:token`
- `PATCH /api/public/onboarding/:token/checklist/:itemKey`
- `POST /api/public/onboarding/:token/submissions`
- `POST /api/public/onboarding/:token/delivery-confirmation`
- `GET /api/public/checkout-handoff/:token`
- `GET /api/public/recovery-link/:token`
- `POST /api/public/recovery-link/:token/respond`
- `POST /api/public/checkout`
- `GET /api/workspace`
- `PUT /api/workspace`
- `POST /api/workspace/reset`
- `POST /api/import/leads`
- `POST /api/import/reviews`
- `POST /api/import/prospects`
- `POST /api/recovery-links`
- `POST /api/leads/:leadId/revenue-pack`
- `POST /api/reviews/:reviewId/response-pack`
- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `POST /api/billing/webhook`
- `POST /api/messages/send`
- `POST /api/google/reviews/import`
- `POST /api/google/reviews/:reviewId/reply`

In production-style mode, non-`/api` routes serve the built frontend from `dist/`, including nested SPA routes. API routes keep their normal API behavior and are not swallowed by the frontend fallback.

CSV import:

- `POST /api/import/leads` accepts either `{ "csv": "..." }` JSON or raw `text/csv`.
- `POST /api/import/reviews` accepts either `{ "csv": "..." }` JSON or raw `text/csv`.
- `POST /api/import/prospects` accepts either `{ "csv": "..." }` JSON or raw `text/csv`.
- Successful rows create non-consented imported customer records when no existing customer email/phone matches.
- Lead imports are scored immediately and deduped by customer, service category, and description.
- Review imports are risk-scored immediately and deduped by platform/external review ID or customer/platform/body.
- Prospect imports are fit-scored immediately, assigned a recommended next touch, and deduped by business name, owner email, and website.
- If some rows fail validation, the API returns HTTP `207` with row-level errors and still persists valid rows.

Lead CSV headers:

```csv
customer_name,email,phone,service_category,description,budget_min,budget_max,urgency,source,repeat_customer
```

Review CSV headers:

```csv
reviewer_name,email,phone,platform,rating,body,external_review_id,reviewed_at
```

Prospect CSV headers:

```csv
business_name,owner_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,recent_review_issue,quote_leak_signal,average_job_value,fit_score,next_touch,notes
```

Sales prospect workflow:

- Build the first 200-business list with `docs/examples/prospect-list-template.csv`.
- Paste or post the CSV into the Launch page / prospect import API.
- The importer validates business name and at least one contact path: email, website, or phone.
- The scoring model prioritizes review volume, weaker ratings, high job value, unanswered review issues, quote leakage signals, and direct contact data.
- `GET /api/sales-prospects` returns the internal queue.
- `PATCH /api/sales-prospects/:prospectId` updates `status`, `nextTouch`, and `notes`.
- Supported statuses are `new`, `qualified`, `contacted`, `call_booked`, `scope_sent`, `checkout_sent`, `won`, `lost`, and `disqualified`.
- Supported next touches are `email`, `call`, `linkedin`, `partner`, and `hold`.
- Moving a prospect to `contacted` or `call_booked` stamps `lastContactedAt` and writes an audit event.
- `GET /api/sales-activities` returns the sales activity ledger. Optional `prospectId`, `since`, and `until` query params filter the ledger by prospect and `occurredAt`.
- `GET /api/sales-summary` returns the management funnel and period activity summary. Optional `since` and `until` query params define the activity period; the default period is the last 7 days.
- The summary activity counts use `SalesActivity.occurredAt` within the requested period.
- The summary funnel uses the current `SalesProspect.status`, not activity outcomes, so old activities do not rewrite the current management view.
- Summary `estimatedPipelineValue` and `wonPipelineValueEstimate` are based on prospect `averageJobValue`. They are not recognized revenue and must not replace Stripe subscription/payment state.
- `POST /api/sales-prospects/:prospectId/activities` records a sales touch with `channel`, `outcome`, `summary`, `nextStep`, optional `ownerEmail`, and optional `occurredAt`.
- Supported activity channels are `email`, `call`, `linkedin`, `partner`, and `manual`.
- Supported activity outcomes are `sent`, `left_voicemail`, `replied`, `call_booked`, `scope_sent`, `checkout_sent`, `won`, `lost`, and `no_response`.
- Activity recording writes `sales_activity_recorded`, updates `lastContactedAt`, and advances prospect status only forward. Old or low-signal activity cannot move `scope_sent`, `checkout_sent`, `won`, `lost`, or `disqualified` prospects backward.
- Daily operators should use the Launch page activity form or activity POST for real touches. Direct prospect patching remains an admin correction path for status, next-touch, or notes cleanup.
- `POST /api/sales-prospects/:prospectId/outreach-pack` generates a manual sales pack and moves `new` prospects to `qualified`.
- `GET /api/sales-prospects/:prospectId/outreach-pack/download` downloads the latest generated email/call/LinkedIn/pilot-scope pack as Markdown.
- Outreach packs include proof points, discovery questions, price draft, risk notes, and a paid-pilot scope draft.
- `POST /api/sales-prospects/:prospectId/checkout-handoff` creates a prospect-specific `/buy?handoff=<token>` link, records a `checkout_sent` activity, and advances the prospect to `checkout_sent`.
- Checkout handoffs require an owner email, an eligible prospect, and a current status of `scope_sent` or `checkout_sent`.
- Checkout handoffs use the public Growth plan for the recommended product: `bidflow-growth` or `reputeloop-growth`.
- A prospect can have only one active checkout handoff at a time. New handoffs expire after 7 days by default. Paid, expired, cancelled, or past-expiry handoffs cannot be used to start another public Checkout.
- A handoff can create or reuse only one Stripe Checkout session. Public checkout first claims the handoff with a short `stripeCheckoutCreatingAt` lock, passes Stripe an idempotency key derived from the handoff id, then stores `stripeCheckoutSessionId` and `stripeCheckoutUrl`; repeated submissions return the same session instead of minting another payment URL.
- `GET /api/sales-prospects/:prospectId/checkout-handoffs` returns handoff history for the internal sales queue.
- `GET /api/sales-prospects/:prospectId/checkout-handoff/order-form` downloads a customer-readable paid-pilot order form for the latest handoff or a specific `handoffId`. It uses the frozen handoff scope, `scopeAcceptedHash`, and canonical `server/plans.ts` pricing; it does not expose internal prospect/organization IDs or direct Stripe session URLs.
- Paid, expired, cancelled, or past-expiry checkout handoffs return `checkout_handoff_not_active` for order-form downloads, so operators cannot resend a stale payment order form.
- `GET /api/public/checkout-handoff/:token` returns only customer-safe handoff fields for the public `/buy` page; it does not expose internal prospect IDs, organization IDs, or full audit state.
- In production, `POST /api/public/checkout` requires a valid scoped checkout handoff token unless `ENABLE_PUBLIC_SELF_SERVE_CHECKOUT=true` is explicitly configured. The default launch posture is managed paid pilots, not broad self-serve checkout.
- The prospect queue is an operator CRM for paid pilot selling; it does not send email, place calls, or publish links automatically.
- Outreach packs are drafts only. They do not send email/SMS, publish review replies, promise recovered revenue, create Checkout sessions, or replace a signed scope/order form.

Revenue command center:

- `GET /api/revenue-command` combines Stripe payment evidence, active checkout handoffs, sales prospects, onboarding delivery status, recovery links, and pilot outcomes into one operating command.
- The response includes north-star metrics, current focus, blockers, and prioritized actions across payment collection, sales follow-up, delivery, customer action, and renewal.
- It is an operating queue, not accounting. Collection proof still comes from signed Stripe webhook-backed `RevenuePayment` rows.

Live launch packet:

- `npm run launch:packet` reads the current workspace and launch readiness state, then prints a Markdown operating packet for the next real-world selling session.
- The packet includes launch blockers, public URLs, first two target pilot offers, open checkout pressure, delivery risk, customer action evidence, renewal evidence, and proof rules.
- It is intentionally read-only and does not create revenue, checkout links, onboarding records, or outcomes.

Production operator auth:

- Public pricing at `GET /api/plans` remains readable without login so `/buy` and deployment smoke tests can load the plan catalog.
- Internal operator APIs still require production Bearer JWTs when `JWT_PUBLIC_KEY` is configured.
- The frontend API client exposes `setApiTokenProvider` so the hosted auth integration can inject a token into Launch, Onboarding, Revenue Command, and other internal API calls.
- JWT payloads must include `organization_id` or `org_id` matching the workspace `business.id`.

Revenue recovery links:

- `POST /api/recovery-links` creates a customer-safe `/recovery/<token>` link for either a BidFlow lead with a generated estimate/proposal or a ReputeLoop feedback case with a generated recovery offer.
- Public link reads through `GET /api/public/recovery-link/:token` mark the link opened and expose only customer-facing fields. They do not expose customer email, source IDs, internal notes, or workspace state.
- Public responses through `POST /api/public/recovery-link/:token/respond` accept `approve`, `request_revision`, `schedule_callback`, or `decline`.
- A BidFlow approval marks the lead `won`, the estimate `accepted`, and the proposal `approved`. A decline marks the lead `lost`, estimate `rejected`, and proposal `declined`. Revision or callback requests keep the lead in follow-up.
- A ReputeLoop approval marks the feedback case `recovered` and the offer `redeemed`. A decline marks the case `churned` and the offer `rejected`. Callback or revision requests keep the case in waiting-customer state.
- Response handling writes `revenue_recovery_link_responded` audit evidence and blocks duplicate responses.
- Recovery links are customer action evidence, not payment evidence. Setup revenue and MRR still require Stripe webhook-backed `RevenuePayment` rows.

Templates:

- `docs/examples/leads-import-template.csv`
- `docs/examples/reviews-import-template.csv`
- `docs/examples/prospect-list-template.csv`
- `docs/examples/pilot-scope-template.md`
- `docs/examples/first-pack-qa-checklist.md`
- `docs/examples/pilot-outcome-log-template.csv`

The billing and messaging endpoints intentionally fail closed unless environment variables are configured. This prevents fake checkout, fake portal sessions, or fake sends.

Stripe Checkout includes the selected monthly subscription price plus the plan setup fee as a one-time first-invoice line item. The Launch page and public `/buy` page send the paid pilot business name, owner email, website, city, state, industry, and, for prospect handoffs, the `prospect_id` and `checkout_handoff_id` into Checkout metadata.

Stripe webhook handling verifies the `stripe-signature` header and updates local subscription state for checkout and subscription lifecycle events. A Checkout session must have `payment_status=paid` before it can activate a subscription, create or update onboarding, mark a checkout handoff `paid`, mark a prospect `won`, or record revenue. A completed paid Checkout session records a revenue payment ledger entry, marks any matching prospect checkout handoff `paid`, marks the prospect `won`, records a `sales_checkout_paid` audit event, creates or updates an onboarding activation record, updates the current workspace business profile from Checkout metadata, and marks the first two activation checks as complete:

- Payment received through Stripe.
- Workspace activated.

Revenue evidence:

- `GET /api/revenue-payments` returns Stripe-paid payment ledger entries. The API does not expose a manual write route for revenue.
- `GET /api/revenue-summary` returns paid pilot count, setup revenue, booked MRR, gross collected, product split, source split, and recent payments.
- Revenue payments are written only for signed `checkout.session.completed` webhooks where organization metadata matches, plan/product metadata matches, and `payment_status` is `paid`.
- Unpaid Checkout completion events are acknowledged but do not trigger fulfillment state or revenue evidence.
- Stripe refund and dispute webhook events mark matching revenue payment rows `refunded` or `disputed`; `/api/revenue-summary` counts only rows that remain `paid`.
- Each payment stores Stripe event/session/customer/subscription identifiers, optional invoice/payment-intent IDs, source (`sales_checkout_handoff`, `public_checkout`, or `operator_checkout`), plan price snapshots, metadata snapshot, and handoff/prospect/onboarding links when present.
- Recovery link responses and outcome ledger entries prove customer actions or results; revenue payment ledger entries prove collection of setup revenue and MRR.

The remaining onboarding checklist keeps the post-payment concierge work visible:

- Customer materials submitted for review.
- For BidFlow: review the first lead pipeline and send the first approved revenue pack.
- For ReputeLoop: review the first reputation risk queue and approve the first compliant response pack.

`GET /api/onboarding` returns the current activation queue for the workspace. `PATCH /api/onboarding/:recordId/checklist/:itemKey` accepts `{ "done": true }` or `{ "done": false }`, writes an audit event, and advances onboarding status:

- `paid`: payment received, but workspace not yet activated.
- `workspace_activated`: workspace opened after payment.
- `materials_submitted`: the customer lead or review materials have been submitted for operator review.
- `data_imported`: historical compatibility state for older records whose customer-materials checklist used the previous import-oriented key.
- `ready_for_pilot`: every activation checklist item is complete and the first approved pack can be delivered.

Customer-facing wording treats submitted materials as “materials submitted for review” rather than “approved” or “imported.” Payment and workspace setup items are read-only in the UI and are based on server-side Stripe webhook state, not URL query parameters.

First-pack delivery evidence:

- Stripe-created onboarding records now carry `deliveryOwnerEmail`, `deliverySlaDueAt`, and `deliveryStatus`; old records are normalized on read.
- First-pack generation moves delivery status to `pack_ready` and records a generated-pack summary.
- Operators use `PATCH /api/onboarding/:recordId/delivery` to mark QA approval with `deliveryQaApprovedBy` and `deliveryQaNotes`.
- Operators cannot mark a pack `sent` until QA approval exists.
- Marking `sent` records `deliveryPackSentAt`, `deliveryPackSentBy`, `deliveryPackSummary`, and optional `renewalEvidenceSummary`.
- Customers respond through `POST /api/public/onboarding/:token/delivery-confirmation` with `accept`, `request_revision`, or `schedule_call`.
- Customer acceptance records `customerConfirmedAt`, `customerConfirmedByEmail`, `customerConfirmationNote`, and upgrades `renewalEvidenceSummary`.
- Delivery evidence proves first-pack acceptance or objection. It does not prove setup revenue or MRR; those still require Stripe webhook-backed `RevenuePayment` rows.

Customer material submission:

- `POST /api/public/onboarding/:token/submissions` accepts `{ submittedByEmail, materialType, title, body }`.
- `materialType` must be `lead_csv`, `review_csv`, or `general_notes`.
- Submitting materials marks the customer-data checklist item complete and creates an audit event.
- Customer-facing responses show submission summaries only; operators see the body through the internal submissions queue.
- Operators can view submitted materials through `GET /api/onboarding/submissions`.
- Operators can mark each submission `submitted`, `reviewed`, `imported`, or `rejected` through `PATCH /api/onboarding/submissions/:submissionId`.
- Operators can preview importable `lead_csv` and `review_csv` submissions through `POST /api/onboarding/submissions/:submissionId/preview`.
- Operators can import preview-clean `lead_csv` and `review_csv` submissions through `POST /api/onboarding/submissions/:submissionId/import`.
- Import preview reuses the same parser, validation, scoring, dedupe, and non-consented customer creation behavior as the dedicated CSV import endpoints.
- Import execution is blocked when row-level validation errors exist, so operators must correct the submitted material before writing partial data.
- Operators can generate the first delivery pack from an imported submission through `POST /api/onboarding/submissions/:submissionId/first-pack`.
- For BidFlow submissions, first-pack generation creates the estimate, proposal, and follow-up sequence for the first imported lead, then marks lead pipeline review and first revenue pack checks complete.
- For ReputeLoop submissions, first-pack generation creates the compliant response, feedback case, and recovery offer where needed for the first imported review, then marks review queue and first response checks complete.
- Operators can download the generated first delivery pack as Markdown through `GET /api/onboarding/submissions/:submissionId/delivery-pack`.
- Operators should QA approve, mark sent, and collect the customer delivery response before using the pilot as renewal or case-study evidence.
- The status is a human workflow marker only; it does not publish review replies, send messages, or mutate leads/reviews until an operator uses the dedicated import and approval routes.

Pilot outcome tracking:

- `GET /api/pilot-outcomes` returns the renewal/case-study evidence ledger.
- `POST /api/onboarding/:recordId/outcomes` records a paid pilot outcome for an onboarding record.
- Supported outcome types are `won_job`, `revived_quote`, `approved_review_reply`, `recovered_customer`, `repeat_booking`, `hours_saved`, and `other`.
- Each outcome requires value, evidence, next action, and operator email.
- Outcome recording writes an audit event and appears in the Launch page outcome ledger.
- Outcome records are evidence for renewal and case-study follow-up; they are not a substitute for live Stripe payment, customer approval, or external attribution.

Billing safety rules:

- Checkout, cancellation, and Customer Portal return URLs must match one of the origins in `APP_ORIGIN`.
- Stripe Checkout and subscription metadata include `organization_id` and `user_id`.
- Webhook processing ignores events whose `organization_id` does not match the current workspace.
- Webhook processing also ignores events whose `plan_id` and `product` do not match the configured billing catalog.
- Replayed Stripe event IDs return `duplicate: true` and do not write another audit event.
- A prospect is counted as paid only when Stripe webhook metadata matches a stored checkout handoff and the handoff is marked `paid`; manual `checkout_sent` activity is not revenue evidence.
- A payment is counted as revenue only when it appears in the revenue payment ledger; active subscription status alone is not used as gross collected evidence.

Stripe Customer Portal:

- `POST /api/billing/portal` creates a Stripe billing portal session for a subscription customer already present in the current workspace.
- The route requires a `returnUrl`.
- The route returns `subscription_customer_not_found` instead of accepting arbitrary customer IDs outside the workspace state.
- The route fails closed until `STRIPE_SECRET_KEY` is configured.

If `LOCAL_GROWTH_API_KEY` is set, all `/api/*` routes except `/api/health` require the `x-api-key` header.

If `x-organization-id` is sent, it must match the current workspace organization. This is a lightweight local guard; production still needs database-enforced tenant isolation.

When `NODE_ENV=production`, `/api/*` routes except `/api/health` fail closed unless `JWT_PUBLIC_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE`, and `APP_ORIGIN` are configured. Header-derived identity is rejected in production.

In production, the full workspace overwrite and reset routes return 403 even for owner JWTs. Operators must use scoped routes so Stripe payment rows, checkout handoffs, and audit logs are not replaced in bulk.

When JWT auth is configured, `/api/*` routes except `/api/health` require a Bearer JWT. The token must include:

- `sub`
- `organization_id` or `org_id`
- `role`

Optional validation variables:

- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_ALGORITHM`

When `JWT_PUBLIC_KEY` is not configured, `x-user-role` can be used locally to exercise role permissions only if `LOCAL_GROWTH_ALLOW_HEADER_AUTH=true` and `NODE_ENV` is not `production`:

- `owner`: all current permissions.
- `admin`: workspace, revenue pack, response pack, billing, and messages.
- `manager`: workspace, revenue pack, response pack, and messages.
- `staff`: workspace read plus revenue and response pack creation only.

Header-derived identity is a development fallback only. Production must use JWT auth and pinned CORS origins.

Outbound message requests are checked for customer consent before provider configuration is considered. SMS without `consentSms` and email without `consentEmail` are blocked.

Configured message sends use:

- Postmark `/email` when `POSTMARK_TOKEN` and `POSTMARK_FROM_EMAIL` are set.
- SendGrid v3 Mail Send when `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` are set.
- Twilio Messages API when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` are set.

Every send attempt creates an `outboundMessages` audit record, including failed provider configuration attempts.

Inbound consent webhooks:

- `POST /api/webhooks/email/unsubscribe`
- `POST /api/webhooks/twilio/inbound`

Email unsubscribe removes `consentEmail`. Twilio `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, and `QUIT` remove `consentSms`; `START`, `YES`, and `UNSTOP` restore `consentSms`. Each consent update creates a `consentEvents` record and an audit log.

Email unsubscribe webhooks require `x-local-growth-webhook-secret` or `Authorization: Bearer <secret>` when `EMAIL_WEBHOOK_SECRET` is configured or `NODE_ENV=production`. Local development can exercise unsubscribe without the secret only when no secret is set.

Twilio inbound requests require a valid `X-Twilio-Signature` when `TWILIO_AUTH_TOKEN` is configured or `NODE_ENV=production`. Local development can exercise STOP/START without a token.

Provider references:

- Stripe Checkout subscription one-time fee support: https://docs.stripe.com/payments/checkout/subscriptions/starting
- Stripe Customer Portal session API: https://docs.stripe.com/api/customer_portal/sessions/create
- Postmark Email API: https://postmarkapp.com/developer/api/email-api
- SendGrid v3 Mail Send: https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send
- Twilio Messages API: https://www.twilio.com/docs/messaging/api/message-resource

Google Business Profile review integration:

- `POST /api/google/reviews/import` imports reviews from the configured account/location, creates non-consented Google reviewer customer records, deduplicates by Google review resource name, and analyzes the imported reviews.
- `POST /api/google/reviews/:reviewId/reply` posts an approved body or stored response draft back to Google and marks the local review as `responded`.
- The routes fail closed until `GOOGLE_ACCESS_TOKEN`, `GOOGLE_ACCOUNT_ID`, and `GOOGLE_LOCATION_ID` are configured.
- Official endpoints used by the adapter:
  - Reviews list: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
  - Review reply update: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply

## Persistence

The API uses a workspace repository abstraction:

- Without `DATABASE_URL`, it uses JSON persistence at `WORKSPACE_DATA_PATH`.
- With `DATABASE_URL`, it uses Postgres table `workspaces` with JSONB `data`.

Critical public, provider-driven, and operator mutations use `WorkspaceRepository.update` instead of separate read/write calls. The JSON repository serializes those updates in process; the Postgres repository creates the workspace row when needed and locks it with `SELECT ... FOR UPDATE` inside the transaction. This protects Stripe billing webhooks, email unsubscribe webhooks, Twilio inbound consent webhooks, public onboarding writes, recovery-link responses, checkout handoff creation, CSV imports, pack generation, onboarding operator writes, sales prospect/activity writes, Google review state writes, and outbound message logs from common lost-write races while the app is still on JSONB workspace storage.

The full workspace overwrite and reset endpoints are retained for local development and tests, but production returns 403 for both. Real-money operation should use scoped routes so payment evidence, handoffs, delivery records, and audit logs are not replaced in bulk.

This is a production bridge: it gives Stripe webhooks, subscriptions, customers, and generated revenue packs a durable database target now, while `docs/database-schema.md` describes the later normalized schema.

Migration file:

- `db/migrations/001_workspace_jsonb.sql`

Required environment variables for production:

```bash
NODE_ENV=production
DATABASE_URL=
SERVE_STATIC_FRONTEND=true
PUBLIC_API_BASE_URL=
JWT_PUBLIC_KEY=
JWT_ISSUER=
JWT_AUDIENCE=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
POSTMARK_TOKEN=
SENDGRID_API_KEY=
EMAIL_WEBHOOK_SECRET=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_ACCESS_TOKEN=
GOOGLE_ACCOUNT_ID=
GOOGLE_LOCATION_ID=
APP_ORIGIN=
PORT=8787
VITE_API_BASE_URL=
ENABLE_PUBLIC_SELF_SERVE_CHECKOUT=false
```

`npm run doctor:production` checks these variables before launch and exits non-zero while blocker checks fail. The first scoped paid pilot requires public HTTPS URLs, `APP_ORIGIN` containing the deployed origin, Postgres, PEM JWT public key plus issuer/audience, a live-mode Stripe secret, `whsec_` webhook secret, and `price_` plan IDs. Email, SMS, and Google Business Profile checks are advisory for a manual concierge pilot unless `REQUIRE_EMAIL_PROVIDER=true`, `REQUIRE_TWILIO=true`, or `REQUIRE_GOOGLE_BUSINESS_PROFILE=true` is set.

`npm run launch:readiness` adds an operator-facing launch gate. It requires the deployment URL to be public HTTPS, checks that `APP_ORIGIN` includes the deployed origin, expects live Stripe pricing variables, verifies broad public self-serve checkout is still disabled for scoped pilot launch, lists the Stripe/email/SMS/customer onboarding URLs to configure, and prints the paid-pilot runbook. Passing this command means the system is ready for a live smoke test, not broad self-serve SaaS or proven revenue.

`npm run launch:smoke -- https://your-public-app.example` checks the deployed public origin for `/api/health`, `/api/plans`, `/buy`, `/legal/pilot-terms`, `/legal/privacy`, and `/legal/refunds`.

`npm run launch:packet` prints the current day-of-launch operating packet from machine readiness checks and workspace evidence. It exits non-zero while launch is blocked, which is expected before production variables and live payment evidence exist.

`npm run stripe:bootstrap` uses `STRIPE_SECRET_KEY` to create or reuse the six monthly Stripe Prices defined in `server/plans.ts`, then prints the `STRIPE_PRICE_*` values to paste into Render or the production environment. It uses deterministic Product IDs, Price lookup keys, and idempotency keys so retries are safe.

Deployment:

- `render.yaml` defines a Render web service and managed Postgres database.
- Build command: `npm ci && npm run build`.
- Start command: `npm run start`.
- Health check path: `/api/health`.
- Stripe webhook URL after deployment: `${PUBLIC_API_BASE_URL}/api/billing/webhook`.
- Twilio inbound webhook URL after deployment: `${PUBLIC_API_BASE_URL}/api/webhooks/twilio/inbound`.
- Email unsubscribe webhook URL after deployment: `${PUBLIC_API_BASE_URL}/api/webhooks/email/unsubscribe`.
- Detailed launch checklist: `docs/launch-runbook.md`.
- Revenue operations playbook: `docs/revenue-ops-playbook.md`.

## Production Readiness Status

Ready now:

- Product direction and scoring.
- Local product workflow.
- Paid-pilot CSV import for leads and reviews.
- Lead scoring.
- Estimate generation.
- Proposal generation.
- Follow-up sequence generation.
- Review risk scoring.
- Public-safe response generation.
- Recovery case and offer generation.
- Audit log in local state.
- JSON export.
- Proposal Markdown export.
- Review recovery Markdown export.
- Revenue recovery links for quote approval and customer recovery actions.
- API health and integration status.
- Production single-service static frontend serving with SPA fallback.
- Render Blueprint deployment config.
- JSON and Postgres workspace repository support.
- Pricing plan API for the two products.
- API key and organization-scope guard.
- Role permission checks for billing, messaging, workspace writes, and generated packs.
- Bearer JWT verification for production authentication.
- Stripe Checkout Session adapter using configured Stripe recurring price IDs plus one-time setup fee line items.
- Stripe Customer Portal session route scoped to workspace subscription customers.
- Stripe webhook subscription-state and paid-pilot onboarding activation handling.
- Stripe webhook duplicate-event guard, workspace metadata guard, and billing return URL allowlist.
- Launch page Checkout profile capture, onboarding activation queue display, and checklist completion controls.
- Customer-facing onboarding progress page with safe confirmation controls.
- Consent checks before outbound messages.
- Postmark, SendGrid, and Twilio message provider adapters.
- Email unsubscribe and Twilio STOP/START consent webhooks.
- Google Business Profile review import and reply posting adapter/routes.
- Launch readiness command and paid concierge pilot operator runbook.
- Automated tests for the core engines, API boundary, and customer-facing document renderers.

Not ready for broad self-serve SaaS until completed:

- Hosted authentication provider and production JWT issuer.
- Organization and role isolation hardening in a provisioned server database.
- Live Stripe products/prices, Customer Portal account configuration, tax settings, and public webhook URL.
- Live email and SMS provider credentials, verified sender identity, and webhook URLs.
- Google OAuth consent flow, refresh-token storage, Business Profile API access approval, and verified location IDs.
- Production database migrations, backups, and monitoring.
- Admin support tooling.
- Counsel-approved legal policies and customer-specific order forms beyond the pilot policy templates.

## Recommended First Customer Operation

Sell as a managed pilot before self-serve SaaS:

1. Pick one city and vertical.
2. Charge setup plus monthly fee.
3. Confirm the Stripe webhook created an onboarding record and activated the workspace profile.
4. Send the private onboarding link and collect lead CSV, review CSV, or notes through the submission queue.
5. Preview and import only clean CSV submissions after operator review, or use Google review import after OAuth is configured.
6. Use the workbench to produce estimates, proposals, responses, and winback offers.
7. Generate, QA approve, mark sent, and collect the customer response for the first delivery pack.
8. Generate `/recovery/<token>` links only for human-approved quote or recovery actions and send them manually through the customer's approved channel.
9. Track recovered revenue manually until external attribution and payment integrations prove the result.
10. Only automate external sends after consent and provider integrations are complete.
