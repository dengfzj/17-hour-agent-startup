# Revenue Operations Playbook

This playbook is the real-world operating command for the first paid pilots. It assumes the product will be sold as a managed concierge pilot before broad self-serve SaaS.

## Current Revenue Objective

Close two paid pilots in one beachhead:

- One BidFlow Local pilot at `$499 setup + $149/month`.
- One ReputeLoop pilot at `$399 setup + $99/month`.

Primary beachhead:

- Austin, Texas.
- Roofing, home repair, cleaning, landscaping, and HVAC-adjacent local service companies.
- 5-50 employees.
- Owner or office manager can approve a setup fee.

## Assets

- Prospect list template: `docs/examples/prospect-list-template.csv`
- Pilot scope template: `docs/examples/pilot-scope-template.md`
- Lead import template: `docs/examples/leads-import-template.csv`
- Review import template: `docs/examples/reviews-import-template.csv`
- First-pack QA checklist: `docs/examples/first-pack-qa-checklist.md`
- Pilot outcome log: `docs/examples/pilot-outcome-log-template.csv`
- Launch runbook: `docs/launch-runbook.md`

## Daily Sales Motion

Every weekday until two paid pilots are closed:

1. Add 40 qualified businesses to `docs/examples/prospect-list-template.csv`.
2. Import the new rows into the Launch page prospect queue.
3. Open the Launch page revenue command center and clear critical payment, delivery, and customer-action items before starting new outreach.
4. Work the top-scored prospects first and log every email, call, partner touch, reply, scope send, checkout handoff, win, or loss in the Launch page sales activity form.
5. Generate a manual outreach pack for every prospect contacted that day.
6. Send 20 personalized emails from the generated pack after human review.
7. Make 10 calls using the generated opener.
8. Send 5 local association, LinkedIn, agency, or partner touches.
9. Book discovery calls only when the owner or office manager can discuss quote leakage, reviews, or repeat bookings.
10. Download or copy the generated paid-pilot scope draft before generating a checkout handoff.
11. Use the Launch page `Checkout link` action only after a clear written scope or fit call, then send that prospect-specific `/buy?handoff=<token>` URL.

Personalization hooks:

- Unanswered negative reviews.
- Reviews mentioning no callback, delayed estimate, expensive invoice, refund, attorney, or poor communication.
- Quote forms with no expectation-setting.
- High average job value.
- Visible owner-operated business with 30+ reviews.

## Discovery Script

Use the first call to prove fit, not to demo everything.

Questions:

1. How many leads or quote requests come in each week?
2. How fast do you usually respond?
3. Where do estimates get delayed or forgotten?
4. What is the average job value and gross margin?
5. Do reviews affect your close rate?
6. Who approves public review replies and customer recovery offers?
7. What would make a 14-day paid pilot obviously worth it?

Close:

```text
The pilot is small on purpose: one location, one workflow, one first delivery pack, and a 14-day implementation sprint. If we cannot identify a won job, recovered customer, approved review reply, or clear time savings, we should not expand.
```

## Qualification Rules

Accept first:

- Owner can approve setup fee now.
- Average job value above `$500`.
- At least 30 public Google reviews or at least 20 recent leads.
- There is a clear quote, review, or follow-up leak.
- Customer accepts human approval rules.

Reject or defer:

- Fake review requests.
- Review gating.
- Medical, legal, tax, hiring, insurance, credit, or other high-liability workflows.
- Franchise locations where corporate controls marketing and review replies.
- Very low-ticket businesses where one recovered job cannot pay for the pilot.

## Paid Pilot Close Path

