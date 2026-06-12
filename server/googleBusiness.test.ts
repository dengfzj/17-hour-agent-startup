import { describe, expect, it } from 'vitest'
import { getGoogleBusinessReadiness, importGoogleReviews, replyToGoogleReview } from './googleBusiness'

const configuredEnv = {
  GOOGLE_ACCESS_TOKEN: 'ya29.test',
  GOOGLE_ACCOUNT_ID: 'accounts/123'.replace('accounts/', ''),
  GOOGLE_LOCATION_ID: 'locations/456'.replace('locations/', ''),
} as NodeJS.ProcessEnv

describe('Google Business Profile adapter', () => {
  it('reports missing OAuth and profile configuration', () => {
    expect(getGoogleBusinessReadiness({} as NodeJS.ProcessEnv)).toEqual({
      configured: false,
      missing: ['GOOGLE_ACCESS_TOKEN', 'GOOGLE_ACCOUNT_ID', 'GOOGLE_LOCATION_ID'],
    })
  })

  it('imports and normalizes Google reviews', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const result = await importGoogleReviews(
      configuredEnv,
      fakeFetch({
        ok: true,
        json: {
          reviews: [
            {
              name: 'accounts/123/locations/456/reviews/rev_a',
              reviewer: { displayName: 'Avery Chen' },
              starRating: 'TWO',
              comment: 'The appointment was missed and nobody followed up.',
              updateTime: '2026-06-09T10:00:00Z',
            },
          ],
          nextPageToken: 'next-token',
        },
        calls,
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      nextPageToken: 'next-token',
      reviews: [
        {
          externalReviewId: 'accounts/123/locations/456/reviews/rev_a',
          platform: 'google',
          rating: 2,
          reviewerName: 'Avery Chen',
        },
      ],
    })
    expect(calls[0].url).toBe('https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews')
    expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer ya29.test' })
  })

  it('posts review replies to the Google reply endpoint', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const result = await replyToGoogleReview(
      'accounts/123/locations/456/reviews/rev_a',
      'Thank you for the feedback. We are contacting you today.',
      configuredEnv,
      fakeFetch({ ok: true, json: { updateTime: '2026-06-10T01:00:00Z' }, calls }),
    )

    expect(result).toEqual({ ok: true, updateTime: '2026-06-10T01:00:00Z' })
    expect(calls[0].url).toBe('https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews/rev_a/reply')
    expect(calls[0].init).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ comment: 'Thank you for the feedback. We are contacting you today.' }),
    })
  })
})

function fakeFetch({
  ok,
  json,
  calls = [],
}: {
  ok: boolean
  json?: unknown
  calls?: Array<{ url: string; init?: RequestInit }>
}): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => json ?? {},
    } as Response
  }) as typeof fetch
}
