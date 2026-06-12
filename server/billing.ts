import { randomBytes } from 'node:crypto'
import Stripe from 'stripe'
import type { BusinessProfile, OnboardingRecord, ProductKey, SubscriptionRecord, SubscriptionStatus, WorkspaceData } from '../src/domain/types'
import { findBillingPlan, getPlanReadiness } from './plans'

export type CheckoutRequest = {
  planId: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  businessName?: string
  businessWebsite?: string
  businessCity?: string
  businessState?: string
  industry?: string
  pilotScopeAccepted?: boolean
  humanReviewAccepted?: boolean
  termsAccepted?: boolean
  privacyAccepted?: boolean
  refundPolicyAccepted?: boolean
  organizationId?: string
  userId?: string
  prospectId?: string
  checkoutHandoffId?: string
  idempotencyKey?: string
  pilotScopeSummary?: string
  pilotScopeHash?: string
}

export type PortalRequest = {
  customerId: string
  returnUrl: string
}

export type CheckoutClient = {
  checkout: {
    sessions: {
      create: (
        params: Stripe.Checkout.SessionCreateParams,
        options?: Stripe.RequestOptions,
      ) => Promise<{ id: string; url: string | null }>
    }
  }
  billingPortal?: {
    sessions: {
      create: (params: Stripe.BillingPortal.SessionCreateParams) => Promise<{ id: string; url: string }>
    }
  }
  webhooks?: {
    constructEvent: (payload: string | Buffer, signature: string, secret: string) => Stripe.Event
  }
}

export function createCustomerAccessToken() {
  return randomBytes(32).toString('base64url')
}

export function createStripeClient(secretKey = process.env.STRIPE_SECRET_KEY): CheckoutClient {
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is required.')
  }

  return new Stripe(secretKey, {
    apiVersion: '2026-05-27.dahlia',
  })
}

export function verifyStripeWebhook(
  payload: string | Buffer,
  signature: string | undefined,
  env = process.env,
  client?: CheckoutClient,
) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return { ok: false as const, status: 503, error: 'stripe_webhook_not_configured' }
  }

  if (!signature) {
    return { ok: false as const, status: 400, error: 'stripe_signature_missing' }
  }

  if (!client && !env.STRIPE_SECRET_KEY) {
    return { ok: false as const, status: 503, error: 'stripe_not_configured' }
  }

  const stripeClient = client ?? createStripeClient(env.STRIPE_SECRET_KEY)
  if (!stripeClient.webhooks) {
    return { ok: false as const, status: 500, error: 'stripe_webhook_client_missing' }
  }

  try {
    return {
      ok: true as const,
      event: stripeClient.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET),
    }
  } catch {
    return { ok: false as const, status: 400, error: 'stripe_signature_invalid' }
  }
}

export function applyStripeSubscriptionEvent(workspace: WorkspaceData, event: Stripe.Event): WorkspaceData {
  const now = new Date().toISOString()
  const record = subscriptionFromEvent(workspace.business.id, event, now)
  const onboardingRecord = onboardingFromEvent(workspace, event, now)
  if (!record && !onboardingRecord) return workspace

  const nextSubscriptions = record ? upsertSubscription(workspace.subscriptions, record, now) : workspace.subscriptions
  const nextOnboarding = onboardingRecord ? upsertOnboarding(workspace.onboarding, onboardingRecord, now) : workspace.onboarding

  return {
    ...workspace,
    subscriptions: nextSubscriptions,
    onboarding: nextOnboarding,
    business: onboardingRecord ? activateBusinessProfile(workspace.business, onboardingRecord) : workspace.business,
  }
}

function upsertSubscription(subscriptions: SubscriptionRecord[], record: SubscriptionRecord, now: string) {
  const existing = subscriptions.find((subscription) => subscription.stripeSubscriptionId === record.stripeSubscriptionId)
  return existing
    ? subscriptions.map((subscription) =>
        subscription.stripeSubscriptionId === record.stripeSubscriptionId
          ? { ...subscription, ...record, createdAt: subscription.createdAt, updatedAt: now }
          : subscription,
      )
    : [record, ...subscriptions]
}