1. Fill out `docs/examples/pilot-scope-template.md`.
2. Confirm price and plan.
3. Generate or download the Launch page outreach pack and scope draft.
4. Log a `scope_sent` activity in the Launch page prospect queue.
5. Review pilot terms, privacy/consent, and refund/cancellation pages.
6. Click `Checkout link` in the Launch page to generate the prospect-specific `/buy?handoff=<token>` URL. This records `checkout_sent`; it does not count as revenue.
7. Send the generated handoff link to the approved buyer.
8. Confirm live Stripe payment.
9. Confirm webhook-created onboarding and `sales_checkout_paid` audit evidence.
10. Send private `/onboarding/<customerAccessToken>` link.
11. Collect `lead_csv`, `review_csv`, or `general_notes`.
12. Review, preview, import, generate first pack, QA, deliver.
13. Mark the first pack QA-approved, mark it sent, and collect customer accept/revision/call response through the private onboarding link.
14. When the first approved BidFlow proposal or ReputeLoop recovery offer is ready, generate the `/recovery/<token>` link and send it manually to the approved customer contact.
15. Treat customer approval, revision, callback, or decline on that link as customer action evidence; treat Stripe webhook-backed `RevenuePayment` rows as collection evidence.
16. Log `won` manually only for back-office correction; the preferred source of truth is Stripe webhook payment confirmation.
17. Record outcome in the Launch page outcome ledger and mirror it in `docs/examples/pilot-outcome-log-template.csv` when an external operating sheet is needed.

## Delivery Acceptance

BidFlow success:

- One won job.
- One revived quote conversation.
- One clear proposal pack sent.
- At least 10 hours/month of owner quoting/follow-up work saved.

ReputeLoop success:

- Five approved review replies.
- One recovered dissatisfied customer conversation.
- One repeat booking opportunity.
- A manager-safe response process that prevents risky public replies.

## Weekly Review

Every Friday:

- Count imported prospects, top-score distribution, emails sent, calls made, replies, calls booked, paid pilots, setup revenue, and MRR.
- Review the revenue command center first: focus, blockers, open checkout pressure, delivery risk, customer action count, and renewal evidence count.
- Then review the Launch page sales summary: API activity period, funnel counts, estimated pipeline value, stale prospects, win-rate estimates, and recommended focus.
- Treat estimated pipeline value as prioritization input only; setup revenue and MRR come from the Launch page revenue payment ledger and `/api/revenue-summary`.
- Treat `checkout_sent` as an open payment link, not as revenue. Paid status requires Stripe webhook evidence and a paid checkout handoff.
- Treat outcome ledger entries as delivery proof, not collection proof. Revenue collection proof is a `RevenuePayment` row written from a signed paid Stripe webhook.
- Review refunded or disputed `RevenuePayment` rows before claiming setup revenue or MRR; `/api/revenue-summary` counts only entries that still have `status=paid`.
- Review revenue recovery links created, opened, accepted, callback-requested, revision-requested, or declined. Accepted recovery links are customer action evidence, not subscription revenue.
- Review onboarding delivery status, owner, SLA due date, QA approval, sent timestamp, customer response, and renewal evidence summary for every paid pilot.
- Review Launch page prospect statuses: `new`, `contacted`, `call_booked`, `scope_sent`, `checkout_sent`, `won`, `lost`, and `disqualified`.
- Work the `Needs action` list before opening new prospect rows.
- Review first-pack quality and customer objections.
- Review Launch page outcome ledger entries for won jobs, revived quotes, approved replies, recovered customers, repeat bookings, and saved hours.
- Update vertical templates.
- Decide whether to continue, narrow the vertical, or pivot.

Stop or pivot if:

- Fewer than two paid pilots after 200 targeted contacts.
- Prospects like the idea but refuse any setup fee.
- Delivery needs custom labor that cannot be templated.
- Compliance or platform restrictions block the core value.

## Next Real-World Command

Do this in order:

1. Deploy with `render.yaml`.
2. Configure live environment variables.
3. Run `npm run doctor:production`.
4. Run `npm run stripe:bootstrap` with live Stripe.
5. Configure Stripe webhook and provider webhooks.
6. Run `npm run launch:readiness`.
7. Run `npm run launch:smoke -- ${PUBLIC_API_BASE_URL}`.
8. Run `npm run launch:packet` and clear any machine blockers before sending checkout links beyond controlled prospects.
9. Build the first 200-prospect list using `docs/examples/prospect-list-template.csv`.
10. Import the list into the Launch page and work prospects by fit score.
11. Start the weekday sales motion and keep every sales touch in the Launch page activity ledger.
12. Close one BidFlow and one ReputeLoop pilot.
13. Deliver the first pack using `docs/examples/first-pack-qa-checklist.md`.
