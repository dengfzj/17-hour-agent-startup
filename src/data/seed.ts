import {
  analyzeReview,
  buildEstimate,
  buildFeedbackCase,
  estimateCampaignRevenue,
  generateFollowUps,
  generateProposal,
  generateRecoveryOffer,
  generateReviewResponse,
  scoreLead,
} from '../domain/engines'
import type { Lead, Review, WorkspaceData } from '../domain/types'

const now = new Date()
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

const business = {
  id: 'org_evergreen',
  name: 'Evergreen Home Services',
  industry: 'Home repair and maintenance',
  city: 'Austin',
  state: 'TX',
  website: 'https://evergreen.example',
  currency: 'USD' as const,
  averageDealSize: 1850,
  grossMargin: 0.42,
  monthlyLeadGoal: 72,
  monthlyReviewGoal: 45,
  brandVoice: 'warm' as const,
}

const customers = [
  {
    id: 'cust_maria',
    name: 'Maria Lopez',
    email: 'maria@example.com',
    phone: '+1 512 555 0140',
    source: 'Google Business Profile',
    tags: ['homeowner', 'repeat'],
    consentEmail: true,
    consentSms: true,
    lifetimeValue: 4280,
    lastInteractionAt: daysAgo(12),
  },
  {
    id: 'cust_bryce',
    name: 'Bryce Carter',
    email: 'bryce@example.com',
    phone: '+1 512 555 0182',
    source: 'Referral',
    tags: ['commercial', 'high-intent'],
    consentEmail: true,
    consentSms: false,
    lifetimeValue: 890,
    lastInteractionAt: daysAgo(3),
  },
  {
    id: 'cust_anya',
    name: 'Anya Patel',
    email: 'anya@example.com',
    phone: '+1 512 555 0199',
    source: 'Website form',
    tags: ['first-time', 'review-risk'],
    consentEmail: true,
    consentSms: true,
    lifetimeValue: 620,
    lastInteractionAt: daysAgo(1),
  },
  {
    id: 'cust_dan',
    name: 'Dan Kim',
    email: 'dan@example.com',
    phone: '+1 512 555 0108',
    source: 'Seasonal campaign',
    tags: ['maintenance-plan'],
    consentEmail: true,
    consentSms: true,
    lifetimeValue: 3150,
    lastInteractionAt: daysAgo(66),
  },
]

const rawLeads: Array<Omit<Lead, 'score' | 'nextStep'>> = [
  {
    id: 'lead_roof_urgent',
    customerId: 'cust_maria',
    serviceCategory: 'Storm roof repair',
    description:
      'Water is coming through the ceiling near the guest bedroom after last night storm. Customer wants a temporary patch today and a full estimate for permanent repair.',
    budgetMin: 1200,
    budgetMax: 5200,
    urgency: 'emergency',
    source: 'phone',
    status: 'qualified',
    createdAt: daysAgo(0),
    locationFit: true,
    repeatCustomer: true,
  },
  {
    id: 'lead_office_refresh',
    customerId: 'cust_bryce',
    serviceCategory: 'Office maintenance refresh',
    description:
      'Small office needs drywall repair, paint touch-up, fixture replacement, and weekend scheduling before a tenant walkthrough next month.',
    budgetMin: 2500,
    budgetMax: 6800,
    urgency: 'high',
    source: 'referral',
    status: 'quoted',
    createdAt: daysAgo(2),
    locationFit: true,
    repeatCustomer: false,
  },
  {
    id: 'lead_patio',
    customerId: 'cust_dan',
    serviceCategory: 'Seasonal patio repair',
    description:
      'Customer wants a spring patio inspection, loose board repair, and maintenance plan quote before hosting guests.',
    budgetMin: 600,
    budgetMax: 1600,
    urgency: 'normal',
    source: 'website',
    status: 'new',
    createdAt: daysAgo(5),
    locationFit: true,
    repeatCustomer: true,
  },
]

const leads = rawLeads.map((lead) => ({ ...lead, ...scoreLead(lead, customers) }))
const estimates = leads.map((lead) => buildEstimate(lead, business))
const proposals = leads.map((lead) => {
  const customer = customers.find((item) => item.id === lead.customerId)!
  const estimate = estimates.find((item) => item.leadId === lead.id)!
  return generateProposal(lead, customer, estimate, business)
})
const followUps = leads.flatMap((lead) => {
  const customer = customers.find((item) => item.id === lead.customerId)!
  const estimate = estimates.find((item) => item.leadId === lead.id)!
  return generateFollowUps(lead, customer, estimate)
})

const rawReviews: Array<Omit<Review, 'riskScore' | 'sentimentScore' | 'status'>> = [
  {
    id: 'rev_maria',
    customerId: 'cust_maria',
    platform: 'google',
    rating: 5,
    body: 'Fast roof patch after the storm. The crew explained the permanent repair options clearly.',
    reviewerName: 'Maria L.',
    reviewedAt: daysAgo(4),
  },
  {
    id: 'rev_anya',
    customerId: 'cust_anya',
    platform: 'google',
    rating: 2,
    body: 'The technician was late, the invoice was expensive, and nobody replied when I asked for a refund. I may call my attorney.',
    reviewerName: 'Anya P.',
    reviewedAt: daysAgo(1),
  },
  {
    id: 'rev_dan',
    customerId: 'cust_dan',
    platform: 'facebook',
    rating: 4,
    body: 'Reliable seasonal maintenance. Scheduling could be a little faster, but the work has always been professional.',
    reviewerName: 'Dan K.',
    reviewedAt: daysAgo(22),
  },
]

