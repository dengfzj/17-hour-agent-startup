# Real-World Launch Plan

## Goal

Turn the current product package into revenue by selling two paid pilot offers:

1. **BidFlow Local Pilot**: recover missed quote revenue for local service companies.
2. **ReputeLoop Pilot**: protect review conversion and recover dissatisfied or dormant customers.

## Offer Design

### BidFlow Local

Pilot offer:

- $499 setup
- $149/month for the first location
- 14-day implementation sprint

Deliverables:

- Lead intake audit.
- Quote and proposal templates for one service category.
- 20 imported CSV leads or manually entered leads.
- Automated scoring and recommended next steps.
- Estimate/proposal drafts.
- Follow-up sequence templates.
- Weekly owner report with pipeline value and won/lost notes.

Success metric:

- At least one won job or at least 10 hours/month saved in quoting and follow-up work.

### ReputeLoop

Pilot offer:

- $399 setup
- $99/month for the first location
- 14-day implementation sprint

Deliverables:

- Review profile audit.
- Import 30-100 recent reviews by CSV or through the Google Business Profile import endpoint after OAuth/location credentials are configured.
- Risk queue setup.
- Public-safe reply drafts.
- Recovery cases for high-risk negative reviews.
- Winback campaign draft for dormant customers with consent.

Success metric:

- At least five approved review replies, one recovered customer conversation, or one repeat booking opportunity.

## Beachhead

Start with:

- Austin, Texas.
- Home repair, roofing, cleaning, landscaping, or HVAC-adjacent service businesses.
- 5-50 employee companies where the owner or office manager still controls sales operations.

Why:

- Local-service quote leakage is visible.
- Review dependence is high.
- Sales cycle can be owner-led and fast.
- Setup work can be done manually while integrations mature.

## Customer Qualification

Good first customers:

- Have at least 30 public Google reviews.
- Have unanswered or poorly answered reviews.
- Have a quote form, phone intake, or email inbox that creates follow-up leakage.
- Average job value above $500.
- Owner can approve a $299-$999 setup fee.

Avoid first:

- Regulated medical/legal/tax businesses.
- Franchises where corporate controls marketing and reviews.
- Businesses that ask for fake reviews or only want to suppress negative feedback.
- Very low-ticket businesses where recovered revenue cannot justify subscription.

## Acquisition Channels

### Manual Outbound

Daily target:

- 40 qualified businesses.
- 20 personalized emails.
- 10 phone calls.
- 5 LinkedIn or local association touches.

Personalization hooks:

- Slow or no replies to recent Google reviews.
- Website quote form with no instant expectation-setting.
- Reviews mentioning late response, no follow-up, expensive invoice, refund, or attorney.
- Service categories with emergency or high-ticket jobs.

### Local SEO Content

Publish:

- "How Austin roofers can reply to bad Google reviews without making it worse"
- "The 5-minute quote follow-up system for local contractors"
- "Why local service companies lose jobs after sending estimates"
- "FTC-safe review request templates for local businesses"

### Partner Channel

Approach:

- Local SEO agencies.
- Website designers for contractors.
- Bookkeepers and operations consultants.
- Trade associations.

Partner pitch:

- They already sell traffic and websites. BidFlow and ReputeLoop help convert that demand into jobs and repeat revenue.

## Sales Script

Email:

```text
Subject: quick idea to recover missed service jobs

Hi {{owner}},

I noticed {{business}} has strong local demand, but most service companies lose money between the first call, the estimate, review response, and follow-up.

We built a small operating desk that scores leads, drafts estimates, schedules follow-ups, and flags risky reviews before they hurt conversion.

Would it be worth a 15-minute review of where quotes or reviews may be leaking revenue?
```

Phone:

```text
We help local service companies respond faster to high-intent requests and stop reviews from turning into lost repeat business. If I can show two missed revenue spots from your public presence, would you consider a paid pilot?
```

Close:

```text
The pilot is intentionally small: setup, one location, one workflow, and a 14-day sprint. If it wins or recovers one job, it should pay for itself.
```

## First 30 Days

### Week 1

