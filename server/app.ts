import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import {
  analyzeReview,
  buildEstimate,
  buildFeedbackCase,
  generateFollowUps,
  generateProposal,
  generateRecoveryOffer,
  generateReviewResponse,
  generateSalesOutreachPack,
  recommendProspectProduct,
  scoreLead,
} from '../src/domain/engines'
import {
  renderCheckoutHandoffOrderFormDocument,
  renderProposalDocument,
  renderRecoveryDocument,
  renderSalesOutreachDocument,
} from '../src/domain/documents'
import type {
  AuditLog,
  FeedbackCase,
  Lead,
  OnboardingRecord,
  OnboardingSubmission,
  PilotOutcome,
  PublicOnboardingRecord,
  PublicOnboardingSubmission,
  PublicRevenueRecoveryLink,
  RevenueCommandCenter,
  RevenuePayment,
  RevenueRecoveryLink,
  RevenueSummary,
  Review,
  SalesActivity,
  SalesCheckoutHandoff,
  SalesProspect,
  SalesSummary,
  WorkspaceData,
} from '../src/domain/types'
import { assertOrganizationScope, attachPrincipal, missingProductionJwtConfig, requirePermission } from './auth'
import {
  applyStripeSubscriptionEvent,
  createCheckoutSession as defaultCreateCheckoutSession,
  createCustomerPortalSession as defaultCreateCustomerPortalSession,
  verifyStripeWebhook as defaultVerifyStripeWebhook,
} from './billing'
import { validateMessageConsent, type MessageRequest } from './compliance'
import { applyEmailUnsubscribe, applySmsInboundConsent } from './consent'
import {
  importGoogleReviews as defaultImportGoogleReviews,
  replyToGoogleReview as defaultReplyToGoogleReview,
} from './googleBusiness'
import { importLeadsCsv, importProspectsCsv, importReviewsCsv, type ImportResult } from './importers'
import { getIntegrationStatus } from './integrations'
import { buildOutboundMessageRecord, sendOutboundMessage } from './messaging'
import { billingPlans, findBillingPlan } from './plans'
import { createWorkspaceRepository, type WorkspaceRepository } from './storage'
import { requireTwilioSignature, validateTwilioSignature } from './twilioSignature'
import { requireEmailWebhookSecret, validateSharedWebhookSecret } from './webhookSecret'

const makeAudit = (action: string, entityType: string, entityId: string, summary: string): AuditLog => ({
  id: `audit_${Date.now().toString(36)}`,
  actor: 'API',
  action,
  entityType,
  entityId,
  summary,
  createdAt: new Date().toISOString(),
})

const requireApiKey: express.RequestHandler = (request, response, next) => {
  const expected = process.env.LOCAL_GROWTH_API_KEY
  if (!expected) {
    next()
    return
  }

  if (request.header('x-api-key') !== expected) {
    response.status(401).json({ error: 'unauthorized', message: 'Missing or invalid API key.' })
    return
  }

  next()
}

const requireProductionRuntimeConfig: express.RequestHandler = (_request, response, next) => {
  if (process.env.NODE_ENV !== 'production') {
    next()
    return
  }

  const missing = [
    ...missingProductionJwtConfig(),
    ...(process.env.APP_ORIGIN?.trim() ? [] : ['APP_ORIGIN']),
    ...(process.env.LOCAL_GROWTH_ALLOW_HEADER_AUTH === 'true' ? ['LOCAL_GROWTH_ALLOW_HEADER_AUTH'] : []),
  ]
  if (missing.length > 0) {
    response.status(503).json({
      error: 'production_runtime_not_configured',
      message: 'Production API access requires pinned CORS origins and JWT auth; header-derived identity is disabled.',
      missing,
    })
    return
  }

  next()
}

function saveWithAudit(workspace: WorkspaceData, audit: AuditLog) {
  const nextWorkspace = {
    ...workspace,
    auditLogs: [audit, ...workspace.auditLogs],
  }
  return nextWorkspace
}

type ApiMutationFailure = { ok: false; status: number; error: string }
type EmailUnsubscribeWebhookResult = ApiMutationFailure | { ok: true; customerId: string }
type SmsInboundWebhookResult = ApiMutationFailure | { ok: true; customerId: string; action: string }
type PublicOnboardingUpdateResult = ApiMutationFailure | {
  ok: true
  record: PublicOnboardingRecord
  submissions: PublicOnboardingSubmission[]
}
type PublicOnboardingSubmissionResult = ApiMutationFailure | {
  ok: true
  record: PublicOnboardingRecord
  submission: PublicOnboardingSubmission
  submissions: PublicOnboardingSubmission[]
}
type PublicRecoveryLinkResult = ApiMutationFailure | { ok: true; link: PublicRevenueRecoveryLink }
type PublicCheckoutHandoffLookupResult =
  | ApiMutationFailure
  | {
      ok: true
      workspace: WorkspaceData
      handoff?: SalesCheckoutHandoff
      existingSession?: { sessionId: string; url: string }
    }
type PublicCheckoutHandoffSessionResult =
  | ApiMutationFailure
  | {
      ok: true
      sessionId: string
      url: string
      handoff?: SalesCheckoutHandoff
      reusedExisting: boolean
    }
type SalesCheckoutHandoffResult =
  | (ApiMutationFailure & { handoff?: SalesCheckoutHandoff })
  | {
      ok: true
      handoff: SalesCheckoutHandoff
      handoffs: SalesCheckoutHandoff[]
      activity: SalesActivity
      activities: SalesActivity[]
      prospect: SalesProspect
      prospects: SalesProspect[]
      workspace: WorkspaceData
    }
type RevenueRecoveryLinkCreateResult =
  | ApiMutationFailure
  | { ok: true; link: RevenueRecoveryLink; links: RevenueRecoveryLink[]; workspace: WorkspaceData }
type OnboardingSubmissionImportResult =
  | (ApiMutationFailure & Partial<Pick<ImportResult<Lead | Review>, 'imported' | 'skipped' | 'errors' | 'records'>>)
  | {
      ok: true
      imported: number
      skipped: number
      errors: ImportResult<Lead | Review>['errors']
      records: Array<Lead | Review>
      submission: OnboardingSubmission
      submissions: OnboardingSubmission[]
      workspace: WorkspaceData
    }
type OnboardingFirstPackResult =
  | ApiMutationFailure
  | {
      ok: true
      onboarding: OnboardingRecord[]
      record: OnboardingRecord
      submission: OnboardingSubmission
      workspace: WorkspaceData
      firstPack: unknown
    }
type PilotOutcomeMutationResult =
  | ApiMutationFailure
  | { ok: true; outcome: PilotOutcome; outcomes: PilotOutcome[]; workspace: WorkspaceData }
type OnboardingRecordMutationResult =
  | ApiMutationFailure
  | { ok: true; record: OnboardingRecord; onboarding: OnboardingRecord[]; workspace: WorkspaceData }
type SalesProspectImportResult = {
  imported: number
  skipped: number
  errors: ImportResult<SalesProspect>['errors']
  prospects: SalesProspect[]
  workspace: WorkspaceData
}
type SalesProspectMutationResult =
  | ApiMutationFailure
  | { ok: true; prospect: SalesProspect; prospects: SalesProspect[]; workspace: WorkspaceData }
type SalesActivityMutationResult =
  | ApiMutationFailure
  | {
      ok: true
      activity: SalesActivity
      activities: SalesActivity[]
      prospect: SalesProspect
      prospects: SalesProspect[]
      workspace: WorkspaceData
    }
type SalesOutreachPackMutationResult =
  | ApiMutationFailure
  | {
      ok: true
      pack: ReturnType<typeof generateSalesOutreachPack>
      prospect: SalesProspect
      prospects: SalesProspect[]
      workspace: WorkspaceData
    }
type OnboardingSubmissionStatusResult =
  | ApiMutationFailure
  | { ok: true; submission: OnboardingSubmission; submissions: OnboardingSubmission[]; workspace: WorkspaceData }
type GenericImportResult<TRecord> = {
  imported: number
  skipped: number
  errors: ImportResult<TRecord>['errors']
  records: TRecord[]
  workspace: WorkspaceData
}
type WorkspaceGenerationResult = ApiMutationFailure | { ok: true; workspace: WorkspaceData }
type GoogleReviewsImportMutationResult = {
  imported: number
  nextPageToken?: string
  reviews: Review[]
  workspace: WorkspaceData
}
type GoogleReviewReplyMutationResult = ApiMutationFailure | { ok: true; reviewId: string; responseId?: string; updateTime?: string }
type MessageSendLogResult = { outboundMessage: ReturnType<typeof buildOutboundMessageRecord> }

function addDaysIso(reference: string, days: number) {
  const date = new Date(reference)
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function defaultDeliveryStatus(record: Pick<OnboardingRecord, 'status' | 'checklist'>): OnboardingRecord['deliveryStatus'] {
  if (record.checklist.some((item) => ['first_revenue_pack_sent', 'first_response_pack_approved'].includes(item.key) && item.done)) {
    return 'pack_ready'
  }
  if (record.checklist.some((item) => item.key === 'customer_materials_submitted' && item.done)) return 'materials_waiting'
  return record.status === 'ready_for_pilot' ? 'pack_ready' : 'not_started'
}

function normalizeOnboardingRecord(record: OnboardingRecord): OnboardingRecord {
  const reference = record.createdAt || new Date().toISOString()
  return {
    ...record,
    deliveryOwnerEmail: record.deliveryOwnerEmail || record.ownerEmail,
    deliverySlaDueAt: record.deliverySlaDueAt || addDaysIso(reference, 14),
    deliveryStatus: record.deliveryStatus || defaultDeliveryStatus(record),
  }
}

function normalizeOnboardingRecords(onboarding: OnboardingRecord[]) {
  return onboarding.map(normalizeOnboardingRecord)
}

function normalizeOnboardingWorkspace(workspace: WorkspaceData): WorkspaceData {
  return {
    ...workspace,
    onboarding: normalizeOnboardingRecords(workspace.onboarding),
  }
}

function deriveOnboardingStatus(checklist: OnboardingRecord['checklist']): OnboardingRecord['status'] {
  if (checklist.length > 0 && checklist.every((item) => item.done)) return 'ready_for_pilot'
  if (checklist.some((item) => item.key === 'customer_materials_submitted' && item.done)) return 'materials_submitted'
  if (checklist.some((item) => item.key === 'customer_data_imported' && item.done)) return 'data_imported'
  if (checklist.some((item) => item.key === 'workspace_activated' && item.done)) return 'workspace_activated'
  if (checklist.some((item) => item.key === 'payment_received' && item.done)) return 'paid'
  return 'checkout_started'
}

function updateOnboardingChecklist(
  workspace: WorkspaceData,
  recordId: string,
  itemKey: string,
  done: boolean,
  now = new Date().toISOString(),
) {
  const record = workspace.onboarding.find((item) => item.id === recordId)
  if (!record) return { ok: false as const, error: 'onboarding_record_not_found' }
  if (!record.checklist.some((item) => item.key === itemKey)) {
    return { ok: false as const, error: 'onboarding_checklist_item_not_found' }
  }

  const checklist = record.checklist.map((item) => (item.key === itemKey ? { ...item, done } : item))
  const nextRecord = {
    ...normalizeOnboardingRecord(record),
    checklist,
    status: deriveOnboardingStatus(checklist),
    updatedAt: now,
  }

  return {
    ok: true as const,
    record: nextRecord,
    workspace: {
      ...workspace,
      onboarding: workspace.onboarding.map((item) => (item.id === recordId ? nextRecord : item)),
    },
  }
}

function toPublicOnboardingRecord(record: OnboardingRecord): PublicOnboardingRecord {
  const normalized = normalizeOnboardingRecord(record)
  return {
    id: normalized.id,
    businessName: normalized.businessName,
    businessWebsite: normalized.businessWebsite,
    businessCity: normalized.businessCity,
    businessState: normalized.businessState,
    industry: normalized.industry,
    ownerEmail: normalized.ownerEmail,
    product: normalized.product,
    planId: normalized.planId,
    status: normalized.status,
    deliveryOwnerEmail: normalized.deliveryOwnerEmail,
    deliverySlaDueAt: normalized.deliverySlaDueAt,
    deliveryStatus: normalized.deliveryStatus,
    deliveryQaApprovedAt: normalized.deliveryQaApprovedAt,
    deliveryQaApprovedBy: normalized.deliveryQaApprovedBy,
    deliveryQaNotes: normalized.deliveryQaNotes,
    deliveryPackSentAt: normalized.deliveryPackSentAt,
    deliveryPackSentBy: normalized.deliveryPackSentBy,
    deliveryPackSummary: normalized.deliveryPackSummary,
    customerDeliveryResponse: normalized.customerDeliveryResponse,
    customerConfirmedAt: normalized.customerConfirmedAt,
    customerConfirmedByEmail: normalized.customerConfirmedByEmail,
    customerConfirmationNote: normalized.customerConfirmationNote,
    renewalEvidenceSummary: normalized.renewalEvidenceSummary,
    checklist: normalized.checklist,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  }
}

function toPublicOnboardingSubmission(submission: OnboardingSubmission): PublicOnboardingSubmission {
  return {
    id: submission.id,
    onboardingId: submission.onboardingId,
    submittedByEmail: submission.submittedByEmail,
    materialType: submission.materialType,
    title: submission.title,
    status: submission.status,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  }
}

function getPublicOnboardingSubmissions(workspace: WorkspaceData, recordId: string) {
  return workspace.onboardingSubmissions
    .filter((submission) => submission.onboardingId === recordId)
    .map(toPublicOnboardingSubmission)
}

const customerEditableOnboardingKeys = new Set([
  'customer_materials_submitted',
  'customer_data_imported',
])

const onboardingMaterialTypes = new Set<OnboardingSubmission['materialType']>(['lead_csv', 'review_csv', 'general_notes'])
const onboardingSubmissionStatuses = new Set<OnboardingSubmission['status']>(['submitted', 'reviewed', 'imported', 'rejected'])
const salesProspectStatusValues: SalesProspect['status'][] = [
  'new',
  'qualified',
  'contacted',
  'call_booked',
  'scope_sent',
  'checkout_sent',
  'won',
  'lost',
  'disqualified',
]
const salesProspectStatuses = new Set<SalesProspect['status']>(salesProspectStatusValues)
const salesProspectTouches = new Set<SalesProspect['nextTouch']>(['email', 'call', 'linkedin', 'partner', 'hold'])
const salesActivityChannels = new Set<SalesActivity['channel']>(['email', 'call', 'linkedin', 'partner', 'manual'])
const salesActivityOutcomes = new Set<SalesActivity['outcome']>([
  'sent',
  'left_voicemail',
  'replied',
  'call_booked',
  'scope_sent',
  'checkout_sent',
  'won',
  'lost',
  'no_response',
])
const pilotOutcomeTypes = new Set<PilotOutcome['outcomeType']>([
  'won_job',
  'revived_quote',
  'approved_review_reply',
  'recovered_customer',
  'repeat_booking',
  'hours_saved',
  'other',
])
const publicTokenRateBuckets = new Map<string, { count: number; resetAt: number }>()

function positiveNumberEnv(keys: string[], fallback: number) {
  for (const key of keys) {
    const value = Number(process.env[key])
    if (Number.isFinite(value) && value > 0) return value
  }
  return fallback
}

function createPublicTokenRateLimit(error: string, bucketPrefix: string): express.RequestHandler {
  return (request, response, next) => {
    const token = String(request.params.token ?? 'unknown')
    const key = `${bucketPrefix}:${request.ip}:${token}`
    const now = Date.now()
    const publicTokenRateWindowMs = positiveNumberEnv(['PUBLIC_TOKEN_RATE_WINDOW_MS', 'PUBLIC_ONBOARDING_RATE_WINDOW_MS'], 60_000)
    const publicTokenRateMax = positiveNumberEnv(['PUBLIC_TOKEN_RATE_MAX', 'PUBLIC_ONBOARDING_RATE_MAX'], 20)
    const current = publicTokenRateBuckets.get(key)
    const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + publicTokenRateWindowMs }
    bucket.count += 1
    publicTokenRateBuckets.set(key, bucket)

    if (bucket.count > publicTokenRateMax) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      response.setHeader('retry-after', String(retryAfterSeconds))
      response.status(429).json({ error, retryAfterSeconds })
      return
    }

    next()
  }
}

const rateLimitPublicOnboarding = createPublicTokenRateLimit('public_onboarding_rate_limited', 'onboarding')
const rateLimitPublicCheckoutHandoff = createPublicTokenRateLimit('public_checkout_handoff_rate_limited', 'checkout_handoff')
const rateLimitPublicRecoveryLink = createPublicTokenRateLimit('public_recovery_link_rate_limited', 'recovery_link')

function parseOnboardingSubmissionBody(body: unknown) {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    submittedByEmail: typeof payload.submittedByEmail === 'string' ? payload.submittedByEmail.trim().toLowerCase() : '',
    materialType: typeof payload.materialType === 'string' ? payload.materialType.trim() : '',
    title: typeof payload.title === 'string' ? payload.title.trim() : '',
    body: typeof payload.body === 'string' ? payload.body.trim() : '',
  }
}

function validateOnboardingSubmission(input: ReturnType<typeof parseOnboardingSubmissionBody>) {
  if (!input.submittedByEmail || !input.title || !input.body) return 'onboarding_submission_required_fields_missing'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.submittedByEmail)) return 'onboarding_submission_email_invalid'
  if (!onboardingMaterialTypes.has(input.materialType as OnboardingSubmission['materialType'])) {
    return 'onboarding_submission_material_type_invalid'
  }
  if (input.title.length > 120) return 'onboarding_submission_title_too_large'
  if (input.body.length > 20000) return 'onboarding_submission_body_too_large'
  return undefined
}

function parseDeliveryEvidenceBody(body: unknown) {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    deliveryOwnerEmail: typeof payload.deliveryOwnerEmail === 'string' ? payload.deliveryOwnerEmail.trim().toLowerCase() : '',
    deliveryPackSentBy: typeof payload.deliveryPackSentBy === 'string' ? payload.deliveryPackSentBy.trim().toLowerCase() : '',
    deliveryPackSummary: typeof payload.deliveryPackSummary === 'string' ? payload.deliveryPackSummary.trim() : '',
    deliveryQaApprovedBy: typeof payload.deliveryQaApprovedBy === 'string' ? payload.deliveryQaApprovedBy.trim().toLowerCase() : '',
    deliveryQaNotes: typeof payload.deliveryQaNotes === 'string' ? payload.deliveryQaNotes.trim() : '',
    renewalEvidenceSummary: typeof payload.renewalEvidenceSummary === 'string' ? payload.renewalEvidenceSummary.trim() : '',
    deliverySlaDueAt: typeof payload.deliverySlaDueAt === 'string' ? payload.deliverySlaDueAt.trim() : '',
    deliveryStatus:
      typeof payload.deliveryStatus === 'string'
        ? payload.deliveryStatus.trim().toLowerCase().replace(/\s+/g, '_')
        : '',
  }
}

