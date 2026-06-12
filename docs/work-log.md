# Work Log

Date: 2026-06-10

## Objective

Use a sub-agent organization to research current business trends, select two money-making product directions, design and build products, test them, document the work, and provide a real-world launch command.

## Workspace Baseline

- Starting directory: `D:\codex_project\free_project`
- Initial state: empty/non-git workspace.
- Created a Vite React TypeScript app.
- Installed product dependencies, test tooling, Playwright, and a small Express API boundary.
- Installed `pg` and added a workspace repository abstraction for JSON/Postgres persistence.
- Added Postmark, SendGrid, and Twilio messaging adapters.
- Added inbound unsubscribe and Twilio STOP/START consent handling.
- Added Google Business Profile review import and reply-posting adapter/routes.
- Added production single-service static frontend serving and Render Blueprint deployment config.
- Added CSV bulk import APIs for leads and reviews.
- Added internal sales prospect pipeline for importing and advancing the first 200 target businesses.
- Added sales activity ledger for recording real sales touches and keeping prospect status movement auditable.
- Added paid-pilot onboarding activation from Stripe Checkout metadata.
- Added public onboarding material submission and operator submission-review status tracking.
- Added `.env.example` for production integration configuration.

## Sub-Agent Work

### Market Trends Researcher

Output:

- Researched 10 candidate software directions.
- Top recommendation included RFP/proposal AI, ecommerce/SaaS customer service agents, and creator/social commerce tooling.
- Highlighted strong paid trends in workflow-specific AI and B2B ROI products.

### Demand and Purchase-Intent Analyst

Output:

- Researched SMB, ecommerce, creator, and local business pain points.
- Identified paid alternatives and pricing anchors including Gorgias, Manychat, Loop Returns, QuickBooks, TaxJar, Buffer, Omnisend, BrightLocal, Bonsai, and ecommerce seller tools.
- Confirmed local review management and service workflows have direct willingness-to-pay.

### Investment / Risk Reviewer

Output:

- Created a weighted scoring framework:
  - market demand
  - willingness to pay
  - competition
  - development complexity
  - compliance risk
  - acquisition cost
  - seven-day launch feasibility
  - long-term ceiling
- Rated local quote/proposal/follow-up automation as the top cash-flow-friendly bet.
- Rated compliant review/recovery management as a viable smaller bet.
- Rejected generic writing tools, high-liability AI, fake review products, and financial signal products.

### Backend / Domain Design Reviewer

Output:

- Proposed product domain models for:
  - leads
  - estimates
  - proposals
  - follow-ups
  - reviews
  - review responses
  - feedback cases
  - recovery offers
  - campaigns
  - audit logs
- Proposed API routes and production risks.

### Product / QA Reviewer

Output:

- Identified that the app was not yet buildable.
- Flagged missing `App.tsx`, review status type errors, lint failure, and missing production integrations.
- Recommended required gates:
  - build/lint/test green
  - real UI
  - auth
  - multitenancy
  - Stripe
  - email/SMS
  - Google Business Profile
  - production docs

## Product Decisions

Selected:

1. **BidFlow Local**
   - Local-service lead scoring, estimate generation, proposal generation, follow-up sequence, pipeline value.
2. **ReputeLoop**
   - Review import, risk scoring, public-safe reply draft, recovery case, winback offer, compliance rules.

Rejected:

- Generic AI writing.
- Generic chatbot/prompt tools.
- Fake review generation.
- Medical/legal/tax/hiring/credit decision automation.
- Crypto or investment signal products.

## Implementation Log

### Frontend

Created:

- `src/App.tsx`
- `src/components/AppShell.tsx`
- `src/components/PortfolioView.tsx`
- `src/components/BidFlowView.tsx`
- `src/components/ReputeLoopView.tsx`
- `src/components/LaunchView.tsx`
- `src/components/OnboardingView.tsx`
- `src/components/BuyView.tsx`
- `src/components/LegalView.tsx`
- `src/index.css`

Implemented:

- Dashboard shell with four views.
- Portfolio selection memo and source links.
- BidFlow lead queue, score display, estimate/proposal/follow-up artifacts, lead capture form, mark-won action.
- ReputeLoop review queue, risk score, compliance box, response draft, recovery offer, review import form, approval action.
- Launch view with pricing, sales scripts, production gates, launch sequence, and operating log.
- Launch view live-connects to the API for pricing catalog and production integration readiness.
- Onboarding view for payment-confirmed pilot activation progress, customer-safe confirmations, and human-approval guardrails.
- Public buy view for external paid-pilot Checkout without exposing the operator cockpit.
- Public pilot terms, privacy/consent, and refund/cancellation pages linked from Checkout.

### Domain Logic

Created:

- `src/domain/types.ts`
- `src/domain/engines.ts`
- `src/domain/documents.ts`

Implemented:

- Lead scoring.
- Estimate generation.
- Proposal generation.
- Follow-up sequence generation.
- Review risk and sentiment analysis.
- Review response generation.
- Feedback case generation.
- Recovery offer generation.
- Campaign revenue estimation.
- Workspace JSON export.
- Customer-facing proposal Markdown rendering.
- Review recovery-pack Markdown rendering.

### Data and State

Created:

