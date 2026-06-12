# First Delivery Pack QA Checklist

Use this before sending any first pack to a paying customer.

## Shared Checks

- [ ] Stripe payment is live, not test mode.
- [ ] `/api/onboarding` shows the paid customer and selected plan.
- [ ] Customer materials were submitted through `/onboarding/<customerAccessToken>`.
- [ ] Submission status is `reviewed` or `imported`.
- [ ] CSV preview had no row errors before import.
- [ ] Delivery pack was generated from imported records, not raw customer text.
- [ ] Customer name, business name, scope, and product are correct.
- [ ] No passwords, API keys, card data, or unnecessary sensitive data appear in the pack.
- [ ] Operator reviewed the pack before delivery.

## BidFlow Local

- [ ] Estimate total is plausible for the service category and local market.
- [ ] Scope of work is specific and avoids hidden obligations.
- [ ] Exclusions are visible.
- [ ] Proposal states draft status and requires customer approval before binding.
- [ ] Follow-up sequence does not imply guaranteed availability, discounts, or emergency response unless approved.
- [ ] Outcome tracking field is ready: won job, revived quote, or hours saved.

## ReputeLoop

- [ ] Public reply does not admit legal liability.
- [ ] Public reply does not promise a refund, discount, or service redo unless manager approved.
- [ ] High-risk language is flagged for manager review.
- [ ] Recovery offer is appropriate and documented.
- [ ] No request for fake, gated, or incentivized positive reviews.
- [ ] Outcome tracking field is ready: approved reply, recovered conversation, or repeat booking.

## Delivery Record

- Customer:
- Product:
- Submission ID:
- Delivery pack filename:
- Operator:
- Sent at:
- Customer-visible outcome:
- Renewal or next step:
