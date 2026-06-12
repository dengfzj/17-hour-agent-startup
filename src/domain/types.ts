export type CurrencyCode = 'USD' | 'CNY'

export type ProductKey = 'bidflow' | 'reputeloop'

export type LeadStatus =
  | 'new'
  | 'qualified'
  | 'quoted'
  | 'proposal_sent'
  | 'follow_up'
  | 'won'
  | 'lost'

export type Urgency = 'low' | 'normal' | 'high' | 'emergency'

export type ReviewStatus =
  | 'new'
  | 'needs_response'
  | 'response_drafted'
  | 'responded'
  | 'escalated'

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed'

export type Channel = 'email' | 'sms' | 'phone' | 'manual'

export type BusinessProfile = {
  id: string
  name: string
  industry: string
  city: string
  state: string
  website: string
  currency: CurrencyCode
  averageDealSize: number
  grossMargin: number
  monthlyLeadGoal: number
  monthlyReviewGoal: number
  brandVoice: 'direct' | 'warm' | 'premium' | 'technical'
}

export type Customer = {
  id: string
  name: string
  email: string
  phone: string
  source: string
  tags: string[]
  consentEmail: boolean
  consentSms: boolean
  lifetimeValue: number
  lastInteractionAt: string
}

export type Lead = {
  id: string
  customerId: string
  serviceCategory: string
  description: string
  budgetMin: number
  budgetMax: number
  urgency: Urgency
  source: 'website' | 'phone' | 'referral' | 'ad' | 'import' | 'manual'
  status: LeadStatus
  createdAt: string
  score: number
  nextStep: string
  locationFit: boolean
  repeatCustomer: boolean
}

export type EstimateLineItem = {
  id: string
  name: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  taxable: boolean
}

export type Estimate = {
  id: string
  leadId: string
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired'
  validUntil: string
  lineItems: EstimateLineItem[]
  subtotal: number
  tax: number
  total: number
  confidence: 'low' | 'medium' | 'high'
}

export type Proposal = {
  id: string
  leadId: string
  estimateId: string
  title: string
  problemSummary: string
  recommendedSolution: string
  scopeOfWork: string[]
  timeline: string
  warrantyTerms: string
  exclusions: string[]
  closingNote: string
  status: 'draft' | 'sent' | 'approved' | 'declined'
  generatedAt: string
}

export type FollowUp = {
  id: string
  leadId: string
  customerId: string
  channel: Channel
  scheduledAt: string
  status: 'scheduled' | 'sent' | 'failed' | 'canceled'
  subject: string
  body: string
  outcome: 'pending' | 'no_response' | 'replied' | 'booked' | 'declined'
}

export type ReviewPlatform = 'google' | 'yelp' | 'facebook' | 'internal' | 'other'

export type Review = {
  id: string
  customerId: string
  externalReviewId?: string
  platform: ReviewPlatform
  rating: number
  body: string
  reviewerName: string
  reviewedAt: string
  sentimentScore: number
  riskScore: number
  status: ReviewStatus
}

export type ReviewResponse = {
  id: string
  reviewId: string
  tone: 'warm' | 'concise' | 'professional' | 'apologetic'
  body: string
  status: 'draft' | 'approved' | 'posted' | 'rejected'
  complianceNotes: string[]
  generatedAt: string
}

export type FeedbackCase = {
  id: string
  customerId: string
  reviewId?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  reasonCategory: string
  summary: string
  status: 'open' | 'waiting_customer' | 'recovered' | 'churned' | 'closed'
  openedAt: string
  winbackScore: number
}

export type RecoveryOffer = {
  id: string
  feedbackCaseId: string
  offerType: 'coupon' | 'refund' | 'redo_service' | 'consultation' | 'apology_only'
  value: number
  message: string
  expiresAt: string
  status: 'draft' | 'sent' | 'redeemed' | 'expired' | 'rejected'
}

export type RevenueRecoveryLink = {
  id: string
  token: string
  organizationId: string
  product: ProductKey
  sourceType: 'lead' | 'feedback_case'
  sourceId: string
  customerId: string
  customerName: string
  customerEmail: string
  businessName: string
  title: string
  summary: string
  callToAction: string
  valueCents: number
  currency: CurrencyCode
  status: 'created' | 'opened' | 'accepted' | 'revision_requested' | 'callback_requested' | 'declined' | 'expired'
  createdBy: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  openedAt?: string
  respondedAt?: string
  responseAction?: 'approve' | 'request_revision' | 'schedule_callback' | 'decline'
  responseNote?: string
  responseEmail?: string
}

export type PublicRevenueRecoveryLink = Pick<
  RevenueRecoveryLink,
  | 'id'
  | 'token'
  | 'product'
  | 'sourceType'
  | 'customerName'
  | 'businessName'
  | 'title'
  | 'summary'
  | 'callToAction'
  | 'valueCents'
  | 'currency'
  | 'status'
  | 'expiresAt'
>

export type Campaign = {
  id: string
  name: string
  type: 'review_request' | 'winback' | 'repeat_purchase' | 'referral' | 'seasonal'
  channel: 'email' | 'sms' | 'mixed'
  status: CampaignStatus
  audienceSize: number
  projectedRevenue: number
  conversionRate: number
  createdAt: string
}

export type OutboundMessage = {
  id: string
  customerId: string
  channel: Channel
  purpose: 'follow_up' | 'review_request' | 'winback' | 'repeat_purchase'
  subject?: string
  body: string
  provider?: 'postmark' | 'sendgrid' | 'twilio' | 'manual'
  providerMessageId?: string
  status: 'sent' | 'failed' | 'manual_required'
  failureReason?: string
  consentCheckedAt: string
  createdAt: string
}

export type ConsentEvent = {
  id: string
  customerId: string
  channel: 'email' | 'sms'
  action: 'unsubscribe' | 'resubscribe'
  source: 'postmark' | 'sendgrid' | 'twilio' | 'manual'
  rawValue?: string
  createdAt: string
}

export type SubscriptionStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused'

export type SubscriptionRecord = {
  id: string
  organizationId: string
  product: ProductKey
  planId: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  status: SubscriptionStatus
  currentPeriodEnd?: string
  createdAt: string
  updatedAt: string
}

export type RevenuePayment = {
  id: string
  organizationId: string
  product: ProductKey
  planId: string
  businessName: string
  customerEmail: string
  currency: CurrencyCode
  grossCollectedCents: number
  setupRevenueCents: number
  mrrCents: number
  planMonthlyPriceSnapshotCents: number
  planSetupFeeSnapshotCents: number
  amountSource: 'stripe_session' | 'catalog_fallback'
  paymentSource: 'sales_checkout_handoff' | 'public_checkout' | 'operator_checkout'
  paymentStatus: 'paid'
  status: 'paid' | 'refunded' | 'disputed'
  source: 'stripe_checkout'
  stripeEventId: string
  stripeCheckoutSessionId: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  stripeInvoiceId?: string
  stripePaymentIntentId?: string
  stripeChargeId?: string
  prospectId?: string
  checkoutHandoffId?: string
  onboardingId?: string
  metadataSnapshot: Record<string, string>
  receivedAt: string
  refundedAt?: string
  disputedAt?: string
  statusUpdatedAt?: string
  statusReason?: string
  createdAt: string
  updatedAt: string
}

export type RevenueSummary = {
  generatedAt: string
  period: {
    since?: string
    until?: string
  }
  paidPilots: number
  setupRevenueCents: number
  mrrCents: number
  grossCollectedCents: number
  byProduct: Array<{
    product: ProductKey
    paidPilots: number
    setupRevenueCents: number
    mrrCents: number
    grossCollectedCents: number
  }>
  bySource: Array<{
    source: RevenuePayment['paymentSource']
    paidPilots: number
    setupRevenueCents: number
    mrrCents: number
    grossCollectedCents: number
  }>
  recentPayments: RevenuePayment[]
}

export type RevenueCommandCenter = {
  generatedAt: string
  focus: string
  northStar: {
    paidPilots: number
    setupRevenueCents: number
    mrrCents: number
    grossCollectedCents: number
    openCheckoutCount: number
    deliveryAtRiskCount: number
    customerActionCount: number
    renewalEvidenceCount: number
  }
  actions: Array<{
    id: string
    priority: 'critical' | 'high' | 'medium' | 'low'
    lane: 'collect_payment' | 'sales_followup' | 'delivery' | 'customer_action' | 'renewal'
    title: string
    detail: string
    nextStep: string
    sourceType: 'sales_prospect' | 'checkout_handoff' | 'onboarding' | 'recovery_link' | 'pilot_outcome'
    sourceId: string
    ownerEmail?: string
    dueAt?: string
  }>
  blockers: Array<{
    id: string
    title: string
    detail: string
  }>
}

