import 'dotenv/config'

type SmokeCheck = {
  label: string
  path: string
  ok: boolean
  status?: number
  detail: string
}

function normalizeBaseUrl(input: string | undefined) {
  if (!input?.trim()) return undefined
  try {
    const parsed = new URL(input)
    return parsed.origin
  } catch {
    return undefined
  }
}

function isPublicHttps(baseUrl: string | undefined) {
  if (!baseUrl) return false
  const parsed = new URL(baseUrl)
  return parsed.protocol === 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1'
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { accept: 'text/html,application/json' } })
  return {
    status: response.status,
    text: await response.text(),
  }
}

export async function runLaunchSmoke(baseUrlInput = process.argv[2] || process.env.PUBLIC_API_BASE_URL) {
  const baseUrl = normalizeBaseUrl(baseUrlInput)
  const checks: SmokeCheck[] = []

  if (!isPublicHttps(baseUrl)) {
    return {
      baseUrl,
      ok: false,
      checks: [
        {
          label: 'Public HTTPS base URL',
          path: '/',
          ok: false,
          detail: 'Set PUBLIC_API_BASE_URL or pass a public HTTPS deployment URL, not localhost.',
        },
      ],
    }
  }

  const targets = [
    { label: 'API health', path: '/api/health', mustContain: '"ok":true' },
    { label: 'Pricing plans API', path: '/api/plans', mustContain: 'bidflow-growth' },
    { label: 'Public checkout page', path: '/buy', mustContain: 'Start a managed local growth pilot' },
    { label: 'Pilot terms page', path: '/legal/pilot-terms', mustContain: 'Managed Pilot Terms' },
    { label: 'Privacy page', path: '/legal/privacy', mustContain: 'Privacy and Consent' },
    { label: 'Refund policy page', path: '/legal/refunds', mustContain: 'Refund and Cancellation Policy' },
  ]

  for (const target of targets) {
    const url = `${baseUrl}${target.path}`
    try {
      const result = await fetchText(url)
      const compact = result.text.replace(/\s+/g, '')
      const expected = target.mustContain.replace(/\s+/g, '')
      checks.push({
        label: target.label,
        path: target.path,
        ok: result.status >= 200 && result.status < 300 && compact.includes(expected),
        status: result.status,
        detail:
          result.status >= 200 && result.status < 300
            ? `Expected deployed response to contain "${target.mustContain}".`
            : `Expected HTTP 2xx from ${url}.`,
      })
    } catch (error) {
      checks.push({
        label: target.label,
        path: target.path,
        ok: false,
        detail: error instanceof Error ? error.message : 'Request failed.',
      })
    }
  }

  return {
    baseUrl,
    ok: checks.every((check) => check.ok),
    checks,
  }
}

export function formatLaunchSmoke(result: Awaited<ReturnType<typeof runLaunchSmoke>>) {
  const lines: string[] = []
  lines.push('# Local Growth OS Launch Smoke Test')
  lines.push('')
  lines.push(`Base URL: ${result.baseUrl ?? 'missing'}`)
  lines.push(`Smoke passed: ${result.ok ? 'yes' : 'no'}`)
  lines.push('')
  for (const check of result.checks) {
    lines.push(`${check.ok ? 'OK' : 'FAIL'} ${check.label} ${check.status ? `(HTTP ${check.status})` : ''}`)
    lines.push(`  Path: ${check.path}`)
    if (!check.ok) lines.push(`  Detail: ${check.detail}`)
  }
  return lines.join('\n')
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/launchSmoke.ts')) {
  const result = await runLaunchSmoke()
  console.log(formatLaunchSmoke(result))
  if (!result.ok) {
    process.exitCode = 1
  }
}
