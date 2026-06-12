export type IntegrationStatus = {
  key: string
  label: string
  configured: boolean
  requiredForRevenue: boolean
  nextAction: string
}

export function getIntegrationStatus(env = process.env): IntegrationStatus[] {
  return [
    {
      key: 'stripe',
      label: 'Stripe subscriptions and invoices',
      configured: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
      requiredForRevenue: true,
      nextAction: 'Create products for BidFlow and ReputeLoop, then set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
    },
    {
      key: 'email',
      label: 'Transactional email',
      configured: Boolean(
        env.EMAIL_WEBHOOK_SECRET && ((env.POSTMARK_TOKEN && env.POSTMARK_FROM_EMAIL) || (env.SENDGRID_API_KEY && env.SENDGRID_FROM_EMAIL)),
      ),
      requiredForRevenue: true,
      nextAction: 'Set provider credentials, verify the sending domain, and configure EMAIL_WEBHOOK_SECRET for unsubscribe webhooks.',
    },
    {
      key: 'sms',
      label: 'SMS follow-up and winback',
      configured: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_MESSAGING_SERVICE_SID),
      requiredForRevenue: true,
      nextAction: 'Set Twilio credentials and implement STOP/unsubscribe webhook handling before production sends.',
    },
    {
      key: 'google_business_profile',
      label: 'Google Business Profile reviews',
      configured: Boolean(env.GOOGLE_ACCESS_TOKEN && env.GOOGLE_ACCOUNT_ID && env.GOOGLE_LOCATION_ID),
      requiredForRevenue: false,
      nextAction: 'Create Google OAuth credentials, request Business Profile API access, then set GOOGLE_ACCESS_TOKEN, GOOGLE_ACCOUNT_ID, and GOOGLE_LOCATION_ID.',
    },
    {
      key: 'database',
      label: 'Production database',
      configured: Boolean(env.DATABASE_URL),
      requiredForRevenue: true,
      nextAction: 'Set DATABASE_URL for Postgres before onboarding real customers.',
    },
  ]
}
