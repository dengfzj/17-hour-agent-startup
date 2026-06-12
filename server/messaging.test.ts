import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import { buildOutboundMessageRecord, sendOutboundMessage } from './messaging'

const maria = seedData.customers.find((customer) => customer.id === 'cust_maria')!

describe('messaging adapters', () => {
  it('fails closed when email provider is not configured', async () => {
    const result = await sendOutboundMessage(
      maria,
      { customerId: maria.id, channel: 'email', body: 'Hello', purpose: 'follow_up' },
      {},
      fakeFetch({ ok: true }),
    )

    expect(result).toMatchObject({ ok: false, status: 503, error: 'email_not_configured' })
  })

  it('sends email through Postmark when configured', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const result = await sendOutboundMessage(
      maria,
      { customerId: maria.id, channel: 'email', subject: 'Quote', body: 'Your quote is ready.', purpose: 'follow_up' },
      { POSTMARK_TOKEN: 'pm_test', POSTMARK_FROM_EMAIL: 'ops@example.com' },
      fakeFetch({ ok: true, json: { MessageID: 'postmark-id' }, calls }),
    )

    expect(result).toMatchObject({ ok: true, provider: 'postmark', providerMessageId: 'postmark-id' })
    expect(calls[0].url).toBe('https://api.postmarkapp.com/email')
    expect(calls[0].init?.headers).toMatchObject({ 'X-Postmark-Server-Token': 'pm_test' })
  })

  it('sends email through SendGrid when Postmark is absent', async () => {
    const result = await sendOutboundMessage(
      maria,
      { customerId: maria.id, channel: 'email', subject: 'Quote', body: 'Your quote is ready.', purpose: 'follow_up' },
      { SENDGRID_API_KEY: 'sg_test', SENDGRID_FROM_EMAIL: 'ops@example.com' },
      fakeFetch({ ok: true, headers: { 'x-message-id': 'sendgrid-id' } }),
    )

    expect(result).toMatchObject({ ok: true, provider: 'sendgrid', providerMessageId: 'sendgrid-id' })
  })

  it('sends SMS through Twilio when configured', async () => {
    const result = await sendOutboundMessage(
      maria,
      { customerId: maria.id, channel: 'sms', body: 'Checking in.', purpose: 'follow_up' },
      {
        TWILIO_ACCOUNT_SID: 'AC123',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_MESSAGING_SERVICE_SID: 'MG123',
      },
      fakeFetch({ ok: true, json: { sid: 'SM123' } }),
    )

    expect(result).toMatchObject({ ok: true, provider: 'twilio', providerMessageId: 'SM123' })
  })

  it('builds auditable outbound message records', () => {
    const record = buildOutboundMessageRecord(
      maria,
      { customerId: maria.id, channel: 'email', body: 'Hello', purpose: 'follow_up' },
      { ok: true, provider: 'postmark', providerMessageId: 'postmark-id' },
    )

    expect(record).toMatchObject({
      customerId: maria.id,
      channel: 'email',
      status: 'sent',
      providerMessageId: 'postmark-id',
    })
    expect(record.consentCheckedAt).toBeTruthy()
  })
})

function fakeFetch({
  ok,
  json,
  headers,
  calls = [],
}: {
  ok: boolean
  json?: unknown
  headers?: Record<string, string>
  calls?: Array<{ url: string; init?: RequestInit }>
}): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => json ?? {},
      text: async () => '',
      headers: {
        get: (name: string) => headers?.[name.toLowerCase()] ?? null,
      },
    } as Response
  }) as typeof fetch
}