- `src/data/seed.ts`
- `src/store/workspace.ts`

Implemented:

- Seed business profile.
- Seed customers, leads, estimates, proposals, follow-ups, reviews, responses, cases, offers, campaigns, research sources, selected directions.
- Zustand persistent local store.
- Audit log updates for major user actions.

### API Boundary

Created:

- `server/auth.ts`
- `server/billing.ts`
- `server/index.ts`
- `server/app.ts`
- `server/storage.ts`
- `server/integrations.ts`
- `server/plans.ts`
- `server/compliance.ts`
- `server/messaging.ts`
- `server/consent.ts`
- `server/googleBusiness.ts`
- `server/importers.ts`
- `server/launchReadiness.ts`
- `server/launchSmoke.ts`
- `render.yaml`

Implemented:

- Health endpoint.
- Integration status endpoint.
- Pricing plans endpoint.
- Workspace read/write/reset endpoint.
- CSV lead and review import endpoints.
- Lead revenue-pack generation route.
- Review response-pack generation route.
- Optional API key guard.
- Organization-scope guard.
- Role permission guard for owner/admin/manager/staff.
- Bearer JWT verification when `JWT_PUBLIC_KEY` is configured.
- Stripe Checkout Session adapter with plan price IDs and setup-fee line items.
- Stripe Customer Portal session route scoped to workspace subscription customers.
- Stripe webhook verification and subscription upsert.
- Outbound message consent validation.
- Postmark email adapter.
- SendGrid email adapter.
- Twilio SMS adapter.
- Outbound message audit records for sent/failed/manual messages.
- Email unsubscribe webhook.
- Twilio inbound STOP/START webhook.
- Consent event history in `consentEvents`.
- Google Business Profile review import route.
- Google Business Profile review reply-posting route.
- Fail-closed billing endpoint.
- Fail-closed messaging endpoint.
- Fail-closed Google Business Profile endpoint behavior.
- JSON file persistence boundary.
- Workspace repository abstraction.
- Postgres JSONB workspace persistence when `DATABASE_URL` is set.
- Migration file `db/migrations/001_workspace_jsonb.sql`.
- Production single-service mode for serving API and the built React app from one Node process.
- Render Blueprint for a web service plus managed Postgres.
- CSV parser/importer with quoted-field support, dedupe, customer upsert, lead scoring, review risk scoring, row-level errors, and audit logging.
- Paid-pilot Checkout profile capture on the Launch page.
- `OnboardingRecord` workspace state for post-payment activation.
- `GET /api/onboarding` activation queue endpoint.
- `PATCH /api/onboarding/:recordId/checklist/:itemKey` completion endpoint.
- Stripe Checkout metadata for business name, owner email, website, city, state, and industry.
- Stripe webhook activation of workspace business profile and onboarding checklist.
- Stripe billing return URL allowlist based on `APP_ORIGIN`.
- Stripe webhook duplicate-event guard.
- Stripe webhook organization metadata and plan/product catalog guards.
- Customer onboarding access token on onboarding records.
- Public onboarding read/update API scoped by token.
- `OnboardingSubmission` workspace state for customer-submitted lead CSV, review CSV, and setup notes.
- `POST /api/public/onboarding/:token/submissions` public material submission endpoint.
- `PATCH /api/onboarding/:recordId/delivery` first-pack delivery QA/sent evidence endpoint.
- `POST /api/public/onboarding/:token/delivery-confirmation` customer delivery response endpoint.
- `GET /api/onboarding/submissions` operator submission queue endpoint.
- `PATCH /api/onboarding/submissions/:submissionId` operator submission status endpoint.
- `POST /api/onboarding/submissions/:submissionId/preview` operator import preview endpoint.
- `POST /api/onboarding/submissions/:submissionId/import` operator-controlled submission import endpoint.
- `POST /api/onboarding/submissions/:submissionId/first-pack` first delivery pack endpoint from imported submission records.
- `GET /api/onboarding/submissions/:submissionId/delivery-pack` Markdown delivery-pack export endpoint.
- `PilotOutcome` workspace state for paid pilot renewal and case-study evidence.
- `GET /api/pilot-outcomes` outcome ledger endpoint.
- `POST /api/onboarding/:recordId/outcomes` paid pilot outcome recording endpoint.
- `SalesProspect` workspace state for target-account prospecting.
- `POST /api/import/prospects` prospect CSV import endpoint with fit scoring, dedupe, row-level validation, and audit logging.
- `GET /api/sales-prospects` internal qualified-prospect queue endpoint.
- `PATCH /api/sales-prospects/:prospectId` status, next-touch, notes, and last-contact update endpoint.
- `SalesActivity` workspace state for sales touches, replies, scope sends, checkout sends, wins, losses, next steps, and owner attribution.
- `GET /api/sales-activities` sales activity ledger endpoint with prospect and date filtering.
- `POST /api/sales-prospects/:prospectId/activities` audited activity recording endpoint that advances prospect state only forward.
- `GET /api/sales-summary` management summary endpoint for activity period counts, current funnel, estimated pipeline value, stale prospects, conversion estimates, weekly buckets, and next-action priorities.
- `SalesCheckoutHandoff` workspace state for scoped prospect-to-payment handoff links.
- `GET /api/sales-prospects/:prospectId/checkout-handoffs` handoff history endpoint for the internal sales queue.
- `POST /api/sales-prospects/:prospectId/checkout-handoff` scoped checkout-link creation endpoint requiring an owner email and `scope_sent` or `checkout_sent` status.
- `GET /api/public/checkout-handoff/:token` customer-safe public handoff lookup endpoint for `/buy?handoff=<token>`.
- Checkout handoff scope snapshot fields: customer-visible scope summary, scope source, and accepted scope hash carried into Stripe metadata.
- Stripe webhook handoff payment application that marks handoffs `paid`, prospects `won`, writes `sales_checkout_paid`, and links onboarding/subscription IDs.
- `RevenuePayment` workspace state for Stripe-paid setup revenue, booked MRR, gross collected, source, price snapshots, and Stripe identifiers.
- `GET /api/revenue-payments` verified payment ledger endpoint.
- `GET /api/revenue-summary` setup revenue, booked MRR, gross collected, product split, source split, and recent-payment summary endpoint.
- `GET /api/revenue-command` daily operating command endpoint across payment, sales, delivery, customer actions, and renewal evidence.
- Stripe refund/dispute webhook status correction for revenue payment rows without deleting the original paid evidence.
- `SalesOutreachPack` workspace state for manual prospect email/call/LinkedIn/scope drafts.
- `POST /api/sales-prospects/:prospectId/outreach-pack` manual outreach pack generation endpoint.
- `GET /api/sales-prospects/:prospectId/outreach-pack` latest outreach pack endpoint.
- `GET /api/sales-prospects/:prospectId/outreach-pack/download` Markdown outreach/scope pack export endpoint.
- Customer-safe public submission summaries returned from `GET /api/public/onboarding/:token` and public submission responses.
- Lightweight per-process public onboarding token rate limit with `retry-after` response on HTTP 429.
- Public onboarding material form and internal submitted-materials queue in the Onboarding view.
- Launch page outcome form and outcome ledger for won jobs, revived quotes, approved replies, recovered customers, repeat bookings, and saved hours.
- Public paid-pilot Checkout API scoped by `APP_ORIGIN` and workspace organization metadata.
- Public Checkout pilot acknowledgement enforcement for scope, human review, terms, privacy, and refund/cancellation policy.
- Launch page prospect CSV import and qualified queue with score, signal, status, and activity-backed email/checkout quick actions.
- Launch page sales activity form for logging channel, outcome, summary, next step, and owner email on each prospect.
- Launch page checkout handoff actions for creating/loading scoped public payment links after scope approval.
- Launch page revenue evidence panel and payment ledger for separating Stripe-paid collection from estimated pipeline and customer outcome evidence.
- Launch page 7-day sales review metrics for activity volume, emails sent, calls logged, positive replies, and checkout/win movement.
- Launch page API-backed management funnel, recommended focus, estimated pipeline value, stale prospect count, and needs-action queue.
- Launch page prospect outreach pack actions for generating manual email, call, LinkedIn, and paid-pilot scope drafts without sending messages automatically.
- Production doctor script for launch-blocking runtime variables.
- Launch readiness script for public HTTPS deployment, live Stripe, origin allowlist, webhook URLs, and manual paid-pilot signoffs.
- Launch smoke script for verifying deployed public health, pricing, checkout, and pilot policy pages.
- Production frontend API default changed to same-origin to avoid deployed browsers calling localhost.
- Stripe catalog bootstrap script for the six monthly recurring plan Prices.