function validateDeliveryEvidenceInput(input: ReturnType<typeof parseDeliveryEvidenceBody>) {
  if (input.deliveryOwnerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.deliveryOwnerEmail)) {
    return 'delivery_owner_email_invalid'
  }
  if (input.deliveryPackSentBy && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.deliveryPackSentBy)) {
    return 'delivery_sent_by_email_invalid'
  }
  if (input.deliveryQaApprovedBy && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.deliveryQaApprovedBy)) {
    return 'delivery_qa_approved_by_email_invalid'
  }
  if (input.deliveryStatus === 'qa_approved' && !input.deliveryQaApprovedBy) return 'delivery_qa_approved_by_required'
  if (input.deliveryStatus === 'sent' && input.deliveryPackSummary.length < 8) return 'delivery_pack_summary_required'
  if (input.deliveryPackSummary.length > 1000) return 'delivery_pack_summary_too_large'
  if (input.deliveryQaNotes.length > 1000) return 'delivery_qa_notes_too_large'
  if (input.renewalEvidenceSummary.length > 1000) return 'delivery_renewal_evidence_too_large'
  if (input.deliverySlaDueAt && Number.isNaN(new Date(input.deliverySlaDueAt).getTime())) return 'delivery_sla_due_at_invalid'
  if (
    input.deliveryStatus &&
    !new Set<OnboardingRecord['deliveryStatus']>(['qa_approved', 'sent', 'blocked', 'pack_ready']).has(
      input.deliveryStatus as OnboardingRecord['deliveryStatus'],
    )
  ) {
    return 'delivery_status_invalid'
  }
  return undefined
}

function parsePublicDeliveryConfirmationBody(body: unknown) {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    response:
      typeof payload.response === 'string'
        ? payload.response.trim().toLowerCase().replace(/\s+/g, '_')
        : typeof payload.accepted === 'boolean' && payload.accepted
          ? 'accept'
          : '',
    confirmedByEmail: typeof payload.confirmedByEmail === 'string' ? payload.confirmedByEmail.trim().toLowerCase() : '',
    note: typeof payload.note === 'string' ? payload.note.trim() : '',
  }
}

function validatePublicDeliveryConfirmationInput(input: ReturnType<typeof parsePublicDeliveryConfirmationBody>) {
  if (!new Set(['accept', 'request_revision', 'schedule_call']).has(input.response)) return 'delivery_confirmation_response_invalid'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.confirmedByEmail)) return 'delivery_confirmation_email_invalid'
  if (input.note.length > 1000) return 'delivery_confirmation_note_too_large'
  return undefined
}

function updateDeliveryEvidence(
  workspace: WorkspaceData,
  recordId: string,
  input: ReturnType<typeof parseDeliveryEvidenceBody>,
  now = new Date().toISOString(),
) {
  const record = workspace.onboarding.find((item) => item.id === recordId)
  if (!record) return { ok: false as const, status: 404, error: 'onboarding_record_not_found' }
  const normalized = normalizeOnboardingRecord(record)
  const nextStatus = (input.deliveryStatus || 'sent') as OnboardingRecord['deliveryStatus']
  if (nextStatus === 'sent' && !normalized.deliveryQaApprovedAt && input.deliveryStatus !== 'qa_approved') {
    return { ok: false as const, status: 409, error: 'delivery_qa_approval_required' }
  }
  const nextRecord: OnboardingRecord = {
    ...normalized,
    deliveryOwnerEmail: input.deliveryOwnerEmail || normalized.deliveryOwnerEmail,
    deliverySlaDueAt: input.deliverySlaDueAt || normalized.deliverySlaDueAt,
    deliveryStatus: nextStatus,
    deliveryQaApprovedAt:
      nextStatus === 'qa_approved' ? normalized.deliveryQaApprovedAt ?? now : normalized.deliveryQaApprovedAt,
    deliveryQaApprovedBy:
      nextStatus === 'qa_approved'
        ? input.deliveryQaApprovedBy || normalized.deliveryQaApprovedBy || input.deliveryOwnerEmail || normalized.deliveryOwnerEmail
        : normalized.deliveryQaApprovedBy,
    deliveryQaNotes: input.deliveryQaNotes || normalized.deliveryQaNotes,
    deliveryPackSentAt: nextStatus === 'sent' ? normalized.deliveryPackSentAt ?? now : normalized.deliveryPackSentAt,
    deliveryPackSentBy: input.deliveryPackSentBy || normalized.deliveryPackSentBy || input.deliveryOwnerEmail || normalized.deliveryOwnerEmail,
    deliveryPackSummary: input.deliveryPackSummary || normalized.deliveryPackSummary,
    renewalEvidenceSummary: input.renewalEvidenceSummary || normalized.renewalEvidenceSummary,
    updatedAt: now,
  }
  return {
    ok: true as const,
    record: nextRecord,
    workspace: {
      ...workspace,
      onboarding: workspace.onboarding.map((item) => (item.id === recordId ? nextRecord : item)),
    },
  }
}

function confirmDeliveryEvidence(
  workspace: WorkspaceData,
  record: OnboardingRecord,
  input: ReturnType<typeof parsePublicDeliveryConfirmationBody>,
  now = new Date().toISOString(),
) {
  const normalized = normalizeOnboardingRecord(record)
  if (!['sent', 'customer_confirmed', 'revision_requested', 'call_requested', 'renewal_ready'].includes(normalized.deliveryStatus)) {
    return { ok: false as const, status: 409, error: 'delivery_pack_not_sent' }
  }
  if (normalized.customerConfirmedAt || normalized.customerDeliveryResponse) {
    return { ok: false as const, status: 409, error: 'delivery_already_confirmed' }
  }
  const responseAction = input.response as NonNullable<OnboardingRecord['customerDeliveryResponse']>
  const nextStatus: OnboardingRecord['deliveryStatus'] =
    responseAction === 'accept'
      ? 'customer_confirmed'
      : responseAction === 'request_revision'
        ? 'revision_requested'
        : 'call_requested'

  const nextRecord: OnboardingRecord = {
    ...normalized,
    deliveryStatus: nextStatus,
    customerDeliveryResponse: responseAction,
    customerConfirmedAt: responseAction === 'accept' ? now : undefined,
    customerConfirmedByEmail: input.confirmedByEmail,
    customerConfirmationNote: input.note || undefined,
    renewalEvidenceSummary:
      responseAction === 'accept'
        ? `${normalized.renewalEvidenceSummary ? `${normalized.renewalEvidenceSummary} ` : ''}Customer confirmed first delivery pack for ${normalized.businessName} on ${now.slice(0, 10)}.`
        : normalized.renewalEvidenceSummary,
    updatedAt: now,
  }
  return {
    ok: true as const,
    record: nextRecord,
    workspace: {
      ...workspace,
      onboarding: workspace.onboarding.map((item) => (item.id === nextRecord.id ? nextRecord : item)),
    },
  }
}

function parsePilotOutcomeBody(body: unknown) {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    outcomeType: typeof payload.outcomeType === 'string' ? payload.outcomeType.trim() : '',
    outcomeValue: typeof payload.outcomeValue === 'number' ? payload.outcomeValue : Number(payload.outcomeValue),
    evidence: typeof payload.evidence === 'string' ? payload.evidence.trim() : '',
    nextAction: typeof payload.nextAction === 'string' ? payload.nextAction.trim() : '',
    recordedBy: typeof payload.recordedBy === 'string' ? payload.recordedBy.trim().toLowerCase() : '',
    occurredAt: typeof payload.occurredAt === 'string' ? payload.occurredAt.trim() : '',
  }
}

function validatePilotOutcome(input: ReturnType<typeof parsePilotOutcomeBody>) {
  if (!pilotOutcomeTypes.has(input.outcomeType as PilotOutcome['outcomeType'])) return 'pilot_outcome_type_invalid'
  if (!Number.isFinite(input.outcomeValue) || input.outcomeValue < 0) return 'pilot_outcome_value_invalid'
  if (!input.evidence || input.evidence.length < 8) return 'pilot_outcome_evidence_required'
  if (input.evidence.length > 1000) return 'pilot_outcome_evidence_too_large'
  if (!input.nextAction || input.nextAction.length > 240) return 'pilot_outcome_next_action_invalid'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.recordedBy)) return 'pilot_outcome_recorded_by_invalid'
  if (input.occurredAt && Number.isNaN(new Date(input.occurredAt).getTime())) return 'pilot_outcome_occurred_at_invalid'
  return undefined
}

function parseProspectPatchBody(body: unknown) {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    status: typeof payload.status === 'string' ? payload.status.trim().toLowerCase() : undefined,
    notes: typeof payload.notes === 'string' ? payload.notes.trim() : undefined,
    nextTouch: typeof payload.nextTouch === 'string' ? payload.nextTouch.trim().toLowerCase().replace(/\s+/g, '_') : undefined,
  }
}

function parseCheckoutHandoffBody(body: unknown) {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    planId: typeof payload.planId === 'string' ? payload.planId.trim() : '',
    createdBy: typeof payload.createdBy === 'string' ? payload.createdBy.trim().toLowerCase() : '',
    scopeSummary: typeof payload.scopeSummary === 'string' ? payload.scopeSummary.trim() : '',
  }
}

function toPublicCheckoutHandoff(handoff: SalesCheckoutHandoff) {
  return {
    id: handoff.id,
    token: handoff.token,
    businessName: handoff.businessName,
    customerEmail: handoff.customerEmail,
    businessWebsite: handoff.businessWebsite,
    businessCity: handoff.businessCity,
    businessState: handoff.businessState,
    industry: handoff.industry,
    product: handoff.product,
    planId: handoff.planId,
    scopeSummary: handoff.scopeSummary,
    scopeSource: handoff.scopeSource,
    scopeAcceptedHash: handoff.scopeAcceptedHash,
    status: handoff.status,
    expiresAt: handoff.expiresAt,
  }
}

function isActiveCheckoutHandoff(status: SalesCheckoutHandoff['status']) {
  return status === 'created' || status === 'sent'
}

function checkoutHandoffExpired(handoff: SalesCheckoutHandoff, now = Date.now()) {
  return Boolean(handoff.expiresAt && Date.parse(handoff.expiresAt) < now)
}

function checkoutSessionCreationInProgress(handoff: SalesCheckoutHandoff, now = Date.now()) {
  if (!handoff.stripeCheckoutCreatingAt) return false
  const createdAt = Date.parse(handoff.stripeCheckoutCreatingAt)
  return Number.isFinite(createdAt) && now - createdAt < 120_000
}

function parseSalesActivityBody(body: unknown) {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    channel: typeof payload.channel === 'string' ? payload.channel.trim().toLowerCase().replace(/\s+/g, '_') : '',
    outcome: typeof payload.outcome === 'string' ? payload.outcome.trim().toLowerCase().replace(/\s+/g, '_') : '',
    summary: typeof payload.summary === 'string' ? payload.summary.trim() : '',
    nextStep: typeof payload.nextStep === 'string' ? payload.nextStep.trim() : '',
    ownerEmail: typeof payload.ownerEmail === 'string' ? payload.ownerEmail.trim().toLowerCase() : '',
    occurredAt: typeof payload.occurredAt === 'string' ? payload.occurredAt.trim() : '',
  }
}

function validateSalesActivity(input: ReturnType<typeof parseSalesActivityBody>) {
  if (!salesActivityChannels.has(input.channel as SalesActivity['channel'])) return 'sales_activity_channel_invalid'
  if (!salesActivityOutcomes.has(input.outcome as SalesActivity['outcome'])) return 'sales_activity_outcome_invalid'
  if (!input.summary || input.summary.length < 6) return 'sales_activity_summary_required'
  if (input.summary.length > 600) return 'sales_activity_summary_too_large'
  if (!input.nextStep || input.nextStep.length > 240) return 'sales_activity_next_step_invalid'
  if (input.ownerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.ownerEmail)) return 'sales_activity_owner_email_invalid'
  if (input.occurredAt && Number.isNaN(new Date(input.occurredAt).getTime())) return 'sales_activity_occurred_at_invalid'
  return undefined
}

const salesStatusRank: Record<SalesProspect['status'], number> = {
  new: 0,
  qualified: 1,
  contacted: 2,
  call_booked: 3,
  scope_sent: 4,
  checkout_sent: 5,
  won: 6,
  lost: 6,
  disqualified: 6,
}

function proposedStatusFromSalesActivity(outcome: SalesActivity['outcome']): SalesProspect['status'] {
  if (outcome === 'call_booked') return 'call_booked'
  if (outcome === 'scope_sent') return 'scope_sent'
  if (outcome === 'checkout_sent') return 'checkout_sent'
  if (outcome === 'won') return 'won'
  if (outcome === 'lost') return 'lost'
  return 'contacted'
}

function statusFromSalesActivity(outcome: SalesActivity['outcome'], currentStatus: SalesProspect['status']) {
  const proposedStatus = proposedStatusFromSalesActivity(outcome)
  return salesStatusRank[proposedStatus] > salesStatusRank[currentStatus] ? proposedStatus : currentStatus
}

function nextTouchFromSalesActivity(outcome: SalesActivity['outcome'], channel: SalesActivity['channel'], currentTouch: SalesProspect['nextTouch']) {
  if (outcome === 'sent' || outcome === 'left_voicemail' || outcome === 'no_response') return 'call'
  if (outcome === 'replied') return 'call'
  if (outcome === 'call_booked' || outcome === 'scope_sent' || outcome === 'checkout_sent' || outcome === 'won' || outcome === 'lost') {
    return 'hold'
  }
  if (channel === 'linkedin') return 'linkedin'
  if (channel === 'partner') return 'partner'
  return currentTouch
}

function maxIsoTimestamp(current: string | undefined, candidate: string) {
  const currentTime = current ? Date.parse(current) : Number.NaN
  const candidateTime = Date.parse(candidate)
  if (Number.isFinite(currentTime) && currentTime > candidateTime) return current
  return candidate
}

function firstQueryValue(value: unknown) {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

function filterSalesActivities(workspace: WorkspaceData, query: Record<string, unknown>) {
  const prospectId = firstQueryValue(query.prospectId)?.trim()
  const since = firstQueryValue(query.since)?.trim()
  const until = firstQueryValue(query.until)?.trim()
  const sinceTime = since ? Date.parse(since) : undefined
  const untilTime = until ? Date.parse(until) : undefined
  if (since && !Number.isFinite(sinceTime)) return { ok: false as const, error: 'sales_activity_since_invalid' }
  if (until && !Number.isFinite(untilTime)) return { ok: false as const, error: 'sales_activity_until_invalid' }

  const activities = workspace.salesActivities
    .filter((activity) => !prospectId || activity.prospectId === prospectId)
    .filter((activity) => {
      const occurredTime = Date.parse(activity.occurredAt)
      if (sinceTime !== undefined && occurredTime < sinceTime) return false
      if (untilTime !== undefined && occurredTime > untilTime) return false
      return true
    })
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))

  return { ok: true as const, activities }
}

function startOfUtcWeek(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = start.getUTCDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  start.setUTCDate(start.getUTCDate() + mondayOffset)
  return start
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function parseSalesSummaryQuery(query: Record<string, unknown>, now = new Date()) {
  const sinceRaw = firstQueryValue(query.since)?.trim()
  const untilRaw = firstQueryValue(query.until)?.trim()
  const until = untilRaw ? new Date(untilRaw) : now
  const since = sinceRaw ? new Date(sinceRaw) : new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (sinceRaw && Number.isNaN(since.getTime())) return { ok: false as const, error: 'sales_summary_since_invalid' }
  if (untilRaw && Number.isNaN(until.getTime())) return { ok: false as const, error: 'sales_summary_until_invalid' }
  if (since >= until) return { ok: false as const, error: 'sales_summary_range_invalid' }
  if (until.getTime() - since.getTime() > 180 * 24 * 60 * 60 * 1000) {
    return { ok: false as const, error: 'sales_summary_range_too_large' }
  }
  return { ok: true as const, since, until }
}

function emptyActivityCounts(): SalesSummary['activity'] {
  return {
    total: 0,
    emailsSent: 0,
    callsLogged: 0,
    partnerTouches: 0,
    replies: 0,
    callsBooked: 0,
    scopesSent: 0,
    checkoutsSent: 0,
    wins: 0,
    losses: 0,
    noResponses: 0,
  }
}

function addActivityToCounts(counts: SalesSummary['activity'], activity: SalesActivity) {
  counts.total += 1
  if (activity.channel === 'email' && activity.outcome === 'sent') counts.emailsSent += 1
  if (activity.channel === 'call') counts.callsLogged += 1
  if (activity.channel === 'partner' || activity.channel === 'linkedin') counts.partnerTouches += 1
  if (activity.outcome === 'replied') counts.replies += 1
  if (activity.outcome === 'call_booked') counts.callsBooked += 1
  if (activity.outcome === 'scope_sent') counts.scopesSent += 1
  if (activity.outcome === 'checkout_sent') counts.checkoutsSent += 1
  if (activity.outcome === 'won') counts.wins += 1
  if (activity.outcome === 'lost') counts.losses += 1
  if (activity.outcome === 'no_response') counts.noResponses += 1
}

function createEmptyWeeklyBucket(start: Date) {
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  return {
    weekStart: isoDate(start),
    weekEnd: isoDate(end),
    activity: {
      ...emptyActivityCounts(),
      uniqueProspectsTouched: 0,
    },
  }
}

function roundPercent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0
}

