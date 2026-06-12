import { describe, expect, it } from 'vitest'
import {
  buildEstimate,
  generateProposal,
  generateReviewResponse,
  analyzeReview,
  generateRecoveryOffer,
  buildFeedbackCase,
  generateSalesOutreachPack,
} from './engines'
import {
  renderCheckoutHandoffOrderFormDocument,
  renderProposalDocument,
  renderRecoveryDocument,
  renderSalesOutreachDocument,
} from './documents'
import type { BusinessProfile, Customer, Lead, Review, SalesCheckoutHandoff, SalesProspect } from './types'

const business: BusinessProfile = {
  id: 'org_docs',
  name: 'Docs Home Services',
  industry: 'Home services',
  city: 'Austin',
  state: 'TX',
  website: 'https://example.com',
  currency: 'USD',
  averageDealSize: 1500,
  grossMargin: 0.42,
  monthlyLeadGoal: 50,
  monthlyReviewGoal: 30,
  brandVoice: 'warm',
}

const customer: Customer = {
  id: 'cust_docs',
  name: 'Jamie Stone',
  email: 'jamie@example.com',
  phone: '+1 512 555 0191',
  source: 'Website',
  tags: [],
  consentEmail: true,
  consentSms: true,
  lifetimeValue: 2100,
  lastInteractionAt: new Date().toISOString(),
}

describe('customer-facing documents', () => {
  it('renders a proposal document with estimate, scope, and exclusions', () => {
    const lead: Lead = {
      id: 'lead_docs',
      customerId: customer.id,
      serviceCategory: 'Deck repair',
      description: 'Replace damaged boards and inspect railing before a weekend event.',
      budgetMin: 800,
      budgetMax: 2400,
      urgency: 'high',
      source: 'website',
      status: 'quoted',
      createdAt: new Date().toISOString(),
      score: 70,
      nextStep: 'Prepare estimate.',
      locationFit: true,
      repeatCustomer: false,
    }
    const estimate = buildEstimate(lead, business)
    const proposal = generateProposal(lead, customer, estimate, business)
    const document = renderProposalDocument(business, customer, estimate, proposal)

    expect(document).toContain('Prepared by: Docs Home Services')
    expect(document).toContain('Total:')
    expect(document).toContain('Scope of Work')
    expect(document).toContain('Exclusions')
  })

  it('renders a recovery document with compliance notes and offer details', () => {
    const rawReview = {
      id: 'review_docs',
      customerId: customer.id,
      platform: 'google' as const,
      rating: 2,
      body: 'Late visit and ignored my refund question.',
      reviewerName: 'Jamie S.',
      reviewedAt: new Date().toISOString(),
    }
    const review: Review = { ...rawReview, ...analyzeReview(rawReview) }
    const response = generateReviewResponse(review, customer, business)
    const feedbackCase = buildFeedbackCase(review, customer)
    const offer = generateRecoveryOffer(feedbackCase, customer, business)
    const document = renderRecoveryDocument(business, customer, review, response, offer)

    expect(document).toContain('Review Recovery Pack')
    expect(document).toContain('Compliance Notes')
    expect(document).toContain('No private service details included.')
    expect(document).toContain('Recovery Offer')
  })

  it('renders a sales outreach document with scripts, scope, and risk notes', () => {
    const prospect: SalesProspect = {
      id: 'prospect_docs',
      organizationId: business.id,
      businessName: 'Docs Roofing',
      ownerName: 'Morgan Owner',
      ownerEmail: 'morgan@example.com',
      phone: '+1 512 555 0192',
      website: 'https://docs-roof.example',
      city: 'Austin',
      state: 'TX',
      industry: 'Roofing',
      googleReviewCount: 92,
      averageRating: 4.2,
      recentReviewIssue: 'unanswered review mentions no callback',
      quoteLeakSignal: 'estimate form has no follow-up timeline',
      averageJobValue: 2200,
      fitScore: 88,
      nextTouch: 'call',
      status: 'new',
      notes: 'High-value local account',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const pack = generateSalesOutreachPack(prospect, business)
    const document = renderSalesOutreachDocument(business, prospect, pack)

    expect(document).toContain('Sales Outreach Pack')
    expect(document).toContain('Subject:')
    expect(document).toContain('Discovery Questions')
    expect(document).toContain('Pilot Scope Draft')
    expect(document).toContain('Do not send this message as an automated campaign')
  })

  it('renders a paid pilot order form with scope, price, payment link, and automation boundaries', () => {
    const handoff: SalesCheckoutHandoff = {
      id: 'sales_checkout_docs',
      token: 'token_docs',
      prospectId: 'prospect_docs',
      organizationId: business.id,
      businessName: 'Docs Roofing',
      customerEmail: 'morgan@example.com',
      businessWebsite: 'https://docs-roof.example',
      businessCity: 'Austin',
      businessState: 'TX',
      industry: 'Roofing',
      product: 'bidflow',
      planId: 'bidflow-growth',
      checkoutUrl: 'https://app.example.com/buy?handoff=token_docs',
      scopeSummary: 'Operator-reviewed BidFlow pilot for quote recovery and proposal follow-up.',
      scopeSource: 'sales_activity',
      scopeAcceptedHash: 'abc123def456abc123def456',
      status: 'sent',
      createdBy: 'rep@example.com',
      expiresAt: '2026-06-18T00:00:00.000Z',
      createdAt: '2026-06-11T00:00:00.000Z',
      updatedAt: '2026-06-11T00:00:00.000Z',
      sentAt: '2026-06-11T00:00:00.000Z',
    }
    const document = renderCheckoutHandoffOrderFormDocument(business, handoff, {
      id: 'bidflow-growth',
      name: 'BidFlow Growth',
      monthlyPrice: 149,
      setupFee: 499,
      includedLocations: 1,
      includedContacts: 1000,
      promise: 'Add higher-volume quoting, proposal follow-up, and weekly revenue reporting.',
    })

    expect(document).toContain('Paid Pilot Order Form')
    expect(document).toContain('Prepared for: Docs Roofing')
    expect(document).toContain('Product: BidFlow Local')
    expect(document).toContain('Setup fee: $499')
    expect(document).toContain('Monthly subscription: $149 / month')
    expect(document).toContain('First invoice target: $648')
    expect(document).toContain('Scope hash: abc123def456abc123def456')
    expect(document).toContain('Public checkout handoff: https://app.example.com/buy?handoff=token_docs')
    expect(document).toContain('Revenue is recognized only after Stripe webhook confirms paid.')
    expect(document).toContain('No automated email, SMS, or Google Business Profile actions are promised')
  })
})
