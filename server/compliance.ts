import type { Channel, Customer } from '../src/domain/types'

export type MessageRequest = {
  customerId: string
  channel: Channel
  subject?: string
  body: string
  purpose: 'follow_up' | 'review_request' | 'winback' | 'repeat_purchase'
}

export function validateMessageConsent(customer: Customer | undefined, request: MessageRequest) {
  if (!customer) {
    return { allowed: false, reason: 'customer_not_found' }
  }

  if (!request.body || request.body.trim().length < 3) {
    return { allowed: false, reason: 'message_body_required' }
  }

  if (request.channel === 'sms' && !customer.consentSms) {
    return { allowed: false, reason: 'sms_consent_missing' }
  }

  if (request.channel === 'email' && !customer.consentEmail) {
    return { allowed: false, reason: 'email_consent_missing' }
  }

  if (request.channel === 'manual' || request.channel === 'phone') {
    return { allowed: true, reason: 'manual_or_phone_channel' }
  }

  return { allowed: true, reason: 'consent_valid' }
}