function buildWeeklyBuckets(activities: SalesActivity[], since: Date, until: Date) {
  const bucketStarts: Date[] = []
  const cursor = startOfUtcWeek(since)
  while (cursor <= until) {
    bucketStarts.push(new Date(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }
  const prospectSets = new Map<string, Set<string>>()
  const buckets = bucketStarts.map((start) => {
    const bucket = createEmptyWeeklyBucket(start)
    prospectSets.set(bucket.weekStart, new Set<string>())
    return bucket
  })
  const bucketByStart = new Map(buckets.map((bucket) => [bucket.weekStart, bucket]))

  for (const activity of activities) {
    const occurredAt = new Date(activity.occurredAt)
    const bucket = bucketByStart.get(isoDate(startOfUtcWeek(occurredAt)))
    if (!bucket) continue

    addActivityToCounts(bucket.activity, activity)
    prospectSets.get(bucket.weekStart)?.add(activity.prospectId)
  }

  for (const bucket of buckets) {
    bucket.activity.uniqueProspectsTouched = prospectSets.get(bucket.weekStart)?.size ?? 0
  }

  return buckets
}

function buildSalesSummary(workspace: WorkspaceData, since: Date, until: Date, now = new Date()): SalesSummary {
  const activities = workspace.salesActivities.filter((activity) => {
    const occurredAt = new Date(activity.occurredAt)
    return !Number.isNaN(occurredAt.getTime()) && occurredAt >= since && occurredAt <= until
  })
  const activity = activities.reduce((counts, item) => {
    addActivityToCounts(counts, item)
    return counts
  }, emptyActivityCounts())
  const currentFunnel = salesProspectStatusValues.map((status) => {
    const prospects = workspace.salesProspects.filter((prospect) => prospect.status === status)
    const fitScoreTotal = prospects.reduce((sum, prospect) => sum + prospect.fitScore, 0)
    return {
      status,
      count: prospects.length,
      averageFitScore: prospects.length > 0 ? Math.round(fitScoreTotal / prospects.length) : 0,
      estimatedPipelineValue: prospects.reduce((sum, prospect) => sum + prospect.averageJobValue, 0),
    }
  })
  const pipelineByStatus = Object.fromEntries(currentFunnel.map((item) => [item.status, item.count])) as Record<
    SalesProspect['status'],
    number
  >
  const terminalStatuses = new Set<SalesProspect['status']>(['won', 'lost', 'disqualified'])
  const activeProspects = workspace.salesProspects.filter((prospect) => !terminalStatuses.has(prospect.status))
  const staleCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const staleProspects = activeProspects.filter((prospect) => {
    const reference = new Date(prospect.lastContactedAt ?? prospect.createdAt)
    return !Number.isNaN(reference.getTime()) && reference < staleCutoff
  })
  const contactedStatusCount =
    pipelineByStatus.contacted +
    pipelineByStatus.call_booked +
    pipelineByStatus.scope_sent +
    pipelineByStatus.checkout_sent +
    pipelineByStatus.won +
    pipelineByStatus.lost
  const checkoutReachedCount = pipelineByStatus.checkout_sent + pipelineByStatus.won + pipelineByStatus.lost
  const estimatedPipelineValue = activeProspects.reduce((sum, prospect) => sum + prospect.averageJobValue, 0)
  const wonPipelineValueEstimate = workspace.salesProspects
    .filter((prospect) => prospect.status === 'won')
    .reduce((sum, prospect) => sum + prospect.averageJobValue, 0)
  const nextActions = activeProspects
    .map((prospect) => {
      const reference = new Date(prospect.lastContactedAt ?? prospect.createdAt)
      const stale = !Number.isNaN(reference.getTime()) && reference < staleCutoff
      const priority =
        prospect.status === 'checkout_sent'
          ? 100
          : prospect.status === 'scope_sent'
            ? 90
            : stale
              ? 80
              : prospect.status === 'call_booked'
                ? 70
                : prospect.status === 'contacted'
                  ? 60
                  : prospect.status === 'qualified'
                    ? 50
                    : 40
      const reason =
        prospect.status === 'checkout_sent'
          ? 'Confirm payment or mark won/lost.'
          : prospect.status === 'scope_sent'
            ? 'Follow up on the pilot scope and ask for checkout approval.'
            : stale
              ? 'No recent touch in the last 7 days.'
              : prospect.status === 'call_booked'
                ? 'Prepare discovery questions and scope path.'
                : prospect.status === 'contacted'
                  ? 'Book the next call or send a tighter proof point.'
                  : 'Work this account by fit score.'
      return { prospect, priority, reason }
    })
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        right.prospect.fitScore - left.prospect.fitScore ||
        Date.parse(left.prospect.updatedAt) - Date.parse(right.prospect.updatedAt),
    )
    .slice(0, 8)
    .map(({ prospect, reason }) => ({
      prospectId: prospect.id,
      businessName: prospect.businessName,
      status: prospect.status,
      nextTouch: prospect.nextTouch,
      fitScore: prospect.fitScore,
      lastContactedAt: prospect.lastContactedAt,
      reason,
    }))

  const recommendedFocus =
    pipelineByStatus.checkout_sent > 0
      ? 'Collect payment or mark won/lost for checkout-sent prospects.'
      : pipelineByStatus.scope_sent > 0
        ? 'Follow scope-sent prospects and push qualified fits to checkout.'
        : activity.total < 25
          ? 'Increase daily outbound volume before judging demand.'
          : activity.callsBooked === 0
            ? 'Tighten personalization and call openers to create discovery calls.'
            : 'Keep working the current vertical and convert booked calls into paid pilots.'

  return {
    generatedAt: now.toISOString(),
    period: {
      since: since.toISOString(),
      until: until.toISOString(),
    },
    activity,
    funnel: currentFunnel,
    management: {
      importedProspects: workspace.salesProspects.length,
      activeProspects: activeProspects.length,
      staleProspects: staleProspects.length,
      checkoutOpen: pipelineByStatus.checkout_sent,
      estimatedPipelineValue,
      wonPipelineValueEstimate,
      winRateFromContacted: roundPercent(pipelineByStatus.won, contactedStatusCount),
      checkoutToWonRate: roundPercent(pipelineByStatus.won, checkoutReachedCount),
    },
    weekly: buildWeeklyBuckets(activities, since, until),
    nextActions,
    recommendedFocus,
  }
}

function parseRevenueSummaryQuery(query: Record<string, unknown>) {
  const sinceRaw = firstQueryValue(query.since)?.trim()
  const untilRaw = firstQueryValue(query.until)?.trim()
  const since = sinceRaw ? new Date(sinceRaw) : undefined
  const until = untilRaw ? new Date(untilRaw) : undefined
  if (sinceRaw && (!since || Number.isNaN(since.getTime()))) return { ok: false as const, error: 'revenue_summary_since_invalid' }
  if (untilRaw && (!until || Number.isNaN(until.getTime()))) return { ok: false as const, error: 'revenue_summary_until_invalid' }
  if (since && until && since >= until) return { ok: false as const, error: 'revenue_summary_range_invalid' }
  return { ok: true as const, since, until }
}

function addPaymentToRevenueTotals<T extends { paidPilots: number; setupRevenueCents: number; mrrCents: number; grossCollectedCents: number }>(
  totals: T,
  payment: RevenuePayment,
) {
  totals.paidPilots += 1
  totals.setupRevenueCents += payment.setupRevenueCents
  totals.mrrCents += payment.mrrCents
  totals.grossCollectedCents += payment.grossCollectedCents
}

function buildRevenueSummary(payments: RevenuePayment[], input: { since?: Date; until?: Date }, now = new Date()): RevenueSummary {
  const filtered = payments
    .filter((payment) => payment.status === 'paid')
    .filter((payment) => {
      const receivedAt = Date.parse(payment.receivedAt)
      if (input.since && receivedAt < input.since.getTime()) return false
      if (input.until && receivedAt > input.until.getTime()) return false
      return true
    })
    .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))
  const summary: RevenueSummary = {
    generatedAt: now.toISOString(),
    period: {
      since: input.since?.toISOString(),
      until: input.until?.toISOString(),
    },
    paidPilots: 0,
    setupRevenueCents: 0,
    mrrCents: 0,
    grossCollectedCents: 0,
    byProduct: [],
    bySource: [],
    recentPayments: filtered.slice(0, 8),
  }
  const byProduct = new Map<RevenuePayment['product'], RevenueSummary['byProduct'][number]>()
  const bySource = new Map<RevenuePayment['paymentSource'], RevenueSummary['bySource'][number]>()
  for (const payment of filtered) {
    addPaymentToRevenueTotals(summary, payment)
    const productBucket =
      byProduct.get(payment.product) ??
      ({ product: payment.product, paidPilots: 0, setupRevenueCents: 0, mrrCents: 0, grossCollectedCents: 0 } satisfies RevenueSummary['byProduct'][number])
    addPaymentToRevenueTotals(productBucket, payment)
    byProduct.set(payment.product, productBucket)
    const sourceBucket =
      bySource.get(payment.paymentSource) ??
      ({ source: payment.paymentSource, paidPilots: 0, setupRevenueCents: 0, mrrCents: 0, grossCollectedCents: 0 } satisfies RevenueSummary['bySource'][number])
    addPaymentToRevenueTotals(sourceBucket, payment)
    bySource.set(payment.paymentSource, sourceBucket)
  }
  summary.byProduct = [...byProduct.values()]
  summary.bySource = [...bySource.values()]
  return summary
}

function formatCurrencyValue(value: number) {
  return `$${Math.round(value).toLocaleString()}`
}

function sortRevenueCommandActions(actions: RevenueCommandCenter['actions']) {
  const priorityRank: Record<RevenueCommandCenter['actions'][number]['priority'], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }
  return [...actions].sort((left, right) => {
    const priorityDelta = priorityRank[right.priority] - priorityRank[left.priority]
    if (priorityDelta) return priorityDelta
    const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY
    const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY
    return leftDue - rightDue
  })
}

function buildRevenueCommandCenter(workspace: WorkspaceData, now = new Date()): RevenueCommandCenter {
  const normalizedWorkspace = normalizeOnboardingWorkspace(workspace)
  const paidSummary = buildRevenueSummary(normalizedWorkspace.revenuePayments, {}, now)
  const activeHandoffs = normalizedWorkspace.salesCheckoutHandoffs.filter(
    (handoff) => (handoff.status === 'sent' || handoff.status === 'created') && !checkoutHandoffExpired(handoff),
  )
  const checkoutProspects = normalizedWorkspace.salesProspects.filter((prospect) => prospect.status === 'checkout_sent')
  const customerActionLinks = normalizedWorkspace.revenueRecoveryLinks.filter((link) =>
    ['opened', 'revision_requested', 'callback_requested', 'accepted'].includes(link.status),
  )
  const renewalEvidence = normalizedWorkspace.onboarding.filter(
    (record) => record.renewalEvidenceSummary || record.customerConfirmedAt || record.deliveryStatus === 'customer_confirmed',
  )
  const deliveryAtRisk = normalizedWorkspace.onboarding.filter((record) => {
    const dueAt = Date.parse(record.deliverySlaDueAt)
    const dueSoon = Number.isFinite(dueAt) && dueAt <= now.getTime() + 48 * 60 * 60 * 1000
    return !['customer_confirmed', 'renewal_ready'].includes(record.deliveryStatus) && dueSoon
  })
  const actions: RevenueCommandCenter['actions'] = []

  for (const prospect of checkoutProspects.slice(0, 8)) {
    actions.push({
      id: `collect_${prospect.id}`,
      priority: 'critical',
      lane: 'collect_payment',
      title: `Collect payment from ${prospect.businessName}`,
      detail: `${prospect.status.replaceAll('_', ' ')} prospect with estimated job value ${formatCurrencyValue(prospect.averageJobValue)}.`,
      nextStep: 'Call the buyer, confirm the scoped checkout link, and close payment or mark lost.',
      sourceType: 'sales_prospect',
      sourceId: prospect.id,
      ownerEmail: prospect.ownerEmail,
      dueAt: prospect.lastContactedAt,
    })
  }

  for (const handoff of activeHandoffs.slice(0, 8)) {
    actions.push({
      id: `handoff_${handoff.id}`,
      priority: 'high',
      lane: 'collect_payment',
      title: `Resolve checkout handoff for ${handoff.businessName}`,
      detail: `${handoff.planId} handoff is ${handoff.status}; scope hash ${handoff.scopeAcceptedHash.slice(0, 10)}.`,
      nextStep: 'Follow up on payment; do not count revenue until Stripe webhook records a paid payment.',
      sourceType: 'checkout_handoff',
      sourceId: handoff.id,
      ownerEmail: handoff.customerEmail,
      dueAt: handoff.expiresAt ?? handoff.sentAt ?? handoff.createdAt,
    })
  }

  for (const record of deliveryAtRisk.slice(0, 8)) {
    const priority: RevenueCommandCenter['actions'][number]['priority'] =
      Date.parse(record.deliverySlaDueAt) < now.getTime() ? 'critical' : 'high'
    actions.push({
      id: `delivery_${record.id}`,
      priority,
      lane: 'delivery',
      title: `Move delivery forward for ${record.businessName}`,
      detail: `Delivery is ${record.deliveryStatus.replaceAll('_', ' ')}; SLA due ${record.deliverySlaDueAt.slice(0, 10)}.`,
      nextStep:
        record.deliveryStatus === 'pack_ready'
          ? 'QA approve the first pack, then mark it sent.'
          : record.deliveryStatus === 'sent'
            ? 'Ask the customer to accept, request revision, or schedule a call from their onboarding page.'
            : 'Collect or review materials and generate the first delivery pack.',
      sourceType: 'onboarding',
      sourceId: record.id,
      ownerEmail: record.deliveryOwnerEmail,
      dueAt: record.deliverySlaDueAt,
    })
  }

  for (const link of customerActionLinks.slice(0, 8)) {
    actions.push({
      id: `recovery_${link.id}`,
      priority: link.status === 'accepted' ? 'high' : 'medium',
      lane: 'customer_action',
      title: `${link.customerName} ${link.status.replaceAll('_', ' ')} ${link.product === 'bidflow' ? 'proposal' : 'recovery plan'}`,
      detail: `${link.businessName} action link value ${formatCurrencyValue(link.valueCents / 100)}.`,
      nextStep:
        link.status === 'accepted'
          ? 'Schedule work, collect deposit/payment externally if needed, and record outcome evidence.'
          : 'Follow up on the requested revision or callback before the link expires.',
      sourceType: 'recovery_link',
      sourceId: link.id,
      ownerEmail: link.customerEmail,
      dueAt: link.expiresAt,
    })
  }

  for (const record of renewalEvidence.slice(0, 8)) {
    actions.push({
      id: `renewal_${record.id}`,
      priority: 'medium',
      lane: 'renewal',
      title: `Prepare renewal ask for ${record.businessName}`,
      detail: record.renewalEvidenceSummary || 'Customer confirmed first delivery evidence.',
      nextStep: 'Record measurable outcome, ask for monthly continuation, or document the objection.',
      sourceType: 'onboarding',
      sourceId: record.id,
      ownerEmail: record.deliveryOwnerEmail,
      dueAt: record.customerConfirmedAt,
    })
  }

  const blockers: RevenueCommandCenter['blockers'] = []
  if (paidSummary.paidPilots === 0) {
    blockers.push({
      id: 'no_paid_pilots',
      title: 'No paid pilot collection yet',
      detail: 'Do not claim revenue until Stripe webhook-backed RevenuePayment rows exist.',
    })
  }
  if (activeHandoffs.length === 0 && checkoutProspects.length === 0) {
    blockers.push({
      id: 'no_checkout_pressure',
      title: 'No open checkout pressure',
      detail: 'Move qualified prospects to scope_sent and generate checkout handoffs only after written scope.',
    })
  }
  if (normalizedWorkspace.onboarding.length > 0 && renewalEvidence.length === 0) {
    blockers.push({
      id: 'no_delivery_acceptance',
      title: 'No customer delivery acceptance yet',
      detail: 'Generate, QA approve, send, and collect customer response for the first delivery pack.',
    })
  }

  const focus =
    paidSummary.paidPilots === 0
      ? 'Close the first paid pilot through Stripe before expanding scope.'
      : deliveryAtRisk.length > 0
        ? 'Protect paid pilot trust by clearing delivery SLA risk.'
        : renewalEvidence.length > 0
          ? 'Convert delivery proof into renewal or case-study asks.'
          : 'Keep prospecting while moving paid customers to first-pack acceptance.'

  return {
    generatedAt: now.toISOString(),
    focus,
    northStar: {
      paidPilots: paidSummary.paidPilots,
      setupRevenueCents: paidSummary.setupRevenueCents,
      mrrCents: paidSummary.mrrCents,
      grossCollectedCents: paidSummary.grossCollectedCents,
      openCheckoutCount: activeHandoffs.length + checkoutProspects.length,
      deliveryAtRiskCount: deliveryAtRisk.length,
      customerActionCount: customerActionLinks.length,
      renewalEvidenceCount: renewalEvidence.length + normalizedWorkspace.pilotOutcomes.length,
    },
    actions: sortRevenueCommandActions(actions).slice(0, 12),
    blockers,
  }
}

function createSalesActivity(
  prospect: SalesProspect,
  input: ReturnType<typeof parseSalesActivityBody>,
  organizationId: string,
  now = new Date().toISOString(),
) {
  return {
    id: `sales_activity_${randomUUID()}`,
    prospectId: prospect.id,
    organizationId,
    businessName: prospect.businessName,
    channel: input.channel as SalesActivity['channel'],
    outcome: input.outcome as SalesActivity['outcome'],
    summary: input.summary,
    nextStep: input.nextStep,
    ownerEmail: input.ownerEmail,
    occurredAt: input.occurredAt || now,
    createdAt: now,
    updatedAt: now,
  } satisfies SalesActivity
}

function defaultPlanForProduct(product: SalesCheckoutHandoff['product']) {
  return product === 'bidflow' ? 'bidflow-growth' : 'reputeloop-growth'
}

function normalizeScopeSummary(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500)
}

function createScopeHash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function buildCheckoutScopeSnapshot(
  workspace: WorkspaceData,
  prospect: SalesProspect,
  input: ReturnType<typeof parseCheckoutHandoffBody>,
): Pick<SalesCheckoutHandoff, 'scopeSummary' | 'scopeSource' | 'scopeAcceptedHash'> {
  const explicitSummary = normalizeScopeSummary(input.scopeSummary)
  if (explicitSummary) {
    return {
      scopeSummary: explicitSummary,
      scopeSource: 'sales_activity',
      scopeAcceptedHash: createScopeHash(`${prospect.id}|${explicitSummary}`),
    }
  }

  const pack = getLatestOutreachPack(workspace, prospect.id)
  const packScope = pack ? normalizeScopeSummary(pack.pilotScopeDraft) : ''
  if (packScope) {
    return {
      scopeSummary: packScope,
      scopeSource: 'outreach_pack',
      scopeAcceptedHash: createScopeHash(`${prospect.id}|${pack.id}|${packScope}`),
    }
  }

  const scopeActivity = workspace.salesActivities
    .filter((activity) => activity.prospectId === prospect.id && activity.outcome === 'scope_sent')
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0]
  const activityScope = scopeActivity ? normalizeScopeSummary(`${scopeActivity.summary} Next step: ${scopeActivity.nextStep}`) : ''
  if (activityScope) {
    return {
      scopeSummary: activityScope,
      scopeSource: 'sales_activity',
      scopeAcceptedHash: createScopeHash(`${prospect.id}|${scopeActivity.id}|${activityScope}`),
    }
  }

  const prospectScope = normalizeScopeSummary(
    `${prospect.businessName} paid pilot for ${prospect.industry || 'local service'}: ${prospect.quoteLeakSignal || prospect.recentReviewIssue || prospect.notes || 'operator-reviewed revenue workflow'}.`,
  )
  return {
    scopeSummary: prospectScope,
    scopeSource: 'prospect_notes',
    scopeAcceptedHash: createScopeHash(`${prospect.id}|${prospectScope}`),
  }
}

function getPublicBuyBaseUrl(request: express.Request) {
  const configuredOrigin = parseAllowedOrigins()[0]
  const origin = configuredOrigin ?? `${request.protocol}://${request.get('host')}`
  return `${origin}/buy`
}

