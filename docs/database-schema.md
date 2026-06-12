# Production Database Schema

This schema is the target for moving Local Growth OS from JSON persistence to a production Postgres database.

## Current Production Bridge

The implemented server can already use Postgres when `DATABASE_URL` is set. The first migration stores the complete workspace as JSONB:

```sql
create table if not exists workspaces (
  id text primary key,
  organization_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

Migration file:

- `db/migrations/001_workspace_jsonb.sql`

This bridge is intentionally simpler than the normalized target below. It provides durable production persistence for paid pilots and Stripe subscription state while the fully normalized schema is implemented.

## Principles

- Every customer-owned record includes `organization_id`.
- API queries must be scoped by authenticated organization and role.
- Public review replies, messages, estimates, and offers keep audit history.
- Generated content stores input snapshot, output text, prompt version, and safety status.
- Consent state is checked before campaign or follow-up sends.

## Core Tables

```sql
create table organizations (
  id uuid primary key,
  name text not null,
  industry text not null,
  website text,
  timezone text not null default 'America/Chicago',
  default_locale text not null default 'en-US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table locations (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name text not null,
  address text,
  city text,
  state text,
  postal_code text,
  phone text,
  google_business_profile_id text,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  email citext not null,
  name text not null,
  role text not null check (role in ('owner', 'admin', 'manager', 'staff')),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table customers (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  location_id uuid references locations(id),
  name text not null,
  email citext,
  phone text,
  source text,
  tags text[] not null default '{}',
  consent_email boolean not null default false,
  consent_sms boolean not null default false,
  lifetime_value numeric(12, 2) not null default 0,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now()
);
```

## BidFlow Tables

```sql
create table leads (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  location_id uuid references locations(id),
  customer_id uuid not null references customers(id),
  service_category text not null,
  description text not null,
  budget_min numeric(12, 2) not null default 0,
  budget_max numeric(12, 2) not null default 0,
  urgency text not null check (urgency in ('low', 'normal', 'high', 'emergency')),
  source text not null,
  status text not null,
  score integer not null default 0,
  next_step text,
  location_fit boolean not null default true,
  repeat_customer boolean not null default false,
  assigned_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table estimates (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  lead_id uuid not null references leads(id),
  customer_id uuid not null references customers(id),
  status text not null,
  subtotal numeric(12, 2) not null,
  tax numeric(12, 2) not null,
  total numeric(12, 2) not null,
  confidence text not null,
  valid_until date not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table estimate_line_items (
  id uuid primary key,
  estimate_id uuid not null references estimates(id) on delete cascade,
  name text not null,
  description text,
  quantity numeric(12, 2) not null,
  unit text not null,
  unit_price numeric(12, 2) not null,
  taxable boolean not null default false,
  sort_order integer not null default 0
);

create table proposals (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  lead_id uuid not null references leads(id),
  estimate_id uuid not null references estimates(id),
  title text not null,
  body_markdown text not null,
  status text not null,
  generated_content_id uuid,
  sent_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table follow_ups (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  lead_id uuid not null references leads(id),
  customer_id uuid not null references customers(id),
  channel text not null check (channel in ('email', 'sms', 'phone', 'manual')),
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null,
  subject text,
  body text not null,
  outcome text not null default 'pending',
  idempotency_key text,
  unique (organization_id, idempotency_key)
);
```

## ReputeLoop Tables

```sql
create table reviews (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  location_id uuid references locations(id),
  customer_id uuid references customers(id),
  platform text not null,
  external_review_id text,
  rating integer not null check (rating between 1 and 5),
  body text not null,
  reviewer_name text,
  reviewed_at timestamptz not null,
  sentiment_score integer not null default 0,
  risk_score integer not null default 0,
  status text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, platform, external_review_id)
);

create table review_responses (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  review_id uuid not null references reviews(id),
  body text not null,
  tone text not null,
  status text not null,
  compliance_notes text[] not null default '{}',
  approved_by uuid references users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create table feedback_cases (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  customer_id uuid not null references customers(id),
  review_id uuid references reviews(id),
  severity text not null,
  reason_category text not null,
  summary text not null,
  status text not null,
  winback_score integer not null default 0,
  assigned_user_id uuid references users(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table recovery_offers (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  feedback_case_id uuid not null references feedback_cases(id),
  offer_type text not null,
  value numeric(12, 2) not null default 0,
  message text not null,
  expires_at timestamptz not null,
  status text not null
);
```

## Customer Action Links

```sql
create table revenue_recovery_links (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  token text not null unique,
  product text not null check (product in ('bidflow', 'reputeloop')),
  source_type text not null check (source_type in ('lead', 'feedback_case')),
  source_id uuid not null,
  customer_id uuid not null references customers(id),
  customer_name text not null,
  customer_email citext not null,
  business_name text not null,
  title text not null,
  summary text not null,
  call_to_action text not null,
  value_cents integer not null default 0,
  currency text not null default 'USD',
  status text not null check (
    status in (
      'created',
      'opened',
      'accepted',
      'revision_requested',
      'callback_requested',
      'declined',
      'expired'
    )
  ),
  created_by citext not null,
  opened_at timestamptz,
  responded_at timestamptz,
  response_action text check (
    response_action is null or response_action in ('approve', 'request_revision', 'schedule_callback', 'decline')
  ),
  response_note text,
  response_email citext,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (product = 'bidflow' and source_type = 'lead') or
    (product = 'reputeloop' and source_type = 'feedback_case')
  )
);
```

`source_id` is intentionally polymorphic. Application code must verify that a `lead` or `feedback_case` belongs to the same `organization_id` before creating or resolving the link.

## Messaging, Billing, and Audit

```sql
create table outbound_messages (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  customer_id uuid not null references customers(id),
  channel text not null,
  purpose text not null,
  subject text,
  body text not null,
  consent_checked_at timestamptz not null,
  provider text,
  provider_message_id text,
  status text not null,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  product text not null,
  plan_id text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table revenue_payments (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  product text not null check (product in ('bidflow', 'reputeloop')),
  plan_id text not null,
  business_name text not null,
  customer_email citext not null,
  currency text not null default 'USD',
  gross_collected_cents integer not null default 0,
  setup_revenue_cents integer not null default 0,
  mrr_cents integer not null default 0,
  plan_monthly_price_snapshot_cents integer not null default 0,
  plan_setup_fee_snapshot_cents integer not null default 0,
  amount_source text not null check (amount_source in ('stripe_session', 'catalog_fallback')),
  payment_source text not null check (payment_source in ('sales_checkout_handoff', 'public_checkout', 'operator_checkout')),
  payment_status text not null check (payment_status in ('paid')),
  status text not null check (status in ('paid', 'refunded', 'disputed')),
  source text not null check (source in ('stripe_checkout')),
  stripe_event_id text not null unique,
  stripe_checkout_session_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  prospect_id text,
  checkout_handoff_id text,
  onboarding_id text,
  metadata_snapshot jsonb not null default '{}',
  received_at timestamptz not null,
  refunded_at timestamptz,
  disputed_at timestamptz,
  status_updated_at timestamptz,
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table onboarding_records (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  business_name text not null,
  business_website text,
  business_city text,
  business_state text,
  industry text,
  owner_email text not null,
  product text not null,
  plan_id text not null,
  status text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  customer_access_token text unique,
  delivery_owner_email citext not null,
  delivery_sla_due_at timestamptz not null,
  delivery_status text not null check (
    delivery_status in (
      'not_started',
      'materials_waiting',
      'pack_ready',
      'qa_approved',
      'sent',
      'customer_confirmed',
      'revision_requested',
      'call_requested',
      'renewal_ready',
      'blocked'
    )
  ),
  delivery_qa_approved_at timestamptz,
  delivery_qa_approved_by citext,
  delivery_qa_notes text,
  delivery_pack_sent_at timestamptz,
  delivery_pack_sent_by citext,
  delivery_pack_summary text,
  customer_delivery_response text check (
    customer_delivery_response is null or customer_delivery_response in ('accept', 'request_revision', 'schedule_call')
  ),
  customer_confirmed_at timestamptz,
  customer_confirmed_by_email citext,
  customer_confirmation_note text,
  renewal_evidence_summary text,
  checklist jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table onboarding_submissions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  onboarding_id uuid not null references onboarding_records(id) on delete cascade,
  submitted_by_email text not null,
  material_type text not null check (material_type in ('lead_csv', 'review_csv', 'general_notes')),
  title text not null,
  body text not null,
  status text not null check (status in ('submitted', 'reviewed', 'imported', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales_prospects (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  business_name text not null,
  owner_name text,
  owner_email citext,
  phone text,
  website text,
  city text,
  state text,
  industry text,
  google_review_count integer not null default 0,
  average_rating numeric(3, 2) not null default 0,
  recent_review_issue text,
  quote_leak_signal text,
  average_job_value numeric(12, 2) not null default 0,
  fit_score integer not null default 0,
  next_touch text not null check (next_touch in ('email', 'call', 'linkedin', 'partner', 'hold')),
  status text not null check (
    status in (
      'new',
      'qualified',
      'contacted',
      'call_booked',
      'scope_sent',
      'checkout_sent',
      'won',
      'lost',
      'disqualified'
    )
  ),
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, business_name, owner_email, website)
);

create table sales_outreach_packs (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  prospect_id uuid not null references sales_prospects(id) on delete cascade,
  business_name text not null,
  product text not null check (product in ('bidflow', 'reputeloop')),
  subject text not null,
  email_body text not null,
  call_opener text not null,
  voicemail_script text not null,
  linkedin_note text not null,
  pilot_scope_draft text not null,
  pilot_price_summary text not null,
  discovery_questions jsonb not null default '[]',
  proof_points jsonb not null default '[]',
  risk_notes jsonb not null default '[]',
  next_step text not null,
  status text not null check (status in ('draft', 'used', 'archived')),
  generated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table sales_activities (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  prospect_id uuid not null references sales_prospects(id) on delete cascade,
  business_name text not null,
  channel text not null check (channel in ('email', 'call', 'linkedin', 'partner', 'manual')),
  outcome text not null check (
    outcome in (
      'sent',
      'left_voicemail',
      'replied',
      'call_booked',
      'scope_sent',
      'checkout_sent',
      'won',
      'lost',
      'no_response'
    )
  ),
  summary text not null,
  next_step text not null,
  owner_email citext,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales_checkout_handoffs (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  prospect_id uuid not null references sales_prospects(id) on delete cascade,
  token text not null unique,
  business_name text not null,
  customer_email citext not null,
  business_website text,
  business_city text,
  business_state text,
  industry text,
  product text not null check (product in ('bidflow', 'reputeloop')),
  plan_id text not null,
  checkout_url text not null,
  scope_summary text not null,
  scope_source text not null check (scope_source in ('outreach_pack', 'sales_activity', 'prospect_notes')),
  scope_accepted_hash text not null,
  status text not null check (status in ('created', 'sent', 'paid', 'expired', 'cancelled')),
  created_by citext not null,
  sent_at timestamptz,
  paid_at timestamptz,
  stripe_checkout_session_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  onboarding_id uuid references onboarding_records(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pilot_outcomes (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  onboarding_id uuid not null references onboarding_records(id) on delete cascade,
  product text not null check (product in ('bidflow', 'reputeloop')),
  business_name text not null,
  outcome_type text not null check (
    outcome_type in (
      'won_job',
      'revived_quote',
      'approved_review_reply',
      'recovered_customer',
      'repeat_booking',
      'hours_saved',
      'other'
    )
  ),
  outcome_value numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  evidence text not null,
  next_action text not null,
  recorded_by text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table generated_contents (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  content_type text not null,
  input_snapshot jsonb not null,
  output_text text not null,
  model text,
  prompt_version text not null,
  safety_status text not null,
  compliance_notes text[] not null default '{}',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  actor_user_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  summary text not null,
  created_at timestamptz not null default now()
);
```

## Required Indexes

```sql
create index leads_org_status_score_idx on leads (organization_id, status, score desc);
create index reviews_org_status_risk_idx on reviews (organization_id, status, risk_score desc);
create index followups_org_scheduled_idx on follow_ups (organization_id, scheduled_at, status);
create index messages_org_customer_idx on outbound_messages (organization_id, customer_id, created_at desc);
create index revenue_payments_org_received_idx on revenue_payments (organization_id, received_at desc);
create index revenue_payments_org_product_idx on revenue_payments (organization_id, product, received_at desc);
create index revenue_payments_org_source_idx on revenue_payments (organization_id, payment_source, received_at desc);
create index revenue_payments_stripe_intent_idx on revenue_payments (stripe_payment_intent_id);
create index revenue_payments_stripe_charge_idx on revenue_payments (stripe_charge_id);
create index revenue_recovery_links_org_status_idx on revenue_recovery_links (organization_id, status, updated_at desc);
create index revenue_recovery_links_source_idx on revenue_recovery_links (organization_id, source_type, source_id);
create index revenue_recovery_links_customer_idx on revenue_recovery_links (organization_id, customer_id, created_at desc);
create index onboarding_org_status_idx on onboarding_records (organization_id, status, updated_at desc);
create index onboarding_delivery_status_idx on onboarding_records (organization_id, delivery_status, delivery_sla_due_at);
create index onboarding_submissions_org_status_idx on onboarding_submissions (organization_id, status, updated_at desc);
create index onboarding_submissions_record_idx on onboarding_submissions (onboarding_id, created_at desc);
create index sales_prospects_org_status_score_idx on sales_prospects (organization_id, status, fit_score desc);
create index sales_prospects_org_touch_idx on sales_prospects (organization_id, next_touch, updated_at desc);
create index sales_outreach_packs_prospect_idx on sales_outreach_packs (prospect_id, generated_at desc);
create index sales_outreach_packs_org_status_idx on sales_outreach_packs (organization_id, status, generated_at desc);
create index sales_activities_org_occurred_idx on sales_activities (organization_id, occurred_at desc);
create index sales_activities_prospect_occurred_idx on sales_activities (prospect_id, occurred_at desc);
create index sales_activities_org_channel_outcome_idx on sales_activities (organization_id, channel, outcome, occurred_at desc);
create index sales_checkout_handoffs_org_status_idx on sales_checkout_handoffs (organization_id, status, updated_at desc);
create index sales_checkout_handoffs_prospect_idx on sales_checkout_handoffs (prospect_id, created_at desc);
create index sales_checkout_handoffs_scope_hash_idx on sales_checkout_handoffs (scope_accepted_hash);
create index sales_checkout_handoffs_stripe_session_idx on sales_checkout_handoffs (stripe_checkout_session_id);
create index pilot_outcomes_org_created_idx on pilot_outcomes (organization_id, created_at desc);
create index pilot_outcomes_onboarding_idx on pilot_outcomes (onboarding_id, created_at desc);
create index audit_org_created_idx on audit_logs (organization_id, created_at desc);
```
