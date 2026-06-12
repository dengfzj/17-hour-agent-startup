import { addDays, format } from 'date-fns'
import type {
  BusinessProfile,
  Customer,
  Estimate,
  EstimateLineItem,
  FeedbackCase,
  FollowUp,
  Lead,
  Proposal,
  RecoveryOffer,
  Review,
  ReviewResponse,
  SalesOutreachPack,
  SalesProspect,
} from './types'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const id = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`

const legalTerms = [
  'lawyer',
  'attorney',
  'sue',
  'lawsuit',
  'fraud',
  'chargeback',
  'unsafe',
  'dangerous',
  'injury',
  'discrimination',
  'harassment',
  'refund',
  'scam',
]

const negativeTerms = [
  'bad',
  'terrible',
  'late',
  'rude',
  'dirty',
  'broken',
  'unprofessional',
  'expensive',
  'ignored',
  'never',
]

export function scoreLead(lead: Omit<Lead, 'score' | 'nextStep'>, customers: Customer[]) {
  const customer = customers.find((item) => item.id === lead.customerId)
  let score = 35

  if (lead.urgency === 'emergency') score += 24
  if (lead.urgency === 'high') score += 16
  if (lead.urgency === 'low') score -= 6
  if (lead.source === 'referral') score += 16
  if (lead.source === 'phone') score += 8
  if (lead.budgetMax >= 5000) score += 18
  if (lead.budgetMax >= 2500 && lead.budgetMax < 5000) score += 10
  if (lead.description.length > 120) score += 8
  if (customer?.email && customer.phone) score += 8
  if (lead.repeatCustomer) score += 10
  if (!lead.locationFit) score -= 30
  if (lead.description.length < 28) score -= 12

  const bounded = Math.max(0, Math.min(100, score))
  const nextStep =
    bounded >= 80
      ? 'Call within 5 minutes and send a premium estimate today.'
      : bounded >= 55
        ? 'Qualify details, prepare an estimate, and schedule a 24-hour follow-up.'
        : bounded >= 30
          ? 'Send a discovery note and move into a nurture sequence.'
          : 'Hold for manual verification before investing sales time.'

  return { score: bounded, nextStep }
}

export function buildEstimate(lead: Lead, profile: BusinessProfile): Estimate {
  const urgencyMultiplier =
    lead.urgency === 'emergency' ? 1.35 : lead.urgency === 'high' ? 1.18 : lead.urgency === 'low' ? 0.92 : 1
  const midpoint = (lead.budgetMin + lead.budgetMax) / 2 || profile.averageDealSize
  const labor = Math.max(480, Math.round(midpoint * 0.46 * urgencyMultiplier))
  const materials = Math.max(220, Math.round(midpoint * 0.22))
  const projectManagement = Math.max(180, Math.round(midpoint * 0.1))

  const lineItems: EstimateLineItem[] = [
    {
      id: id('line'),
      name: `${lead.serviceCategory} labor`,
      description: 'Crew time, preparation, field execution, and cleanup.',
      quantity: 1,
      unit: 'project',
      unitPrice: labor,
      taxable: false,
    },
    {
      id: id('line'),
      name: 'Materials and supplies',
      description: 'Standard materials, transport, and consumables.',
      quantity: 1,
      unit: 'allowance',
      unitPrice: materials,
      taxable: true,
    },
    {
      id: id('line'),
      name: 'Project coordination',
      description: 'Scheduling, customer updates, quality check, and closeout notes.',
      quantity: 1,
      unit: 'fixed',
      unitPrice: projectManagement,
      taxable: false,
    },
  ]

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const tax = Math.round(lineItems.filter((item) => item.taxable).reduce((sum, item) => sum + item.unitPrice, 0) * 0.0825)
  const confidence = lead.description.length > 160 && lead.budgetMin > 0 ? 'high' : lead.description.length > 80 ? 'medium' : 'low'

  return {
    id: id('estimate'),
    leadId: lead.id,
    status: 'draft',
    validUntil: addDays(new Date(), 14).toISOString(),
    lineItems,
    subtotal,
    tax,
    total: subtotal + tax,
    confidence,
  }
}

export function generateProposal(
  lead: Lead,
  customer: Customer,
  estimate: Estimate,
  profile: BusinessProfile,
): Proposal {
  return {
    id: id('proposal'),
    leadId: lead.id,
    estimateId: estimate.id,
    title: `${profile.name} proposal for ${customer.name}`,
    problemSummary: `${customer.name} needs a reliable ${lead.serviceCategory.toLowerCase()} solution in ${profile.city} with ${lead.urgency} urgency. The request mentions: ${lead.description}`,
    recommendedSolution: `We recommend a scoped ${lead.serviceCategory.toLowerCase()} package priced at ${currency.format(
      estimate.total,
    )}, with the final price confirmed after field validation.`,
    scopeOfWork: [
      'Confirm site details, constraints, and customer priorities before work begins.',
      'Prepare crew, materials, and project schedule based on the approved estimate.',
      'Complete the work with progress updates and a closeout quality check.',
      'Send completion notes, care instructions, and a review request when appropriate.',
    ],
    timeline:
      lead.urgency === 'emergency'
        ? 'Priority scheduling: first available emergency slot after approval.'
        : 'Standard scheduling: 3-7 business days after approval, subject to route availability.',
    warrantyTerms: 'Workmanship is covered for 30 days unless the final signed estimate states otherwise.',
    exclusions: [
      'Hidden structural issues, permit fees, and customer-requested scope changes are excluded.',
      'No final price is guaranteed until the customer approves the written estimate.',
    ],
    closingNote: `Reply to approve the estimate or call ${profile.name} to reserve the next available service window.`,
    status: 'draft',
    generatedAt: new Date().toISOString(),
  }
}

export function generateFollowUps(lead: Lead, customer: Customer, estimate: Estimate): FollowUp[] {
  const days = [0, 1, 3, 7, 14]
  const subjects = [
    'Your estimate is ready',
    'Any questions about the estimate?',
    'A quick note on timing',
    'Estimate window reminder',
    'Should we keep this open?',
  ]

  return days.map((day, index) => ({
    id: id('follow'),
    leadId: lead.id,
    customerId: customer.id,
    channel: index === 0 ? 'email' : index === 4 ? 'phone' : 'sms',
    scheduledAt: addDays(new Date(), day).toISOString(),
    status: 'scheduled',
    subject: subjects[index],
    body:
      index === 0
        ? `Hi ${customer.name}, your ${lead.serviceCategory.toLowerCase()} estimate is ${currency.format(
            estimate.total,
          )}. Reply with any questions or approval details.`
        : `Hi ${customer.name}, checking in on the ${lead.serviceCategory.toLowerCase()} estimate. We can hold the current pricing until ${format(
            new Date(estimate.validUntil),
            'MMM d',
          )}.`,
    outcome: 'pending',
  }))
}

export function analyzeReview(review: Omit<Review, 'riskScore' | 'sentimentScore' | 'status'>) {
  const body = review.body.toLowerCase()
  const legalHits = legalTerms.filter((term) => body.includes(term))
  const negativeHits = negativeTerms.filter((term) => body.includes(term))
  const ratingPenalty = Math.max(0, 5 - review.rating) * 14
  const riskScore = Math.min(100, ratingPenalty + legalHits.length * 16 + negativeHits.length * 5)
  const sentimentScore = Math.max(-100, Math.min(100, review.rating * 24 - 70 - negativeHits.length * 7 + (review.rating >= 5 ? 28 : 0)))
  const status: Review['status'] = riskScore >= 70 ? 'escalated' : review.rating <= 3 ? 'needs_response' : 'new'

  return {
    riskScore,
    sentimentScore,
    status,
    riskTerms: [...legalHits, ...negativeHits],
  }
}

export function generateReviewResponse(review: Review, customer: Customer, profile: BusinessProfile): ReviewResponse {
  const notes = [
    'No private service details included.',
    'No admission of legal liability.',
    'No incentive offered for changing or posting a review.',
  ]
  const isHighRisk = review.riskScore >= 70
  const isPositive = review.rating >= 4
  const body = isHighRisk
    ? `${customer.name}, thank you for raising this. We are sorry your experience did not meet expectations. We cannot discuss account details publicly, but our manager would like to review this directly. Please contact ${profile.name} so we can look into the situation and decide the right next step.`
    : isPositive
      ? `${customer.name}, thank you for choosing ${profile.name}. We appreciate the kind words and are glad the team delivered a strong experience.`
      : `${customer.name}, thank you for the feedback. We are sorry the visit fell short. Please contact ${profile.name} so a manager can understand what happened and help with the next step.`

  return {
    id: id('response'),
    reviewId: review.id,
    tone: isHighRisk ? 'apologetic' : isPositive ? 'warm' : 'professional',
    body,
    status: 'draft',
    complianceNotes: isHighRisk ? ['Manager approval required before posting.', ...notes] : notes,
    generatedAt: new Date().toISOString(),
  }
}

export function buildFeedbackCase(review: Review, customer: Customer): FeedbackCase {
  const severity =
    review.riskScore >= 85 ? 'critical' : review.riskScore >= 65 ? 'high' : review.rating <= 3 ? 'medium' : 'low'
  const winbackScore = Math.max(
    0,
    Math.min(100, customer.lifetimeValue / 75 + (review.rating <= 3 ? 28 : 12) - review.riskScore / 4),
  )

  return {
    id: id('case'),
    customerId: customer.id,
    reviewId: review.id,
    severity,
    reasonCategory: review.rating <= 2 ? 'service_recovery' : 'relationship_follow_up',
    summary: `${customer.name} left a ${review.rating}-star ${review.platform} review. Risk score: ${review.riskScore}.`,
    status: 'open',
    openedAt: new Date().toISOString(),
    winbackScore: Math.round(winbackScore),
  }
}

export function generateRecoveryOffer(caseItem: FeedbackCase, customer: Customer, profile: BusinessProfile): RecoveryOffer {
  const highValue = customer.lifetimeValue > 2000
  const offerType = caseItem.severity === 'critical' ? 'consultation' : highValue ? 'redo_service' : 'coupon'
  const value = offerType === 'coupon' ? 35 : offerType === 'redo_service' ? 150 : 0

  return {
    id: id('offer'),
    feedbackCaseId: caseItem.id,
    offerType,
    value,
    message:
      offerType === 'consultation'
        ? `${customer.name}, a manager from ${profile.name} would like to review your concern personally and agree on the right next step.`
        : offerType === 'redo_service'
          ? `${customer.name}, we would like to schedule a manager-reviewed service correction. Reply with a time that works for you.`
          : `${customer.name}, we appreciate the chance to make this right. Use this ${currency.format(
              value,
            )} service credit on your next booking this month.`,
    expiresAt: addDays(new Date(), 21).toISOString(),
    status: 'draft',
  }
}

export function estimateCampaignRevenue(audienceSize: number, conversionRate: number, averageDealSize: number) {
  return Math.round(audienceSize * conversionRate * averageDealSize)
}

export function recommendProspectProduct(prospect: SalesProspect): SalesOutreachPack['product'] {
  const reviewSignal = `${prospect.recentReviewIssue} ${prospect.notes}`.toLowerCase()
  const quoteSignal = `${prospect.quoteLeakSignal} ${prospect.notes}`.toLowerCase()
  const hasReviewPain = /(review|rating|stars?|unanswered|refund|attorney|poor communication|reputation)/.test(reviewSignal)
  const hasQuotePain = /(quote|estimate|callback|follow.?up|no timeline|slow|lead)/.test(quoteSignal)
  if (hasQuotePain) return 'bidflow'
  if (hasReviewPain) return 'reputeloop'
  return prospect.averageJobValue >= 700 ? 'bidflow' : 'reputeloop'
}

export function generateSalesOutreachPack(prospect: SalesProspect, profile: BusinessProfile): SalesOutreachPack {
  const product = recommendProspectProduct(prospect)
  const contactName = prospect.ownerName || 'there'
  const cityLabel = [prospect.city, prospect.state].filter(Boolean).join(', ') || profile.city
  const primarySignal =
    prospect.quoteLeakSignal || prospect.recentReviewIssue || prospect.notes || 'public follow-up signals suggest revenue may be leaking'
  const averageJobValue = prospect.averageJobValue > 0 ? formatCurrency(prospect.averageJobValue) : formatCurrency(profile.averageDealSize)
  const productName = product === 'bidflow' ? 'BidFlow Local' : 'ReputeLoop'
  const setupFee = product === 'bidflow' ? '$499 setup + $149/month' : '$399 setup + $99/month'
  const promise =
    product === 'bidflow'
      ? 'recover missed quote revenue and reduce owner follow-up time'
      : 'protect review conversion and recover dissatisfied customers'
  const firstPack =
    product === 'bidflow'
      ? 'one scored lead pipeline, one estimate/proposal draft, and a follow-up sequence ready for human approval'
      : 'five manager-safe review response drafts, one recovery case, and a winback offer where appropriate'
  const questions =
    product === 'bidflow'
      ? [
          'How many quote requests come in each week?',
          'How quickly does someone respond to new service requests?',
          'Where do estimates or callbacks usually get delayed?',
          'What is the average job value and gross margin?',
          'What would make a 14-day pilot obviously worth renewing?',
        ]
      : [
          'Who approves public review replies today?',
          'Which review themes most often hurt close rate?',
          'How do dissatisfied customers get routed to a manager?',
          'What is a recovered repeat customer worth?',
          'What would make a 14-day pilot obviously worth renewing?',
        ]
  const proofPoints = [
    `${prospect.businessName} has ${prospect.googleReviewCount || 'unknown'} public-review signals and an estimated ${averageJobValue} job value anchor.`,
    `Observed signal: ${primarySignal}.`,
    `${productName} is sold as a small paid pilot with human approval before public replies, sends, or customer-facing commitments.`,
  ]
  const riskNotes = [
    'Do not promise recovered revenue until a paid pilot outcome is recorded.',
    'Do not send this message as an automated campaign without consent and unsubscribe handling.',
    'Do not publish review replies, send SMS, or bind prices without operator approval.',
  ]
  const emailBody = `Hi ${contactName},