### Tests

Created:

- `src/domain/engines.test.ts`
- `src/domain/documents.test.ts`
- `server/app.test.ts`
- `server/googleBusiness.test.ts`
- `server/importers.test.ts`
- `server/launchReadiness.test.ts`
- `server/launchSmoke.test.ts`

### Production Assets

Created:

- `.env.example`
- `docs/database-schema.md`
- `docs/launch-runbook.md`
- `docs/revenue-ops-playbook.md`
- `docs/examples/prospect-list-template.csv`
- `docs/examples/pilot-scope-template.md`
- `docs/examples/first-pack-qa-checklist.md`
- `docs/examples/pilot-outcome-log-template.csv`

Covered:

- Required runtime variables.
- Stripe plan price variables.
- Email, SMS, Google Business Profile, and database variables.
- Target Postgres schema for tenants, users, customers, leads, estimates, proposals, follow-ups, reviews, recovery offers, onboarding submissions, outbound messages, subscriptions, generated content, and audit logs.
- Target Postgres schema for pilot outcomes tied to onboarding records.
- Target Postgres schema for sales prospects, generated sales outreach packs, and sales activity ledger entries.
- Target Postgres schema for sales checkout handoffs tied to prospects, Stripe sessions, and onboarding records.
- Target Postgres schema for revenue recovery links tied to BidFlow leads or ReputeLoop feedback cases.
- Target Postgres schema for revenue payments tied to Stripe checkout events, source, plan snapshots, and received-at reporting.
- Real-world sales and delivery templates for prospecting, pilot scoping, first-pack QA, and pilot outcome logging.

Covered:

