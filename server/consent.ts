import type { ConsentEvent, Customer, WorkspaceData } from '../src/domain/types'

export type EmailUnsubscribeRequest = {
  email: string
  source: 'postmark' | 'sendgrid' | 'manual'
  rawValue?: string
}

export type SmsInboundRequest = {
  from: string
  body: string
  source: 'twilio' | 'manual'
}

const stopWords = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])
const startWords = new Set(['START', 'YES', 'UNSTOP'])

export function applyEmailUnsubscribe(workspace: WorkspaceData, request: EmailUnsubscribeRequest) {
  const customer = findByEmail(workspace.customers, request.email)
  if (!customer) return { ok: false as const, error: 'customer_not_found' }

  return {
    ok: true as const,
    workspace: writeConsentEvent(
      {
        ...workspace,
        customers: workspace.customers.map((item) =>
          item.id === customer.id ? { ...item, consentEmail: false, lastInteractionAt: new Date().toISOString() } : item,
        ),
      },
      customer.id,
      'email',
      'unsubscribe',
      request.source,
      request.rawValue ?? request.email,
    ),
    customerId: customer.id,
  }
}

export function applySmsInboundConsent(workspace: WorkspaceData, request: SmsInboundRequest) {
  const customer = findByPhone(workspace.customers, request.from)
  if (!customer) return { ok: false as const, error: 'customer_not_found' }

  const normalizedBody = request.body.trim().toUpperCase()
  const action = stopWords.has(normalizedBody) ? 'unsubscribe' : startWords.has(normalizedBody) ? 'resubscribe' : undefined
  if (!action) return { ok: false as const, error: 'non_consent_message' }

  const consentSms = action === 'resubscribe'
  return {
    ok: true as const,
    workspace: writeConsentEvent(
      {
        ...workspace,
        customers: workspace.customers.map((item) =>
          item.id === customer.id ? { ...item, consentSms, lastInteractionAt: new Date().toISOString() } : item,
        ),
      },
      customer.id,
      'sms',
      action,
      request.source,
      request.body,
    ),
    customerId: customer.id,
    action,
  }
}

function writeConsentEvent(
  workspace: WorkspaceData,
  customerId: string,
  channel: ConsentEvent['channel'],
  action: ConsentEvent['action'],
  source: ConsentEvent['source'],
  rawValue?: string,
) {
  const event: ConsentEvent = {
    id: `consent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    customerId,
    channel,
    action,
    source,
    rawValue,
    createdAt: new Date().toISOString(),
  }

  return {
    ...workspace,
    consentEvents: [event, ...workspace.consentEvents],
  }
}

function findByEmail(customers: Customer[], email: string) {
  return customers.find((customer) => customer.email.toLowerCase() === email.trim().toLowerCase())
}

function findByPhone(customers: Customer[], phone: string) {
  const normalized = normalizePhone(phone)
  return customers.find((customer) => normalizePhone(customer.phone) === normalized)
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}