export type OnboardingRecord = {
  id: string
  organizationId: string
  businessName: string
  businessWebsite?: string
  businessCity?: string
  businessState?: string
  industry?: string
  ownerEmail: string
  product: ProductKey
  planId: string
  status: 'checkout_started' | 'paid' | 'workspace_activated' | 'materials_submitted' | 'data_imported' | 'ready_for_pilot'
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  customerAccessToken?: string
  deliveryOwnerEmail: string
  deliverySlaDueAt: string
  deliveryStatus:
    | 'not_started'
    | 'materials_waiting'
    | 'pack_ready'
    | 'qa_approved'
    | 'sent'
    | 'customer_confirmed'
    | 'revision_requested'
    | 'call_requested'
    | 'renewal_ready'
    | 'blocked'
  deliveryQaApprovedAt?: string
  deliveryQaApprovedBy?: string
  deliveryQaNotes?: string
  deliveryPackSentAt?: string
  deliveryPackSentBy?: string
  deliveryPackSummary?: string
  customerDeliveryResponse?: 'accept' | 'request_revision' | 'schedule_call'
  customerConfirmedAt?: string
  customerConfirmedByEmail?: string
  customerConfirmationNote?: string
  renewalEvidenceSummary?: string
  checklist: Array<{
    key: string
    label: string
    done: boolean
  }>
  createdAt: string
  updatedAt: string
}

export type PublicOnboardingRecord = Omit<
  OnboardingRecord,
  'organizationId' | 'stripeCustomerId' | 'stripeSubscriptionId' | 'customerAccessToken'
>

export type OnboardingSubmission = {
  id: string
  onboardingId: string
  organizationId: string
  importedRecordIds?: string[]
  submittedByEmail: string
  materialType: 'lead_csv' | 'review_csv' | 'general_notes'
  title: string
  body: string
  status: 'submitted' | 'reviewed' | 'imported' | 'rejected'
  createdAt: string
  updatedAt: string
}

export type PublicOnboardingSubmission = Pick<
  OnboardingSubmission,
  'id' | 'onboardingId' | 'submittedByEmail' | 'materialType' | 'title' | 'status' | 'createdAt' | 'updatedAt'
>

export type PilotOutcome = {
  id: string
  onboardingId: string
  organizationId: string
  product: ProductKey
  businessName: string
  outcomeType:
    | 'won_job'
    | 'revived_quote'
    | 'approved_review_reply'
    | 'recovered_customer'
    | 'repeat_booking'
    | 'hours_saved'
    | 'other'
  outcomeValue: number
  currency: CurrencyCode
  evidence: string
  nextAction: string
  recordedBy: string
  occurredAt: string
  createdAt: string
  updatedAt: string
}

export type SalesProspect = {
  id: string
  organizationId: string
  businessName: string
  ownerName: string
  ownerEmail: string
  phone: string
  website: string
  city: string
  state: string
  industry: string
  googleReviewCount: number
  averageRating: number
  recentReviewIssue: string
  quoteLeakSignal: string
  averageJobValue: number
  fitScore: number
  nextTouch: 'email' | 'call' | 'linkedin' | 'partner' | 'hold'
  status: 'new' | 'qualified' | 'contacted' | 'call_booked' | 'scope_sent' | 'checkout_sent' | 'won' | 'lost' | 'disqualified'
  notes: string
  lastContactedAt?: string
  createdAt: string
  updatedAt: string
}

export type SalesOutreachPack = {
  id: string
  prospectId: string
  organizationId: string
  businessName: string
  product: ProductKey
  subject: string
  emailBody: string
  callOpener: string
  voicemailScript: string
  linkedinNote: string
  pilotScopeDraft: string
  pilotPriceSummary: string
  discoveryQuestions: string[]
  proofPoints: string[]
  riskNotes: string[]
  nextStep: string
  status: 'draft' | 'used' | 'archived'
  generatedAt: string
  updatedAt: string
}

