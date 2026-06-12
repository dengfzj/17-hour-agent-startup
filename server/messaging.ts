import type { Customer, OutboundMessage } from '../src/domain/types'
import type { MessageRequest } from './compliance'

export type MessagingEnv = NodeJS.ProcessEnv

export type MessagingResult =
  | { ok: true; provider: OutboundMessage['provider']; providerMessageId: string }
  | { ok: false; status: number; error: string; missing?: string[] }

export type FetchLike = typeof fetch

export async function sendOutboundMessage(
  customer: Customer,
  request: MessageRequest,
  env: MessagingEnv = process.env,
  fetcher: FetchLike = fetch,
): Promise<MessagingResult> {
  if (request.channel === 'manual' || request.channel === 'phone') {
    return { ok: true, provider: 'manual', providerMessageId: `manual_${Date.now()}` }
  }

  if (request.channel === 'email') {
    if (env.POSTMARK_TOKEN) return sendPostmarkEmail(customer, request, env, fetcher)
    if (env.SENDGRID_API_KEY) return sendSendGridEmail(customer, request, env, fetcher)
    return { ok: false, status: 503, error: 'email_not_configured', missing: ['POSTMARK_TOKEN or SENDGRID_API_KEY'] }
  }

  if (request.channel === 'sms') {
    return sendTwilioSms(customer, request, env, fetcher)
  }

  return { ok: false, status: 400, error: 'unsupported_channel' }
}

async function sendPostmarkEmail(
  customer: Customer,
  request: MessageRequest,
  env: MessagingEnv,
  fetcher: FetchLike,
): Promise<MessagingResult> {
  const missing = ['POSTMARK_TOKEN', 'POSTMARK_FROM_EMAIL'].filter((key) => !env[key])
  if (missing.length) return { ok: false, status: 503, error: 'postmark_not_configured', missing }

  const response = await fetcher('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': env.POSTMARK_TOKEN!,
    },
    body: JSON.stringify({
      From: env.POSTMARK_FROM_EMAIL,
      To: customer.email,
      Subject: request.subject || 'A quick update',
      TextBody: request.body,
      MessageStream: env.POSTMARK_MESSAGE_STREAM || 'outbound',
    }),
  })
  const body = (await response.json().catch(() => ({}))) as { MessageID?: string; ErrorCode?: number; Message?: string }
  if (!response.ok) {
    return { ok: false, status: response.status, error: body.Message || 'postmark_send_failed' }
  }

  return { ok: true, provider: 'postmark', providerMessageId: body.MessageID || `postmark_${Date.now()}` }
}

async function sendSendGridEmail(
  customer: Customer,
  request: MessageRequest,
  env: MessagingEnv,
  fetcher: FetchLike,
): Promise<MessagingResult> {
  const missing = ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL'].filter((key) => !env[key])
  if (missing.length) return { ok: false, status: 503, error: 'sendgrid_not_configured', missing }

  const response = await fetcher('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: customer.email, name: customer.name }] }],
      from: { email: env.SENDGRID_FROM_EMAIL },
      subject: request.subject || 'A quick update',
      content: [{ type: 'text/plain', value: request.body }],
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return { ok: false, status: response.status, error: body || 'sendgrid_send_failed' }
  }

  return {
    ok: true,
    provider: 'sendgrid',
    providerMessageId: response.headers.get('x-message-id') || `sendgrid_${Date.now()}`,
  }
}

async function sendTwilioSms(
  customer: Customer,
  request: MessageRequest,
  env: MessagingEnv,
  fetcher: FetchLike,
): Promise<MessagingResult> {
  const missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID'].filter((key) => !env[key])
  if (missing.length) return { ok: false, status: 503, error: 'twilio_not_configured', missing }

  const body = new URLSearchParams({
    To: customer.phone,
    Body: request.body,
    MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID!,
  })
  const credentials = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')
  const response = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const payload = (await response.json().catch(() => ({}))) as { sid?: string; message?: string }
  if (!response.ok) {
    return { ok: false, status: response.status, error: payload.message || 'twilio_send_failed' }
  }

  return { ok: true, provider: 'twilio', providerMessageId: payload.sid || `twilio_${Date.now()}` }
}

export function buildOutboundMessageRecord(
  customer: Customer,
  request: MessageRequest,
  result: MessagingResult,
): OutboundMessage {
  const now = new Date().toISOString()
  return {
    id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    customerId: customer.id,
    channel: request.channel,
    purpose: request.purpose,
    subject: request.subject,
    body: request.body,
    provider: result.ok ? result.provider : undefined,
    providerMessageId: result.ok ? result.providerMessageId : undefined,
    status: result.ok ? (result.provider === 'manual' ? 'manual_required' : 'sent') : 'failed',
    failureReason: result.ok ? undefined : result.error,
    consentCheckedAt: now,
    createdAt: now,
  }
}