I was looking at ${prospect.businessName}${cityLabel ? ` in ${cityLabel}` : ''} and noticed a possible revenue leak: ${primarySignal}.

We built ${productName} for local service teams that want to ${promise}. The paid pilot is intentionally small: one location, one workflow, one first delivery pack, and a 14-day implementation sprint.

For ${prospect.businessName}, I would start with ${firstPack}. If we cannot point to a won job, recovered customer, approved reply, repeat booking, or clear time savings, we should not expand.

Would it be worth a 15-minute fit call this week?`
  const callOpener = `I help local service companies in ${profile.city} find missed revenue between quotes, follow-up, and reviews. I noticed ${prospect.businessName} may have this signal: ${primarySignal}. If I can show two concrete places revenue may be leaking, would a small paid pilot be worth discussing?`
  const voicemailScript = `Hi ${contactName}, this is ${profile.name === prospect.businessName ? 'the Local Growth OS team' : profile.name}. I had a quick idea for ${prospect.businessName} around ${productName} and ${promise}. I will send a short note with the specific signal I saw.`
  const linkedinNote = `${contactName}, I noticed a possible ${product === 'bidflow' ? 'quote/follow-up' : 'review recovery'} leak at ${prospect.businessName}. We run small paid pilots for local service teams to ${promise}. Open to a 15-minute fit check?`
  const pilotScopeDraft = `# Paid Pilot Scope Draft

