import { describe, expect, it } from 'vitest'
import { billingPlans } from './plans'
import { runProductionDoctor } from './productionDoctor'

describe('production readiness doctor', () => {
  it('reports missing production revenue configuration', () => {
    const checks = runProductionDoctor({})

    expect(checks.filter((check) => !check.ok).map((check) => check.key)).toEqual(
      expect.arrayContaining([
        'NODE_ENV',
        'PUBLIC_API_BASE_URL',
        'APP_ORIGIN',
        'DATABASE_URL',
        'JWT_PUBLIC_KEY',
        'JWT_ISSUER',
        'JWT_AUDIENCE',
        'STRIPE_SECRET_KEY',
      ]),
    )
  })

  it('passes scoped paid-pilot blockers when core production revenue variables are configured', () => {
    const env: Record<string, string> = {
      PUBLIC_API_BASE_URL: 'https://local-growth.example',
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://local-growth.example',
      DATABASE_URL: 'postgres://user:pass@db.example/local_growth',
      JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
      JWT_ISSUER: 'https://auth.local-growth.example',
      JWT_AUDIENCE: 'local-growth-os',
      STRIPE_SECRET_KEY: 'sk_live_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    }
    for (const plan of billingPlans) {
      env[plan.stripePriceEnv] = `price_${plan.id}`
    }

    const checks = runProductionDoctor(env)

    expect(checks.filter((check) => check.severity === 'blocker').every((check) => check.ok)).toBe(true)
    expect(checks.filter((check) => !check.ok).map((check) => check.key)).toEqual(
      expect.arrayContaining(['EMAIL_PROVIDER', 'EMAIL_WEBHOOK_SECRET', 'TWILIO', 'GOOGLE_BUSINESS_PROFILE']),
    )
    expect(checks.filter((check) => !check.ok).every((check) => check.severity === 'advisory')).toBe(true)
  })

  it('promotes provider checks to blockers when those channels are required', () => {
    const env: Record<string, string> = {
      PUBLIC_API_BASE_URL: 'https://local-growth.example',
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://local-growth.example',
      DATABASE_URL: 'postgres://user:pass@db.example/local_growth',
      JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
      JWT_ISSUER: 'https://auth.local-growth.example',
      JWT_AUDIENCE: 'local-growth-os',
      STRIPE_SECRET_KEY: 'sk_live_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      REQUIRE_EMAIL_PROVIDER: 'true',
      REQUIRE_TWILIO: 'true',
      REQUIRE_GOOGLE_BUSINESS_PROFILE: 'true',
    }
    for (const plan of billingPlans) {
      env[plan.stripePriceEnv] = `price_${plan.id}`
    }

    const failingBlockers = runProductionDoctor(env)
      .filter((check) => check.severity === 'blocker' && !check.ok)
      .map((check) => check.key)

    expect(failingBlockers).toEqual(
      expect.arrayContaining(['EMAIL_PROVIDER', 'EMAIL_WEBHOOK_SECRET', 'TWILIO', 'GOOGLE_BUSINESS_PROFILE']),
    )
  })

  it('rejects local, test-mode, or mismatched production shapes', () => {
    const env: Record<string, string> = {
      PUBLIC_API_BASE_URL: 'http://localhost:8787',
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://different.example',
      DATABASE_URL: 'sqlite://local',
      JWT_PUBLIC_KEY: 'not-a-public-key',
      JWT_ISSUER: 'https://auth.local-growth.example',
      JWT_AUDIENCE: 'local-growth-os',
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'secret',
      POSTMARK_TOKEN: 'postmark',
      POSTMARK_FROM_EMAIL: 'ops@example.com',
      EMAIL_WEBHOOK_SECRET: 'email-webhook-secret',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'twilio',
      TWILIO_MESSAGING_SERVICE_SID: 'MG123',
      GOOGLE_ACCESS_TOKEN: 'google',
      GOOGLE_ACCOUNT_ID: 'accounts/123',
      GOOGLE_LOCATION_ID: 'locations/456',
    }
    for (const plan of billingPlans) {
      env[plan.stripePriceEnv] = `lookup_${plan.id}`
    }

    const failingKeys = runProductionDoctor(env)
      .filter((check) => !check.ok)
      .map((check) => check.key)

    expect(failingKeys).toEqual(
      expect.arrayContaining([
        'PUBLIC_API_BASE_URL',
        'APP_ORIGIN',
        'DATABASE_URL',
        'JWT_PUBLIC_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'STRIPE_PRICE_*',
      ]),
    )
  })
})
