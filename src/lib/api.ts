import type {
  Lead,
  OnboardingRecord,
  OnboardingSubmission,
  PilotOutcome,
  ProductKey,
  PublicOnboardingRecord,
  PublicOnboardingSubmission,
  PublicRevenueRecoveryLink,
  PublicSalesCheckoutHandoff,
  RevenuePayment,
  RevenueCommandCenter,
  RevenueRecoveryLink,
  RevenueSummary,
  Review,
  SalesActivity,
  SalesCheckoutHandoff,
  SalesOutreachPack,
  SalesProspect,
  SalesSummary,
  SubscriptionRecord,
} from '../domain/types'

export type IntegrationStatus = {
  key: string
  label: string
  configured: boolean
  requiredForRevenue: boolean
  nextAction: string
}

export type BillingPlan = {
  id: string
  product: ProductKey
  name: string
  monthlyPrice: number
  setupFee: number
  includedLocations: number
  includedContacts: number
  promise: string
  stripePriceEnv: string
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:8787' : '')
type ApiTokenProvider = () => string | undefined | Promise<string | undefined>
let apiTokenProvider: ApiTokenProvider | undefined

export function setApiTokenProvider(provider: ApiTokenProvider | undefined) {
  apiTokenProvider = provider
}

async function authHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra)
  const token = await apiTokenProvider?.()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: await authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(payload.message || payload.error || `API request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'PATCH',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(payload.message || payload.error || `API request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function getIntegrationStatuses() {
  return fetchJson<{ integrations: IntegrationStatus[] }>('/api/integrations')
}

export async function getBillingPlans() {
  return fetchJson<{ plans: BillingPlan[] }>('/api/plans')
}

export async function getSubscriptions() {
  return fetchJson<{ subscriptions: SubscriptionRecord[] }>('/api/subscriptions')
}

export async function getRevenuePayments() {
  return fetchJson<{ payments: RevenuePayment[] }>('/api/revenue-payments')
}

export async function getRevenueSummary(input?: { since?: string; until?: string }) {
  const params = new URLSearchParams()
  if (input?.since) params.set('since', input.since)
  if (input?.until) params.set('until', input.until)
  const query = params.size ? `?${params.toString()}` : ''
  return fetchJson<{ summary: RevenueSummary }>(`/api/revenue-summary${query}`)
}

export async function getRevenueCommand() {
  return fetchJson<{ command: RevenueCommandCenter }>('/api/revenue-command')
}

export async function getOnboardingRecords() {
  return fetchJson<{ onboarding: OnboardingRecord[] }>('/api/onboarding')
}

export async function getOnboardingSubmissions() {
  return fetchJson<{ submissions: OnboardingSubmission[] }>('/api/onboarding/submissions')
}

export async function getPilotOutcomes() {
  return fetchJson<{ outcomes: PilotOutcome[] }>('/api/pilot-outcomes')
}

export async function getSalesProspects() {
  return fetchJson<{ prospects: SalesProspect[] }>('/api/sales-prospects')
}

export async function getSalesActivities(prospectId?: string) {
  const query = prospectId ? `?prospectId=${encodeURIComponent(prospectId)}` : ''
  return fetchJson<{ activities: SalesActivity[] }>(`/api/sales-activities${query}`)
}

export async function getSalesSummary(input?: { since?: string; until?: string }) {
  const params = new URLSearchParams()
  if (input?.since) params.set('since', input.since)
  if (input?.until) params.set('until', input.until)
  const query = params.size ? `?${params.toString()}` : ''
  return fetchJson<{ summary: SalesSummary }>(`/api/sales-summary${query}`)
}

export async function getRecoveryLinks() {
  return fetchJson<{ links: RevenueRecoveryLink[] }>('/api/recovery-links')
}

export async function createRecoveryLink(input: {
  sourceType: 'lead' | 'feedback_case'
  sourceId: string
  createdBy?: string
  summary?: string
  callToAction?: string
}) {
  return postJson<{ link: RevenueRecoveryLink; links: RevenueRecoveryLink[]; publicUrl: string }>('/api/recovery-links', input)
}

export async function getPublicRecoveryLink(token: string) {
  return fetchJson<{ link: PublicRevenueRecoveryLink }>(`/api/public/recovery-link/${encodeURIComponent(token)}`)
}

export async function respondToRecoveryLink(
  token: string,
  input: {
    action: 'approve' | 'request_revision' | 'schedule_callback' | 'decline'
    note?: string
    email?: string
  },
) {
  return postJson<{ link: PublicRevenueRecoveryLink }>(`/api/public/recovery-link/${encodeURIComponent(token)}/respond`, input)
}

export async function getPublicOnboardingRecord(token: string) {
  return fetchJson<{ record: PublicOnboardingRecord; submissions: PublicOnboardingSubmission[] }>(
    `/api/public/onboarding/${encodeURIComponent(token)}`,
  )
}

export async function updateOnboardingChecklistItem(recordId: string, itemKey: string, done: boolean) {
  return patchJson<{ onboarding: OnboardingRecord[]; record: OnboardingRecord }>(
    `/api/onboarding/${encodeURIComponent(recordId)}/checklist/${encodeURIComponent(itemKey)}`,
    { done },
  )
}

export async function updateOnboardingDelivery(
  recordId: string,
  input: {
    deliveryStatus: 'qa_approved' | 'sent' | 'blocked' | 'pack_ready'
    deliveryOwnerEmail?: string
    deliverySlaDueAt?: string
    deliveryQaApprovedBy?: string
    deliveryQaNotes?: string
    deliveryPackSentBy?: string
    deliveryPackSummary?: string
    renewalEvidenceSummary?: string
  },
) {
  return patchJson<{ onboarding: OnboardingRecord[]; record: OnboardingRecord }>(
    `/api/onboarding/${encodeURIComponent(recordId)}/delivery`,
    input,
  )
}

export async function updatePublicOnboardingChecklistItem(token: string, itemKey: string, done: boolean) {
  return patchJson<{ record: PublicOnboardingRecord; submissions: PublicOnboardingSubmission[] }>(
    `/api/public/onboarding/${encodeURIComponent(token)}/checklist/${encodeURIComponent(itemKey)}`,
    { done },
  )
}

export async function confirmPublicOnboardingDelivery(
  token: string,
  input: {
    response: 'accept' | 'request_revision' | 'schedule_call'
    confirmedByEmail: string
    note?: string
  },
) {
  return postJson<{ record: PublicOnboardingRecord; submissions: PublicOnboardingSubmission[] }>(
    `/api/public/onboarding/${encodeURIComponent(token)}/delivery-confirmation`,
    input,
  )
}

export async function submitPublicOnboardingMaterials(
  token: string,
  input: {
    submittedByEmail: string
    materialType: OnboardingSubmission['materialType']
    title: string
    body: string
  },
) {
  return postJson<{
    record: PublicOnboardingRecord
    submission: PublicOnboardingSubmission
    submissions: PublicOnboardingSubmission[]
  }>(
    `/api/public/onboarding/${encodeURIComponent(token)}/submissions`,
    input,
  )
}

export async function updateOnboardingSubmissionStatus(
  submissionId: string,
  status: OnboardingSubmission['status'],
) {
  return patchJson<{ submission: OnboardingSubmission; submissions: OnboardingSubmission[] }>(
    `/api/onboarding/submissions/${encodeURIComponent(submissionId)}`,
    { status },
  )
}

export async function previewOnboardingSubmissionImport(submissionId: string) {
  return postJson<{
    imported: number
    skipped: number
    errors: Array<{ row: number; error: string }>
    records: Array<Lead | Review>
    submission: OnboardingSubmission
    writable: boolean
  }>(`/api/onboarding/submissions/${encodeURIComponent(submissionId)}/preview`, {})
}

export async function importOnboardingSubmission(submissionId: string) {
  return postJson<{
    imported: number
    skipped: number
    errors: Array<{ row: number; error: string }>
    records: Array<Lead | Review>
    submission: OnboardingSubmission
    submissions: OnboardingSubmission[]
  }>(`/api/onboarding/submissions/${encodeURIComponent(submissionId)}/import`, {})
}

export async function generateOnboardingFirstPack(submissionId: string) {
  return postJson<{
    onboarding: OnboardingRecord[]
    record: OnboardingRecord
    submission: OnboardingSubmission
  }>(`/api/onboarding/submissions/${encodeURIComponent(submissionId)}/first-pack`, {})
}

export async function getOnboardingDeliveryPack(submissionId: string) {
  return fetchJson<{ filename: string; content: string }>(
    `/api/onboarding/submissions/${encodeURIComponent(submissionId)}/delivery-pack`,
  )
}

export async function createPilotOutcome(
  recordId: string,
  input: {
    outcomeType: PilotOutcome['outcomeType']
    outcomeValue: number
    evidence: string
    nextAction: string
    recordedBy: string
    occurredAt?: string
  },
) {
  return postJson<{ outcome: PilotOutcome; outcomes: PilotOutcome[] }>(
    `/api/onboarding/${encodeURIComponent(recordId)}/outcomes`,
    input,
  )
}

export async function importSalesProspectsCsv(csv: string) {
  return postJson<{
    imported: number
    skipped: number
    errors: Array<{ row: number; error: string }>
    prospects: SalesProspect[]
  }>('/api/import/prospects', { csv })
}

export async function updateSalesProspect(
  prospectId: string,
  input: {
    status?: SalesProspect['status']
    nextTouch?: SalesProspect['nextTouch']
    notes?: string
  },
) {
  return patchJson<{ prospect: SalesProspect; prospects: SalesProspect[] }>(
    `/api/sales-prospects/${encodeURIComponent(prospectId)}`,
    input,
  )
}

export async function createSalesActivity(
  prospectId: string,
  input: {
    channel: SalesActivity['channel']
    outcome: SalesActivity['outcome']
    summary: string
    nextStep: string
    ownerEmail?: string
    occurredAt?: string
  },
) {
  return postJson<{
    activity: SalesActivity
    activities: SalesActivity[]
    prospect: SalesProspect
    prospects: SalesProspect[]
  }>(`/api/sales-prospects/${encodeURIComponent(prospectId)}/activities`, input)
}

export async function getPublicCheckoutHandoff(token: string) {
  return fetchJson<{ handoff: PublicSalesCheckoutHandoff }>(`/api/public/checkout-handoff/${encodeURIComponent(token)}`)
}

export async function getSalesCheckoutHandoffs(prospectId: string) {
  return fetchJson<{ handoffs: SalesCheckoutHandoff[] }>(
    `/api/sales-prospects/${encodeURIComponent(prospectId)}/checkout-handoffs`,
  )
}

export async function createSalesCheckoutHandoff(
  prospectId: string,
  input: {
    planId?: string
    createdBy?: string
    scopeSummary?: string
  },
) {
  return postJson<{
    handoff: SalesCheckoutHandoff
    handoffs: SalesCheckoutHandoff[]
    activity: SalesActivity
    activities: SalesActivity[]
    prospect: SalesProspect
    prospects: SalesProspect[]
  }>(`/api/sales-prospects/${encodeURIComponent(prospectId)}/checkout-handoff`, input)
}

export async function getSalesCheckoutHandoffOrderForm(prospectId: string, handoffId?: string) {
  const query = handoffId ? `?handoffId=${encodeURIComponent(handoffId)}` : ''
  return fetchJson<{ filename: string; content: string; handoff: SalesCheckoutHandoff }>(
    `/api/sales-prospects/${encodeURIComponent(prospectId)}/checkout-handoff/order-form${query}`,
  )
}

export async function getSalesOutreachPack(prospectId: string) {
  return fetchJson<{ pack: SalesOutreachPack | null }>(
    `/api/sales-prospects/${encodeURIComponent(prospectId)}/outreach-pack`,
  )
}

export async function generateSalesOutreachPack(prospectId: string) {
  return postJson<{ pack: SalesOutreachPack; prospect: SalesProspect; prospects: SalesProspect[] }>(
    `/api/sales-prospects/${encodeURIComponent(prospectId)}/outreach-pack`,
    {},
  )
}

export async function getSalesOutreachPackDocument(prospectId: string, packId?: string) {
  const query = packId ? `?packId=${encodeURIComponent(packId)}` : ''
  return fetchJson<{ filename: string; content: string; pack: SalesOutreachPack }>(
    `/api/sales-prospects/${encodeURIComponent(prospectId)}/outreach-pack/download${query}`,
  )
}

export async function createCheckoutSession(input: {
  planId: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  businessName?: string
  businessWebsite?: string
  businessCity?: string
  businessState?: string
  industry?: string
  pilotScopeAccepted?: boolean
  humanReviewAccepted?: boolean
  termsAccepted?: boolean
  privacyAccepted?: boolean
  refundPolicyAccepted?: boolean
}) {
  return postJson<{ sessionId: string; url: string | null; plan: BillingPlan }>('/api/billing/checkout', input)
}

export async function createPublicCheckoutSession(input: {
  planId: string
  successUrl: string
  cancelUrl: string
  customerEmail: string
  businessName: string
  businessWebsite?: string
  businessCity?: string
  businessState?: string
  industry?: string
  pilotScopeAccepted: boolean
  humanReviewAccepted: boolean
  termsAccepted: boolean
  privacyAccepted: boolean
  refundPolicyAccepted: boolean
  checkoutHandoffToken?: string
}) {
  return postJson<{ sessionId: string; url: string | null; plan: BillingPlan }>('/api/public/checkout', input)
}

export async function createBillingPortalSession(input: {
  subscriptionId?: string
  customerId?: string
  returnUrl: string
}) {
  return postJson<{
    sessionId: string
    url: string
    subscriptionId: string
    stripeCustomerId: string
  }>('/api/billing/portal', input)
}