function createCheckoutHandoff(
  workspace: WorkspaceData,
  prospect: SalesProspect,
  input: ReturnType<typeof parseCheckoutHandoffBody>,
  request: express.Request,
  now = new Date().toISOString(),
) {
  const recommendedProduct = recommendProspectProduct(prospect)
  const defaultPlanId = defaultPlanForProduct(recommendedProduct)
  if (input.planId && input.planId !== defaultPlanId) return { ok: false as const, error: 'checkout_handoff_plan_unsupported' }
  const plan = findBillingPlan(defaultPlanId)
  if (!plan) return { ok: false as const, error: 'checkout_handoff_plan_invalid' }
  if (!prospect.ownerEmail) return { ok: false as const, error: 'checkout_handoff_owner_email_required' }
  if (prospect.status === 'lost' || prospect.status === 'disqualified') {
    return { ok: false as const, error: 'checkout_handoff_prospect_not_eligible' }
  }
  if (prospect.status !== 'scope_sent' && prospect.status !== 'checkout_sent') {
    return { ok: false as const, error: 'checkout_handoff_scope_required' }
  }

  const token = randomUUID()
  const handoffId = `sales_checkout_${randomUUID()}`
  const checkoutUrl = `${getPublicBuyBaseUrl(request)}?handoff=${encodeURIComponent(token)}`
  const scopeSnapshot = buildCheckoutScopeSnapshot(workspace, prospect, input)
  return {
    ok: true as const,
    handoff: {
      id: handoffId,
      token,
      prospectId: prospect.id,
      organizationId: prospect.organizationId,
      businessName: prospect.businessName,
      customerEmail: prospect.ownerEmail,
      businessWebsite: prospect.website,
      businessCity: prospect.city,
      businessState: prospect.state,
      industry: prospect.industry,
      product: plan.product,
      planId: plan.id,
      checkoutUrl,
      ...scopeSnapshot,
      status: 'sent',
      createdBy: input.createdBy || 'API',
      expiresAt: new Date(new Date(now).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    } satisfies SalesCheckoutHandoff,
  }
}

function createPilotOutcome(record: OnboardingRecord, input: ReturnType<typeof parsePilotOutcomeBody>, currency: PilotOutcome['currency']) {
  const now = new Date().toISOString()
  return {
    id: `pilot_outcome_${randomUUID()}`,
    onboardingId: record.id,
    organizationId: record.organizationId,
    product: record.product,
    businessName: record.businessName,
    outcomeType: input.outcomeType as PilotOutcome['outcomeType'],
    outcomeValue: Math.round(input.outcomeValue * 100) / 100,
    currency,
    evidence: input.evidence,
    nextAction: input.nextAction,
    recordedBy: input.recordedBy,
    occurredAt: input.occurredAt || now,
    createdAt: now,
    updatedAt: now,
  } satisfies PilotOutcome
}

function createOnboardingSubmission(
  workspace: WorkspaceData,
  record: OnboardingRecord,
  input: ReturnType<typeof parseOnboardingSubmissionBody>,
  now = new Date().toISOString(),
) {
  const materialChecklistKey = record.checklist.some((item) => item.key === 'customer_materials_submitted')
    ? 'customer_materials_submitted'
    : 'customer_data_imported'
  const progress = updateOnboardingChecklist(workspace, record.id, materialChecklistKey, true, now)
  const workspaceWithProgress = progress.ok ? progress.workspace : workspace
  const recordWithProgress = progress.ok ? progress.record : record
  const submission: OnboardingSubmission = {
    id: `onboarding_submission_${randomUUID()}`,
    onboardingId: record.id,
    organizationId: record.organizationId,
    submittedByEmail: input.submittedByEmail,
    materialType: input.materialType as OnboardingSubmission['materialType'],
    title: input.title,
    body: input.body,
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  }

  return {
    record: recordWithProgress,
    submission,
    workspace: {
      ...workspaceWithProgress,
      onboardingSubmissions: [submission, ...workspaceWithProgress.onboardingSubmissions],
    },
  }
}

function parseRecoveryLinkBody(body: unknown) {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    sourceType: typeof payload.sourceType === 'string' ? payload.sourceType.trim().toLowerCase().replace(/\s+/g, '_') : '',
    sourceId: typeof payload.sourceId === 'string' ? payload.sourceId.trim() : '',
    createdBy: typeof payload.createdBy === 'string' ? payload.createdBy.trim().toLowerCase() : '',
    summary: typeof payload.summary === 'string' ? payload.summary.trim() : '',
    callToAction: typeof payload.callToAction === 'string' ? payload.callToAction.trim() : '',
  }
}

function parseRecoveryLinkResponseBody(body: unknown) {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    action: typeof payload.action === 'string' ? payload.action.trim().toLowerCase().replace(/\s+/g, '_') : '',
    note: typeof payload.note === 'string' ? payload.note.trim() : '',
    email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '',
  }
}

function toPublicRevenueRecoveryLink(link: RevenueRecoveryLink): PublicRevenueRecoveryLink {
  return {
    id: link.id,
    token: link.token,
    product: link.product,
    sourceType: link.sourceType,
    customerName: link.customerName,
    businessName: link.businessName,
    title: link.title,
    summary: link.summary,
    callToAction: link.callToAction,
    valueCents: link.valueCents,
    currency: link.currency,
    status: link.status,
    expiresAt: link.expiresAt,
  }
}

function buildLeadRecoveryLink(workspace: WorkspaceData, lead: Lead, input: ReturnType<typeof parseRecoveryLinkBody>, now: string) {
  const customer = workspace.customers.find((item) => item.id === lead.customerId)
  if (!customer) return { ok: false as const, error: 'customer_not_found' }
  const estimate = workspace.estimates.find((item) => item.leadId === lead.id)
  const proposal = workspace.proposals.find((item) => item.leadId === lead.id)
  if (!estimate || !proposal) return { ok: false as const, error: 'revenue_pack_required' }

  return {
    ok: true as const,
    link: {
      id: `recovery_link_${randomUUID()}`,
      token: randomUUID(),
      organizationId: workspace.business.id,
      product: 'bidflow',
      sourceType: 'lead',
      sourceId: lead.id,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      businessName: workspace.business.name,
      title: proposal.title,
      summary: input.summary || `${proposal.problemSummary} ${proposal.recommendedSolution}`,
      callToAction: input.callToAction || 'Approve this proposal, request a revision, or schedule a callback.',
      valueCents: Math.round(estimate.total * 100),
      currency: workspace.business.currency,
      status: 'created',
      createdBy: input.createdBy || 'API',
      createdAt: now,
      updatedAt: now,
      expiresAt: estimate.validUntil,
    } satisfies RevenueRecoveryLink,
  }
}

function buildFeedbackRecoveryLink(workspace: WorkspaceData, caseItem: FeedbackCase, input: ReturnType<typeof parseRecoveryLinkBody>, now: string) {
  const customer = workspace.customers.find((item) => item.id === caseItem.customerId)
  if (!customer) return { ok: false as const, error: 'customer_not_found' }
  const offer = workspace.recoveryOffers.find((item) => item.feedbackCaseId === caseItem.id)
  if (!offer) return { ok: false as const, error: 'recovery_offer_required' }

  return {
    ok: true as const,
    link: {
      id: `recovery_link_${randomUUID()}`,
      token: randomUUID(),
      organizationId: workspace.business.id,
      product: 'reputeloop',
      sourceType: 'feedback_case',
      sourceId: caseItem.id,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      businessName: workspace.business.name,
      title: `Recovery plan for ${customer.name}`,
      summary: input.summary || `${caseItem.summary} ${offer.message}`,
      callToAction: input.callToAction || 'Accept this recovery plan, ask for a manager callback, or decline with context.',
      valueCents: Math.round(Math.max(0, offer.value) * 100),
      currency: workspace.business.currency,
      status: 'created',
      createdBy: input.createdBy || 'API',
      createdAt: now,
      updatedAt: now,
      expiresAt: offer.expiresAt,
    } satisfies RevenueRecoveryLink,
  }
}

function createRevenueRecoveryLink(workspace: WorkspaceData, input: ReturnType<typeof parseRecoveryLinkBody>, now = new Date().toISOString()) {
  if (input.sourceType === 'lead') {
    const lead = workspace.leads.find((item) => item.id === input.sourceId)
    if (!lead) return { ok: false as const, status: 404, error: 'lead_not_found' }
    const result = buildLeadRecoveryLink(workspace, lead, input, now)
    if (!result.ok) return { ...result, status: 409 }
    return { ok: true as const, status: 201, link: result.link }
  }
  if (input.sourceType === 'feedback_case') {
    const caseItem = workspace.feedbackCases.find((item) => item.id === input.sourceId)
    if (!caseItem) return { ok: false as const, status: 404, error: 'feedback_case_not_found' }
    const result = buildFeedbackRecoveryLink(workspace, caseItem, input, now)
    if (!result.ok) return { ...result, status: 409 }
    return { ok: true as const, status: 201, link: result.link }
  }
  return { ok: false as const, status: 400, error: 'recovery_link_source_invalid' }
}

function applyRevenueRecoveryResponse(
  workspace: WorkspaceData,
  link: RevenueRecoveryLink,
  input: ReturnType<typeof parseRecoveryLinkResponseBody>,
  now = new Date().toISOString(),
) {
  const allowed = new Set(['approve', 'request_revision', 'schedule_callback', 'decline'])
  if (!allowed.has(input.action)) return { ok: false as const, status: 400, error: 'recovery_link_action_invalid' }
  if (link.status === 'expired' || Date.parse(link.expiresAt) < Date.parse(now)) {
    return { ok: false as const, status: 410, error: 'recovery_link_expired' }
  }
  if (['accepted', 'revision_requested', 'callback_requested', 'declined'].includes(link.status)) {
    return { ok: false as const, status: 409, error: 'recovery_link_already_responded' }
  }

  const nextStatus: RevenueRecoveryLink['status'] =
    input.action === 'approve'
      ? 'accepted'
      : input.action === 'request_revision'
        ? 'revision_requested'
        : input.action === 'schedule_callback'
          ? 'callback_requested'
          : 'declined'
  const updatedLink: RevenueRecoveryLink = {
    ...link,
    status: nextStatus,
    responseAction: input.action as RevenueRecoveryLink['responseAction'],
    responseNote: input.note || undefined,
    responseEmail: input.email || undefined,
    respondedAt: now,
    openedAt: link.openedAt ?? now,
    updatedAt: now,
  }
  let nextWorkspace: WorkspaceData = {
    ...workspace,
    revenueRecoveryLinks: workspace.revenueRecoveryLinks.map((item) => (item.id === link.id ? updatedLink : item)),
  }

  if (link.sourceType === 'lead') {
    nextWorkspace = {
      ...nextWorkspace,
      leads: nextWorkspace.leads.map((lead) =>
        lead.id === link.sourceId
          ? {
              ...lead,
              status: nextStatus === 'accepted' ? 'won' : nextStatus === 'declined' ? 'lost' : 'follow_up',
              nextStep:
                nextStatus === 'accepted'
                  ? 'Customer approved the recovery link; schedule work and collect payment/deposit.'
                  : nextStatus === 'declined'
                    ? 'Review decline reason and decide whether to nurture or close.'
                    : 'Customer requested follow-up from the recovery link.',
            }
          : lead,
      ),
      estimates: nextWorkspace.estimates.map((estimate) =>
        estimate.leadId === link.sourceId
          ? { ...estimate, status: nextStatus === 'accepted' ? 'accepted' : nextStatus === 'declined' ? 'rejected' : estimate.status }
          : estimate,
      ),
      proposals: nextWorkspace.proposals.map((proposal) =>
        proposal.leadId === link.sourceId
          ? { ...proposal, status: nextStatus === 'accepted' ? 'approved' : nextStatus === 'declined' ? 'declined' : proposal.status }
          : proposal,
      ),
    }
  }

  if (link.sourceType === 'feedback_case') {
    nextWorkspace = {
      ...nextWorkspace,
      feedbackCases: nextWorkspace.feedbackCases.map((caseItem) =>
        caseItem.id === link.sourceId
          ? {
              ...caseItem,
              status: nextStatus === 'accepted' ? 'recovered' : nextStatus === 'declined' ? 'churned' : 'waiting_customer',
            }
          : caseItem,
      ),
      recoveryOffers: nextWorkspace.recoveryOffers.map((offer) =>
        offer.feedbackCaseId === link.sourceId
          ? { ...offer, status: nextStatus === 'accepted' ? 'redeemed' : nextStatus === 'declined' ? 'rejected' : 'sent' }
          : offer,
      ),
    }
  }

  return { ok: true as const, link: updatedLink, workspace: nextWorkspace }
}

function parseSubmissionCsv(workspace: WorkspaceData, submission: OnboardingSubmission): ImportResult<Lead | Review> | undefined {
  if (submission.materialType === 'lead_csv') return importLeadsCsv(workspace, submission.body)
  if (submission.materialType === 'review_csv') return importReviewsCsv(workspace, submission.body)
  return undefined
}

function applyRevenuePack(workspace: WorkspaceData, leadId: string) {
  const lead = workspace.leads.find((item) => item.id === leadId)
  if (!lead) return { ok: false as const, error: 'lead_not_found' }

  const customer = workspace.customers.find((item) => item.id === lead.customerId)
  if (!customer) return { ok: false as const, error: 'customer_not_found' }

  const scoredLead: Lead = { ...lead, ...scoreLead(lead, workspace.customers), status: 'quoted' }
  const estimate = buildEstimate(scoredLead, workspace.business)
  const proposal = generateProposal(scoredLead, customer, estimate, workspace.business)
  const followUps = generateFollowUps(scoredLead, customer, estimate)

  return {
    ok: true as const,
    lead: scoredLead,
    estimate,
    proposal,
    followUps,
    workspace: {
      ...workspace,
      leads: workspace.leads.map((item) => (item.id === lead.id ? scoredLead : item)),
      estimates: [estimate, ...workspace.estimates.filter((item) => item.leadId !== lead.id)],
      proposals: [proposal, ...workspace.proposals.filter((item) => item.leadId !== lead.id)],
      followUps: [...followUps, ...workspace.followUps.filter((item) => item.leadId !== lead.id)],
    },
  }
}

function applyResponsePack(workspace: WorkspaceData, reviewId: string) {
  const review = workspace.reviews.find((item) => item.id === reviewId)
  if (!review) return { ok: false as const, error: 'review_not_found' }

  const customer = workspace.customers.find((item) => item.id === review.customerId)
  if (!customer) return { ok: false as const, error: 'customer_not_found' }

  const analyzedReview: Review = { ...review, ...analyzeReview(review) }
  const reviewResponse = generateReviewResponse(analyzedReview, customer, workspace.business)
  const feedbackCase =
    analyzedReview.rating <= 3 || analyzedReview.riskScore >= 50 ? buildFeedbackCase(analyzedReview, customer) : undefined
  const recoveryOffer = feedbackCase ? generateRecoveryOffer(feedbackCase, customer, workspace.business) : undefined

  return {
    ok: true as const,
    review: analyzedReview,
    reviewResponse,
    feedbackCase,
    recoveryOffer,
    workspace: {
      ...workspace,
      reviews: workspace.reviews.map((item) => (item.id === review.id ? analyzedReview : item)),
      reviewResponses: [reviewResponse, ...workspace.reviewResponses.filter((item) => item.reviewId !== review.id)],
      feedbackCases: feedbackCase
        ? [feedbackCase, ...workspace.feedbackCases.filter((item) => item.reviewId !== review.id)]
        : workspace.feedbackCases,
      recoveryOffers: recoveryOffer ? [recoveryOffer, ...workspace.recoveryOffers] : workspace.recoveryOffers,
    },
  }
}

function renderFirstPackDocument(workspace: WorkspaceData, submission: OnboardingSubmission) {
  const firstRecordId = submission.importedRecordIds?.[0]
  if (!firstRecordId) return { ok: false as const, error: 'onboarding_submission_import_required' }

  if (submission.materialType === 'lead_csv') {
    const lead = workspace.leads.find((item) => item.id === firstRecordId)
    if (!lead) return { ok: false as const, error: 'lead_not_found' }
    const customer = workspace.customers.find((item) => item.id === lead.customerId)
    const estimate = workspace.estimates.find((item) => item.leadId === lead.id)
    const proposal = workspace.proposals.find((item) => item.leadId === lead.id)
    if (!customer) return { ok: false as const, error: 'customer_not_found' }
    if (!estimate || !proposal) return { ok: false as const, error: 'first_pack_not_generated' }
    return {
      ok: true as const,
      filename: `${submission.id}-revenue-pack.md`,
      content: renderProposalDocument(workspace.business, customer, estimate, proposal),
    }
  }

  if (submission.materialType === 'review_csv') {
    const review = workspace.reviews.find((item) => item.id === firstRecordId)
    if (!review) return { ok: false as const, error: 'review_not_found' }
    const customer = workspace.customers.find((item) => item.id === review.customerId)
    const reviewResponse = workspace.reviewResponses.find((item) => item.reviewId === review.id)
    const feedbackCase = workspace.feedbackCases.find((item) => item.reviewId === review.id)
    const recoveryOffer = feedbackCase
      ? workspace.recoveryOffers.find((item) => item.feedbackCaseId === feedbackCase.id)
      : undefined
    if (!customer) return { ok: false as const, error: 'customer_not_found' }
    if (!reviewResponse) return { ok: false as const, error: 'first_pack_not_generated' }
    return {
      ok: true as const,
      filename: `${submission.id}-recovery-pack.md`,
      content: renderRecoveryDocument(workspace.business, customer, review, reviewResponse, recoveryOffer),
    }
  }

  return { ok: false as const, error: 'onboarding_submission_not_packable' }
}

function getLatestOutreachPack(workspace: WorkspaceData, prospectId: string) {
  return workspace.salesOutreachPacks
    .filter((pack) => pack.prospectId === prospectId)
    .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())[0]
}

function renderOutreachPackDocument(workspace: WorkspaceData, prospectId: string, packId?: string) {
  const prospect = workspace.salesProspects.find((item) => item.id === prospectId)
  if (!prospect) return { ok: false as const, error: 'sales_prospect_not_found' }
  const pack = packId
    ? workspace.salesOutreachPacks.find((item) => item.id === packId && item.prospectId === prospectId)
    : getLatestOutreachPack(workspace, prospectId)
  if (!pack) return { ok: false as const, error: 'sales_outreach_pack_not_found' }

  return {
    ok: true as const,
    filename: `${prospect.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || prospect.id}-outreach-pack.md`,
    content: renderSalesOutreachDocument(workspace.business, prospect, pack),
    pack,
  }
}

function renderCheckoutHandoffOrderFormDownload(workspace: WorkspaceData, prospectId: string, handoffId?: string) {
  const prospect = workspace.salesProspects.find((item) => item.id === prospectId)
  if (!prospect) return { ok: false as const, error: 'sales_prospect_not_found' }
  const handoff = (
    handoffId
      ? workspace.salesCheckoutHandoffs.find((item) => item.id === handoffId && item.prospectId === prospect.id)
      : workspace.salesCheckoutHandoffs
          .filter((item) => item.prospectId === prospect.id)
          .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]
  )
  if (!handoff) return { ok: false as const, error: 'sales_checkout_handoff_not_found' }
  if (!isActiveCheckoutHandoff(handoff.status) || checkoutHandoffExpired(handoff)) {
    return { ok: false as const, error: 'checkout_handoff_not_active' }
  }

  const plan = findBillingPlan(handoff.planId)
  if (!plan) return { ok: false as const, error: 'checkout_handoff_plan_invalid' }
  if (plan.product !== handoff.product) return { ok: false as const, error: 'checkout_handoff_plan_mismatch' }

  return {
    ok: true as const,
    filename: `${prospect.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || prospect.id}-paid-pilot-order-form.md`,
    content: renderCheckoutHandoffOrderFormDocument(workspace.business, handoff, plan),
    handoff,
  }
}

function getCsvBody(request: express.Request) {
  if (typeof request.body === 'string') return request.body
  if (typeof request.body?.csv === 'string') return request.body.csv
  return ''
}

