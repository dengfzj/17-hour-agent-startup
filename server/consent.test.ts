import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import { applyEmailUnsubscribe, applySmsInboundConsent } from './consent'

describe('consent inbound handlers', () => {
  it('removes email consent and records an event', () => {
    const result = applyEmailUnsubscribe(seedData, { email: 'maria@example.com', source: 'postmark' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const customer = result.workspace.customers.find((item) => item.id === 'cust_maria')
    expect(customer?.consentEmail).toBe(false)
    expect(result.workspace.consentEvents[0]).toMatchObject({
      customerId: 'cust_maria',
      channel: 'email',
      action: 'unsubscribe',
      source: 'postmark',
    })
  })

  it('handles Twilio STOP and START consent commands', () => {
    const stopped = applySmsInboundConsent(seedData, { from: '+1 512 555 0140', body: 'STOP', source: 'twilio' })
    expect(stopped.ok).toBe(true)
    if (!stopped.ok) return
    expect(stopped.workspace.customers.find((item) => item.id === 'cust_maria')?.consentSms).toBe(false)

    const started = applySmsInboundConsent(stopped.workspace, { from: '+15125550140', body: 'START', source: 'twilio' })
    expect(started.ok).toBe(true)
    if (!started.ok) return
    expect(started.workspace.customers.find((item) => item.id === 'cust_maria')?.consentSms).toBe(true)
    expect(started.workspace.consentEvents[0]).toMatchObject({ action: 'resubscribe', channel: 'sms' })
  })

  it('ignores non-consent SMS messages', () => {
    const result = applySmsInboundConsent(seedData, { from: '+1 512 555 0140', body: 'What time?', source: 'twilio' })

    expect(result).toMatchObject({ ok: false, error: 'non_consent_message' })
  })
})
