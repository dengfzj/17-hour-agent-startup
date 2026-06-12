import type { Review } from '../src/domain/types'

export type GoogleBusinessEnv = NodeJS.ProcessEnv
export type FetchLike = typeof fetch

type GoogleReview = {
  name: string
  reviewer?: { displayName?: string }
  starRating?: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'
  comment?: string
  createTime?: string
  updateTime?: string
  reviewReply?: { comment?: string; updateTime?: string }
}

type GoogleReviewsResponse = {
  reviews?: GoogleReview[]
  nextPageToken?: string
}

const ratingMap: Record<NonNullable<GoogleReview['starRating']>, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
}

export function getGoogleBusinessReadiness(env: GoogleBusinessEnv = process.env) {
  const missing = ['GOOGLE_ACCESS_TOKEN', 'GOOGLE_ACCOUNT_ID', 'GOOGLE_LOCATION_ID'].filter((key) => !env[key])
  return { configured: missing.length === 0, missing }
}

export async function importGoogleReviews(env: GoogleBusinessEnv = process.env, fetcher: FetchLike = fetch) {
  const readiness = getGoogleBusinessReadiness(env)
  if (!readiness.configured) {
    return { ok: false as const, status: 503, error: 'google_business_not_configured', missing: readiness.missing }
  }

  const url = `https://mybusiness.googleapis.com/v4/accounts/${env.GOOGLE_ACCOUNT_ID}/locations/${env.GOOGLE_LOCATION_ID}/reviews`
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${env.GOOGLE_ACCESS_TOKEN}` },
  })
  const payload = (await response.json().catch(() => ({}))) as GoogleReviewsResponse & { error?: { message?: string } }
  if (!response.ok) {
    return { ok: false as const, status: response.status, error: payload.error?.message || 'google_reviews_import_failed' }
  }

  return {
    ok: true as const,
    reviews: (payload.reviews ?? []).map(mapGoogleReview),
    nextPageToken: payload.nextPageToken,
  }
}

export async function replyToGoogleReview(
  reviewName: string,
  comment: string,
  env: GoogleBusinessEnv = process.env,
  fetcher: FetchLike = fetch,
) {
  const readiness = getGoogleBusinessReadiness(env)
  if (!readiness.configured) {
    return { ok: false as const, status: 503, error: 'google_business_not_configured', missing: readiness.missing }
  }

  if (!reviewName || !comment.trim()) {
    return { ok: false as const, status: 400, error: 'review_name_and_comment_required' }
  }

  const url = `https://mybusiness.googleapis.com/v4/${reviewName}/reply`
  const response = await fetcher(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GOOGLE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment }),
  })
  const payload = (await response.json().catch(() => ({}))) as { updateTime?: string; error?: { message?: string } }
  if (!response.ok) {
    return { ok: false as const, status: response.status, error: payload.error?.message || 'google_review_reply_failed' }
  }

  return { ok: true as const, updateTime: payload.updateTime }
}

function mapGoogleReview(review: GoogleReview): Omit<Review, 'id' | 'customerId' | 'sentimentScore' | 'riskScore' | 'status'> & {
  externalReviewId: string
} {
  return {
    externalReviewId: review.name,
    platform: 'google',
    rating: review.starRating ? ratingMap[review.starRating] : 3,
    body: review.comment || '',
    reviewerName: review.reviewer?.displayName || 'Google reviewer',
    reviewedAt: review.updateTime || review.createTime || new Date().toISOString(),
  }
}