function upsertOnboarding(onboarding: OnboardingRecord[], record: OnboardingRecord, now: string) {
  const existing = onboarding.find(
    (item) =>
      (record.stripeSubscriptionId && item.stripeSubscriptionId === record.stripeSubscriptionId) ||
      (record.stripeCustomerId && item.stripeCustomerId === record.stripeCustomerId),
  )
  return existing
    ? onboarding.map((item) =>
        item.id === existing.id
          ? {
              ...item,
              ...record,
              checklist: mergeChecklist(item.checklist, record.checklist),
              deliveryOwnerEmail: item.deliveryOwnerEmail || record.deliveryOwnerEmail,
              deliverySlaDueAt: item.deliverySlaDueAt || record.deliverySlaDueAt,
              deliveryStatus: item.deliveryStatus || record.deliveryStatus,
              deliveryPackSentAt: item.deliveryPackSentAt ?? record.deliveryPackSentAt,
              deliveryPackSentBy: item.deliveryPackSentBy ?? record.deliveryPackSentBy,
              deliveryPackSummary: item.deliveryPackSummary ?? record.deliveryPackSummary,
              customerConfirmedAt: item.customerConfirmedAt ?? record.customerConfirmedAt,
              customerConfirmedByEmail: item.customerConfirmedByEmail ?? record.customerConfirmedByEmail,
              customerConfirmationNote: item.customerConfirmationNote ?? record.customerConfirmationNote,
              renewalEvidenceSummary: item.renewalEvidenceSummary ?? record.renewalEvidenceSummary,
              createdAt: item.createdAt,
              updatedAt: now,
            }
          : item,
      )
    : [record, ...onboarding]
}

function mergeChecklist(existing: OnboardingRecord['checklist'], incoming: OnboardingRecord['checklist']) {
  return incoming.map((item) => {
    const current = existing.find((entry) => entry.key === item.key)
    return current ? { ...item, done: current.done || item.done } : item
  })
}

