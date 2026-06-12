import { describe, expect, it } from 'vitest'
import type { WorkspaceData } from '../src/domain/types'
import { seedData } from '../src/data/seed'
import { billingPlans } from './plans'
import { buildLaunchPacket, formatLaunchPacket } from './launchPacket'

function liveEnv() {
  const env: Record<string, string> = {
    PUBLIC_API_BASE_URL: 'https://local-growth.example',
    APP_ORIGIN: 'https://local-growth.example',
    DATABASE_URL: 'postgres://user:pass@db.example/local_growth',
    JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY----- test -----END PUBLIC KEY-----',
    JWT_ISSUER: 'https://auth.local-growth.example',
    JWT_AUDIENCE: 'local-growth-os',
    STRIPE_SECRET_KEY: 'sk_live_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    POSTMARK_TOKEN: 'postmark',
    POSTMARK_FROM_EMAIL: 'ops@example.com',
    EMAIL_WEBHOOK_SECRET: 'email-webhook-secret',
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'twilio',
    TWILIO_MESSAGING_SERVICE_SID: 'MG123',
    GOOGLE_ACCESS_TOKEN: 'google',
    GOOGLE_ACCOUNT_ID: 'accounts/123',
    GOOGLE_LOCATION_ID: 'locations/456',
    SERVE_STATIC_FRONTEND: 'true',
    NODE_ENV: 'production',
    WORKSPACE_ID: 'local-growth-os',
  }
  for (const plan of billingPlans) {
    env[plan.stripePriceEnv] = `price_${plan.id.replaceAll('-', '_')}`
  }
  return env
}

describe('live launch packet', () => {
  it('summarizes blockers when production launch configuration is missing', () => {
    const packet = buildLaunchPacket(seedData, {}, new Date('2026-06-11T00:00:00.000Z'))

    expect(packet.mode).toBe('blocked')
    expect(packet.blockers).toEqual(expect.arrayContaining([expect.stringContaining('PUBLIC_API_BASE_URL')]))
    expect(formatLaunchPacket(packet)).toContain('Mode: blocked')
  })

  it('turns workspace revenue evidence into a concrete command packet', () => {
    const workspace: WorkspaceData = {
      ...seedData,
      revenuePayments: [
        {
          id: 'revenue_payment_bidflow',
          organizationId: seedData.business.id,
          product: 'bidflow',
          planId: 'bidflow-growth',
          businessName: 'Command Roofing',
          customerEmail: 'casey@command.example',
          currency: 'USD',
          grossCollectedCents: 64800,
          setupRevenueCents: 49900,
          mrrCents: 14900,
          planMonthlyPriceSnapshotCents: 14900,
          planSetupFeeSnapshotCents: 49900,
          amountSource: 'stripe_session',
          paymentSource: 'sales_checkout_handoff',
          paymentStatus: 'paid',
          status: 'paid',
          source: 'stripe_checkout',
          stripeEventId: 'evt_paid',
          stripeCheckoutSessionId: 'cs_live_paid',
          metadataSnapshot: {},
          receivedAt: '2026-06-11T00:00:00.000Z',
          createdAt: '2026-06-11T00:00:00.000Z',
          updatedAt: '2026-06-11T00:00:00.000Z',
        },
      ],
      salesProspects: [
        {
          id: 'prospect_checkout',
          organizationId: seedData.business.id,
          businessName: 'Command Roofing',
          ownerName: 'Casey Owner',
          ownerEmail: 'casey@command.example',
          phone: '+15125550100',
          website: 'https://command.example',
          city: 'Austin',
          state: 'TX',
          industry: 'Roofing',
          googleReviewCount: 65,
          averageRating: 4.2,
          recentReviewIssue: 'unanswered review mentions no callback',
          quoteLeakSignal: 'estimate form has no follow-up promise',
          averageJobValue: 2400,
          fitScore: 88,
          nextTouch: 'call',
          status: 'checkout_sent',
          notes: 'Buyer has scoped pilot link.',
          lastContactedAt: '2026-06-10T00:00:00.000Z',
          createdAt: '2026-06-08T00:00:00.000Z',
          updatedAt: '2026-06-10T00:00:00.000Z',
        },
      ],
      onboarding: [
        {
          id: 'onboarding_delivery',
          organizationId: seedData.business.id,
          businessName: 'Command Delivery',
          ownerEmail: 'owner@commanddelivery.example',
          product: 'bidflow',
          planId: 'bidflow-growth',
          status: 'ready_for_pilot',
          deliveryOwnerEmail: 'ops@example.com',
          deliverySlaDueAt: '2026-06-10T00:00:00.000Z',
          deliveryStatus: 'sent',
          deliveryPackSentAt: '2026-06-09T00:00:00.000Z',
          deliveryPackSentBy: 'ops@example.com',
          deliveryPackSummary: 'First pack sent; waiting for acceptance.',
          checklist: [{ key: 'payment_received', label: 'Payment received through Stripe', done: true }],
          createdAt: '2026-06-08T00:00:00.000Z',
          updatedAt: '2026-06-09T00:00:00.000Z',
        },
      ],
    }

    const packet = buildLaunchPacket(workspace, liveEnv(), new Date('2026-06-11T00:00:00.000Z'))
    const output = formatLaunchPacket(packet)

    expect(packet.mode).toBe('delivery_focus')
    expect(packet.summary).toMatchObject({
      paidPilots: 1,
      paidBidFlowPilots: 1,
      setupRevenueCents: 49900,
      mrrCents: 14900,
      openCheckoutCount: 1,
      deliveryAtRiskCount: 1,
    })
    expect(output).toContain('https://local-growth.example/api/billing/webhook')
    expect(output).toContain('Call Command Roofing')
    expect(output).toContain('Ask Command Delivery')
  })
})
