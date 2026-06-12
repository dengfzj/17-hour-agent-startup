import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatLaunchSmoke, runLaunchSmoke } from './launchSmoke'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('launch smoke test', () => {
  it('requires a public HTTPS deployment URL', async () => {
    const result = await runLaunchSmoke('http://localhost:8787')

    expect(result.ok).toBe(false)
    expect(result.checks[0]).toMatchObject({
      label: 'Public HTTPS base URL',
      ok: false,
    })
  })

  it('passes when deployed public routes and APIs return expected content', async () => {
    const calls: string[] = []
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      const body = url.endsWith('/api/health')
        ? '{"ok":true}'
        : url.endsWith('/api/plans')
          ? '{"plans":[{"id":"bidflow-growth"}]}'
          : url.endsWith('/buy')
            ? '<h2>Start a managed local growth pilot</h2>'
            : url.endsWith('/legal/pilot-terms')
              ? '<h2>Managed Pilot Terms</h2>'
              : url.endsWith('/legal/privacy')
                ? '<h2>Privacy and Consent</h2>'
                : '<h2>Refund and Cancellation Policy</h2>'
      return new Response(body, { status: 200 })
    }) as typeof fetch

    const result = await runLaunchSmoke('https://local-growth.example')

    expect(result.ok).toBe(true)
    expect(result.checks).toHaveLength(6)
    expect(calls).toContain('https://local-growth.example/api/health')
    expect(formatLaunchSmoke(result)).toContain('Smoke passed: yes')
  })

  it('fails when a deployed route is reachable but missing expected content', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<h2>Wrong app</h2>', { status: 200 })) as typeof fetch

    const result = await runLaunchSmoke('https://local-growth.example')

    expect(result.ok).toBe(false)
    expect(result.checks.some((check) => !check.ok)).toBe(true)
  })
})
