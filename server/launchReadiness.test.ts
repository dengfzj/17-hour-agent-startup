import { describe, expect, it } from 'vitest'
import { billingPlans } from './plans'
import { buildLaunchReadiness, formatLaunchReadiness } from './launchReadiness'

describe('launch readiness runbook', () => {
  it('blocks local or incomplete configuration from live launch smoke tests', () => {
    const report = buildLaunchReadiness(
      {
        PUBLIC_API_BASE_URL: 'http://localhost:8787',
        APP_ORIGIN: 'http://localhost:5173',
      },
      '2026-06-11T00:00:00.000Z',
    )

    expect(report.configReadyForLiveSmokeTest).toBe(false)
    expect(report.readyForBroadSelfServeLaunch).toBe(false)
    expect(report.checks.filter((item) => !item.ok).map((item) => item.id)).toEqual(
      expect.arrayContaining(['doctor:NODE_ENV', 'url:public-api-live-https', 'billing:stripe-live-secret', 'auth:issuer-audience']),
    )
    expect(formatLaunchReadiness(report)).toContain('Ready for broad self-serve launch: no')
  })

  it('passes machine-checkable live smoke test gates while preserving manual signoffs', () => {
    const env: Record<string, string> = {
      PUBLIC_API_BASE_URL: 'https://local-growth.example',
      APP_ORIGIN: 'https://local-growth.example,https://admin.local-growth.example',
      DATABASE_URL: 'postgres://user:pass@db.example/local_growth',
      JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY----- test -----END PUBLIC KEY-----',
      JWT_ISSUER: 'https://auth.local-growth.example',
      JWT_AUDIENCE: 'local-growth-os',
      STRIPE_SECRET_KEY: 'sk_live_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      SERVE_STATIC_FRONTEND: 'true',
      NODE_ENV: 'production',
      WORKSPACE_ID: 'local-growth-os',
      ENABLE_PUBLIC_SELF_SERVE_CHECKOUT: 'false',
    }
    for (const plan of billingPlans) {
      env[plan.stripePriceEnv] = `price_${plan.id.replaceAll('-', '_')}`
    }

    const report = buildLaunchReadiness(env, '2026-06-11T00:00:00.000Z')
    const output = formatLaunchReadiness(report)

    expect(report.configReadyForLiveSmokeTest).toBe(true)
    expect(report.readyForBroadSelfServeLaunch).toBe(false)
    expect(report.checks.filter((item) => !item.ok && item.severity === 'advisory').map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'doctor:EMAIL_PROVIDER',
        'doctor:EMAIL_WEBHOOK_SECRET',
        'doctor:TWILIO',
        'doctor:GOOGLE_BUSINESS_PROFILE',
      ]),
    )
    expect(report.manualSignoffs.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        'Stripe Customer Portal, tax settings, invoice branding, live webhook, and event delivery are configured',
        'First paid pilot has a named operator, SLA, customer scope, and manual approval owner',
      ]),
    )
    expect(output).toContain('https://local-growth.example/api/billing/webhook')
    expect(output).toContain('do not call the product launched for revenue until live Stripe payment')
  })

  it('blocks scoped paid-pilot launch when public self-serve checkout is enabled', () => {
    const env: Record<string, string> = {
      PUBLIC_API_BASE_URL: 'https://local-growth.example',
      APP_ORIGIN: 'https://local-growth.example',
      DATABASE_URL: 'postgres://user:pass@db.example/local_growth',
      JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
      JWT_ISSUER: 'https://auth.local-growth.example',
      JWT_AUDIENCE: 'local-growth-os',
      STRIPE_SECRET_KEY: 'sk_live_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      NODE_ENV: 'production',
      ENABLE_PUBLIC_SELF_SERVE_CHECKOUT: 'true',
    }
    for (const plan of billingPlans) {
      env[plan.stripePriceEnv] = `price_${plan.id.replaceAll('-', '_')}`
    }

    const report = buildLaunchReadiness(env, '2026-06-11T00:00:00.000Z')

    expect(report.configReadyForLiveSmokeTest).toBe(false)
    expect(report.checks.find((item) => item.id === 'checkout:scoped-pilot-only')).toMatchObject({
      ok: false,
      severity: 'blocker',
    })
  })
})