export type SalesCheckoutHandoff = {
  id: string
  token: string
  prospectId: string
  organizationId: string
  businessName: string
  customerEmail: string
  businessWebsite: string
  businessCity: string
  businessState: string
  industry: string
  product: ProductKey
  planId: string
  checkoutUrl: string
  scopeSummary: string
  scopeSource: 'outreach_pack' | 'sales_activity' | 'prospect_notes'
  scopeAcceptedHash: string
  status: 'created' | 'sent' | 'paid' | 'expired' | 'cancelled'
  createdBy: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
  sentAt?: string
  paidAt?: string
  stripeCheckoutCreatingAt?: string
  stripeCheckoutSessionId?: string
  stripeCheckoutUrl?: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  onboardingId?: string
}

export type PublicSalesCheckoutHandoff = Pick<
  SalesCheckoutHandoff,
  | 'id'
  | 'token'
  | 'businessName'
  | 'customerEmail'
  | 'businessWebsite'
  | 'businessCity'
  | 'businessState'
  | 'industry'
  | 'product'
  | 'planId'
  | 'scopeSummary'
  | 'scopeSource'
  | 'scopeAcceptedHash'
  | 'status'
  | 'expiresAt'
>

export type SalesActivity = {
  id: string
  prospectId: string
  organizationId: string
  businessName: string
  channel: 'email' | 'call' | 'linkedin' | 'partner' | 'manual'
  outcome: 'sent' | 'left_voicemail' | 'replied' | 'call_booked' | 'scope_sent' | 'checkout_sent' | 'won' | 'lost' | 'no_response'
  summary: string
  nextStep: string
  ownerEmail: string
  occurredAt: string
  createdAt: string
  updatedAt: string
}

export type SalesActivitySummaryCounts = {
  total: number
  emailsSent: number
  callsLogged: number
  partnerTouches: number
  replies: number
  callsBooked: number
  scopesSent: number
  checkoutsSent: number
  wins: number
  losses: number
  noResponses: number
}

export type SalesSummary = {
  generatedAt: string
  period: {
    since: string
    until: string
  }
  activity: SalesActivitySummaryCounts
  funnel: Array<{
    status: SalesProspect['status']
    count: number
    averageFitScore: number
    estimatedPipelineValue: number
  }>
  management: {
    importedProspects: number
    activeProspects: number
    staleProspects: number
    checkoutOpen: number
    estimatedPipelineValue: number
    wonPipelineValueEstimate: number
    winRateFromContacted: number
    checkoutToWonRate: number
  }
  weekly: Array<{
    weekStart: string
    weekEnd: string
    activity: SalesActivitySummaryCounts & {
      uniqueProspectsTouched: number
    }
  }>
  nextActions: Array<{
    prospectId: string
    businessName: string
    status: SalesProspect['status']
    nextTouch: SalesProspect['nextTouch']
    fitScore: number
    lastContactedAt?: string
    reason: string
  }>
  recommendedFocus: string
}

export type AuditLog = {
  id: string
  actor: string
  action: string
  entityType: string
  entityId: string
  summary: string
  createdAt: string
}

export type ResearchSource = {
  title: string
  publisher: string
  date: string
  url: string
  note: string
}

export type BusinessDirection = {
  id: string
  name: string
  productKey: ProductKey
  marketScore: number
  willingnessToPayScore: number
  buildComplexityScore: number
  complianceScore: number
  acquisitionScore: number
  sevenDayLaunchScore: number
  ceilingScore: number
  weightedScore: number
  targetCustomers: string
  priceAnchor: string
  whyNow: string
  risks: string[]
}

export type WorkspaceData = {
  business: BusinessProfile
  customers: Customer[]
  leads: Lead[]
  estimates: Estimate[]
  proposals: Proposal[]
  followUps: FollowUp[]
  reviews: Review[]
  reviewResponses: ReviewResponse[]
  feedbackCases: FeedbackCase[]
  recoveryOffers: RecoveryOffer[]
  revenueRecoveryLinks: RevenueRecoveryLink[]
  campaigns: Campaign[]
  outboundMessages: OutboundMessage[]
  consentEvents: ConsentEvent[]
  subscriptions: SubscriptionRecord[]
  revenuePayments: RevenuePayment[]
  onboarding: OnboardingRecord[]
  onboardingSubmissions: OnboardingSubmission[]
  pilotOutcomes: PilotOutcome[]
  salesProspects: SalesProspect[]
  salesOutreachPacks: SalesOutreachPack[]
  salesCheckoutHandoffs: SalesCheckoutHandoff[]
  salesActivities: SalesActivity[]
  auditLogs: AuditLog[]
  researchSources: ResearchSource[]
  directions: BusinessDirection[]
}