- Hot lead scoring.
- Estimate totals and confidence.
- Proposal/follow-up generation.
- High-risk review escalation.
- Public-safe review response.
- Winback case and recovery offer.
- API health.
- API integration readiness.
- API revenue-pack generation.
- API fail-closed checkout.
- Optional API key enforcement.
- Pricing plans.
- SMS consent blocking.
- Cross-organization blocking.
- Staff allowed to generate packs but blocked from billing, messages, and full workspace writes.
- Bearer JWT required/verified when production key is configured.
- Stripe adapter fail-closed behavior and configured checkout session creation through a fake client.
- Stripe Checkout includes the configured recurring price plus a one-time setup fee line item.
- Stripe Customer Portal session creation succeeds for known workspace subscription customers and fails closed when no subscription customer exists.
- Stripe checkout/subscription events create and update workspace subscription state.
- Stripe Checkout forwards paid-pilot business profile details from the API route.
- Checkout session completion creates an onboarding activation record and updates the workspace business profile.
- API returns current onboarding records.
- API updates onboarding checklist items, writes audit logs, and advances status to `materials_submitted`, legacy `data_imported`, or `ready_for_pilot`.
- Frontend onboarding page reads activation records and lets non-locked checklist items be confirmed without changing billing or provider setup.
- Public `/onboarding/<token>` entry hides the internal sidebar and reads only the matching customer onboarding record.
- Public onboarding API blocks customer edits to payment/workspace activation checks.
- Public onboarding material submission validates email, material type, title, and body; writes an audit event; and advances the customer-data checklist item.
- Public onboarding material submission does not mutate leads or reviews until an operator uses a dedicated import route.
- Operator submission queue returns submitted materials and allows status changes to `submitted`, `reviewed`, `imported`, or `rejected`.
- Operator import preview reuses the lead/review CSV importers without persisting data.
- Operator import writes lead/review submissions only when validation is clean, marks the submission imported, and records `onboarding_submission_imported`.
- Operator first-pack generation creates BidFlow revenue packs or ReputeLoop response/recovery packs from the first imported record and advances the matching internal onboarding checklist items.
- First-pack delivery evidence tracks delivery owner, SLA due date, generated-pack readiness, QA approval, sent status, customer acceptance/revision/call response, and renewal evidence summary.
- Operator delivery-pack export renders the generated BidFlow proposal or ReputeLoop recovery pack as downloadable Markdown.
- Operator outcome recording validates outcome type, value, evidence, next action, and recorded-by email, then writes `pilot_outcome_recorded`.
- Product/QA audit feedback changed the new checklist key and status from import-oriented wording to `customer_materials_submitted` and `materials_submitted`, while keeping legacy `customer_data_imported` / `data_imported` compatibility.
- QA feedback also narrowed public onboarding responses to customer-safe fields and removed first-pack/operator approval items from the customer-editable checklist set.
- Public onboarding summaries let customers see previously submitted material titles/statuses after refresh without exposing full CSV/review note bodies.
- Public onboarding rate-limit tests cover HTTP 429 behavior for repeated token requests.
- `/buy` starts BidFlow Growth or ReputeLoop Growth Checkout from a public business profile form.
- `POST /api/public/checkout` validates required customer fields and rejects return URLs outside `APP_ORIGIN`.
- `POST /api/public/checkout` rejects requests missing pilot scope, human review, terms, privacy, and refund acknowledgements, and forwards accepted acknowledgements into Stripe metadata.
- Frontend API calls default to same-origin in production and keep localhost only for Vite development or explicit `VITE_API_BASE_URL`.
- `npm run doctor:production` reports missing live deployment, auth, Stripe, provider, database, and Google variables.
- `npm run launch:readiness` blocks localhost/test-mode launch, requires public HTTPS and live Stripe shape, lists webhook/customer onboarding URLs, and preserves manual signoffs before broad self-serve launch.
- `npm run launch:smoke` verifies deployed public routes without requiring secrets and fails if the origin is localhost or responses do not contain expected app content.
- `npm run stripe:bootstrap` creates or reuses deterministic Stripe Products/Prices and prints the `STRIPE_PRICE_*` environment values.
- Product/risk review narrowed onboarding language from self-service activation to “materials submitted for review” and “first pack reviewed.”
- Checkout and portal reject return URLs outside `APP_ORIGIN`.
- Duplicate Stripe webhook events do not repeat subscription/onboarding/audit writes.
- Stripe events with the wrong organization metadata or mismatched plan/product metadata are ignored.
- JSON repository persistence, reset, and repository factory behavior.
- Provider fail-closed behavior for unconfigured email/SMS.
- Postmark, SendGrid, and Twilio fake-client success paths.
- API failed send attempts are written to `outboundMessages`.
- Email unsubscribe removes future email consent.
- Twilio STOP removes SMS consent and START restores it.
- Google Business Profile adapter maps official review resources, ratings, and reply calls.
- API imports Google reviews into local analyzed reviews and non-consented reviewer customer records.
- API posts Google replies from approved/generated response drafts and updates local response/review state.
- API imports lead CSV into scored leads and non-consented customers.
- API imports review CSV into risk-scored reviews and reports row-level validation errors while preserving valid rows.
- API imports sales prospect CSV into fit-scored prospects, skips duplicates, validates required contact paths, and reports row-level errors.
- API sales prospect update route validates status and next-touch values, stamps contacted prospects, and writes audit logs.
- API records sales activity entries, validates activity channel/outcome/email/date inputs, filters the ledger by prospect/date, stamps `lastContactedAt`, and prevents old activity from moving advanced prospects backward.
- API sales summary returns period activity counts, current prospect funnel, estimated pipeline value, conversion estimates, weekly buckets, and next actions without returning full workspace payloads.
- API creates prospect-specific checkout handoffs only after `scope_sent`, prevents duplicate active handoffs, exposes customer-safe handoff lookup, and forwards prospect/handoff metadata into public Stripe Checkout.
- Prospect-specific checkout handoffs now bind a versioned pilot scope snapshot to the public payment page and Stripe metadata for later dispute, refund, and customer-success review.
- API creates revenue recovery links for generated BidFlow estimate/proposal packs and ReputeLoop recovery offers, exposes customer-safe `/recovery/<token>` pages, and records approval, revision, callback, or decline responses back to the source workflow.
- Stripe webhook payment metadata marks the matching checkout handoff `paid`, moves the prospect to `won`, records a `won` sales activity, writes `sales_checkout_paid`, and disables reuse of the public handoff token.
- Stripe webhook writes revenue payment ledger entries only for signed `checkout.session.completed` events with matching organization metadata, matching plan/product metadata, and `payment_status=paid`.
- Stripe refund and dispute webhook events mark matching revenue payment ledger entries `refunded` or `disputed`; revenue summaries count only entries that remain `paid`.
- API revenue summary reports paid pilots, setup revenue, booked MRR, gross collected, and product/source splits without using estimated pipeline values.
- API revenue command center combines paid revenue evidence, open checkout pressure, delivery SLA risk, customer recovery-link actions, renewal evidence, blockers, and prioritized operator next steps.
- API generates sales outreach packs, moves new prospects to qualified, writes `sales_outreach_pack_generated`, and downloads Markdown packs with risk notes.
- Production static frontend serving returns the built frontend for root and nested app routes while preserving API 404 behavior.
- Proposal document rendering.
- Review recovery document rendering.
- Sales outreach document rendering.

