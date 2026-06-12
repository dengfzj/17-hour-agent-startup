import { createHmac, timingSafeEqual } from 'node:crypto'

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>

function normalizeUrl(url: string) {
  return url.replace(/^http:\/\//, 'https://')
}

export function validateTwilioSignature(input: {
  url: string
  params: Record<string, string | string[] | undefined>
  signature?: string
  authToken?: string
}) {
  const { authToken, signature } = input
  if (!authToken || !signature) return false
  const payload =
    normalizeUrl(input.url) +
    Object.keys(input.params)
      .sort()
      .map((key) => `${key}${Array.isArray(input.params[key]) ? input.params[key]?.[0] ?? '' : input.params[key] ?? ''}`)
      .join('')
  const expected = createHmac('sha1', authToken).update(payload).digest('base64')
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer)
}

export function requireTwilioSignature(env: Env = process.env) {
  return env.NODE_ENV === 'production' || Boolean(env.TWILIO_AUTH_TOKEN?.trim())
}
