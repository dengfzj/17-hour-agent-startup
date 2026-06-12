# Database Schema Summary

Recorded on: 2026-06-11

## Current Persistence Route

The product supports two persistence modes:

- Local JSON workspace.
- Postgres JSONB workspace bridge.

Production should start with the Postgres JSONB bridge, then split into normalized tables after paid pilots prove demand.

## Key Objects

- `BusinessProfile`
- `Customer`
- `Lead`
- `Review`
- `SalesProspect`
- `SalesOutreachPack`
- `SalesActivity`
- `SalesCheckoutHandoff`
- `SubscriptionRecord`
- `RevenuePayment`
- `OnboardingRecord`
- `OnboardingSubmission`
- `PilotOutcome`
- `AuditLog`

## Concurrency and Evidence Protection

- The JSON repository serializes updates in process.
- The Postgres repository uses transactions and row locks.
- Stripe webhooks, public token writes, checkout handoff creation, CSV imports, delivery updates, and outcome updates use atomic repository updates.
- Production disables full workspace overwrite/reset.

## Later Normalized Schema

After real paid pilots prove demand, split first into:

1. organizations
2. users
3. customers
4. sales_prospects
5. sales_checkout_handoffs
6. revenue_payments
7. onboarding_records
8. onboarding_submissions
9. pilot_outcomes
10. audit_logs

## Migration File

- `db/migrations/001_workspace_jsonb.sql`
