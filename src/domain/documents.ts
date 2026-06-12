import { format } from 'date-fns'
import type {
  BusinessProfile,
  Customer,
  Estimate,
  Proposal,
  RecoveryOffer,
  Review,
  ReviewResponse,
  SalesCheckoutHandoff,
  SalesOutreachPack,
  SalesProspect,
} from './types'
import { formatCurrency } from './engines'

type OrderFormPlan = {
  id: string
  name: string
  monthlyPrice: number
  setupFee: number
  includedLocations: number
  includedContacts: number
  promise: string
}

function productLabel(product: 'bidflow' | 'reputeloop') {
  return product === 'bidflow' ? 'BidFlow Local' : 'ReputeLoop'
}

export function renderProposalDocument(
  business: BusinessProfile,
  customer: Customer,
  estimate: Estimate,
  proposal: Proposal,
) {
  const lineItems = estimate.lineItems
    .map((item) => `- ${item.name}: ${item.quantity} ${item.unit} x ${formatCurrency(item.unitPrice)}`)
    .join('\n')
  const scope = proposal.scopeOfWork.map((item) => `- ${item}`).join('\n')
  const exclusions = proposal.exclusions.map((item) => `- ${item}`).join('\n')

  return `# ${proposal.title}

Prepared by: ${business.name}
Prepared for: ${customer.name}
Generated: ${format(new Date(proposal.generatedAt), 'yyyy-MM-dd')}
Valid until: ${format(new Date(estimate.validUntil), 'yyyy-MM-dd')}

## Problem Summary

${proposal.problemSummary}

## Recommended Solution

${proposal.recommendedSolution}

## Estimate

${lineItems}

Subtotal: ${formatCurrency(estimate.subtotal)}
Tax: ${formatCurrency(estimate.tax)}
Total: ${formatCurrency(estimate.total)}

## Scope of Work

${scope}

## Timeline

${proposal.timeline}

## Warranty and Terms

${proposal.warrantyTerms}

## Exclusions

${exclusions}

## Next Step

${proposal.closingNote}
`
}

export function renderRecoveryDocument(
  business: BusinessProfile,
  customer: Customer,
  review: Review,
  response: ReviewResponse,
  offer?: RecoveryOffer,
) {
  return `# Review Recovery Pack

Business: ${business.name}
Customer: ${customer.name}
Platform: ${review.platform}
Rating: ${review.rating}
Risk score: ${review.riskScore}

## Public Reply Draft

${response.body}

## Compliance Notes

${response.complianceNotes.map((note) => `- ${note}`).join('\n')}

## Recovery Offer

${offer ? `${offer.message}\n\nOffer type: ${offer.offerType}\nValue: ${formatCurrency(offer.value)}\nExpires: ${format(new Date(offer.expiresAt), 'yyyy-MM-dd')}` : 'No recovery offer required.'}
`
}

export function renderSalesOutreachDocument(
  business: BusinessProfile,
  prospect: SalesProspect,
  pack: SalesOutreachPack,
) {
  return `# Sales Outreach Pack

Prepared by: ${business.name}
Prospect: ${prospect.businessName}
Product: ${productLabel(pack.product)}
Generated: ${format(new Date(pack.generatedAt), 'yyyy-MM-dd')}
Pilot price draft: ${pack.pilotPriceSummary}

## Source Signals

- Industry: ${prospect.industry || 'Unknown'}
- Location: ${[prospect.city, prospect.state].filter(Boolean).join(', ') || 'Unknown'}
- Google review count: ${prospect.googleReviewCount || 'Unknown'}
- Average rating: ${prospect.averageRating || 'Unknown'}
- Average job value: ${prospect.averageJobValue ? formatCurrency(prospect.averageJobValue) : 'Unknown'}
- Review issue: ${prospect.recentReviewIssue || 'None recorded'}
- Quote leak signal: ${prospect.quoteLeakSignal || 'None recorded'}
- Fit score: ${prospect.fitScore}
- Recommended next touch: ${prospect.nextTouch}

## Email

Subject: ${pack.subject}

${pack.emailBody}

## Call Opener

${pack.callOpener}

## Voicemail

${pack.voicemailScript}

## LinkedIn Note

${pack.linkedinNote}

## Discovery Questions

${pack.discoveryQuestions.map((question) => `- ${question}`).join('\n')}

## Proof Points

${pack.proofPoints.map((point) => `- ${point}`).join('\n')}

## Risk Notes

${pack.riskNotes.map((note) => `- ${note}`).join('\n')}

## Pilot Scope Draft

${pack.pilotScopeDraft}

## Next Step

${pack.nextStep}
`
}

export function renderCheckoutHandoffOrderFormDocument(
  business: BusinessProfile,
  handoff: SalesCheckoutHandoff,
  plan: OrderFormPlan,
) {
  const firstInvoice = plan.setupFee + plan.monthlyPrice
  const expiration = handoff.expiresAt ? format(new Date(handoff.expiresAt), 'yyyy-MM-dd') : 'No expiration recorded'
  const paidAt = handoff.paidAt ? `\nPaid at: ${format(new Date(handoff.paidAt), 'yyyy-MM-dd')}` : ''

  return `# Paid Pilot Order Form

Prepared by: ${business.name}
Prepared for: ${handoff.businessName}
Owner email: ${handoff.customerEmail}
Business website: ${handoff.businessWebsite || 'Not provided'}
Location: ${[handoff.businessCity, handoff.businessState].filter(Boolean).join(', ') || 'Not provided'}
Industry: ${handoff.industry || 'Not provided'}
Product: ${productLabel(handoff.product)}
Plan: ${plan.name} (${plan.id})
Prepared: ${format(new Date(handoff.createdAt), 'yyyy-MM-dd')}
Expires: ${expiration}
Status: ${handoff.status}${paidAt}

## Commercial Terms

- Setup fee: ${formatCurrency(plan.setupFee)}
- Monthly subscription: ${formatCurrency(plan.monthlyPrice)} / month
- First invoice target: ${formatCurrency(firstInvoice)}
- Included locations: ${plan.includedLocations}
- Included contacts: ${plan.includedContacts.toLocaleString('en-US')}
- Plan promise: ${plan.promise}

## Accepted Pilot Scope

${handoff.scopeSummary}

Scope source: ${handoff.scopeSource.replaceAll('_', ' ')}
Scope hash: ${handoff.scopeAcceptedHash}

## Payment Link

Public checkout handoff: ${handoff.checkoutUrl}

## Customer Acknowledgements

- The paid pilot scope above is the scope to be purchased.
- Deliverables require human review before customer use.
- Revenue is recognized only after Stripe webhook confirms paid.
- Customer materials must be reviewed before import.
- No automated email, SMS, or Google Business Profile actions are promised unless the provider integrations are configured and the customer approves the channel policy.

## Operator Checklist

- Confirm owner email and business profile before sending.
- Confirm the scope hash matches the checkout handoff.
- Send terms, privacy, and refund policy links with the payment page.
- Keep the prospect on hold until paid webhook evidence arrives.

## Non-Legal Note

This order form is an operational payment summary, not a standalone legal contract. Use a signed agreement when your market, customer size, or refund policy requires one.
`
}