Business: ${prospect.businessName}
Product: ${productName}
Location: ${cityLabel || 'TBD'}
Commercial draft: ${setupFee}

## Pilot Objective

Use a 14-day managed pilot to ${promise} for one location and one workflow.

## Starting Signal

${primarySignal}

## First Delivery Pack

${firstPack}

## Operator Commitments

- Review customer materials before importing or generating customer-facing work.
- Keep every estimate, public review reply, SMS, and recovery offer human-approved.
- Record any claimed outcome in the Launch page outcome ledger before using it for renewal, testimonial, or case-study claims.

## Customer Commitments

- Provide the requested lead CSV, review CSV, or setup notes through the private onboarding link.
- Confirm the person approving scope, replies, and pilot expansion.
- Do not ask for fake reviews, review gating, or incentives for positive reviews.

## Success Criteria

- One won job, revived quote, approved review reply, recovered customer, repeat booking, or clear time savings.
- Customer agrees the workflow is worth renewing before expansion.

## Next Step

Run a fit call, finalize the signed scope/order form, then send /buy only after the scope is clear.`

  return {
    id: id('outreach'),
    prospectId: prospect.id,
    organizationId: prospect.organizationId,
    businessName: prospect.businessName,
    product,
    subject: `${prospect.businessName}: quick idea to recover local-service revenue`,
    emailBody,
    callOpener,
    voicemailScript,
    linkedinNote,
    pilotScopeDraft,
    pilotPriceSummary: setupFee,
    discoveryQuestions: questions,
    proofPoints,
    riskNotes,
    nextStep: 'Use the email/call script manually, run a fit call, then mark scope_sent only after the scope is reviewed.',
    status: 'draft',
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function formatCurrency(value: number) {
  return currency.format(value)
}
