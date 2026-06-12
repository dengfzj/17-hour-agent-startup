import 'dotenv/config'
import { billingPlans } from './plans'
import { runProductionDoctor } from './productionDoctor'

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>

export type LaunchCheckSeverity = 'blocker' | 'advisory'

export type LaunchCheck = {
  id: string
  label: string
  ok: boolean
  severity: LaunchCheckSeverity
  detail: string
  fix: string
}

export type LaunchEndpoint = {
  label: string
  url: string
  owner: string
}

export type ManualSignoff = {
  label: string
  owner: string
  evidence: string
}

export type LaunchPhase = {
  name: string
  actions: string[]
  acceptance: string[]
}

export type LaunchReadinessReport = {
  generatedAt: string
  publicBaseUrl?: string
  configReadyForLiveSmokeTest: boolean
  readyForBroadSelfServeLaunch: false
  checks: LaunchCheck[]
  endpoints: LaunchEndpoint[]
  manualSignoffs: ManualSignoff[]
  phases: LaunchPhase[]
}

function envValue(env: Env, key: string) {
  return env[key]?.trim()
}

function hasEnv(env: Env, key: string) {
  return Boolean(envValue(env, key))
}

function parseUrl(value: string | undefined) {
  if (!value) return undefined
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function isProductionHttpsUrl(value: string | undefined) {
  const parsed = parseUrl(value)
  return Boolean(parsed && parsed.protocol === 'https:' && !isLocalHost(parsed.hostname))
}

function splitOrigins(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function originFor(value: string | undefined) {
  return parseUrl(value)?.origin
}

function appendPath(baseUrl: string | undefined, path: string) {
  if (!baseUrl) return `PUBLIC_API_BASE_URL${path}`
  const parsed = parseUrl(baseUrl)
  if (!parsed) return `${baseUrl.replace(/\/$/, '')}${path}`
  return new URL(path, parsed.origin).toString()
}

function check(
  id: string,
  label: string,
  ok: boolean,
  severity: LaunchCheckSeverity,
  detail: string,
  fix: string,
): LaunchCheck {
  return { id, label, ok, severity, detail, fix }
}

function buildBlockingChecks(env: Env): LaunchCheck[] {
  const publicBaseUrl = envValue(env, 'PUBLIC_API_BASE_URL')
  const publicOrigin = originFor(publicBaseUrl)
  const origins = splitOrigins(envValue(env, 'APP_ORIGIN')).map(originFor).filter(Boolean)
  const priceIds = billingPlans.map((plan) => envValue(env, plan.stripePriceEnv))
  const publicSelfServeCheckoutEnabled = envValue(env, 'ENABLE_PUBLIC_SELF_SERVE_CHECKOUT') === 'true'

  return [
    ...runProductionDoctor(env).map((item) =>
      check(`doctor:${item.key}`, item.key, item.ok, item.severity, item.message, item.message),
    ),
    check(
      'url:public-api-live-https',
      'PUBLIC_API_BASE_URL is a public HTTPS origin',
      isProductionHttpsUrl(publicBaseUrl),
      'blocker',
      'Live Checkout, Stripe webhooks, provider webhooks, and customer onboarding links must point to a public HTTPS deployment.',
      'Set PUBLIC_API_BASE_URL to the deployed Render/Vercel/etc origin, for example https://local-growth-os.onrender.com.',
    ),
    check(
      'url:app-origin-includes-public-origin',
      'APP_ORIGIN includes the deployed public origin',
      Boolean(publicOrigin && origins.includes(publicOrigin)),
      'blocker',
      'Checkout and billing portal return URLs are rejected unless their origin is allowlisted.',
      'Add the exact deployed origin to APP_ORIGIN, comma-separated if you also keep local development origins.',
    ),
    check(
      'billing:stripe-live-secret',
      'Stripe secret key is live mode',
      envValue(env, 'STRIPE_SECRET_KEY')?.startsWith('sk_live_') ?? false,
      'blocker',
      'A real paid pilot must use a live Stripe key. Test-mode Checkout cannot prove customer payment.',
      'Set STRIPE_SECRET_KEY to a live-mode sk_live_ key only in production.',
    ),
    check(
      'billing:stripe-price-shape',
      'Every Stripe plan variable contains a Price ID',
      priceIds.every((priceId) => priceId?.startsWith('price_')),
      'blocker',
      `The public /buy flow exposes BidFlow and ReputeLoop plans that must map to Stripe recurring Price IDs.`,
      `Run npm run stripe:bootstrap with the live Stripe key and set ${billingPlans.map((plan) => plan.stripePriceEnv).join(', ')}.`,
    ),
    check(
      'auth:issuer-audience',
      'Production JWT issuer and audience are pinned',
      hasEnv(env, 'JWT_PUBLIC_KEY') && hasEnv(env, 'JWT_ISSUER') && hasEnv(env, 'JWT_AUDIENCE'),
      'blocker',
      'Bearer JWT verification should pin issuer and audience before operators use live billing and customer data.',
      'Configure JWT_PUBLIC_KEY, JWT_ISSUER, and JWT_AUDIENCE from the hosted auth provider.',
    ),
    check(
      'checkout:scoped-pilot-only',
      'Public self-serve checkout is disabled for scoped pilot launch',
      !publicSelfServeCheckoutEnabled,
      'blocker',
      'The first real-money launch should use prospect-specific checkout handoffs after a written scope, not broad public self-serve checkout.',
      'Keep ENABLE_PUBLIC_SELF_SERVE_CHECKOUT=false or unset until manual signoffs and real pilot evidence support broad self-serve.',
    ),
  ]
}

function buildAdvisoryChecks(env: Env): LaunchCheck[] {
  return [
    check(
      'runtime:serve-static',
      'Single-service frontend serving is enabled',
      envValue(env, 'SERVE_STATIC_FRONTEND') !== 'false',
      'advisory',
      'The Render Blueprint expects one Node service to serve both the API and the built React frontend.',
      'Keep SERVE_STATIC_FRONTEND=true or unset for the Render single-service deployment.',
    ),
    check(
      'runtime:workspace-id',
      'Workspace ID is explicit',
      hasEnv(env, 'WORKSPACE_ID'),
      'advisory',
      'Workspace metadata is used in Stripe and audit records. An explicit ID makes launch records easier to trace.',
      'Set WORKSPACE_ID=local-growth-os or a customer/operator-specific value.',
    ),
  ]
}

function buildEndpoints(publicBaseUrl: string | undefined): LaunchEndpoint[] {
  return [
    { label: 'Public checkout', url: appendPath(publicBaseUrl, '/buy'), owner: 'Sales' },
    { label: 'API health check', url: appendPath(publicBaseUrl, '/api/health'), owner: 'Engineering' },
    { label: 'Stripe webhook', url: appendPath(publicBaseUrl, '/api/billing/webhook'), owner: 'Billing' },
    { label: 'Email unsubscribe webhook', url: appendPath(publicBaseUrl, '/api/webhooks/email/unsubscribe'), owner: 'Messaging' },
    { label: 'Twilio inbound webhook', url: appendPath(publicBaseUrl, '/api/webhooks/twilio/inbound'), owner: 'Messaging' },
    { label: 'Google review import route', url: appendPath(publicBaseUrl, '/api/google/reviews/import'), owner: 'Operations' },
    { label: 'Customer onboarding link pattern', url: appendPath(publicBaseUrl, '/onboarding/<customerAccessToken>'), owner: 'Operations' },
  ]
}

function buildManualSignoffs(): ManualSignoff[] {
  return [
    {
      label: 'Render or equivalent deployment is live and /api/health returns ok from the public internet',
      owner: 'Engineering',
      evidence: 'Saved deploy URL, build log, and health-check response.',
    },
    {
      label: 'Production Postgres migration, backups, and restore path are verified',
      owner: 'Engineering',
      evidence: 'Migration applied for db/migrations/001_workspace_jsonb.sql and backup policy documented.',
    },
    {
      label: 'Stripe Customer Portal, tax settings, invoice branding, live webhook, and event delivery are configured',
      owner: 'Finance',
      evidence: 'Stripe Dashboard screenshots or links for portal, webhook endpoint, and successful live checkout event.',
    },
    {
      label: 'Terms, privacy policy, refund policy, and consent language are approved before sending /buy broadly',
      owner: 'Founder',
      evidence: 'Published policy URLs and checkout/onboarding copy review.',
    },
    {
      label: 'Email sender domain, unsubscribe route, SMS sender, STOP/START handling, and consent source are verified',
      owner: 'Messaging',
      evidence: 'Provider dashboards plus one internal email and SMS consent test.',
    },
    {
      label: 'Google Business Profile OAuth/location access is approved for any customer where live review import/reply is promised',
      owner: 'Operations',
      evidence: 'Account ID, location ID, token refresh plan, and a non-destructive import test.',
    },
    {
      label: 'First paid pilot has a named operator, SLA, customer scope, and manual approval owner',
      owner: 'Operations',
      evidence: 'Customer record with owner, plan, promised deliverables, and first-pack approval timestamp.',
    },
  ]
}

function buildPhases(publicBaseUrl: string | undefined): LaunchPhase[] {
  return [
    {
      name: '1. Preflight the repository',
      actions: ['npm ci', 'npm run lint', 'npm test', 'npm run build'],
      acceptance: ['All quality gates pass on the same commit that will be deployed.'],
    },
    {
      name: '2. Deploy the single-service app',
      actions: ['Push the repo to the Git host.', 'Apply render.yaml or equivalent platform config.', 'Set PUBLIC_API_BASE_URL and APP_ORIGIN to the deployed HTTPS origin.'],
      acceptance: [`${appendPath(publicBaseUrl, '/api/health')} returns { "ok": true } from a browser or curl outside the host.`],
    },
    {
      name: '3. Configure auth, database, and revenue variables',
      actions: [
        'Attach managed Postgres and verify the workspace table exists.',
        'Set JWT_PUBLIC_KEY, JWT_ISSUER, and JWT_AUDIENCE.',
        'Run npm run stripe:bootstrap with the live Stripe key and paste the printed STRIPE_PRICE_* values into production.',
        'Run npm run doctor:production and npm run launch:readiness in the production shell.',
      ],
      acceptance: ['doctor:production has no missing blockers, and launch:readiness reports config ready for live smoke test.'],
    },
    {
      name: '4. Wire external webhooks',
      actions: [
        `Set the Stripe webhook endpoint to ${appendPath(publicBaseUrl, '/api/billing/webhook')}.`,
        `Set provider unsubscribe/inbound routes to ${appendPath(publicBaseUrl, '/api/webhooks/email/unsubscribe')} and ${appendPath(publicBaseUrl, '/api/webhooks/twilio/inbound')}.`,
        'Send one internal provider test and confirm consent/audit records update correctly.',
      ],
      acceptance: ['Stripe event delivery succeeds, email unsubscribe works, and Twilio STOP/START changes consent state.'],
    },
    {
      name: '5. Close the first paid pilot',
      actions: [
        `Send ${appendPath(publicBaseUrl, '/buy')} only to a qualified buyer with a written BidFlow or ReputeLoop pilot scope.`,
        'After Checkout, confirm /api/onboarding contains the paid onboarding record created by the Stripe webhook.',
        'Send the private /onboarding/<customerAccessToken> link to collect lead CSV, review CSV, or setup notes.',
      ],
      acceptance: ['The customer paid in live Stripe, the onboarding record exists, and submitted materials are visible in the operator queue.'],
    },
    {
      name: '6. Deliver the first money proof',
      actions: [
        'Preview the customer submission and import only if there are no row errors.',
        'Generate the first delivery pack from the imported lead or review.',
        'Download the Markdown delivery pack and send it only after human review.',
        'Record won job, recovered customer, approved review reply, or hours saved as the pilot outcome.',
      ],
      acceptance: ['At least one approved revenue/recovery pack is delivered and the business outcome is logged for renewal or case-study follow-up.'],
    },
  ]
}

export function buildLaunchReadiness(env: Env = process.env, generatedAt = new Date().toISOString()): LaunchReadinessReport {
  const publicBaseUrl = envValue(env, 'PUBLIC_API_BASE_URL')
  const checks = [...buildBlockingChecks(env), ...buildAdvisoryChecks(env)]
  const hasBlockers = checks.some((item) => item.severity === 'blocker' && !item.ok)

  return {
    generatedAt,
    publicBaseUrl,
    configReadyForLiveSmokeTest: !hasBlockers,
    readyForBroadSelfServeLaunch: false,
    checks,
    endpoints: buildEndpoints(publicBaseUrl),
    manualSignoffs: buildManualSignoffs(),
    phases: buildPhases(publicBaseUrl),
  }
}

function statusFor(checkItem: LaunchCheck) {
  if (checkItem.ok) return 'OK'
  return checkItem.severity === 'blocker' ? 'BLOCKED' : 'REVIEW'
}

export function formatLaunchReadiness(report: LaunchReadinessReport) {
  const lines: string[] = []
  lines.push('# Local Growth OS Launch Readiness')
  lines.push('')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push(`Config ready for live smoke test: ${report.configReadyForLiveSmokeTest ? 'yes' : 'no'}`)
  lines.push('Ready for broad self-serve launch: no - manual signoffs and real pilot evidence are still required.')
  lines.push('')
  lines.push('## Checks')
  for (const checkItem of report.checks) {
    lines.push(`${statusFor(checkItem)} ${checkItem.label}`)
    lines.push(`  Detail: ${checkItem.detail}`)
    if (!checkItem.ok) lines.push(`  Fix: ${checkItem.fix}`)
  }
  lines.push('')
  lines.push('## Live URLs to Configure')
  for (const endpoint of report.endpoints) {
    lines.push(`- ${endpoint.label} (${endpoint.owner}): ${endpoint.url}`)
  }
  lines.push('')
  lines.push('## Manual Signoffs')
  for (const signoff of report.manualSignoffs) {
    lines.push(`- ${signoff.label}`)
    lines.push(`  Owner: ${signoff.owner}`)
    lines.push(`  Evidence: ${signoff.evidence}`)
  }
  lines.push('')
  lines.push('## Runbook')
  for (const phase of report.phases) {
    lines.push(`### ${phase.name}`)
    lines.push('Actions:')
    for (const action of phase.actions) lines.push(`- ${action}`)
    lines.push('Acceptance:')
    for (const item of phase.acceptance) lines.push(`- ${item}`)
  }
  lines.push('')
  lines.push('Outcome rule: do not call the product launched for revenue until live Stripe payment, webhook-created onboarding, operator-reviewed import, and first delivery-pack acceptance have all happened for a real customer.')
  return lines.join('\n')
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/launchReadiness.ts')) {
  const report = buildLaunchReadiness()
  console.log(formatLaunchReadiness(report))
  if (!report.configReadyForLiveSmokeTest) {
    process.exitCode = 1
  }
}
