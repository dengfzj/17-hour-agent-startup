import { describe, expect, it } from 'vitest'
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
} from './engines'
import type { BusinessProfile, Customer, Lead, Review, SalesProspect } from './types'

const business: BusinessProfile = {
  id: 'org_test',
  name: 'Test Home Services',
  industry: 'Home services',
  city: 'Austin',
  state: 'TX',
  website: 'https://example.com',
  currency: 'USD',
  averageDealSize: 1800,
  grossMargin: 0.4,
  monthlyLeadGoal: 60,
  monthlyReviewGoal: 40,
  brandVoice: 'warm',
}

const customer: Customer = {
  id: 'cust_test',
  name: 'Alex Rivera',
  email: 'alex@example.com',
  phone: '+1 512 555 0100',
  source: 'Referral',
  tags: ['repeat'],
  consentEmail: true,
  consentSms: true,
  lifetimeValue: 4500,
  lastInteractionAt: new Date().toISOString(),
}

const leadInput: Omit<Lead, 'score' | 'nextStep'> = {
  id: 'lead_test',
  customerId: customer.id,
  serviceCategory: 'Emergency water damage repair',
  description:
    'The customer has water damage from a burst pipe and needs an urgent repair estimate with cleanup, drywall, and flooring scope.',
  budgetMin: 2000,
  budgetMax: 6500,
  urgency: 'emergency',
  source: 'referral',
  status: 'new',
  createdAt: new Date().toISOString(),
  locationFit: true,
  repeatCustomer: true,
}

describe('BidFlow engines', () => {
  it('scores urgent referral leads as hot and produces a next action', () => {
    const result = scoreLead(leadInput, [customer])

    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.nextStep).toContain('5 minutes')
  })

  it('builds an editable estimate with tax, total, and confidence', () => {
    const lead: Lead = { ...leadInput, ...scoreLead(leadInput, [customer]) }
    const estimate = buildEstimate(lead, business)

    expect(estimate.lineItems.length).toBeGreaterThanOrEqual(3)
    expect(estimate.total).toBeGreaterThan(estimate.subtotal)
    expect(['medium', 'high']).toContain(estimate.confidence)
  })

  it('generates a proposal and follow-up sequence for revenue conversion', () => {
    const lead: Lead = { ...leadInput, ...scoreLead(leadInput, [customer]) }
    const estimate = buildEstimate(lead, business)
    const proposal = generateProposal(lead, customer, estimate, business)
    const followUps = generateFollowUps(lead, customer, estimate)

    expect(proposal.scopeOfWork).toHaveLength(4)
    expect(proposal.exclusions.join(' ')).toContain('final price')
    expect(followUps).toHaveLength(5)
    expect(followUps[0].body).toContain(customer.name)
    expect(followUps[0].body).toContain('$')
  })
})

describe('ReputeLoop engines', () => {
  it('escalates legal or refund language in low-star reviews', () => {
    const rawReview = {
      id: 'review_test',
      customerId: customer.id,
      platform: 'google' as const,
      rating: 1,
      body: 'This felt like fraud, I want a refund and I may call an attorney.',
      reviewerName: 'Alex R.',
      reviewedAt: new Date().toISOString(),
    }

    const result = analyzeReview(rawReview)

    expect(result.riskScore).toBeGreaterThanOrEqual(70)
    expect(result.status).toBe('escalated')
    expect(result.riskTerms).toContain('attorney')
  })

  it('generates public-safe review responses without incentives or liability admissions', () => {
    const rawReview = {
      id: 'review_test',
      customerId: customer.id,
      platform: 'google' as const,
      rating: 2,
      body: 'The technician was late and expensive. I want a refund.',
      reviewerName: 'Alex R.',
      reviewedAt: new Date().toISOString(),
    }
    const review: Review = { ...rawReview, ...analyzeReview(rawReview) }
    const response = generateReviewResponse(review, customer, business)

    expect(response.status).toBe('draft')
    expect(response.body.toLowerCase()).not.toContain('we admit')
    expect(response.body.toLowerCase()).not.toContain('discount for a review')
    expect(response.complianceNotes.join(' ')).toContain('No admission')
  })

  it('creates a winback case and recovery offer for at-risk customers', () => {
    const rawReview = {
      id: 'review_test',
      customerId: customer.id,
      platform: 'google' as const,
      rating: 2,
      body: 'Late and ignored my refund request.',
      reviewerName: 'Alex R.',
      reviewedAt: new Date().toISOString(),
    }
    const review: Review = { ...rawReview, ...analyzeReview(rawReview) }
    const caseItem = buildFeedbackCase(review, customer)
    const offer = generateRecoveryOffer(caseItem, customer, business)

    expect(caseItem.winbackScore).toBeGreaterThan(0)
    expect(['consultation', 'redo_service', 'coupon']).toContain(offer.offerType)
    expect(offer.message).toContain(customer.name)
  })
})

describe('Sales prospect engines', () => {
  const prospect: SalesProspect = {
    id: 'prospect_test',
    organizationId: business.id,
    businessName: 'Austin Roof & Repair',
    ownerName: 'Maria Owner',
    ownerEmail: 'maria@example.com',
    phone: '+1 512 555 0101',
    website: 'https://roof.example',
    city: 'Austin',
    state: 'TX',
    industry: 'Roofing',
    googleReviewCount: 84,
    averageRating: 4.3,
    recentReviewIssue: 'unanswered 2-star review mentions no callback',
    quoteLeakSignal: 'quote form has no timeline or expectation copy',
    averageJobValue: 1800,
    fitScore: 82,
    nextTouch: 'email',
    status: 'new',
    notes: 'BidFlow first',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('recommends a product and generates a manual outreach pack with guardrails', () => {
    expect(recommendProspectProduct(prospect)).toBe('bidflow')

    const pack = generateSalesOutreachPack(prospect, business)

    expect(pack.product).toBe('bidflow')
    expect(pack.subject).toContain(prospect.businessName)
    expect(pack.emailBody).toContain('15-minute fit call')
    expect(pack.callOpener).toContain('revenue')
    expect(pack.pilotScopeDraft).toContain('Paid Pilot Scope Draft')
    expect(pack.pilotScopeDraft).toContain('/buy only after the scope is clear')
    expect(pack.riskNotes.join(' ')).toContain('Do not send this message as an automated campaign')
  })
})
