import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBillingPlans, getRevenueCommand, setApiTokenProvider } from './api'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  setApiTokenProvider(undefined)
  vi.restoreAllMocks()
})

describe('API client auth token provider', () => {
  it('adds a bearer token to API reads when a production auth provider is registered', async () => {
    const calls: Array<{ url: string; authorization?: string | null }> = []
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      calls.push({ url: String(input), authorization: headers.get('authorization') })
      return new Response(
        JSON.stringify({
          command: {
            generatedAt: '2026-06-11T00:00:00.000Z',
            focus: 'Close payment.',
            northStar: {
              paidPilots: 0,
              setupRevenueCents: 0,
              mrrCents: 0,
              grossCollectedCents: 0,
              openCheckoutCount: 0,
              deliveryAtRiskCount: 0,
              customerActionCount: 0,
              renewalEvidenceCount: 0,
            },
            actions: [],
            blockers: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch
    setApiTokenProvider(() => 'jwt-test-token')

    await getRevenueCommand()

    expect(calls).toEqual([{ url: 'http://localhost:8787/api/revenue-command', authorization: 'Bearer jwt-test-token' }])
  })

  it('keeps public catalog reads working without a registered token provider', async () => {
    globalThis.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.has('authorization')).toBe(false)
      return new Response(JSON.stringify({ plans: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch

    await getBillingPlans()
  })
})
