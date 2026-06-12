import 'dotenv/config'
import { billingPlans } from './plans'

type Check = {
  key: string
  ok: boolean
  severity: 'blocker' | 'advisory'
  message: string
}

function hasEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string) {
  return Boolean(env[key]?.trim())
}

function parseUrl(value: string | undefined) {
  if (!value) return false
  try {
    return new URL(value)
  } catch {
    return false
  }
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function validProductionUrl(value: string | undefined) {
  const parsed = parseUrl(value)
  return Boolean(parsed && parsed.protocol === 'https:' && !isLocalHost(parsed.hostname))
}

function allowedOrigins(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function originFor(value: string | undefined) {
  const parsed = parseUrl(value)
  return parsed ? parsed.origin : undefined
}

function validPostgresUrl(value: string | undefined) {
  if (!value?.trim()) return false
  return value.startsWith('postgres://') || value.startsWith('postgresql://')
}

function validPublicKey(value: string | undefined) {
  const normalized = value?.replace(/\\n/g, '\n') ?? ''
  return normalized.includes('-----BEGIN PUBLIC KEY-----') && normalized.includes('-----END PUBLIC KEY-----')
}

function envFlag(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string) {
  return env[key]?.trim().toLowerCase() === 'true'
}

export function runProductionDoctor(env = process.env): Check[] {
  const origins = allowedOrigins(env.APP_ORIGIN)
  const publicOrigin = originFor(env.PUBLIC_API_BASE_URL)
  const stripePrices = billingPlans.map((plan) => plan.stripePriceEnv)
  const requireEmail = envFlag(env, 'REQUIRE_EMAIL_PROVIDER')
  const requireTwilio = envFlag(env, 'REQUIRE_TWILIO')
  const requireGoogleBusinessProfile = envFlag(env, 'REQUIRE_GOOGLE_BUSINESS_PROFILE')
  return [
    {
      key: 'NODE_ENV',
      ok: env.NODE_ENV === 'production',
      severity: 'blocker',
      message: 'Set NODE_ENV=production so production auth, webhook, and runtime safety gates are active.',
    },
    {
      key: 'PUBLIC_API_BASE_URL',
      ok: validProductionUrl(env.PUBLIC_API_BASE_URL),
      severity: 'blocker',
      message: 'Set the deployed public HTTPS app URL, not localhost, used for Stripe and provider webhooks.',
    },
    {
      key: 'APP_ORIGIN',
      ok: Boolean(publicOrigin && origins.includes(publicOrigin) && origins.every(validProductionUrl)),
      severity: 'blocker',
      message: 'Set public HTTPS allowed frontend origins and include PUBLIC_API_BASE_URL origin; checkout and portal redirects are rejected outside this list.',
    },
    {
      key: 'DATABASE_URL',
      ok: validPostgresUrl(env.DATABASE_URL),
      severity: 'blocker',
      message: 'Use managed Postgres before onboarding real customers.',
    },
    {
      key: 'JWT_PUBLIC_KEY',
      ok: validPublicKey(env.JWT_PUBLIC_KEY),
      severity: 'blocker',
      message: 'Configure a PEM SPKI production JWT public key; header-derived roles are development-only.',
    },
    {
      key: 'JWT_ISSUER',
      ok: hasEnv(env, 'JWT_ISSUER'),
      severity: 'blocker',
      message: 'Pin the production JWT issuer from the hosted auth provider.',
    },
    {
      key: 'JWT_AUDIENCE',
      ok: hasEnv(env, 'JWT_AUDIENCE'),
      severity: 'blocker',
      message: 'Pin the production JWT audience expected by Local Growth OS.',
    },
    {
      key: 'STRIPE_SECRET_KEY',
      ok: env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ?? false,
      severity: 'blocker',
      message: 'Use a live-mode Stripe secret key for real Checkout and Customer Portal sessions.',
    },
    {
      key: 'STRIPE_WEBHOOK_SECRET',
      ok: env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') ?? false,
      severity: 'blocker',
      message: 'Required to verify payment/subscription webhooks before fulfillment.',
    },
    {
      key: 'STRIPE_PRICE_*',
      ok: stripePrices.every((key) => env[key]?.startsWith('price_')),
      severity: 'blocker',
      message: `Set all plan price IDs: ${stripePrices.join(', ')}.`,
    },
    {
      key: 'EMAIL_PROVIDER',
      ok:
        (hasEnv(env, 'POSTMARK_TOKEN') && hasEnv(env, 'POSTMARK_FROM_EMAIL')) ||
        (hasEnv(env, 'SENDGRID_API_KEY') && hasEnv(env, 'SENDGRID_FROM_EMAIL')),
      severity: requireEmail ? 'blocker' : 'advisory',
      message: requireEmail
        ? 'Configure Postmark or SendGrid before promised automated customer email.'
        : 'Configure Postmark or SendGrid before automated customer email; scoped paid pilots may use manual email until this is ready.',
    },
    {
      key: 'EMAIL_WEBHOOK_SECRET',
      ok: hasEnv(env, 'EMAIL_WEBHOOK_SECRET'),
      severity: requireEmail ? 'blocker' : 'advisory',
      message: requireEmail
        ? 'Set a shared secret for email unsubscribe webhooks before promised automated customer email.'
        : 'Set a shared secret for email unsubscribe webhooks before automated email; manual concierge pilots can proceed without email automation.',
    },
    {
      key: 'TWILIO',
      ok: hasEnv(env, 'TWILIO_ACCOUNT_SID') && hasEnv(env, 'TWILIO_AUTH_TOKEN') && hasEnv(env, 'TWILIO_MESSAGING_SERVICE_SID'),
      severity: requireTwilio ? 'blocker' : 'advisory',
      message: requireTwilio
        ? 'Configure Twilio before promised automated SMS follow-up.'
        : 'Configure Twilio before automated SMS follow-up; scoped paid pilots may use manual calls/email until this is ready.',
    },
    {
      key: 'GOOGLE_BUSINESS_PROFILE',
      ok: hasEnv(env, 'GOOGLE_ACCESS_TOKEN') && hasEnv(env, 'GOOGLE_ACCOUNT_ID') && hasEnv(env, 'GOOGLE_LOCATION_ID'),
      severity: requireGoogleBusinessProfile ? 'blocker' : 'advisory',
      message: requireGoogleBusinessProfile
        ? 'Configure Google Business Profile before promising live review import/reply posting.'
        : 'Configure Google Business Profile before live review import/reply posting; scoped pilots can start with customer-supplied review CSV.',
    },
  ]
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/productionDoctor.ts')) {
  const checks = runProductionDoctor()
  for (const check of checks) {
    const status = check.ok ? 'OK' : check.severity === 'blocker' ? 'MISSING' : 'REVIEW'
    console.log(`${status} ${check.key} - ${check.message}`)
  }

  if (checks.some((check) => check.severity === 'blocker' && !check.ok)) {
    process.exitCode = 1
  }
}
