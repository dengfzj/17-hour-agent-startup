import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { requireTwilioSignature, validateTwilioSignature } from './twilioSignature'

function sign(url: string, params: Record<string, string>, token: string) {
  const payload =
    url.replace(/^http:\/\//, 'https://') +
    Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join('')
  return createHmac('sha1', token).update(payload).digest('base64')
}

describe('Twilio webhook signature validation', () => {
  it('validates signed form webhooks using the Twilio HMAC payload shape', () => {
    const params = { Body: 'STOP', From: '+15125550140' }
    const signature = sign('http://local-growth.example/api/webhooks/twilio/inbound', params, 'token')

    expect(
      validateTwilioSignature({
        url: 'http://local-growth.example/api/webhooks/twilio/inbound',
        params,
        signature,
        authToken: 'token',
      }),
    ).toBe(true)
    expect(
      validateTwilioSignature({
        url: 'http://local-growth.example/api/webhooks/twilio/inbound',
        params,
        signature: 'bad-signature',
        authToken: 'token',
      }),
    ).toBe(false)
  })

  it('requires signatures in production or when an auth token is configured', () => {
    expect(requireTwilioSignature({})).toBe(false)
    expect(requireTwilioSignature({ TWILIO_AUTH_TOKEN: 'token' })).toBe(true)
    expect(requireTwilioSignature({ NODE_ENV: 'production' })).toBe(true)
  })
})