function addDaysIso(reference: string, days: number) {
  const date = new Date(reference)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function activateBusinessProfile(profile: BusinessProfile, onboarding: OnboardingRecord): BusinessProfile {
  return {
    ...profile,
    name: onboarding.businessName || profile.name,
    industry: onboarding.industry || profile.industry,
    city: onboarding.businessCity || profile.city,
    state: onboarding.businessState || profile.state,
    website: onboarding.businessWebsite || profile.website,
  }
}

function checkoutSessionPaid(session: Stripe.Checkout.Session) {
  return session.payment_status === 'paid'
}

function subscriptionFromEvent(organizationId: string, event: Stripe.Event, now: string): SubscriptionRecord | undefined {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
    const planId = typeof session.metadata?.plan_id === 'string' ? session.metadata.plan_id : undefined
    const product = parseProduct(session.metadata?.product)

    if (!subscriptionId || !customerId || !planId || !product) return undefined
    if (!checkoutSessionPaid(session)) return undefined
    if (!metadataBelongsToOrganization(session.metadata, organizationId)) return undefined
    if (!planMatchesProduct(planId, product)) return undefined

    return {
      id: `sub_${subscriptionId}`,
      organizationId,
      product,
      planId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const subscription = event.data.object as Stripe.Subscription
    const planId = typeof subscription.metadata?.plan_id === 'string' ? subscription.metadata.plan_id : undefined
    const product = parseProduct(subscription.metadata?.product)
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id

    if (!planId || !product || !customerId) return undefined
    if (!metadataBelongsToOrganization(subscription.metadata, organizationId)) return undefined
    if (!planMatchesProduct(planId, product)) return undefined
    const currentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end

    return {
      id: `sub_${subscription.id}`,
      organizationId,
      product,
      planId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      status: normalizeSubscriptionStatus(subscription.status),
      currentPeriodEnd: typeof currentPeriodEnd === 'number' ? new Date(currentPeriodEnd * 1000).toISOString() : undefined,
      createdAt: now,
      updatedAt: now,
    }
  }

  return undefined
}

function onboardingFromEvent(workspace: WorkspaceData, event: Stripe.Event, now: string): OnboardingRecord | undefined {
  if (event.type !== 'checkout.session.completed') {
    return undefined
  }

  const session = event.data.object as Stripe.Checkout.Session
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const metadata = session.metadata ?? {}
  const planId = typeof metadata.plan_id === 'string' ? metadata.plan_id : undefined
  const product = parseProduct(metadata.product)
  if (!subscriptionId || !customerId || !planId || !product) return undefined
  if (!checkoutSessionPaid(session)) return undefined
  if (!metadataBelongsToOrganization(metadata, workspace.business.id)) return undefined
  if (!planMatchesProduct(planId, product)) return undefined

  const businessName = typeof metadata.business_name === 'string' && metadata.business_name ? metadata.business_name : workspace.business.name
  const ownerEmail =
    typeof metadata.owner_email === 'string' && metadata.owner_email
      ? metadata.owner_email
      : typeof session.customer_details?.email === 'string'
        ? session.customer_details.email
        : typeof session.customer_email === 'string'
          ? session.customer_email
          : ''

  return {
    id: `onboarding_${subscriptionId}`,
    organizationId: workspace.business.id,
    businessName,
    businessWebsite: typeof metadata.business_website === 'string' ? metadata.business_website : undefined,
    businessCity: typeof metadata.business_city === 'string' ? metadata.business_city : undefined,
    businessState: typeof metadata.business_state === 'string' ? metadata.business_state : undefined,
    industry: typeof metadata.industry === 'string' ? metadata.industry : undefined,
    ownerEmail,
    product,
    planId,
    status: 'workspace_activated',
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    customerAccessToken: createCustomerAccessToken(),
    deliveryOwnerEmail: ownerEmail,
    deliverySlaDueAt: addDaysIso(now, 14),
    deliveryStatus: 'not_started',
    checklist: buildOnboardingChecklist(product),
    createdAt: now,
    updatedAt: now,
  }
}

function buildOnboardingChecklist(product: ProductKey): OnboardingRecord['checklist'] {
  const common = [
    { key: 'payment_received', label: 'Payment received through Stripe', done: true },
    { key: 'workspace_activated', label: 'Workspace activated', done: true },
    { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: false },
  ]
  return product === 'bidflow'
    ? [
        ...common,
        { key: 'lead_pipeline_reviewed', label: 'Review first lead pipeline and quote workflow', done: false },
        { key: 'first_revenue_pack_sent', label: 'Send first approved revenue pack', done: false },
      ]
    : [
        ...common,
        { key: 'review_queue_reviewed', label: 'Review first reputation risk queue', done: false },
        { key: 'first_response_pack_approved', label: 'Approve first compliant response pack', done: false },
      ]
}

function parseProduct(value: unknown): ProductKey | undefined {
  return value === 'reputeloop' || value === 'bidflow' ? value : undefined
}

function metadataBelongsToOrganization(metadata: Stripe.Metadata | null | undefined, organizationId: string) {
  return typeof metadata?.organization_id === 'string' && metadata.organization_id === organizationId
}

function planMatchesProduct(planId: string, product: ProductKey) {
  const plan = findBillingPlan(planId)
  return Boolean(plan && plan.product === product)
}

function normalizeSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === 'active' || status === 'trialing' || status === 'past_due' || status === 'unpaid' || status === 'paused') {
    return status
  }

  if (status === 'canceled') return 'canceled'
  return 'incomplete'
}

