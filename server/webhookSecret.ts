import { timingSafeEqual } from 'node:crypto'

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>

export function requireEmailWebhookSecret(env: Env = process.env) {
  return env.NODE_ENV === 'production' || Boolean(env.EMAIL_WEBHOOK_SECRET?.trim())
}

export function validateSharedWebhookSecret(input: { expected?: string; received?: string }) {
  const expected = input.expected?.trim()
  const received = input.received?.trim()
  if (!expected || !received) return false
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)
}