const reviews = rawReviews.map((review) => ({ ...review, ...analyzeReview(review) }))
const reviewResponses = reviews.map((review) => {
  const customer = customers.find((item) => item.id === review.customerId)!
  return generateReviewResponse(review, customer, business)
})
const feedbackCases = reviews
  .filter((review) => review.rating <= 3 || review.riskScore >= 50)
  .map((review) => {
    const customer = customers.find((item) => item.id === review.customerId)!
    return buildFeedbackCase(review, customer)
  })
const recoveryOffers = feedbackCases.map((caseItem) => {
  const customer = customers.find((item) => item.id === caseItem.customerId)!
  return generateRecoveryOffer(caseItem, customer, business)
})

export const seedData: WorkspaceData = {
  business,
  customers,
  leads,
  estimates,
  proposals,
  followUps,
  reviews,
  reviewResponses,
  feedbackCases,
  recoveryOffers,
  campaigns: [
    {
      id: 'camp_review_boost',
      name: 'Post-service review lift',
      type: 'review_request',
      channel: 'mixed',
      status: 'active',
      audienceSize: 38,
      projectedRevenue: estimateCampaignRevenue(38, 0.08, business.averageDealSize),
      conversionRate: 0.08,
      createdAt: daysAgo(6),
    },
    {
      id: 'camp_spring_winback',
      name: 'Dormant homeowner winback',
      type: 'winback',
      channel: 'email',
      status: 'draft',
      audienceSize: 114,
      projectedRevenue: estimateCampaignRevenue(114, 0.045, business.averageDealSize),
      conversionRate: 0.045,
      createdAt: daysAgo(0),
    },
  ],
  outboundMessages: [],
  consentEvents: [],
  revenueRecoveryLinks: [],
  subscriptions: [],
  revenuePayments: [],
  onboarding: [],
  onboardingSubmissions: [],
  pilotOutcomes: [],
  salesProspects: [],
  salesOutreachPacks: [],
  salesCheckoutHandoffs: [],
  salesActivities: [],
  auditLogs: [
    {
      id: 'audit_research',
      actor: 'Research pod',
      action: 'selected_directions',
      entityType: 'portfolio',
      entityId: 'two_products',
      summary: 'Selected BidFlow Local and ReputeLoop after trend, demand, and risk review.',
      createdAt: now.toISOString(),
    },
  ],
  researchSources: [
    {
      title: 'Gartner forecasts worldwide IT spending to grow in 2026',
      publisher: 'Gartner',
      date: '2026-02-03',
      url: 'https://www.gartner.com/en/newsroom/press-releases/2026-02-03-gartner-forecasts-worldwide-it-spending-to-grow-10-point-8-percent-in-2026-totaling-6-point-15-trillion-dollars',
      note: 'Software and AI budget growth supports paid B2B workflow products.',
    },
    {
      title: 'QuickBooks AI Impact Report',
      publisher: 'Intuit QuickBooks',
      date: '2026-05',
      url: 'https://quickbooks.intuit.com/r/small-business-data/ai-impact-report/',
      note: 'SMBs use AI for marketing, service, and data work, but need trusted narrow tools.',
    },
    {
      title: 'Local Consumer Review Survey',
      publisher: 'BrightLocal',
      date: '2026',
      url: 'https://www.brightlocal.com/research/local-consumer-review-survey/',
      note: 'Local buyers rely heavily on Google reviews, creating direct ROI for review operations.',
    },
    {
      title: 'FTC final rule banning fake reviews and testimonials',
      publisher: 'FTC',
      date: '2024-08-14',
      url: 'https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials',
      note: 'Defines compliance constraints for review workflows; product avoids gating and incentives.',
    },
    {
      title: 'Loopio research on RFP teams and GenAI adoption',
      publisher: 'Loopio / BusinessWire',
      date: '2026-03-11',
      url: 'https://www.businesswire.com/news/home/20260311267176/en/New-Loopio-Research-Finds-AI-Adoption-and-Leadership-Expectations-Are-Climbing-as-RFP-Revenue-Influence-Reaches-a-Five-Year-High',
      note: 'RFP and proposal work is moving toward AI-assisted revenue operations.',
    },
  ],
  directions: [
    {
      id: 'dir_bidflow',
      name: 'BidFlow Local',
      productKey: 'bidflow',
      marketScore: 4,
      willingnessToPayScore: 4,
      buildComplexityScore: 5,
      complianceScore: 5,
      acquisitionScore: 4,
      sevenDayLaunchScore: 5,
      ceilingScore: 3,
      weightedScore: 83,
      targetCustomers: 'Local service businesses: contractors, repair teams, cleaning, field services, boutique B2B service firms.',
      priceAnchor: '$49-$299/month plus optional setup; replaces spreadsheet quoting and missed follow-up labor.',
      whyNow: 'SMBs are adopting narrow AI workflows and need revenue tools that turn leads into approved estimates faster.',
      risks: ['Service pricing varies by location and job conditions.', 'Needs human approval before binding quotes.', 'Vertical templates must be specific to win trust.'],
    },
    {
      id: 'dir_reputeloop',
      name: 'ReputeLoop',
      productKey: 'reputeloop',
      marketScore: 4,
      willingnessToPayScore: 4,
      buildComplexityScore: 4,
      complianceScore: 4,
      acquisitionScore: 3,
      sevenDayLaunchScore: 4,
      ceilingScore: 3,
      weightedScore: 75,
      targetCustomers: 'Local businesses with review-driven demand: home services, clinics, beauty, restaurants, repair, fitness.',
      priceAnchor: '$39-$199/month; lower than Podium/Birdeye while covering review response, risk handling, and winback.',
      whyNow: 'Reviews are a direct buying signal, while fake-review enforcement makes compliant workflows more valuable.',
      risks: ['Must not generate fake reviews or review gating.', 'SMS/email consent and unsubscribe must be respected.', 'Platform integrations can change.'],
    },
  ],
}