export async function createCheckoutSession(
  request: CheckoutRequest,
  env = process.env,
  client?: CheckoutClient,
) {
  const readiness = getPlanReadiness(request.planId, env)
  if (!readiness.plan) {
    return { ok: false as const, status: 404, error: 'plan_not_found', missing: readiness.missing }
  }

  if (!readiness.configured) {
    return { ok: false as const, status: 503, error: 'stripe_not_configured', missing: readiness.missing }
  }

  const priceId = env[readiness.plan.stripePriceEnv]
  if (!priceId) {
    return { ok: false as const, status: 503, error: 'stripe_price_missing', missing: [readiness.plan.stripePriceEnv] }
  }

  const stripeClient = client ?? createStripeClient(env.STRIPE_SECRET_KEY)
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: priceId, quantity: 1 }]
  if (readiness.plan.setupFee > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${readiness.plan.name} implementation setup`,
          metadata: {
            plan_id: readiness.plan.id,
            product: readiness.plan.product,
          },
        },
        unit_amount: readiness.plan.setupFee * 100,
      },
      quantity: 1,
    })
  }

  const session = await stripeClient.checkout.sessions.create(
    {
      mode: 'subscription',
      line_items: lineItems,
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      customer_email: request.customerEmail,
      allow_promotion_codes: true,
      metadata: {
        plan_id: readiness.plan.id,
        product: readiness.plan.product,
        setup_fee: String(readiness.plan.setupFee),
        owner_email: request.customerEmail || '',
        organization_id: request.organizationId || '',
        user_id: request.userId || '',
        business_name: request.businessName || '',
        business_website: request.businessWebsite || '',
        business_city: request.businessCity || '',
        business_state: request.businessState || '',
        industry: request.industry || '',
        prospect_id: request.prospectId || '',
        checkout_handoff_id: request.checkoutHandoffId || '',
        pilot_scope_summary: request.pilotScopeSummary || '',
        pilot_scope_hash: request.pilotScopeHash || '',
        pilot_scope_accepted: String(Boolean(request.pilotScopeAccepted)),
        human_review_accepted: String(Boolean(request.humanReviewAccepted)),
        terms_accepted: String(Boolean(request.termsAccepted)),
        privacy_accepted: String(Boolean(request.privacyAccepted)),
        refund_policy_accepted: String(Boolean(request.refundPolicyAccepted)),
      },
      subscription_data: {
        metadata: {
          plan_id: readiness.plan.id,
          product: readiness.plan.product,
          organization_id: request.organizationId || '',
          user_id: request.userId || '',
          business_name: request.businessName || '',
          prospect_id: request.prospectId || '',
          checkout_handoff_id: request.checkoutHandoffId || '',
          pilot_scope_hash: request.pilotScopeHash || '',
          pilot_scope_accepted: String(Boolean(request.pilotScopeAccepted)),
          human_review_accepted: String(Boolean(request.humanReviewAccepted)),
        },
      },
    },
    request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : undefined,
  )

  return {
    ok: true as const,
    status: 200,
    sessionId: session.id,
    url: session.url,
    plan: readiness.plan,
  }
}

export async function createCustomerPortalSession(
  request: PortalRequest,
  env = process.env,
  client?: CheckoutClient,
) {
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false as const, status: 503, error: 'stripe_not_configured', missing: ['STRIPE_SECRET_KEY'] }
  }

  if (!request.customerId || !request.returnUrl) {
    return { ok: false as const, status: 400, error: 'customer_id_and_return_url_required' }
  }

  const stripeClient = client ?? createStripeClient(env.STRIPE_SECRET_KEY)
  if (!stripeClient.billingPortal) {
    return { ok: false as const, status: 500, error: 'stripe_portal_client_missing' }
  }

  const session = await stripeClient.billingPortal.sessions.create({
    customer: request.customerId,
    return_url: request.returnUrl,
  })

  return {
    ok: true as const,
    status: 200,
    sessionId: session.id,
    url: session.url,
  }
}
