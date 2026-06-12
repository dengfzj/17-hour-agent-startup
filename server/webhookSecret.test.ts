import { describe, expect, it } from 'vitest'
import { requireEmailWebhookSecret, validateSharedWebhookSecret } from './webhookSecret'

describe('shared webhook secret validation', () => {
  it('validates matching shared webhook secrets using exact byte comparison', () => {
    expect(validateSharedWebhookSecret({ expected: 'secret', received: 'secret' })).toBe(true)
    expect(validateSharedWebhookSecret({ expected: 'secret', received: 'different' })).toBe(false)
    expect(validateSharedWebhookSecret({ expected: 'secret' })).toBe(false)
  })

  it('requires email webhook secrets in production or when explicitly configured', () => {
    expect(requireEmailWebhookSecret({})).toBe(false)
    expect(requireEmailWebhookSecret({ EMAIL_WEBHOOK_SECRET: 'secret' })).toBe(true)
    expect(requireEmailWebhookSecret({ NODE_ENV: 'production' })).toBe(true)
  })
})