function parseCheckoutBody(body: unknown) {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    planId: typeof payload.planId === 'string' ? payload.planId : '',
    successUrl: typeof payload.successUrl === 'string' ? payload.successUrl : '',
    cancelUrl: typeof payload.cancelUrl === 'string' ? payload.cancelUrl : '',
    customerEmail: typeof payload.customerEmail === 'string' ? payload.customerEmail : undefined,
    businessName: typeof payload.businessName === 'string' ? payload.businessName : undefined,
    businessWebsite: typeof payload.businessWebsite === 'string' ? payload.businessWebsite : undefined,
    businessCity: typeof payload.businessCity === 'string' ? payload.businessCity : undefined,
    businessState: typeof payload.businessState === 'string' ? payload.businessState : undefined,
    industry: typeof payload.industry === 'string' ? payload.industry : undefined,
    pilotScopeAccepted: payload.pilotScopeAccepted === true,
    humanReviewAccepted: payload.humanReviewAccepted === true,
    termsAccepted: payload.termsAccepted === true,
    privacyAccepted: payload.privacyAccepted === true,
    refundPolicyAccepted: payload.refundPolicyAccepted === true,
    checkoutHandoffToken: typeof payload.checkoutHandoffToken === 'string' ? payload.checkoutHandoffToken.trim() : '',
  }
}

function validateCheckoutProfile(input: ReturnType<typeof parseCheckoutBody>) {
  if (!input.planId || !input.successUrl || !input.cancelUrl) return 'checkout_required_fields_missing'
  if (!input.customerEmail || !input.businessName) return 'customer_email_and_business_required'
  if (!input.pilotScopeAccepted || !input.humanReviewAccepted || !input.termsAccepted || !input.privacyAccepted || !input.refundPolicyAccepted) {
    return 'pilot_checkout_acknowledgements_required'
  }
  return undefined
}

function requiresScopedPublicCheckout(env = process.env) {
  return env.NODE_ENV === 'production' && env.ENABLE_PUBLIC_SELF_SERVE_CHECKOUT !== 'true'
}

function productionWorkspaceOverwriteDisabled(env = process.env) {
  return env.NODE_ENV === 'production'
}

type AppServices = {
  createCheckoutSession?: typeof defaultCreateCheckoutSession
  createCustomerPortalSession?: typeof defaultCreateCustomerPortalSession
  verifyStripeWebhook?: typeof defaultVerifyStripeWebhook
  importGoogleReviews?: typeof defaultImportGoogleReviews
  replyToGoogleReview?: typeof defaultReplyToGoogleReview
}

type AppOptions = {
  serveStaticFrontend?: boolean
  staticDir?: string
}

function stableExternalId(prefix: string, value: string) {
  return `${prefix}_${createHash('sha1').update(value).digest('hex').slice(0, 18)}`
}

function defaultStaticDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
}

function parseAllowedOrigins(value = process.env.APP_ORIGIN) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => {
      try {
        return [new URL(item).origin]
      } catch {
        return []
      }
    })
}

function validateBillingReturnUrls(urls: string[]) {
  const parsedUrls: URL[] = []
  for (const url of urls) {
    try {
      parsedUrls.push(new URL(url))
    } catch {
      return { ok: false as const, status: 400, error: 'billing_url_invalid' }
    }
  }

  const allowedOrigins = parseAllowedOrigins()
  if (allowedOrigins.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false as const, status: 503, error: 'billing_origin_not_configured' }
    }
    return { ok: true as const }
  }

  const forbidden = parsedUrls.find((url) => !allowedOrigins.includes(url.origin))
  if (forbidden) {
    return {
      ok: false as const,
      status: 400,
      error: 'billing_url_origin_not_allowed',
      origin: forbidden.origin,
      allowedOrigins,
    }
  }

  return { ok: true as const }
}

function stripeEventAlreadyProcessed(workspace: WorkspaceData, eventId: string) {
  return workspace.auditLogs.some((log) => log.action === 'stripe_subscription_event' && log.entityId === eventId)
}

function readStripeId(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') return (value as { id: string }).id
  return undefined
}

function readPositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function normalizeStripeMetadata(metadata: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(metadata).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function paymentSourceFromMetadata(metadata: Record<string, string | undefined>): RevenuePayment['paymentSource'] {
  if (metadata.checkout_handoff_id || metadata.prospect_id) return 'sales_checkout_handoff'
  if (metadata.user_id === 'public-checkout') return 'public_checkout'
  return 'operator_checkout'
}

function buildRevenuePaymentFromCheckout(
  workspace: WorkspaceData,
  event: { id?: string; type: string; data: { object: unknown } },
  now = new Date().toISOString(),
) {
  if (event.type !== 'checkout.session.completed' || !event.id) return undefined
  const session = event.data.object as {
    id?: string
    amount_total?: number | null
    currency?: string | null
    customer?: unknown
    subscription?: unknown
    invoice?: unknown
    payment_intent?: unknown
    payment_status?: string | null
    latest_charge?: unknown
    charge?: unknown
    customer_email?: string | null
    customer_details?: { email?: string | null } | null
    metadata?: Record<string, string | undefined> | null
  }
  const metadata = session.metadata ?? {}
  const plan = metadata.plan_id ? findBillingPlan(metadata.plan_id) : undefined
  if (!session.id || !plan || metadata.organization_id !== workspace.business.id) return undefined
  if (metadata.product !== plan.product) return undefined
  if (session.payment_status !== 'paid') return undefined

  const handoffId = typeof metadata.checkout_handoff_id === 'string' && metadata.checkout_handoff_id ? metadata.checkout_handoff_id : undefined
  const existing = workspace.revenuePayments.find(
    (payment) =>
      payment.stripeEventId === event.id ||
      payment.stripeCheckoutSessionId === session.id ||
      (handoffId && payment.checkoutHandoffId === handoffId && payment.status !== 'refunded' && payment.status !== 'disputed'),
  )
  if (existing) return undefined

  const sessionAmount = readPositiveInteger(session.amount_total)
  const setupRevenueCents = plan.setupFee * 100
  const mrrCents = plan.monthlyPrice * 100
  const grossCollectedCents = sessionAmount ?? setupRevenueCents + mrrCents
  const stripeSubscriptionId = readStripeId(session.subscription)
  const onboarding = stripeSubscriptionId
    ? workspace.onboarding.find((record) => record.stripeSubscriptionId === stripeSubscriptionId)
    : undefined
  const metadataSnapshot = normalizeStripeMetadata(metadata)

  return {
    id: `revenue_payment_${randomUUID()}`,
    organizationId: workspace.business.id,
    product: plan.product,
    planId: plan.id,
    businessName: metadata.business_name || workspace.business.name,
    customerEmail: metadata.owner_email || session.customer_details?.email || session.customer_email || '',
    currency: session.currency?.toUpperCase() === 'CNY' ? 'CNY' : 'USD',
    grossCollectedCents,
    setupRevenueCents,
    mrrCents,
    planMonthlyPriceSnapshotCents: mrrCents,
    planSetupFeeSnapshotCents: setupRevenueCents,
    amountSource: sessionAmount === undefined ? 'catalog_fallback' : 'stripe_session',
    paymentSource: paymentSourceFromMetadata(metadata),
    paymentStatus: 'paid',
    status: 'paid',
    source: 'stripe_checkout',
    stripeEventId: event.id,
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: readStripeId(session.customer),
    stripeSubscriptionId,
    stripeInvoiceId: readStripeId(session.invoice),
    stripePaymentIntentId: readStripeId(session.payment_intent),
    stripeChargeId: readStripeId(session.latest_charge) ?? readStripeId(session.charge),
    prospectId: metadata.prospect_id || undefined,
    checkoutHandoffId: handoffId,
    onboardingId: onboarding?.id,
    metadataSnapshot,
    receivedAt: now,
    createdAt: now,
    updatedAt: now,
  } satisfies RevenuePayment
}

function paymentMatchKeysFromStripeObject(object: unknown) {
  const payload = object && typeof object === 'object' ? (object as Record<string, unknown>) : {}
  const keys = new Set<string>()
  for (const key of ['checkout_session', 'checkout_session_id', 'payment_intent', 'invoice', 'charge']) {
    const id = readStripeId(payload[key])
    if (id) keys.add(id)
  }
  const latestCharge = readStripeId(payload.latest_charge)
  if (latestCharge) keys.add(latestCharge)
  const charge = payload.charge && typeof payload.charge === 'object' ? (payload.charge as Record<string, unknown>) : undefined
  if (charge) {
    for (const key of ['id', 'payment_intent', 'invoice']) {
      const id = readStripeId(charge[key])
      if (id) keys.add(id)
    }
  }
  return keys
}

function revenuePaymentMatchesStripeKeys(payment: RevenuePayment, keys: Set<string>) {
  return [
    payment.stripeCheckoutSessionId,
    payment.stripePaymentIntentId,
    payment.stripeInvoiceId,
    payment.stripeChargeId,
  ].some((id) => Boolean(id && keys.has(id)))
}

function applyRevenuePaymentStatusEvent(
  workspace: WorkspaceData,
  event: { type: string; data: { object: unknown } },
  now = new Date().toISOString(),
) {
  const nextStatus =
    event.type === 'charge.refunded' || event.type === 'refund.created' || event.type === 'refund.updated'
      ? 'refunded'
      : event.type === 'charge.dispute.created' || event.type === 'charge.dispute.updated'
        ? 'disputed'
        : undefined
  if (!nextStatus) return { workspace, audits: [] as AuditLog[] }

  const keys = paymentMatchKeysFromStripeObject(event.data.object)
  if (keys.size === 0) return { workspace, audits: [] as AuditLog[] }
  const payment = workspace.revenuePayments.find((item) => revenuePaymentMatchesStripeKeys(item, keys))
  if (!payment || payment.status === nextStatus) return { workspace, audits: [] as AuditLog[] }
  const statusField = nextStatus === 'refunded' ? { refundedAt: now } : { disputedAt: now }
  const updatedPayment: RevenuePayment = {
    ...payment,
    ...statusField,
    status: nextStatus,
    statusUpdatedAt: now,
    statusReason: event.type,
    updatedAt: now,
  }
  return {
    workspace: {
      ...workspace,
      revenuePayments: workspace.revenuePayments.map((item) => (item.id === updatedPayment.id ? updatedPayment : item)),
    },
    audits: [
      makeAudit(
        nextStatus === 'refunded' ? 'revenue_payment_refunded' : 'revenue_payment_disputed',
        'revenue_payment',
        payment.id,
        `Marked Stripe payment for ${payment.businessName} as ${nextStatus} from ${event.type}.`,
      ),
    ],
  }
}

function applySalesCheckoutPayment(workspace: WorkspaceData, event: { type: string; data: { object: unknown } }, now = new Date().toISOString()) {
  if (event.type !== 'checkout.session.completed') return { workspace, audits: [] as AuditLog[] }
  const session = event.data.object as {
    id?: string
    customer?: string | { id?: string }
    subscription?: string | { id?: string }
    payment_status?: string | null
    metadata?: Record<string, string | undefined> | null
  }
  if (session.payment_status !== 'paid') return { workspace, audits: [] as AuditLog[] }
  const handoffId = session.metadata?.checkout_handoff_id
  const prospectId = session.metadata?.prospect_id
  if (!handoffId || !prospectId) return { workspace, audits: [] as AuditLog[] }

  const handoff = workspace.salesCheckoutHandoffs.find((item) => item.id === handoffId && item.prospectId === prospectId)
  const prospect = workspace.salesProspects.find((item) => item.id === prospectId)
  if (!handoff || !prospect) return { workspace, audits: [] as AuditLog[] }

  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  const onboarding = stripeSubscriptionId
    ? workspace.onboarding.find((item) => item.stripeSubscriptionId === stripeSubscriptionId)
    : undefined
  const paidHandoff: SalesCheckoutHandoff = {
    ...handoff,
    status: 'paid',
    paidAt: now,
    stripeCheckoutSessionId: session.id ?? handoff.stripeCheckoutSessionId,
    stripeCustomerId: stripeCustomerId ?? handoff.stripeCustomerId,
    stripeSubscriptionId: stripeSubscriptionId ?? handoff.stripeSubscriptionId,
    onboardingId: onboarding?.id ?? handoff.onboardingId,
    updatedAt: now,
  }
  const wonProspect: SalesProspect = {
    ...prospect,
    status: 'won',
    nextTouch: 'hold',
    lastContactedAt: maxIsoTimestamp(prospect.lastContactedAt, now),
    updatedAt: now,
  }
  const paidActivity = {
    id: `sales_activity_${randomUUID()}`,
    prospectId: prospect.id,
    organizationId: prospect.organizationId,
    businessName: prospect.businessName,
    channel: 'manual',
    outcome: 'won',
    summary: `Stripe payment confirmed for checkout handoff ${handoff.id}.`,
    nextStep: 'Open onboarding and collect customer materials.',
    ownerEmail: handoff.customerEmail,
    occurredAt: now,
    createdAt: now,
    updatedAt: now,
  } satisfies SalesActivity

  return {
    workspace: {
      ...workspace,
      salesCheckoutHandoffs: workspace.salesCheckoutHandoffs.map((item) => (item.id === paidHandoff.id ? paidHandoff : item)),
      salesProspects: workspace.salesProspects.map((item) => (item.id === wonProspect.id ? wonProspect : item)),
      salesActivities: [paidActivity, ...workspace.salesActivities],
    },
    audits: [
      makeAudit(
        'sales_checkout_paid',
        'sales_checkout_handoff',
        handoff.id,
        `Stripe payment confirmed for ${prospect.businessName}; prospect marked won.`,
      ),
    ],
  }
}

export function createApp(
  repository: WorkspaceRepository = createWorkspaceRepository(),
  services: AppServices = {},
  options: AppOptions = {},
) {
  const app = express()
  const createCheckoutSession = services.createCheckoutSession ?? defaultCreateCheckoutSession
  const createCustomerPortalSession = services.createCustomerPortalSession ?? defaultCreateCustomerPortalSession
  const verifyStripeWebhook = services.verifyStripeWebhook ?? defaultVerifyStripeWebhook
  const importGoogleReviews = services.importGoogleReviews ?? defaultImportGoogleReviews
  const replyToGoogleReview = services.replyToGoogleReview ?? defaultReplyToGoogleReview
  const requireOrganizationScope: express.RequestHandler = (request, response, next) => {
    repository
      .read()
      .then((workspace) => {
        if (!assertOrganizationScope(request.principal, workspace)) {
          response.status(403).json({ error: 'organization_scope_mismatch' })
          return
        }

        response.setHeader('x-organization-id', workspace.business.id)
        next()
      })
      .catch(() => response.status(500).json({ error: 'workspace_read_failed' }))
  }

  app.use(helmet())
  const corsOrigins = process.env.APP_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean)
  app.use(cors({ origin: process.env.NODE_ENV === 'production' ? (corsOrigins?.length ? corsOrigins : false) : (corsOrigins ?? true) }))
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (request, response) => {
    const verification = verifyStripeWebhook(request.body, request.header('stripe-signature') ?? undefined)
    if (!verification.ok) {
      response.status(verification.status).json({ error: verification.error })
      return
    }

    const result = await repository.update<{ changed: boolean; duplicate: boolean }>((workspace) => {
      if (stripeEventAlreadyProcessed(workspace, verification.event.id)) {
        return { workspace, result: { changed: false, duplicate: true } }
      }

      const subscriptionWorkspace = applyStripeSubscriptionEvent(workspace, verification.event)
      const paymentResult = applySalesCheckoutPayment(subscriptionWorkspace, verification.event)
      const revenuePayment = buildRevenuePaymentFromCheckout(paymentResult.workspace, verification.event)
      const revenueWorkspace = revenuePayment
        ? {
            ...paymentResult.workspace,
            revenuePayments: [revenuePayment, ...paymentResult.workspace.revenuePayments],
          }
        : paymentResult.workspace
      const revenueStatusResult = applyRevenuePaymentStatusEvent(revenueWorkspace, verification.event)
      const nextWorkspace = revenueStatusResult.workspace
      const changed = nextWorkspace !== workspace
      if (!changed) return { workspace, result: { changed: false, duplicate: false } }

      const stripeAudit = makeAudit('stripe_subscription_event', 'subscription', verification.event.id, `Handled ${verification.event.type}.`)
      const revenueAudits = revenuePayment
        ? [
            makeAudit(
              'revenue_payment_recorded',
              'revenue_payment',
              revenuePayment.id,
              `Recorded ${revenuePayment.currency} ${(revenuePayment.grossCollectedCents / 100).toFixed(2)} Stripe payment for ${revenuePayment.businessName}.`,
            ),
          ]
        : []
      return {
        workspace: {
          ...nextWorkspace,
          auditLogs: [stripeAudit, ...paymentResult.audits, ...revenueAudits, ...revenueStatusResult.audits, ...nextWorkspace.auditLogs],
        },
        result: { changed: true, duplicate: false },
      }
    })
    response.json({ received: true, type: verification.event.type, ...result })
  })
  app.post('/api/webhooks/email/unsubscribe', express.json({ limit: '256kb' }), async (request, response) => {
    if (requireEmailWebhookSecret()) {
      const bearer = request.header('authorization')?.startsWith('Bearer ')
        ? request.header('authorization')?.slice('Bearer '.length)
        : undefined
      const valid = validateSharedWebhookSecret({
        expected: process.env.EMAIL_WEBHOOK_SECRET,
        received: request.header('x-local-growth-webhook-secret') ?? bearer,
      })
      if (!valid) {
        response.status(403).json({ error: 'email_webhook_secret_invalid' })
        return
      }
    }
    const email = String(request.body?.email || request.body?.Email || request.body?.Recipient || '')
    const source = request.body?.source === 'sendgrid' ? 'sendgrid' : request.body?.source === 'manual' ? 'manual' : 'postmark'
    const result = await repository.update<EmailUnsubscribeWebhookResult>((workspace) => {
      const applied = applyEmailUnsubscribe(workspace, { email, source, rawValue: JSON.stringify(request.body ?? {}) })
      if (!applied.ok) return { workspace, result: { ok: false as const, status: 404, error: applied.error } }

      const nextWorkspace = saveWithAudit(
        applied.workspace,
        makeAudit('email_unsubscribe', 'customer', applied.customerId, `Email consent removed via ${source}.`),
      )
      return { workspace: nextWorkspace, result: { ok: true as const, customerId: applied.customerId } }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json({ ok: true, customerId: result.customerId })
  })
  app.post('/api/webhooks/twilio/inbound', express.urlencoded({ extended: false }), async (request, response) => {
    if (requireTwilioSignature()) {
      const url = `${request.protocol}://${request.get('host')}${request.originalUrl}`
      const valid = validateTwilioSignature({
        url,
        params: request.body as Record<string, string | string[] | undefined>,
        signature: request.header('x-twilio-signature') ?? undefined,
        authToken: process.env.TWILIO_AUTH_TOKEN,
      })
      if (!valid) {
        response.status(403).json({ error: 'twilio_signature_invalid' })
        return
      }
    }
    const from = String(request.body?.From || '')
    const body = String(request.body?.Body || '')
    const result = await repository.update<SmsInboundWebhookResult>((workspace) => {
      const applied = applySmsInboundConsent(workspace, { from, body, source: 'twilio' })
      if (!applied.ok) {
        return {
          workspace,
          result: { ok: false as const, status: applied.error === 'non_consent_message' ? 202 : 404, error: applied.error },
        }
      }

      const nextWorkspace = saveWithAudit(
        applied.workspace,
        makeAudit('sms_consent_update', 'customer', applied.customerId, `SMS consent ${applied.action} via Twilio inbound.`),
      )
      return { workspace: nextWorkspace, result: { ok: true as const, customerId: applied.customerId, action: applied.action } }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json({ ok: true, customerId: result.customerId, action: result.action })
  })
  app.use(express.json({ limit: '2mb' }))
  app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }))
  app.use(morgan('tiny'))

  app.get('/api/public/onboarding/:token', rateLimitPublicOnboarding, async (request, response) => {
    const workspace = await repository.read()
    const record = workspace.onboarding.find((item) => item.customerAccessToken === request.params.token)
    if (!record) {
      response.status(404).json({ error: 'onboarding_record_not_found' })
      return
    }

    response.json({
      record: toPublicOnboardingRecord(record),
      submissions: getPublicOnboardingSubmissions(workspace, record.id),
    })
  })

  app.patch('/api/public/onboarding/:token/checklist/:itemKey', rateLimitPublicOnboarding, async (request, response) => {
    if (typeof request.body?.done !== 'boolean') {
      response.status(400).json({ error: 'done_boolean_required' })
      return
    }

    const itemKey = String(request.params.itemKey)
    if (!customerEditableOnboardingKeys.has(itemKey)) {
      response.status(403).json({ error: 'onboarding_item_not_customer_editable' })
      return
    }

    const result = await repository.update<PublicOnboardingUpdateResult>((workspace) => {
      const record = workspace.onboarding.find((item) => item.customerAccessToken === request.params.token)
      if (!record) return { workspace, result: { ok: false as const, status: 404, error: 'onboarding_record_not_found' } }

      const update = updateOnboardingChecklist(workspace, record.id, itemKey, request.body.done)
      if (!update.ok) return { workspace, result: { ok: false as const, status: 404, error: update.error } }

      const nextWorkspace = saveWithAudit(
        update.workspace,
        {
          ...makeAudit(
            'customer_onboarding_checklist_updated',
            'onboarding',
            update.record.id,
            `Customer marked ${itemKey} ${request.body.done ? 'complete' : 'incomplete'} for ${update.record.businessName}.`,
          ),
          actor: 'Customer Onboarding',
        },
      )
      return {
        workspace: nextWorkspace,
        result: {
          ok: true as const,
          record: toPublicOnboardingRecord(update.record),
          submissions: getPublicOnboardingSubmissions(nextWorkspace, update.record.id),
        },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json({
      record: result.record,
      submissions: result.submissions,
    })
  })

  app.post('/api/public/onboarding/:token/submissions', rateLimitPublicOnboarding, async (request, response) => {
    const input = parseOnboardingSubmissionBody(request.body)
    const validationError = validateOnboardingSubmission(input)
    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const result = await repository.update<PublicOnboardingSubmissionResult>((workspace) => {
      const record = workspace.onboarding.find((item) => item.customerAccessToken === request.params.token)
      if (!record) return { workspace, result: { ok: false as const, status: 404, error: 'onboarding_record_not_found' } }

      const created = createOnboardingSubmission(workspace, record, input)
      const nextWorkspace = saveWithAudit(
        created.workspace,
        {
          ...makeAudit(
            'customer_onboarding_materials_submitted',
            'onboarding_submission',
            created.submission.id,
            `Customer submitted ${created.submission.materialType} for ${created.record.businessName}.`,
          ),
          actor: 'Customer Onboarding',
        },
      )
      return {
        workspace: nextWorkspace,
        result: {
          ok: true as const,
          record: toPublicOnboardingRecord(created.record),
          submission: toPublicOnboardingSubmission(created.submission),
          submissions: getPublicOnboardingSubmissions(nextWorkspace, created.record.id),
        },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.status(201).json({
      record: result.record,
      submission: result.submission,
      submissions: result.submissions,
    })
  })

  app.post('/api/public/onboarding/:token/delivery-confirmation', rateLimitPublicOnboarding, async (request, response) => {
    const input = parsePublicDeliveryConfirmationBody(request.body)
    const validationError = validatePublicDeliveryConfirmationInput(input)
    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const result = await repository.update<PublicOnboardingUpdateResult>((workspace) => {
      const record = workspace.onboarding.find((item) => item.customerAccessToken === request.params.token)
      if (!record) return { workspace, result: { ok: false as const, status: 404, error: 'onboarding_record_not_found' } }

      const confirmed = confirmDeliveryEvidence(workspace, record, input)
      if (!confirmed.ok) return { workspace, result: { ok: false as const, status: confirmed.status, error: confirmed.error } }

      const nextWorkspace = saveWithAudit(
        confirmed.workspace,
        {
          ...makeAudit(
            'customer_delivery_response_recorded',
            'onboarding',
            confirmed.record.id,
            `Customer selected ${confirmed.record.customerDeliveryResponse} for first delivery at ${confirmed.record.businessName}.`,
          ),
          actor: 'Customer Onboarding',
        },
      )
      return {
        workspace: nextWorkspace,
        result: {
          ok: true as const,
          record: toPublicOnboardingRecord(confirmed.record),
          submissions: getPublicOnboardingSubmissions(nextWorkspace, confirmed.record.id),
        },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json({
      record: result.record,
      submissions: result.submissions,
    })
  })

  app.get('/api/public/checkout-handoff/:token', rateLimitPublicCheckoutHandoff, async (request, response) => {
    const workspace = await repository.read()
    const handoff = workspace.salesCheckoutHandoffs.find((item) => item.token === request.params.token)
    if (!handoff) {
      response.status(404).json({ error: 'checkout_handoff_not_found' })
      return
    }
    if (!isActiveCheckoutHandoff(handoff.status) || checkoutHandoffExpired(handoff)) {
      response.status(410).json({ error: 'checkout_handoff_not_active' })
      return
    }

    response.json({ handoff: toPublicCheckoutHandoff(handoff) })
  })

  app.get('/api/public/recovery-link/:token', rateLimitPublicRecoveryLink, async (request, response) => {
    const result = await repository.update<PublicRecoveryLinkResult>((workspace) => {
      const link = workspace.revenueRecoveryLinks.find((item) => item.token === request.params.token)
      if (!link) return { workspace, result: { ok: false as const, status: 404, error: 'recovery_link_not_found' } }
      if (Date.parse(link.expiresAt) < Date.now() || link.status === 'expired') {
        return { workspace, result: { ok: false as const, status: 410, error: 'recovery_link_expired' } }
      }

      const now = new Date().toISOString()
      const nextLink = link.openedAt ? link : { ...link, status: 'opened' as const, openedAt: now, updatedAt: now }
      const nextWorkspace =
        nextLink === link
          ? workspace
          : {
              ...workspace,
              revenueRecoveryLinks: workspace.revenueRecoveryLinks.map((item) => (item.id === nextLink.id ? nextLink : item)),
            }
      return { workspace: nextWorkspace, result: { ok: true as const, link: toPublicRevenueRecoveryLink(nextLink) } }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json({ link: result.link })
  })

  app.post('/api/public/recovery-link/:token/respond', rateLimitPublicRecoveryLink, async (request, response) => {
    const input = parseRecoveryLinkResponseBody(request.body)
    const result = await repository.update<PublicRecoveryLinkResult>((workspace) => {
      const link = workspace.revenueRecoveryLinks.find((item) => item.token === request.params.token)
      if (!link) return { workspace, result: { ok: false as const, status: 404, error: 'recovery_link_not_found' } }

      const applied = applyRevenueRecoveryResponse(workspace, link, input)
      if (!applied.ok) return { workspace, result: { ok: false as const, status: applied.status, error: applied.error } }

      const nextWorkspace = saveWithAudit(
        applied.workspace,
        {
          ...makeAudit(
            'revenue_recovery_link_responded',
            'revenue_recovery_link',
            applied.link.id,
            `Customer selected ${applied.link.responseAction} for ${applied.link.title}.`,
          ),
          actor: 'Revenue Recovery Link',
        },
      )
      return { workspace: nextWorkspace, result: { ok: true as const, link: toPublicRevenueRecoveryLink(applied.link) } }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json({ link: result.link })
  })

  app.post('/api/public/checkout', async (request, response) => {
    const input = parseCheckoutBody(request.body)
    if (requiresScopedPublicCheckout() && !input.checkoutHandoffToken) {
      response.status(403).json({ error: 'public_self_serve_checkout_disabled' })
      return
    }

    const error = validateCheckoutProfile(input)
    if (error) {
      response.status(400).json({ error })
      return
    }

    const urlValidation = validateBillingReturnUrls([input.successUrl, input.cancelUrl])
    if (!urlValidation.ok) {
      response.status(urlValidation.status).json(urlValidation)
      return
    }

    const lookup = await repository.update<PublicCheckoutHandoffLookupResult>((workspace) => {
      const handoff = input.checkoutHandoffToken
        ? workspace.salesCheckoutHandoffs.find((item) => item.token === input.checkoutHandoffToken)
        : undefined
      if (input.checkoutHandoffToken && !handoff) {
        return { workspace, result: { ok: false as const, status: 404, error: 'checkout_handoff_not_found' } }
      }
      if (handoff && (!isActiveCheckoutHandoff(handoff.status) || checkoutHandoffExpired(handoff))) {
        return { workspace, result: { ok: false as const, status: 410, error: 'checkout_handoff_not_active' } }
      }
      if (
        handoff &&
        (handoff.planId !== input.planId || handoff.customerEmail !== input.customerEmail || handoff.businessName !== input.businessName)
      ) {
        return { workspace, result: { ok: false as const, status: 409, error: 'checkout_handoff_profile_mismatch' } }
      }
      if (handoff && handoff.stripeCheckoutSessionId && handoff.stripeCheckoutUrl) {
        return {
          workspace,
          result: {
            ok: true as const,
            workspace,
            handoff,
            existingSession: { sessionId: handoff.stripeCheckoutSessionId, url: handoff.stripeCheckoutUrl },
          },
        }
      }
      if (handoff && checkoutSessionCreationInProgress(handoff)) {
        return { workspace, result: { ok: false as const, status: 409, error: 'checkout_handoff_checkout_in_progress' } }
      }
      const now = new Date().toISOString()
      const claimedHandoff = handoff ? { ...handoff, stripeCheckoutCreatingAt: now, updatedAt: now } : undefined
      const nextWorkspace = claimedHandoff
        ? {
            ...workspace,
            salesCheckoutHandoffs: workspace.salesCheckoutHandoffs.map((item) => (item.id === claimedHandoff.id ? claimedHandoff : item)),
          }
        : workspace
      return {
        workspace: nextWorkspace,
        result: {
          ok: true as const,
          workspace: nextWorkspace,
          handoff: claimedHandoff,
        },
      }
    })
    if (!lookup.ok) {
      response.status(lookup.status).json({ error: lookup.error })
      return
    }
    if (lookup.existingSession) {
      const plan = findBillingPlan(lookup.handoff?.planId ?? input.planId)
      response.json({ sessionId: lookup.existingSession.sessionId, url: lookup.existingSession.url, plan })
      return
    }

    const handoff = lookup.handoff
    const result = await createCheckoutSession({
      ...input,
      planId: handoff?.planId ?? input.planId,
      customerEmail: handoff?.customerEmail ?? input.customerEmail,
      businessName: handoff?.businessName ?? input.businessName,
      businessWebsite: handoff?.businessWebsite ?? input.businessWebsite,
      businessCity: handoff?.businessCity ?? input.businessCity,
      businessState: handoff?.businessState ?? input.businessState,
      industry: handoff?.industry ?? input.industry,
      organizationId: lookup.workspace.business.id,
      userId: 'public-checkout',
      prospectId: handoff?.prospectId,
      checkoutHandoffId: handoff?.id,
      idempotencyKey: handoff ? `checkout_handoff_${handoff.id}` : undefined,
      pilotScopeSummary: handoff?.scopeSummary,
      pilotScopeHash: handoff?.scopeAcceptedHash,
    })
    if (!result.ok) {
      if (handoff) {
        await repository.update((workspace) => ({
          workspace: {
            ...workspace,
            salesCheckoutHandoffs: workspace.salesCheckoutHandoffs.map((item) =>
              item.id === handoff.id ? { ...item, stripeCheckoutCreatingAt: undefined, updatedAt: new Date().toISOString() } : item,
            ),
          },
          result: undefined,
        }))
      }
      response.status(result.status).json({
        error: result.error,
        message: 'Paid checkout is not live until Stripe credentials and plan price IDs are configured.',
        missing: result.missing,
      })
      return
    }
    if (!result.url) {
      if (handoff) {
        await repository.update((workspace) => ({
          workspace: {
            ...workspace,
            salesCheckoutHandoffs: workspace.salesCheckoutHandoffs.map((item) =>
              item.id === handoff.id ? { ...item, stripeCheckoutCreatingAt: undefined, updatedAt: new Date().toISOString() } : item,
            ),
          },
          result: undefined,
        }))
      }
      response.status(502).json({ error: 'stripe_checkout_url_missing' })
      return
    }
    const checkoutUrl = result.url ?? ''

    if (!handoff) {
      response.json({ sessionId: result.sessionId, url: checkoutUrl, plan: result.plan })
      return
    }

    const savedSession = await repository.update<PublicCheckoutHandoffSessionResult>((workspace) => {
      const current = workspace.salesCheckoutHandoffs.find((item) => item.id === handoff.id)
      if (!current) return { workspace, result: { ok: false as const, status: 404, error: 'checkout_handoff_not_found' } }
      if (!isActiveCheckoutHandoff(current.status) || checkoutHandoffExpired(current)) {
        return { workspace, result: { ok: false as const, status: 410, error: 'checkout_handoff_not_active' } }
      }
      if (current.stripeCheckoutSessionId && current.stripeCheckoutUrl) {
        return {
          workspace,
          result: {
            ok: true as const,
            sessionId: current.stripeCheckoutSessionId,
            url: current.stripeCheckoutUrl,
            handoff: current,
            reusedExisting: true,
          },
        }
      }

      const now = new Date().toISOString()
      const nextHandoff: SalesCheckoutHandoff = {
        ...current,
        stripeCheckoutCreatingAt: undefined,
        stripeCheckoutSessionId: result.sessionId,
        stripeCheckoutUrl: checkoutUrl,
        updatedAt: now,
      }
      const nextWorkspace = {
        ...workspace,
        salesCheckoutHandoffs: workspace.salesCheckoutHandoffs.map((item) => (item.id === nextHandoff.id ? nextHandoff : item)),
      }
      return {
        workspace: nextWorkspace,
        result: {
          ok: true as const,
          sessionId: result.sessionId,
          url: checkoutUrl,
          handoff: nextHandoff,
          reusedExisting: false,
        },
      }
    })
    if (!savedSession.ok) {
      response.status(savedSession.status).json({ error: savedSession.error })
      return
    }

    response.json({ sessionId: savedSession.sessionId, url: savedSession.url, plan: result.plan })
  })

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      service: 'local-growth-os-api',
      time: new Date().toISOString(),
    })
  })

  app.get('/api/plans', (_request, response) => {
    response.json({ plans: billingPlans })
  })

  app.use('/api', requireProductionRuntimeConfig, requireApiKey, attachPrincipal, requireOrganizationScope)

  app.get('/api/integrations', requirePermission('workspace:read'), (_request, response) => {
    response.json({ integrations: getIntegrationStatus() })
  })

  app.get('/api/workspace', requirePermission('workspace:read'), async (_request, response) => {
    response.json(normalizeOnboardingWorkspace(await repository.read()))
  })

  app.get('/api/subscriptions', requirePermission('workspace:read'), async (_request, response) => {
    response.json({ subscriptions: (await repository.read()).subscriptions })
  })

  app.get('/api/revenue-payments', requirePermission('workspace:read'), async (_request, response) => {
    const workspace = await repository.read()
    response.json({
      payments: workspace.revenuePayments.sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt)),
    })
  })

  app.get('/api/revenue-summary', requirePermission('workspace:read'), async (request, response) => {
    const parsed = parseRevenueSummaryQuery(request.query)
    if (!parsed.ok) {
      response.status(400).json({ error: parsed.error })
      return
    }
    const workspace = await repository.read()
    response.json({ summary: buildRevenueSummary(workspace.revenuePayments, { since: parsed.since, until: parsed.until }) })
  })

  app.get('/api/revenue-command', requirePermission('workspace:read'), async (_request, response) => {
    const workspace = await repository.read()
    response.json({ command: buildRevenueCommandCenter(workspace) })
  })

  app.get('/api/recovery-links', requirePermission('workspace:read'), async (_request, response) => {
    const workspace = await repository.read()
    response.json({
      links: [...workspace.revenueRecoveryLinks].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    })
  })

  app.post('/api/recovery-links', requirePermission('workspace:write'), async (request, response) => {
    const input = parseRecoveryLinkBody(request.body)
    const result = await repository.update<RevenueRecoveryLinkCreateResult>((workspace) => {
      const created = createRevenueRecoveryLink(workspace, input)
      if (!created.ok) return { workspace, result: { ok: false as const, status: created.status, error: created.error } }

      const nextWorkspace = saveWithAudit(
        {
          ...workspace,
          revenueRecoveryLinks: [created.link, ...workspace.revenueRecoveryLinks],
        },
        makeAudit(
          'revenue_recovery_link_created',
          'revenue_recovery_link',
          created.link.id,
          `Created ${created.link.product === 'bidflow' ? 'BidFlow' : 'ReputeLoop'} recovery link for ${created.link.customerName}.`,
        ),
      )
      return {
        workspace: nextWorkspace,
        result: { ok: true as const, link: created.link, links: nextWorkspace.revenueRecoveryLinks, workspace: nextWorkspace },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.status(201).json({
      link: result.link,
      links: result.links,
      publicUrl: `${getPublicBuyBaseUrl(request).replace(/\/buy$/, '')}/recovery/${encodeURIComponent(result.link.token)}`,
      workspace: result.workspace,
    })
  })

  app.get('/api/onboarding', requirePermission('workspace:read'), async (_request, response) => {
    const workspace = normalizeOnboardingWorkspace(await repository.read())
    response.json({ onboarding: workspace.onboarding })
  })

  app.get('/api/onboarding/submissions', requirePermission('workspace:read'), async (_request, response) => {
    response.json({ submissions: (await repository.read()).onboardingSubmissions })
  })

  app.post(
    '/api/onboarding/submissions/:submissionId/preview',
    requirePermission('workspace:read'),
    async (request, response) => {
      const workspace = await repository.read()
      const submission = workspace.onboardingSubmissions.find((item) => item.id === request.params.submissionId)
      if (!submission) {
        response.status(404).json({ error: 'onboarding_submission_not_found' })
        return
      }

      const result = parseSubmissionCsv(workspace, submission)
      if (!result) {
        response.status(400).json({ error: 'onboarding_submission_not_importable' })
        return
      }

      response.json({
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
        records: result.records,
        submission,
        writable: result.errors.length === 0,
      })
    },
  )

  app.post(
    '/api/onboarding/submissions/:submissionId/import',
    requirePermission('workspace:write'),
    async (request, response) => {
      const result = await repository.update<OnboardingSubmissionImportResult>((workspace) => {
        const submission = workspace.onboardingSubmissions.find((item) => item.id === request.params.submissionId)
        if (!submission) {
          return { workspace, result: { ok: false as const, status: 404, error: 'onboarding_submission_not_found' } }
        }

        const parsed = parseSubmissionCsv(workspace, submission)
        if (!parsed) {
          return { workspace, result: { ok: false as const, status: 400, error: 'onboarding_submission_not_importable' } }
        }
        if (parsed.errors.length > 0) {
          return {
            workspace,
            result: {
              ok: false as const,
              status: 422,
              error: 'onboarding_submission_import_has_errors',
              imported: parsed.imported,
              skipped: parsed.skipped,
              errors: parsed.errors,
              records: parsed.records,
            },
          }
        }

        const now = new Date().toISOString()
        const nextSubmission = {
          ...submission,
          status: 'imported' as const,
          importedRecordIds: parsed.records.map((record) => record.id),
          updatedAt: now,
        }
        const workspaceWithSubmission = {
          ...parsed.workspace,
          onboardingSubmissions: parsed.workspace.onboardingSubmissions.map((item) =>
            item.id === nextSubmission.id ? nextSubmission : item,
          ),
        }
        const nextWorkspace = saveWithAudit(
          workspaceWithSubmission,
          makeAudit(
            'onboarding_submission_imported',
            'onboarding_submission',
            nextSubmission.id,
            `Imported ${parsed.imported} records from ${nextSubmission.title}; skipped ${parsed.skipped}.`,
          ),
        )
        return {
          workspace: nextWorkspace,
          result: {
            ok: true as const,
            imported: parsed.imported,
            skipped: parsed.skipped,
            errors: parsed.errors,
            records: parsed.records,
            submission: nextSubmission,
            submissions: nextWorkspace.onboardingSubmissions,
            workspace: nextWorkspace,
          },
        }
      })
      if (!result.ok) {
        response.status(result.status).json({
          error: result.error,
          imported: result.imported,
          skipped: result.skipped,
          errors: result.errors,
          records: result.records,
        })
        return
      }

      response.json({
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
        records: result.records,
        submission: result.submission,
        submissions: result.submissions,
        workspace: result.workspace,
      })
    },
  )

  app.post(
    '/api/onboarding/submissions/:submissionId/first-pack',
    requirePermission('workspace:write'),
    async (request, response) => {
      const result = await repository.update<OnboardingFirstPackResult>((workspace) => {
        const submission = workspace.onboardingSubmissions.find((item) => item.id === request.params.submissionId)
        if (!submission) {
          return { workspace, result: { ok: false as const, status: 404, error: 'onboarding_submission_not_found' } }
        }
        if (submission.status !== 'imported' || !submission.importedRecordIds?.length) {
          return { workspace, result: { ok: false as const, status: 409, error: 'onboarding_submission_import_required' } }
        }

        const record = workspace.onboarding.find((item) => item.id === submission.onboardingId)
        if (!record) {
          return { workspace, result: { ok: false as const, status: 404, error: 'onboarding_record_not_found' } }
        }

        const firstRecordId = submission.importedRecordIds[0]
        const firstPack =
          submission.materialType === 'lead_csv'
            ? applyRevenuePack(workspace, firstRecordId)
            : submission.materialType === 'review_csv'
              ? applyResponsePack(workspace, firstRecordId)
              : undefined
        if (!firstPack) {
          return { workspace, result: { ok: false as const, status: 400, error: 'onboarding_submission_not_packable' } }
        }
        if (!firstPack.ok) {
          return { workspace, result: { ok: false as const, status: 404, error: firstPack.error } }
        }

        const checklistKeys =
          submission.materialType === 'lead_csv'
            ? ['lead_pipeline_reviewed', 'first_revenue_pack_sent']
            : ['review_queue_reviewed', 'first_response_pack_approved']
        let nextWorkspace = firstPack.workspace
        let nextRecord = record
        for (const itemKey of checklistKeys) {
          const checklistResult = updateOnboardingChecklist(nextWorkspace, record.id, itemKey, true)
          if (checklistResult.ok) {
            nextWorkspace = checklistResult.workspace
            nextRecord = checklistResult.record
          }
        }
        const deliveryReadyRecord: OnboardingRecord = {
          ...normalizeOnboardingRecord(nextRecord),
          deliveryStatus: 'pack_ready',
          deliveryPackSummary:
            submission.materialType === 'lead_csv'
              ? 'First BidFlow revenue pack generated and waiting for QA approval.'
              : 'First ReputeLoop response and recovery pack generated and waiting for QA approval.',
          updatedAt: new Date().toISOString(),
        }
        nextWorkspace = {
          ...nextWorkspace,
          onboarding: nextWorkspace.onboarding.map((item) => (item.id === deliveryReadyRecord.id ? deliveryReadyRecord : item)),
        }

        const savedWorkspace = saveWithAudit(
          nextWorkspace,
          makeAudit(
            'onboarding_first_pack_generated',
            'onboarding_submission',
            submission.id,
            `Generated first ${submission.materialType === 'lead_csv' ? 'revenue' : 'response'} pack for ${record.businessName}.`,
          ),
        )
        return {
          workspace: savedWorkspace,
          result: {
            ok: true as const,
            onboarding: savedWorkspace.onboarding,
            record: deliveryReadyRecord,
            submission,
            workspace: savedWorkspace,
            firstPack,
          },
        }
      })
      if (!result.ok) {
        response.status(result.status).json({ error: result.error })
        return
      }

      response.json({
        onboarding: result.onboarding,
        record: result.record,
        submission: result.submission,
        workspace: result.workspace,
        firstPack: result.firstPack,
      })
    },
  )

  app.get(
    '/api/onboarding/submissions/:submissionId/delivery-pack',
    requirePermission('workspace:read'),
    async (request, response) => {
      const workspace = await repository.read()
      const submission = workspace.onboardingSubmissions.find((item) => item.id === request.params.submissionId)
      if (!submission) {
        response.status(404).json({ error: 'onboarding_submission_not_found' })
        return
      }

      const document = renderFirstPackDocument(workspace, submission)
      if (!document.ok) {
        response.status(document.error === 'first_pack_not_generated' ? 409 : 400).json({ error: document.error })
        return
      }

      response.json(document)
    },
  )

  app.get('/api/pilot-outcomes', requirePermission('workspace:read'), async (_request, response) => {
    const workspace = await repository.read()
    response.json({ outcomes: workspace.pilotOutcomes })
  })

  app.post('/api/onboarding/:recordId/outcomes', requirePermission('workspace:write'), async (request, response) => {
    const input = parsePilotOutcomeBody(request.body)
    const validationError = validatePilotOutcome(input)
    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const result = await repository.update<PilotOutcomeMutationResult>((workspace) => {
      const record = workspace.onboarding.find((item) => item.id === request.params.recordId)
      if (!record) return { workspace, result: { ok: false as const, status: 404, error: 'onboarding_record_not_found' } }

      const outcome = createPilotOutcome(record, input, workspace.business.currency)
      const nextWorkspace = saveWithAudit(
        {
          ...workspace,
          pilotOutcomes: [outcome, ...workspace.pilotOutcomes],
        },
        makeAudit(
          'pilot_outcome_recorded',
          'pilot_outcome',
          outcome.id,
          `Recorded ${outcome.outcomeType.replaceAll('_', ' ')} outcome for ${record.businessName}.`,
        ),
      )
      return {
        workspace: nextWorkspace,
        result: { ok: true as const, outcome, outcomes: nextWorkspace.pilotOutcomes, workspace: nextWorkspace },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.status(201).json({ outcome: result.outcome, outcomes: result.outcomes, workspace: result.workspace })
  })

  app.patch('/api/onboarding/:recordId/delivery', requirePermission('workspace:write'), async (request, response) => {
    const input = parseDeliveryEvidenceBody(request.body)
    const validationError = validateDeliveryEvidenceInput(input)
    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const result = await repository.update<OnboardingRecordMutationResult>((workspaceData) => {
      const workspace = normalizeOnboardingWorkspace(workspaceData)
      const updated = updateDeliveryEvidence(workspace, String(request.params.recordId), input)
      if (!updated.ok) {
        return { workspace, result: { ok: false as const, status: updated.status, error: updated.error } }
      }

      const action =
        updated.record.deliveryStatus === 'qa_approved'
          ? 'onboarding_delivery_qa_approved'
          : updated.record.deliveryStatus === 'sent'
            ? 'onboarding_delivery_sent'
            : 'onboarding_delivery_updated'
      const nextWorkspace = saveWithAudit(
        updated.workspace,
        makeAudit(
          action,
          'onboarding',
          updated.record.id,
          `Updated first delivery evidence for ${updated.record.businessName} to ${updated.record.deliveryStatus}.`,
        ),
      )
      return {
        workspace: nextWorkspace,
        result: { ok: true as const, record: updated.record, onboarding: nextWorkspace.onboarding, workspace: nextWorkspace },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json({ record: result.record, onboarding: result.onboarding, workspace: result.workspace })
  })

  app.get('/api/sales-prospects', requirePermission('workspace:read'), async (_request, response) => {
    const workspace = await repository.read()
    response.json({ prospects: workspace.salesProspects })
  })

  app.get('/api/sales-activities', requirePermission('workspace:read'), async (request, response) => {
    const workspace = await repository.read()
    const result = filterSalesActivities(workspace, request.query as Record<string, unknown>)
    if (!result.ok) {
      response.status(400).json({ error: result.error })
      return
    }

    response.json({ activities: result.activities })
  })

  app.get('/api/sales-summary', requirePermission('workspace:read'), async (request, response) => {
    const workspace = await repository.read()
    const range = parseSalesSummaryQuery(request.query as Record<string, unknown>)
    if (!range.ok) {
      response.status(400).json({ error: range.error })
      return
    }

    response.json({ summary: buildSalesSummary(workspace, range.since, range.until) })
  })

  app.post('/api/import/prospects', requirePermission('workspace:write'), async (request, response) => {
    const csv = getCsvBody(request)
    if (!csv) {
      response.status(400).json({ error: 'csv_required' })
      return
    }

    const result = await repository.update<SalesProspectImportResult>((workspace) => {
      const imported = importProspectsCsv(workspace, csv)
      const nextWorkspace = saveWithAudit(
        imported.workspace,
        makeAudit(
          'csv_prospects_imported',
          'sales_prospect',
          'csv_import',
          `Imported ${imported.imported} prospects; skipped ${imported.skipped}.`,
        ),
      )
      return {
        workspace: nextWorkspace,
        result: {
          imported: imported.imported,
          skipped: imported.skipped,
          errors: imported.errors,
          prospects: imported.records,
          workspace: nextWorkspace,
        },
      }
    })
    response.status(result.errors.length ? 207 : 200).json({
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      prospects: result.prospects,
      workspace: result.workspace,
    })
  })

  app.patch('/api/sales-prospects/:prospectId', requirePermission('workspace:write'), async (request, response) => {
    const input = parseProspectPatchBody(request.body)
    if (input.status && !salesProspectStatuses.has(input.status as SalesProspect['status'])) {
      response.status(400).json({ error: 'sales_prospect_status_invalid' })
      return
    }
    if (input.nextTouch && !salesProspectTouches.has(input.nextTouch as SalesProspect['nextTouch'])) {
      response.status(400).json({ error: 'sales_prospect_next_touch_invalid' })
      return
    }

    const result = await repository.update<SalesProspectMutationResult>((workspace) => {
      const prospect = workspace.salesProspects.find((item) => item.id === request.params.prospectId)
      if (!prospect) return { workspace, result: { ok: false as const, status: 404, error: 'sales_prospect_not_found' } }

      const now = new Date().toISOString()
      const nextProspect: SalesProspect = {
        ...prospect,
        status: (input.status as SalesProspect['status'] | undefined) ?? prospect.status,
        nextTouch: (input.nextTouch as SalesProspect['nextTouch'] | undefined) ?? prospect.nextTouch,
        notes: input.notes ?? prospect.notes,
        lastContactedAt: input.status === 'contacted' || input.status === 'call_booked' ? now : prospect.lastContactedAt,
        updatedAt: now,
      }
      const nextWorkspace = saveWithAudit(
        {
          ...workspace,
          salesProspects: workspace.salesProspects.map((item) => (item.id === nextProspect.id ? nextProspect : item)),
        },
        makeAudit(
          'sales_prospect_updated',
          'sales_prospect',
          nextProspect.id,
          `Updated ${nextProspect.businessName} to ${nextProspect.status}.`,
        ),
      )
      return {
        workspace: nextWorkspace,
        result: { ok: true as const, prospect: nextProspect, prospects: nextWorkspace.salesProspects, workspace: nextWorkspace },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json({ prospect: result.prospect, prospects: result.prospects, workspace: result.workspace })
  })

  app.post('/api/sales-prospects/:prospectId/activities', requirePermission('workspace:write'), async (request, response) => {
    const input = parseSalesActivityBody(request.body)
    const validationError = validateSalesActivity(input)
    if (validationError) {
      response.status(400).json({ error: validationError })
      return
    }

    const result = await repository.update<SalesActivityMutationResult>((workspace) => {
      const prospect = workspace.salesProspects.find((item) => item.id === request.params.prospectId)
      if (!prospect) return { workspace, result: { ok: false as const, status: 404, error: 'sales_prospect_not_found' } }

      const now = new Date().toISOString()
      const activity = createSalesActivity(prospect, input, workspace.business.id, now)
      const isTerminal = prospect.status === 'won' || prospect.status === 'lost' || prospect.status === 'disqualified'
      const nextProspect: SalesProspect = {
        ...prospect,
        status: statusFromSalesActivity(activity.outcome, prospect.status),
        nextTouch: isTerminal ? 'hold' : nextTouchFromSalesActivity(activity.outcome, activity.channel, prospect.nextTouch),
        lastContactedAt: maxIsoTimestamp(prospect.lastContactedAt, activity.occurredAt),
        updatedAt: now,
      }
      const nextWorkspace = saveWithAudit(
        {
          ...workspace,
          salesProspects: workspace.salesProspects.map((item) => (item.id === prospect.id ? nextProspect : item)),
          salesActivities: [activity, ...workspace.salesActivities],
        },
        makeAudit(
          'sales_activity_recorded',
          'sales_activity',
          activity.id,
          `Recorded ${activity.outcome.replaceAll('_', ' ')} activity for ${activity.businessName}.`,
        ),
      )
      return {
        workspace: nextWorkspace,
        result: {
          ok: true as const,
          activity,
          activities: nextWorkspace.salesActivities,
          prospect: nextProspect,
          prospects: nextWorkspace.salesProspects,
          workspace: nextWorkspace,
        },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.status(201).json({
      activity: result.activity,
      activities: result.activities,
      prospect: result.prospect,
      prospects: result.prospects,
      workspace: result.workspace,
    })
  })

  app.get('/api/sales-prospects/:prospectId/checkout-handoffs', requirePermission('workspace:read'), async (request, response) => {
    const workspace = await repository.read()
    const prospect = workspace.salesProspects.find((item) => item.id === request.params.prospectId)
    if (!prospect) {
      response.status(404).json({ error: 'sales_prospect_not_found' })
      return
    }

    response.json({
      handoffs: workspace.salesCheckoutHandoffs
        .filter((item) => item.prospectId === prospect.id)
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    })
  })

  app.get('/api/sales-prospects/:prospectId/checkout-handoff/order-form', requirePermission('workspace:read'), async (request, response) => {
    const workspace = await repository.read()
    const handoffIdQuery = request.query.handoffId
    const handoffId = typeof handoffIdQuery === 'string' ? handoffIdQuery : undefined
    const document = renderCheckoutHandoffOrderFormDownload(workspace, String(request.params.prospectId), handoffId)
    if (!document.ok) {
      response
        .status(document.error === 'sales_prospect_not_found' ? 404 : document.error === 'checkout_handoff_not_active' ? 410 : 409)
        .json({ error: document.error })
      return
    }

    response.json(document)
  })

  app.post('/api/sales-prospects/:prospectId/checkout-handoff', requirePermission('workspace:write'), async (request, response) => {
    const input = parseCheckoutHandoffBody(request.body)
    const result = await repository.update<SalesCheckoutHandoffResult>((workspace) => {
      const prospect = workspace.salesProspects.find((item) => item.id === request.params.prospectId)
      if (!prospect) return { workspace, result: { ok: false as const, status: 404, error: 'sales_prospect_not_found' } }

      const existingActiveHandoff = workspace.salesCheckoutHandoffs.find(
        (item) => item.prospectId === prospect.id && isActiveCheckoutHandoff(item.status) && !checkoutHandoffExpired(item),
      )
      if (existingActiveHandoff) {
        return {
          workspace,
          result: { ok: false as const, status: 409, error: 'checkout_handoff_already_active', handoff: existingActiveHandoff },
        }
      }

      const created = createCheckoutHandoff(workspace, prospect, input, request)
      if (!created.ok) return { workspace, result: { ok: false as const, status: 400, error: created.error } }

      const activityInput = {
        channel: 'manual',
        outcome: 'checkout_sent',
        summary: `Created prospect-specific checkout handoff for ${prospect.businessName}.`,
        nextStep: 'Send the handoff link and confirm Stripe payment before marking revenue.',
        ownerEmail: input.createdBy,
        occurredAt: created.handoff.createdAt,
      } satisfies ReturnType<typeof parseSalesActivityBody>
      const activity = createSalesActivity(prospect, activityInput, workspace.business.id, created.handoff.createdAt)
      const nextProspect: SalesProspect = {
        ...prospect,
        status: statusFromSalesActivity(activity.outcome, prospect.status),
        nextTouch: 'hold',
        lastContactedAt: maxIsoTimestamp(prospect.lastContactedAt, activity.occurredAt),
        updatedAt: created.handoff.createdAt,
      }
      const nextWorkspace = saveWithAudit(
        {
          ...workspace,
          salesProspects: workspace.salesProspects.map((item) => (item.id === nextProspect.id ? nextProspect : item)),
          salesCheckoutHandoffs: [created.handoff, ...workspace.salesCheckoutHandoffs],
          salesActivities: [activity, ...workspace.salesActivities],
        },
        makeAudit(
          'sales_checkout_handoff_created',
          'sales_checkout_handoff',
          created.handoff.id,
          `Created checkout handoff for ${prospect.businessName}.`,
        ),
      )
      return {
        workspace: nextWorkspace,
        result: {
          ok: true as const,
          handoff: created.handoff,
          handoffs: nextWorkspace.salesCheckoutHandoffs.filter((item) => item.prospectId === prospect.id),
          activity,
          activities: nextWorkspace.salesActivities,
          prospect: nextProspect,
          prospects: nextWorkspace.salesProspects,
          workspace: nextWorkspace,
        },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error, handoff: result.handoff })
      return
    }

    response.status(201).json({
      handoff: result.handoff,
      handoffs: result.handoffs,
      activity: result.activity,
      activities: result.activities,
      prospect: result.prospect,
      prospects: result.prospects,
      workspace: result.workspace,
    })
  })

  app.get('/api/sales-prospects/:prospectId/outreach-pack', requirePermission('workspace:read'), async (request, response) => {
    const workspace = await repository.read()
    const prospect = workspace.salesProspects.find((item) => item.id === request.params.prospectId)
    if (!prospect) {
      response.status(404).json({ error: 'sales_prospect_not_found' })
      return
    }

    response.json({ pack: getLatestOutreachPack(workspace, prospect.id) ?? null })
  })

  app.post('/api/sales-prospects/:prospectId/outreach-pack', requirePermission('workspace:write'), async (request, response) => {
    const result = await repository.update<SalesOutreachPackMutationResult>((workspace) => {
      const prospect = workspace.salesProspects.find((item) => item.id === request.params.prospectId)
      if (!prospect) return { workspace, result: { ok: false as const, status: 404, error: 'sales_prospect_not_found' } }

      const now = new Date().toISOString()
      const pack = generateSalesOutreachPack(prospect, workspace.business)
      const nextProspect: SalesProspect = {
        ...prospect,
        status: prospect.status === 'new' ? 'qualified' : prospect.status,
        updatedAt: now,
      }
      const nextWorkspace = saveWithAudit(
        {
          ...workspace,
          salesProspects: workspace.salesProspects.map((item) => (item.id === prospect.id ? nextProspect : item)),
          salesOutreachPacks: [pack, ...workspace.salesOutreachPacks],
        },
        makeAudit(
          'sales_outreach_pack_generated',
          'sales_outreach_pack',
          pack.id,
          `Generated ${pack.product === 'bidflow' ? 'BidFlow' : 'ReputeLoop'} outreach pack for ${prospect.businessName}.`,
        ),
      )
      return {
        workspace: nextWorkspace,
        result: { ok: true as const, pack, prospect: nextProspect, prospects: nextWorkspace.salesProspects, workspace: nextWorkspace },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.status(201).json({ pack: result.pack, prospect: result.prospect, prospects: result.prospects, workspace: result.workspace })
  })

  app.get('/api/sales-prospects/:prospectId/outreach-pack/download', requirePermission('workspace:read'), async (request, response) => {
    const workspace = await repository.read()
    const packIdQuery = request.query.packId
    const packId = typeof packIdQuery === 'string' ? packIdQuery : undefined
    const document = renderOutreachPackDocument(workspace, String(request.params.prospectId), packId)
    if (!document.ok) {
      response.status(document.error === 'sales_prospect_not_found' ? 404 : 409).json({ error: document.error })
      return
    }

    response.json(document)
  })

  app.patch('/api/onboarding/:recordId/checklist/:itemKey', requirePermission('workspace:write'), async (request, response) => {
    if (typeof request.body?.done !== 'boolean') {
      response.status(400).json({ error: 'done_boolean_required' })
      return
    }

    const recordId = String(request.params.recordId)
    const itemKey = String(request.params.itemKey)
    const result = await repository.update<OnboardingRecordMutationResult>((workspace) => {
      const updated = updateOnboardingChecklist(workspace, recordId, itemKey, request.body.done)
      if (!updated.ok) {
        return { workspace, result: { ok: false as const, status: 404, error: updated.error } }
      }

      const nextWorkspace = saveWithAudit(
        updated.workspace,
        makeAudit(
          'onboarding_checklist_updated',
          'onboarding',
          updated.record.id,
          `Marked ${itemKey} ${request.body.done ? 'complete' : 'incomplete'} for ${updated.record.businessName}.`,
        ),
      )
      return {
        workspace: nextWorkspace,
        result: { ok: true as const, onboarding: nextWorkspace.onboarding, record: updated.record, workspace: nextWorkspace },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json({ onboarding: result.onboarding, record: result.record, workspace: result.workspace })
  })

  app.patch('/api/onboarding/submissions/:submissionId', requirePermission('workspace:write'), async (request, response) => {
    const status = typeof request.body?.status === 'string' ? request.body.status : ''
    if (!onboardingSubmissionStatuses.has(status as OnboardingSubmission['status'])) {
      response.status(400).json({ error: 'onboarding_submission_status_invalid' })
      return
    }

    const result = await repository.update<OnboardingSubmissionStatusResult>((workspace) => {
      const submission = workspace.onboardingSubmissions.find((item) => item.id === request.params.submissionId)
      if (!submission) {
        return { workspace, result: { ok: false as const, status: 404, error: 'onboarding_submission_not_found' } }
      }

      const now = new Date().toISOString()
      const nextSubmission = { ...submission, status: status as OnboardingSubmission['status'], updatedAt: now }
      const nextWorkspace = saveWithAudit(
        {
          ...workspace,
          onboardingSubmissions: workspace.onboardingSubmissions.map((item) =>
            item.id === nextSubmission.id ? nextSubmission : item,
          ),
        },
        makeAudit(
          'onboarding_submission_status_updated',
          'onboarding_submission',
          nextSubmission.id,
          `Marked onboarding submission ${nextSubmission.title} as ${nextSubmission.status}.`,
        ),
      )
      return {
        workspace: nextWorkspace,
        result: {
          ok: true as const,
          submission: nextSubmission,
          submissions: nextWorkspace.onboardingSubmissions,
          workspace: nextWorkspace,
        },
      }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json({ submission: result.submission, submissions: result.submissions, workspace: result.workspace })
  })

  app.put('/api/workspace', requirePermission('workspace:write'), async (request, response) => {
    if (productionWorkspaceOverwriteDisabled()) {
      response.status(403).json({ error: 'workspace_overwrite_disabled_in_production' })
      return
    }

    const workspace = request.body as WorkspaceData
    const nextWorkspace = saveWithAudit(
      workspace,
      makeAudit('workspace_saved', 'workspace', 'local-growth-os', 'Workspace state saved through the API boundary.'),
    )
    await repository.write(nextWorkspace)
    response.json(nextWorkspace)
  })

  app.post('/api/workspace/reset', requirePermission('workspace:write'), async (_request, response) => {
    if (productionWorkspaceOverwriteDisabled()) {
      response.status(403).json({ error: 'workspace_reset_disabled_in_production' })
      return
    }

    const workspace = await repository.reset()
    const nextWorkspace = saveWithAudit(
      workspace,
      makeAudit('workspace_reset', 'workspace', 'local-growth-os', 'Workspace reset to seeded operating data.'),
    )
    await repository.write(nextWorkspace)
    response.json(nextWorkspace)
  })

  app.post('/api/import/leads', requirePermission('workspace:write'), async (request, response) => {
    const csv = getCsvBody(request)
    if (!csv) {
      response.status(400).json({ error: 'csv_required' })
      return
    }

    const result = await repository.update<GenericImportResult<Lead>>((workspace) => {
      const imported = importLeadsCsv(workspace, csv)
      const nextWorkspace = saveWithAudit(
        imported.workspace,
        makeAudit('csv_leads_imported', 'lead', 'csv_import', `Imported ${imported.imported} leads; skipped ${imported.skipped}.`),
      )
      return {
        workspace: nextWorkspace,
        result: {
          imported: imported.imported,
          skipped: imported.skipped,
          errors: imported.errors,
          records: imported.records,
          workspace: nextWorkspace,
        },
      }
    })
    response.status(result.errors.length ? 207 : 200).json({
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      leads: result.records,
      workspace: result.workspace,
    })
  })

  app.post('/api/import/reviews', requirePermission('workspace:write'), async (request, response) => {
    const csv = getCsvBody(request)
    if (!csv) {
      response.status(400).json({ error: 'csv_required' })
      return
    }

    const result = await repository.update<GenericImportResult<Review>>((workspace) => {
      const imported = importReviewsCsv(workspace, csv)
      const nextWorkspace = saveWithAudit(
        imported.workspace,
        makeAudit('csv_reviews_imported', 'review', 'csv_import', `Imported ${imported.imported} reviews; skipped ${imported.skipped}.`),
      )
      return {
        workspace: nextWorkspace,
        result: {
          imported: imported.imported,
          skipped: imported.skipped,
          errors: imported.errors,
          records: imported.records,
          workspace: nextWorkspace,
        },
      }
    })
    response.status(result.errors.length ? 207 : 200).json({
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      reviews: result.records,
      workspace: result.workspace,
    })
  })

  app.post('/api/leads/:leadId/revenue-pack', requirePermission('revenue_pack:create'), async (request, response) => {
    const leadId = String(request.params.leadId)
    const result = await repository.update<WorkspaceGenerationResult>((workspace) => {
      const generated = applyRevenuePack(workspace, leadId)
      if (!generated.ok) {
        return { workspace, result: { ok: false as const, status: 404, error: generated.error } }
      }

      const savedWorkspace = saveWithAudit(
        generated.workspace,
        makeAudit('generated_revenue_pack', 'lead', leadId, 'API generated estimate, proposal, and follow-up sequence.'),
      )
      return { workspace: savedWorkspace, result: { ok: true as const, workspace: savedWorkspace } }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json(result.workspace)
  })

  app.post('/api/reviews/:reviewId/response-pack', requirePermission('response_pack:create'), async (request, response) => {
    const reviewId = String(request.params.reviewId)
    const result = await repository.update<WorkspaceGenerationResult>((workspace) => {
      const generated = applyResponsePack(workspace, reviewId)
      if (!generated.ok) {
        return { workspace, result: { ok: false as const, status: 404, error: generated.error } }
      }

      const savedWorkspace = saveWithAudit(
        generated.workspace,
        makeAudit('generated_response_pack', 'review', reviewId, 'API generated compliant reply and recovery assets.'),
      )
      return { workspace: savedWorkspace, result: { ok: true as const, workspace: savedWorkspace } }
    })
    if (!result.ok) {
      response.status(result.status).json({ error: result.error })
      return
    }

    response.json(result.workspace)
  })

  app.post('/api/google/reviews/import', requirePermission('workspace:write'), async (_request, response) => {
    const result = await importGoogleReviews()
    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
        missing: 'missing' in result ? result.missing : undefined,
      })
      return
    }

    const saved = await repository.update<GoogleReviewsImportMutationResult>((workspace) => {
      const knownReviewIds = new Set(workspace.reviews.flatMap((review) => [review.id, review.externalReviewId].filter(Boolean)))
      const existingCustomerIds = new Set(workspace.customers.map((customer) => customer.id))
      const importedReviews: Review[] = []
      const importedCustomers = [...workspace.customers]

      for (const googleReview of result.reviews) {
        if (knownReviewIds.has(googleReview.externalReviewId)) {
          continue
        }

        const customerId = stableExternalId('cust_google', googleReview.externalReviewId)
        if (!existingCustomerIds.has(customerId)) {
          importedCustomers.push({
            id: customerId,
            name: googleReview.reviewerName,
            email: '',
            phone: '',
            source: 'google_business_profile',
            tags: ['google-reviewer'],
            consentEmail: false,
            consentSms: false,
            lifetimeValue: 0,
            lastInteractionAt: googleReview.reviewedAt,
          })
          existingCustomerIds.add(customerId)
        }

        const rawReview = {
          ...googleReview,
          id: stableExternalId('rev_google', googleReview.externalReviewId),
          customerId,
        }
        importedReviews.push({ ...rawReview, ...analyzeReview(rawReview) })
        knownReviewIds.add(googleReview.externalReviewId)
      }

      const nextWorkspace = saveWithAudit(
        {
          ...workspace,
          customers: importedCustomers,
          reviews: [...importedReviews, ...workspace.reviews],
        },
        makeAudit('google_reviews_imported', 'review', 'google_business_profile', `Imported ${importedReviews.length} Google reviews.`),
      )
      return {
        workspace: nextWorkspace,
        result: { imported: importedReviews.length, nextPageToken: result.nextPageToken, reviews: importedReviews, workspace: nextWorkspace },
      }
    })
    response.json({ imported: saved.imported, nextPageToken: saved.nextPageToken, reviews: saved.reviews, workspace: saved.workspace })
  })

  app.post('/api/google/reviews/:reviewId/reply', requirePermission('message:send'), async (request, response) => {
    const workspace = await repository.read()
    const review = workspace.reviews.find((item) => item.id === request.params.reviewId)
    if (!review) {
      response.status(404).json({ error: 'review_not_found' })
      return
    }

    if (review.platform !== 'google' || !review.externalReviewId) {
      response.status(422).json({ error: 'google_review_external_id_missing' })
      return
    }

    const responseId = typeof request.body?.responseId === 'string' ? request.body.responseId : undefined
    const reviewResponse = responseId
      ? workspace.reviewResponses.find((item) => item.id === responseId && item.reviewId === review.id)
      : workspace.reviewResponses.find((item) => item.reviewId === review.id)
    const comment = typeof request.body?.body === 'string' ? request.body.body : reviewResponse?.body ?? ''
    if (!comment.trim()) {
      response.status(400).json({ error: 'reply_body_required' })
      return
    }

    const result = await replyToGoogleReview(review.externalReviewId, comment)
    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
        missing: 'missing' in result ? result.missing : undefined,
      })
      return
    }

    const saved = await repository.update<GoogleReviewReplyMutationResult>((latestWorkspace) => {
      const latestReview = latestWorkspace.reviews.find((item) => item.id === review.id)
      if (!latestReview) {
        return { workspace: latestWorkspace, result: { ok: false as const, status: 409, error: 'google_review_reply_state_changed' } }
      }
      const latestReviewResponse = reviewResponse
        ? latestWorkspace.reviewResponses.find((item) => item.id === reviewResponse.id && item.reviewId === review.id)
        : undefined
      const nextWorkspace = saveWithAudit(
        {
          ...latestWorkspace,
          reviews: latestWorkspace.reviews.map((item) => (item.id === review.id ? { ...item, status: 'responded' } : item)),
          reviewResponses: latestReviewResponse
            ? latestWorkspace.reviewResponses.map((item) => (item.id === latestReviewResponse.id ? { ...item, status: 'posted' } : item))
            : latestWorkspace.reviewResponses,
        },
        makeAudit('google_review_reply_posted', 'review', review.id, 'Posted a Google Business Profile review reply.'),
      )
      return {
        workspace: nextWorkspace,
        result: { ok: true as const, reviewId: review.id, responseId: latestReviewResponse?.id ?? reviewResponse?.id, updateTime: result.updateTime },
      }
    })
    if (!saved.ok) {
      response.status(saved.status).json({ error: saved.error, updateTime: result.updateTime })
      return
    }

    response.json({ ok: true, reviewId: saved.reviewId, responseId: saved.responseId, updateTime: saved.updateTime })
  })

  app.post('/api/billing/checkout', requirePermission('billing:manage'), (request, response) => {
    const {
      planId,
      successUrl,
      cancelUrl,
      customerEmail,
      businessName,
      businessWebsite,
      businessCity,
      businessState,
      industry,
      pilotScopeAccepted,
      humanReviewAccepted,
      termsAccepted,
      privacyAccepted,
      refundPolicyAccepted,
    } = parseCheckoutBody(request.body)

    if (!successUrl || !cancelUrl) {
      response.status(400).json({ error: 'checkout_urls_required' })
      return
    }

    const urlValidation = validateBillingReturnUrls([successUrl, cancelUrl])
    if (!urlValidation.ok) {
      response.status(urlValidation.status).json(urlValidation)
      return
    }

    createCheckoutSession({
      planId,
      successUrl,
      cancelUrl,
      customerEmail,
      businessName,
      businessWebsite,
      businessCity,
      businessState,
      industry,
      pilotScopeAccepted,
      humanReviewAccepted,
      termsAccepted,
      privacyAccepted,
      refundPolicyAccepted,
      organizationId: request.principal?.organizationId,
      userId: request.principal?.userId,
    })
      .then((result) => {
        if (!result.ok) {
          response.status(result.status).json({
            error: result.error,
            message: 'Set Stripe credentials and the selected plan price ID before creating real checkout sessions.',
            missing: result.missing,
          })
          return
        }

        response.json({
          sessionId: result.sessionId,
          url: result.url,
          plan: result.plan,
        })
      })
      .catch(() => {
        response.status(502).json({ error: 'stripe_checkout_failed' })
      })
  })

  app.post('/api/billing/portal', requirePermission('billing:manage'), async (request, response) => {
    const returnUrl = typeof request.body?.returnUrl === 'string' ? request.body.returnUrl : ''
    if (!returnUrl) {
      response.status(400).json({ error: 'portal_return_url_required' })
      return
    }

    const urlValidation = validateBillingReturnUrls([returnUrl])
    if (!urlValidation.ok) {
      response.status(urlValidation.status).json(urlValidation)
      return
    }

    const workspace = await repository.read()
    const subscriptionId = typeof request.body?.subscriptionId === 'string' ? request.body.subscriptionId : undefined
    const customerId = typeof request.body?.customerId === 'string' ? request.body.customerId : undefined
    const subscription =
      workspace.subscriptions.find(
        (item) =>
          (subscriptionId && (item.id === subscriptionId || item.stripeSubscriptionId === subscriptionId)) ||
          (customerId && item.stripeCustomerId === customerId),
      ) ?? (!subscriptionId && !customerId ? workspace.subscriptions[0] : undefined)

    if (!subscription) {
      response.status(404).json({ error: 'subscription_customer_not_found' })
      return
    }

    const result = await createCustomerPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl,
    })
    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
        missing: 'missing' in result ? result.missing : undefined,
      })
      return
    }

    response.json({
      sessionId: result.sessionId,
      url: result.url,
      subscriptionId: subscription.id,
      stripeCustomerId: subscription.stripeCustomerId,
    })
  })

  app.post('/api/messages/send', requirePermission('message:send'), async (request, response) => {
    const workspace = await repository.read()
    const messageRequest = request.body as MessageRequest
    const customer = workspace.customers.find((item) => item.id === messageRequest.customerId)
    const consent = validateMessageConsent(customer, messageRequest)

    if (!consent.allowed) {
      response.status(422).json({
        error: consent.reason,
        message: 'Message blocked by consent or request validation.',
      })
      return
    }

    const result = await sendOutboundMessage(customer!, messageRequest)
    const outboundMessage = buildOutboundMessageRecord(customer!, messageRequest, result)
    const saved = await repository.update<MessageSendLogResult>((latestWorkspace) => {
      const nextWorkspace = saveWithAudit(
        {
          ...latestWorkspace,
          outboundMessages: [outboundMessage, ...latestWorkspace.outboundMessages],
        },
        makeAudit(
          'message_send_attempt',
          'outbound_message',
          outboundMessage.id,
          `Message ${outboundMessage.status} via ${outboundMessage.provider || 'none'}.`,
        ),
      )
      return { workspace: nextWorkspace, result: { outboundMessage } }
    })

    if (!result.ok) {
      response.status(result.status).json({
        error: result.error,
        missing: result.missing,
        outboundMessage: saved.outboundMessage,
      })
      return
    }

    response.json({ outboundMessage: saved.outboundMessage })
  })

  if (options.serveStaticFrontend) {
    const staticDir = path.resolve(options.staticDir ?? defaultStaticDir())
    if (existsSync(staticDir)) {
      app.use(express.static(staticDir))
      app.get(/^(?!\/api(?:\/|$)).*/, (_request, response) => {
        response.sendFile(path.join(staticDir, 'index.html'))
      })
    } else {
      app.get(/^(?!\/api(?:\/|$)).*/, (_request, response) => {
        response.status(503).send('Frontend build not found. Run npm run build before production start.')
      })
    }
  }

  return app
}