## Verification

Commands run successfully:

```bash
npm run lint
npm test
npm run build
```

Fail-closed production readiness commands run:

```bash
npm run doctor:production
npm run launch:readiness
npm run launch:smoke
npm run launch:packet
npm run stripe:bootstrap
```

Observed results:

- Lint: passed.
- Tests: 129 passed after the production auth, scope handoff, revenue recovery link, delivery evidence, revenue command, production pricing auth, frontend token provider, launch packet, Twilio signature, email webhook secret, public token rate-limit, production write-guard, repository atomic-update, checkout handoff session-idempotency, concurrent operator-write, production-doctor gate split, and unpaid-checkout fulfillment work.
- Build: passed.
- Production doctor: correctly failed in local mode and listed missing live production variables; it now treats public HTTPS, APP_ORIGIN, Postgres, JWT issuer/audience, live Stripe key, `whsec_` webhook secret, and `price_` IDs as blockers while keeping provider integrations advisory unless explicitly required.
- Launch readiness: correctly failed in local mode and listed missing public HTTPS deployment, production database, JWT issuer/audience, live Stripe key/price IDs/webhook secret, scoped pilot checkout posture, provider advisories, and manual signoffs.
- Launch smoke: local/deploymentless run correctly failed until a public HTTPS app URL is provided; unit tests cover passing deployed-route behavior through mocked fetch.
- Stripe bootstrap: correctly failed locally without `STRIPE_SECRET_KEY`; fake-client tests covered product/price creation and price reuse.
- Frontend local server: `http://127.0.0.1:5174` returned HTTP 200.
- API health: `http://127.0.0.1:8787/api/health` returned `{ ok: true }`.
- Production-style single service serves `dist/` and `/api/health` from one Node process.
- API integration status correctly reported Stripe, email, SMS, Google Business Profile, and database readiness.
- API Google review import fails closed without `GOOGLE_ACCESS_TOKEN`, `GOOGLE_ACCOUNT_ID`, and `GOOGLE_LOCATION_ID`.
- API CSV imports accept JSON or `text/csv`, score valid rows, and return row-level errors for invalid rows.
- API prospect imports accept CSV, score target accounts, recommend next touches, and expose the internal sales queue through `GET /api/sales-prospects`.
- API sales prospect status updates stamp `lastContactedAt` when moved to contacted/call-booked and write `sales_prospect_updated`.
- API sales activity recording creates `sales_activity_recorded`, advances prospect status through contacted/call-booked/scope-sent/checkout-sent/won/lost without regression, and exposes filtered ledger reads through `GET /api/sales-activities`.
- API sales summary filters activity by requested period, keeps funnel counts based on current prospect status, computes estimated pipeline value from `averageJobValue`, validates invalid summary ranges, and omits full workspace payloads.
- API sales outreach pack generation creates manual email/call/LinkedIn/scope drafts, stores them in the workspace, writes audit logs, and downloads Markdown.
- API pricing plans endpoint returned BidFlow and ReputeLoop plans.
- API onboarding endpoint returned activation records.
- API onboarding checklist update endpoint advanced activation status.
- API public onboarding submission endpoint created a submission, advanced onboarding to `materials_submitted`, wrote `customer_onboarding_materials_submitted`, and left lead count unchanged in runtime verification.
- Runtime verification confirmed public onboarding responses omit `customerAccessToken` and Stripe IDs, and public first-pack/operator approval checklist updates return HTTP 403.
- Runtime verification confirmed public onboarding submission summaries are visible after refresh while submitted body text is omitted from public responses.
- Runtime verification confirmed public onboarding token rate limiting returns HTTP 429 with `retry-after`.
- Runtime verification confirmed onboarding submission preview leaves lead count unchanged, while operator import adds the lead, marks the submission `imported`, and writes `onboarding_submission_imported`.
- Runtime verification confirmed first-pack generation from an imported lead submission advances onboarding to `ready_for_pilot`, creates estimate/proposal records for the imported lead, and writes `onboarding_first_pack_generated`.
- Runtime verification confirmed first-pack generation moves delivery evidence to `pack_ready`, QA approval is required before `sent`, sent evidence records owner/summary/timestamp, customer acceptance updates the private onboarding record, and duplicate delivery confirmations are rejected.
- Runtime verification confirmed Stripe onboarding creation includes default delivery owner/SLA/status and replayed checkout events do not overwrite existing delivery evidence.
- Runtime verification confirmed delivery-pack export returns a Markdown revenue pack with estimate, scope, customer name, and a downloadable filename.
- API onboarding submissions endpoint returned the operator queue and status updates wrote `onboarding_submission_status_updated`.
- Runtime verification confirmed public checkout rejects requests without pilot scope, human review, terms, privacy, and refund acknowledgements.
- Runtime verification confirmed prospect-specific checkout handoffs require `scope_sent`, prevent duplicate active links, expose only customer-safe public fields, and pass prospect/handoff metadata into public Checkout creation.
- Runtime verification confirmed BidFlow recovery links expose only customer-safe fields, mark public opens, record customer approval, advance the lead to `won`, mark the estimate `accepted`, mark the proposal `approved`, write audit evidence, and reject duplicate responses.
- Runtime verification confirmed public checkout handoff and recovery link token routes are lightly rate-limited and return HTTP 429 with `retry-after`.
- Runtime verification confirmed checkout handoffs expire by default, past-expiry handoffs return HTTP 410 from public lookup and checkout, and new public handoff responses include the expiry timestamp.
- Runtime verification confirmed ReputeLoop recovery links record callback requests and update the matching feedback case and recovery offer for operator follow-up.
- Runtime verification confirmed lead recovery link creation fails closed until an estimate/proposal revenue pack exists.
- Playwright opened an isolated production-style `/recovery/<token>` page, submitted a revision request, verified the customer-facing success state, confirmed the source lead moved to follow-up through the API, saved `output/playwright/recovery-link-public.png`, then removed the temporary workspace and stopped the temporary service.
- Playwright opened an isolated production-style `/onboarding/<token>` page after first-pack QA approval and sent evidence, verified the customer-visible delivery status and response form, saved `output/playwright/onboarding-delivery-evidence.png`, then removed the temporary workspace and stopped the temporary service.
- Runtime verification confirmed Stripe webhook payment metadata marks a checkout handoff `paid`, advances the prospect to `won`, records a won activity, writes `sales_checkout_paid`, creates onboarding, and makes the public handoff token inactive.
- Runtime verification confirmed paid Stripe checkout sessions create one revenue payment ledger entry with setup revenue, booked MRR, gross collected, source, Stripe IDs, metadata snapshot, and summary totals.
- Runtime verification confirmed unpaid checkout sessions do not create revenue ledger entries.
- Runtime verification confirmed unpaid checkout sessions do not create subscriptions, onboarding records, checkout handoff paid status, prospect wins, sales checkout paid audit logs, or revenue ledger entries.
- Runtime verification confirmed Stripe refund/dispute webhook events mark revenue payment rows `refunded` or `disputed` and remove them from paid revenue summary totals without deleting ledger evidence.
- Runtime verification confirmed `/api/revenue-command` returns open checkout pressure, delivery risk, accepted recovery-link action, renewal evidence, payment blocker, and prioritized operator actions from one combined endpoint.
- Sub-agent revenue operations review concluded the product can support managed paid concierge pilots, but real money is blocked until public HTTPS deployment, live Stripe, webhook, Postgres, and production JWT are configured.
- Sub-agent engineering launch review found two P0 code gaps: deployment smoke needed public pricing without operator JWT, and the frontend needed a Bearer-token injection path for production operator APIs.
- Runtime verification confirmed `GET /api/plans` remains public in production JWT mode while `/api/workspace` still returns HTTP 401 without Bearer auth.
- Runtime verification confirmed production public checkout requires a scoped handoff token by default, and production owner JWTs cannot use full workspace overwrite or reset routes.
- Frontend API client now exposes `setApiTokenProvider` and sends `Authorization: Bearer <token>` on API calls when a hosted auth provider is registered.
- `npm run launch:packet` now prints a read-only live launch packet from readiness plus workspace payment, checkout, delivery, customer-action, and renewal evidence; local execution intentionally exits blocked until production variables are configured.
- Twilio inbound STOP/START webhooks now require a valid `X-Twilio-Signature` when `TWILIO_AUTH_TOKEN` is configured or `NODE_ENV=production`; unsigned local development remains available when no token is set.
- Email unsubscribe webhooks now require `EMAIL_WEBHOOK_SECRET` via `x-local-growth-webhook-secret` or `Authorization: Bearer <secret>` when the secret is configured or `NODE_ENV=production`; unsigned local development remains available when no secret is set.
- Sub-agent engineering/security review identified P0 risks around full workspace overwrite/reset and unmanaged public self-serve checkout; the local mitigation now disables those production paths by default while preserving scoped operator routes.
- Repository writes now support an atomic `update` path: JSON persistence serializes updates in process, Postgres creates and row-locks the JSONB workspace before mutation, and a storage regression test verifies concurrent JSON updates do not lose either write.
- Stripe billing webhooks, email unsubscribe webhooks, Twilio inbound consent webhooks, public onboarding checklist/submission/delivery writes, recovery-link open/response writes, and sales checkout handoff creation now use the repository atomic-update path instead of separate read/write calls.
- Operator-side recovery-link creation, onboarding submission import/first-pack/status/checklist/delivery/outcome writes, lead/review/prospect CSV imports, revenue/response/outreach pack generation, sales prospect/activity writes, Google review import/reply state writes, and outbound message logs now also use repository atomic updates instead of stale-snapshot writeback.
- Added a concurrent operator-write regression test that starts a delayed atomic workspace update, performs a prospect import through the API, and verifies both the simulated external audit write and imported prospect survive.
- Sales checkout handoff creation now checks for an existing non-expired active handoff inside the same repository update, reducing duplicate active payment-link risk under concurrent operator clicks.
- Public checkout now claims a handoff before creating Stripe Checkout, rejects concurrent in-progress creates, passes a handoff-derived Stripe idempotency key, stores `stripeCheckoutSessionId` / `stripeCheckoutUrl`, and returns the existing session on repeat submission.
- Revenue payment ledger creation now treats a non-refunded/non-disputed payment for the same `checkout_handoff_id` as already counted, preventing duplicate local revenue recognition if Stripe ever sends a second paid session for the same handoff.
- Sub-agent launch-ops review identified that email/SMS/Google integrations were being treated as first-payment blockers even though the intended next step is scoped concierge pilots; production doctor and launch readiness now separate first-pilot blockers from provider/broad-launch advisories.
- Launch readiness now blocks `ENABLE_PUBLIC_SELF_SERVE_CHECKOUT=true` for scoped paid-pilot launch, preserving prospect-specific handoff checkout as the default real-money path.
- Checkout session fulfillment now requires `payment_status=paid` before subscription activation, onboarding activation, checkout handoff paid status, prospect won status, or revenue ledger creation.
- Added `docs/16-hour-work-record.md` as a standalone trace of the extended build session and a statement that Codex did not perform public deployment, promotion, live provider configuration, customer contact, or real money collection.
- Added scoped paid-pilot order-form export for sales checkout handoffs. The Markdown order form uses canonical plan pricing, frozen scope summary, scope hash, and the stored `/buy?handoff=` link while avoiding internal prospect/organization IDs and direct Stripe session URLs.
- Added `GET /api/sales-prospects/:prospectId/checkout-handoff/order-form` with optional `handoffId`; inactive, paid, cancelled, or expired handoffs now return `checkout_handoff_not_active`.
- Launch page now includes an `Order form` download action after a checkout handoff exists.
- Added Chinese and English final delivery briefs plus Chinese and English AI automation money-path documents.
- Tests: 132 passed after adding order-form renderer/API/frontend support and inactive-handoff order-form guards.
- Runtime verification confirmed a production-mode local service rejects header-based operator access with `local_header_auth_disabled`, preserving the fail-closed JWT/auth posture outside explicit non-production smoke mode.
- Playwright opened a production-style single service on `http://127.0.0.1:8796` with an isolated workspace, seeded open checkout pressure, delivery risk, accepted customer action, and renewal evidence, confirmed `/api/revenue-command` returned open checkout `2`, delivery risk `1`, customer action `1`, and renewal evidence `1`, verified the Launch Revenue command UI rendered focus, blockers, and prioritized actions, saved `output/playwright/launch-revenue-command.png`, then removed the temporary workspace and stopped the temporary service.
- Playwright opened `/onboarding/<token>`, submitted review CSV text through the public material form, verified the success message and materials-submitted wording, and saved `output/playwright/onboarding-submission-public.png`.
- Playwright opened `/buy`, verified checkout acknowledgement text, and saved `output/playwright/buy-checkout-acknowledgements.png`.
- Playwright opened `/legal/pilot-terms`, verified the pilot terms and policy references page, and saved `output/playwright/legal-pilot-terms.png`.
- Playwright opened the Launch page, verified the outcome ledger UI, and saved `output/playwright/launch-outcome-ledger.png`.
- Playwright opened a production-style single service on `http://127.0.0.1:8790` with an isolated workspace, imported `docs/examples/prospect-list-template.csv` through the production API, verified the Launch prospect queue, clicked `Contacted`, confirmed `lastContactedAt`, saved `output/playwright/launch-prospect-queue.png`, then removed the temporary workspace and stopped the temporary service.
- Playwright opened a production-style single service on `http://127.0.0.1:8791` with an isolated workspace, imported the prospect template, generated a Launch page outreach pack, downloaded `austin-roof-repair-outreach-pack.md`, confirmed the Markdown contains risk notes and a paid-pilot scope draft, saved `output/playwright/launch-outreach-pack.png`, then removed the temporary workspace and stopped the temporary service.
- Playwright opened a production-style single service on `http://127.0.0.1:8792` with an isolated workspace, imported a prospect, recorded a Launch page sales activity, confirmed `/api/sales-activities` returned the browser-recorded ledger entry, confirmed the prospect advanced to `contacted` with `nextTouch` `call`, saved `output/playwright/launch-sales-activity-ledger.png`, then removed the temporary workspace and stopped the temporary service.
- Playwright opened a production-style single service on `http://127.0.0.1:8793` with an isolated workspace, imported two prospects, recorded activity into contacted/scope-sent states, confirmed `/api/sales-summary` returned activity total `2`, active prospects `2`, and needs-action priorities, verified the Launch management funnel UI, saved `output/playwright/launch-sales-summary-funnel.png`, then removed the temporary workspace and stopped the temporary service.
- Playwright opened an isolated production-style Launch page after paid-plus-refunded Stripe webhook events, verified the paid summary returned to zero while the payment ledger retained `refunded` / `charge.refunded` evidence, and saved `output/playwright/launch-revenue-refund-status.png`.
- Lint and production build passed after adding public pilot policy pages and revenue operations templates.
- Runtime verification restored `data/workspace.json`; `/api/onboarding` and `/api/onboarding/submissions` returned empty queues afterward.
- Playwright opened the app, clicked Onboarding, verified the paid pilot activation page with locked payment/setup items and customer-safe confirmation buttons, and saved `output/playwright/onboarding-view.png`.
- Frontend Launch page displayed API connected, BidFlow Growth, and Stripe integration readiness from the API.
- Playwright opened the app, clicked BidFlow, generated revenue pack, clicked ReputeLoop, generated response pack, clicked Launch, and saved `qa-screenshot.png`.

