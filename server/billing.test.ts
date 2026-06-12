import { describe, expect, it } from 'vitest'
import {
  applyStripeSubscriptionEvent,
  createCheckoutSession,
  createCustomerPortalSession,
  verifyStripeWebhook,
  type CheckoutClient,
} from './billing'
import { seedData } from '../src/data/seed'

describe('Stripe billing adapter', () => {
  it('fails closed when Stripe configuration is missing', async () => {
    const result = await createCheckoutSession(
      {
        planId: 'bidflow-growth',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      },
      {},
      fakeClient(),
    )

    expect(result.ok).toBe(false)
    expect(result.status).toBe(503)
    expect(result.missing).toContain('STRIPE_SECRET_KEY')
  })

  it('creates a subscription checkout session with the one-time setup fee when configured', async () => {
    const calls: unknown[] = []
    const optionsCalls: unknown[] = []
    const result = await createCheckoutSession(
      {
        planId: 'reputeloop-growth',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        customerEmail: 'owner@example.com',
        businessName: 'Parker Roof Co',
        businessWebsite: 'https://parker.example',
        businessCity: 'Austin',
        businessState: 'TX',
        industry: 'Roofing',
        pilotScopeAccepted: true,
        humanReviewAccepted: true,
        termsAccepted: true,
        privacyAccepted: true,
        refundPolicyAccepted: true,
        pilotScopeSummary: 'Recover missed review follow-up with one operator-reviewed response pack.',
        pilotScopeHash: 'scopehash123',
        idempotencyKey: 'checkout_handoff_handoff_123',
      },
      {
        STRIPE_SECRET_KEY: 'sk_test_123',
        STRIPE_WEBHOOK_SECRET: 'whsec_123',
        STRIPE_PRICE_REPUTELOOP_GROWTH: 'price_repute_growth',
      },
      fakeClient(calls, optionsCalls),
    )

    expect(result.ok).toBe(true)
    expect(result.url).toBe('https://checkout.stripe.test/session')
    expect(calls[0]).toMatchObject({
      mode: 'subscription',
      line_items: [
        { price: 'price_repute_growth', quantity: 1 },
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'ReputeLoop Growth implementation setup',
              metadata: { plan_id: 'reputeloop-growth', product: 'reputeloop' },
            },
            unit_amount: 39900,
          },
          quantity: 1,
        },
      ],
      customer_email: 'owner@example.com',
      metadata: {
        plan_id: 'reputeloop-growth',
        product: 'reputeloop',
        business_name: 'Parker Roof Co',
        business_website: 'https://parker.example',
        business_city: 'Austin',
        business_state: 'TX',
        industry: 'Roofing',
        pilot_scope_summary: 'Recover missed review follow-up with one operator-reviewed response pack.',
        pilot_scope_hash: 'scopehash123',
        pilot_scope_accepted: 'true',
        human_review_accepted: 'true',
        terms_accepted: 'true',
        privacy_accepted: 'true',
        refund_policy_accepted: 'true',
      },
      subscription_data: {
        metadata: {
          pilot_scope_accepted: 'true',
          human_review_accepted: 'true',
          pilot_scope_hash: 'scopehash123',
        },
      },
    })
    expect(optionsCalls[0]).toEqual({ idempotencyKey: 'checkout_handoff_handoff_123' })
  })

  it('creates a Stripe customer portal session when configured', async () => {
    const calls: unknown[] = []
    const result = await createCustomerPortalSession(
      { customerId: 'cus_123', returnUrl: 'https://example.com/account' },
      { STRIPE_SECRET_KEY: 'sk_test_123' },
      fakeClient(calls),
    )

    expect(result).toEqual({
      ok: true,
      status: 200,
      sessionId: 'bps_test_123',
      url: 'https://billing.stripe.test/session',
    })
    expect(calls[0]).toEqual({ customer: 'cus_123', return_url: 'https://example.com/account' })
  })

  it('fails closed for customer portal sessions without Stripe configuration', async () => {
    const result = await createCustomerPortalSession(
      { customerId: 'cus_123', returnUrl: 'https://example.com/account' },
      {},
      fakeClient(),
    )

    expect(result).toMatchObject({ ok: false, status: 503, error: 'stripe_not_configured' })
  })

  it('fails closed for unsigned or unconfigured webhooks', () => {
    expect(verifyStripeWebhook('{}', undefined, {})).toMatchObject({
      ok: false,
      status: 503,
      error: 'stripe_webhook_not_configured',
    })
    expect(verifyStripeWebhook('{}', undefined, { STRIPE_WEBHOOK_SECRET: 'whsec_123' })).toMatchObject({
      ok: false,
      status: 400,
      error: 'stripe_signature_missing',
    })
  })

  it('applies checkout session and subscription update events to workspace subscriptions', () => {
    const checkoutWorkspace = applyStripeSubscriptionEvent(seedData, {
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_123',
          customer: 'cus_123',
          payment_status: 'paid',
          customer_details: { email: 'owner@roofco.example' },
          metadata: {
            plan_id: 'bidflow-growth',
            product: 'bidflow',
            organization_id: 'org_evergreen',
            business_name: 'RoofCo Austin',
            business_website: 'https://roofco.example',
            business_city: 'Austin',
            business_state: 'TX',
            industry: 'Roofing',
          },
        },
      },
    } as never)

    expect(checkoutWorkspace.subscriptions[0]).toMatchObject({
      planId: 'bidflow-growth',
      product: 'bidflow',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      status: 'active',
    })
    expect(checkoutWorkspace.business).toMatchObject({
      name: 'RoofCo Austin',
      website: 'https://roofco.example',
      city: 'Austin',
      state: 'TX',
      industry: 'Roofing',
    })
    expect(checkoutWorkspace.onboarding[0]).toMatchObject({
      businessName: 'RoofCo Austin',
      ownerEmail: 'owner@roofco.example',
      product: 'bidflow',
      planId: 'bidflow-growth',
      status: 'workspace_activated',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      deliveryOwnerEmail: 'owner@roofco.example',
      deliveryStatus: 'not_started',
    })
    expect(checkoutWorkspace.onboarding[0].deliverySlaDueAt).toEqual(expect.any(String))
    expect(checkoutWorkspace.onboarding[0].customerAccessToken).toEqual(expect.any(String))
    expect(checkoutWorkspace.onboarding[0].customerAccessToken?.length).toBeGreaterThan(30)
    expect(checkoutWorkspace.onboarding[0].checklist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'payment_received', done: true }),
        expect.objectContaining({ key: 'customer_materials_submitted', done: false }),
      ]),
    )

    const updatedWorkspace = applyStripeSubscriptionEvent(checkoutWorkspace, {
      id: 'evt_update',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'past_due',
          current_period_end: 1_800_000_000,
          metadata: { plan_id: 'bidflow-growth', product: 'bidflow', organization_id: 'org_evergreen' },
        },
      },
    } as never)

    expect(updatedWorkspace.subscriptions).toHaveLength(1)
    expect(updatedWorkspace.subscriptions[0]).toMatchObject({
      status: 'past_due',
      currentPeriodEnd: new Date(1_800_000_000 * 1000).toISOString(),
    })

    const deliveredWorkspace = {
      ...checkoutWorkspace,
      onboarding: [
        {
          ...checkoutWorkspace.onboarding[0],
          deliveryStatus: 'customer_confirmed' as const,
          deliveryOwnerEmail: 'ops@example.com',
          deliverySlaDueAt: '2026-06-24T00:00:00.000Z',
          deliveryQaApprovedAt: '2026-06-12T00:00:00.000Z',
          deliveryQaApprovedBy: 'qa@example.com',
          deliveryPackSentAt: '2026-06-13T00:00:00.000Z',
          deliveryPackSentBy: 'ops@example.com',
          customerConfirmedAt: '2026-06-14T00:00:00.000Z',
          customerConfirmedByEmail: 'owner@roofco.example',
          renewalEvidenceSummary: 'Customer accepted first delivery pack.',
        },
      ],
    }
    const replayedCheckout = applyStripeSubscriptionEvent(deliveredWorkspace, {
      id: 'evt_checkout_replay',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_123',
          customer: 'cus_123',
          payment_status: 'paid',
          customer_details: { email: 'owner@roofco.example' },
          metadata: {
            plan_id: 'bidflow-growth',
            product: 'bidflow',
            organization_id: 'org_evergreen',
            business_name: 'RoofCo Austin',
          },
        },
      },
    } as never)

    expect(replayedCheckout.onboarding[0]).toMatchObject({
      deliveryStatus: 'customer_confirmed',
      deliveryOwnerEmail: 'ops@example.com',
      deliverySlaDueAt: '2026-06-24T00:00:00.000Z',
      deliveryQaApprovedBy: 'qa@example.com',
      deliveryPackSentBy: 'ops@example.com',
      customerConfirmedByEmail: 'owner@roofco.example',
      renewalEvidenceSummary: 'Customer accepted first delivery pack.',
    })
  })

  it('does not activate subscriptions or onboarding for unpaid checkout sessions', () => {
    const workspace = applyStripeSubscriptionEvent(seedData, {
      id: 'evt_unpaid_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_unpaid',
          customer: 'cus_unpaid',
          payment_status: 'unpaid',
          customer_details: { email: 'owner@unpaid.example' },
          metadata: {
            plan_id: 'bidflow-growth',
            product: 'bidflow',
            organization_id: 'org_evergreen',
            business_name: 'Unpaid Roofing',
          },
        },
      },
    } as never)

    expect(workspace).toBe(seedData)
  })

  it('ignores Stripe events that do not belong to the workspace or mismatch plan metadata', () => {
    const wrongOrganization = applyStripeSubscriptionEvent(seedData, {
      id: 'evt_wrong_org',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_wrong_org',
          customer: 'cus_wrong_org',
          payment_status: 'paid',
          metadata: {
            plan_id: 'bidflow-growth',
            product: 'bidflow',
            organization_id: 'org_other',
          },
        },
      },
    } as never)
    const mismatchedPlan = applyStripeSubscriptionEvent(seedData, {
      id: 'evt_bad_plan',
      type: 'checkout.session.completed',
      data: {
        object: {
          subscription: 'sub_bad_plan',
          customer: 'cus_bad_plan',
          payment_status: 'paid',
          metadata: {
            plan_id: 'bidflow-growth',
            product: 'reputeloop',
            organization_id: 'org_evergreen',
          },
        },
      },
    } as never)

    expect(wrongOrganization).toBe(seedData)
    expect(mismatchedPlan).toBe(seedData)
  })
})

function fakeClient(calls: unknown[] = [], optionsCalls: unknown[] = []): CheckoutClient {
  return {
    checkout: {
      sessions: {
        create: async (params, options) => {
          calls.push(params)
          optionsCalls.push(options)
          return { id: 'cs_test_123', url: 'https://checkout.stripe.test/session' }
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params) => {
          calls.push(params)
          return { id: 'bps_test_123', url: 'https://billing.stripe.test/session' }
        },
      },
    },
  }
}