- Finalize landing one-page sales deck.
- Build a list of 200 local service businesses with `docs/examples/prospect-list-template.csv`.
- Import the list into the Launch page prospect queue and work the highest fit scores first.
- Contact 100 and log every touch in the Launch page sales activity ledger.
- Book 10 discovery calls.
- Close 1-2 paid setup pilots.
- Write each customer scope with `docs/examples/pilot-scope-template.md`.
- Generate a Launch page checkout handoff and send the prospect-specific `/buy?handoff=<token>` link only after a fit call or clear written scope.

### Week 2

- Run pilots manually with the workbench.
- Import leads/reviews by CSV.
- Confirm the Stripe webhook created the onboarding record, then work from the activation queue.
- Send the customer their private `/onboarding/<token>` link and have them submit lead CSV, review CSV, or setup notes there.
- Use the Onboarding submissions queue to review customer materials before importing them into leads or reviews.
- Confirm first-pack review happened; do not treat customer confirmation as approval without operator review.
- Produce quote packs and review response packs.
- For each paid pilot, complete the first human-approved pack with `docs/examples/first-pack-qa-checklist.md` before broad automation.
- Mark the first pack QA-approved, mark it sent, and collect customer accept/revision/call response on the private onboarding page.
- Send `/recovery/<token>` links for approved quote or recovery actions, then use approvals, revision requests, callbacks, and declines as customer action evidence.
- Record before/after metrics in `docs/examples/pilot-outcome-log-template.csv`.

### Week 3

- Turn pilot workflows into vertical templates.
- Add missing fields found during real use.
- Ask for testimonial only after honest service delivery, without review incentives.

### Week 4

- Convert pilots to monthly subscriptions.
- Package case study.
- Start partner outreach.
- Decide which integration is most urgent based on paid customer friction.

## Metrics

Track:

- Prospects contacted.
- Calls booked.
- Paid pilots closed.
- Setup revenue.
- Monthly recurring revenue.
- Leads scored.
- Estimates generated.
- Proposal packs sent.
- First packs QA-approved, sent, and customer-accepted.
- Won jobs attributed.
- Reviews imported.
- Responses approved.
- Recovery cases opened.
- Recovery links accepted, callback-requested, revision-requested, or declined.
- Repeat bookings or saved relationships.

Kill or pivot if:

- Fewer than 2 paid pilots after 200 targeted contacts.
- Customers like the idea but refuse setup fees.
- Workflows require industry-specific labor that cannot be templated.
- Compliance or platform restrictions block core value.

## Production Investment Order

1. Server database and tenant isolation.
2. Authentication and roles.
3. Stripe recurring prices, first-invoice setup fees, customer portal configuration, and public webhook.
4. Email provider.
5. SMS provider with consent/STOP handling.
6. Google OAuth consent, token refresh, API access approval, and verified Business Profile location setup.
7. Binary file uploads and SLA owner assignment for onboarding submissions.
8. Customer portal hardening for proposal approval and recovery-offer acceptance.
9. Reporting and attribution.

## Immediate Next Command

Deploy the app, set production variables, run `npm run doctor:production`, run `npm run stripe:bootstrap` with the live Stripe key, set the printed `STRIPE_PRICE_*` variables, configure the Stripe webhook, then run `npm run launch:readiness`, `npm run launch:smoke -- ${PUBLIC_API_BASE_URL}`, and `npm run launch:packet`. Generate checkout handoffs only for `scope_sent` prospects after the readiness blockers are gone, the public deployment smoke test passes, the launch packet has no machine blockers, and the pilot scope is written.

After payment, run the paid concierge pilot from `docs/launch-runbook.md`: confirm webhook-created onboarding, send the private onboarding link, review submitted materials, preview/import only clean CSV, generate the first delivery pack, QA approve it, mark it sent, collect the customer delivery response, send the approved `/recovery/<token>` customer action link when appropriate, deliver the result, and record the customer outcome. The fastest path to money is not more generic features; it is proving that one vertical will pay for quote recovery and review recovery.

Use `docs/revenue-ops-playbook.md` as the daily sales and delivery operating command.