## Known Gaps

The current product is a working local workbench plus API boundary. It is not yet complete broad-production SaaS.

Must still be completed before self-serve public charging:

- Apply `db/migrations/001_workspace_jsonb.sql` to the provisioned production database.
- Hosted authentication provider and production JWT issuer.
- Organization/location/user role hardening on a provisioned database.
- Live Stripe products/prices, Customer Portal account configuration, tax settings, and public webhook URL.
- Live email/SMS provider credentials, verified senders, and public webhook URLs.
- Google Business Profile OAuth consent, refresh-token storage, API access approval, and verified location credentials.
- Counsel-approved legal documents and customer-specific order forms beyond the pilot policy templates.
- Hosted deployment verification and monitoring.
- CRM-specific import/export mappings beyond the current paid-pilot CSV format.
- Binary file upload, support ticket assignment, SLA owner display, and customer-specific authentication beyond private onboarding tokens.
- Redis/edge/WAF backed public token rate limiting for multi-instance production deployments.

## Current Local Services

Frontend:

- `http://127.0.0.1:5174`

API:

- `http://127.0.0.1:8787`

## Next Work

1. Push the repository to GitHub/GitLab/Bitbucket and apply `render.yaml` in Render.
2. Apply `db/migrations/001_workspace_jsonb.sql` to the provisioned Postgres database if the table is not created manually.
3. Set `PUBLIC_API_BASE_URL` and `APP_ORIGIN` to the deployed URL.
4. Connect a real auth provider and set `JWT_PUBLIC_KEY`, `JWT_ISSUER`, and `JWT_AUDIENCE`.
5. Create Stripe products/prices for all six recurring plans, configure Customer Portal in Stripe, and set the `STRIPE_PRICE_*` variables.
6. Configure Stripe webhook URL `${PUBLIC_API_BASE_URL}/api/billing/webhook`.
7. Run `npm run launch:readiness` in the production shell and resolve every blocker before sending `/buy` beyond controlled prospects.
8. Build the first 200-prospect list using `docs/examples/prospect-list-template.csv` and import it into the Launch page prospect queue.
9. Work the highest-scored prospects first and log every sales touch in the Launch page activity ledger.
10. Write each customer pilot scope with `docs/examples/pilot-scope-template.md`.
11. After the first real Checkout, verify `/api/onboarding` contains the paid customer, send their private onboarding link, collect materials through `/onboarding/<token>`, and import only after operator review.
12. Configure Postmark/SendGrid and Twilio credentials and point provider webhooks to the deployed consent endpoints.
13. Configure Google OAuth, request Business Profile API access if needed, and set `GOOGLE_ACCESS_TOKEN`, `GOOGLE_ACCOUNT_ID`, and `GOOGLE_LOCATION_ID`.
14. Deliver first packs with `docs/examples/first-pack-qa-checklist.md`, log outcomes in `docs/examples/pilot-outcome-log-template.csv`, and follow `docs/revenue-ops-playbook.md` until two paid pilots close.
