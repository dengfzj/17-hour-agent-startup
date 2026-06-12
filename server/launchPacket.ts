import 'dotenv/config'
import type { OnboardingRecord, RevenuePayment, RevenueRecoveryLink, SalesCheckoutHandoff, SalesProspect, WorkspaceData } from '../src/domain/types'
import { buildLaunchReadiness, type LaunchReadinessReport } from './launchReadiness'
import { findBillingPlan } from './plans'
import { readWorkspace } from './storage'

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>

export type LaunchPacket = {
  generatedAt: string
  mode: 'blocked' | 'ready_for_live_smoke' | 'collecting_pilots' | 'delivery_focus' | 'renewal_focus'
  summary: {
    paidPilots: number
    paidBidFlowPilots: number
    paidReputeLoopPilots: number
    setupRevenueCents: number
    mrrCents: number
    openCheckoutCount: number
    deliveryAtRiskCount: number
    customerActionCount: number
    renewalEvidenceCount: number
  }
  blockers: string[]
  liveUrls: Array<{ label: string; url: string }>
  command: Array<{ priority: string; owner: string; action: string; evidence: string }>
  firstTwoPilotTargets: Array<{ product: string; planId: string; setupFee: number; monthlyPrice: number; target: string }>
  proofRules: string[]
  readiness: LaunchReadinessReport
}

function cents(value: number) {
  return `$${Math.round(value / 100).toLocaleString()}`
}

function dollars(value: number) {
  return `$${Math.round(value).toLocaleString()}`
}

function publicUrl(baseUrl: string | undefined, path: string) {
  if (!baseUrl?.trim()) return `PUBLIC_API_BASE_URL${path}`
  try {
    return new URL(path, new URL(baseUrl).origin).toString()
  } catch {
    return `${baseUrl.replace(/\/$/, '')}${path}`
  }
}

function paidPayments(workspace: WorkspaceData) {
  return workspace.revenuePayments.filter((payment) => payment.status === 'paid')
}

function sumPayments(payments: RevenuePayment[], key: 'setupRevenueCents' | 'mrrCents' | 'grossCollectedCents') {
  return payments.reduce((sum, payment) => sum + payment[key], 0)
}

function activeCheckoutHandoffs(workspace: WorkspaceData) {
  return workspace.salesCheckoutHandoffs.filter((handoff) => handoff.status === 'created' || handoff.status === 'sent')
}

function checkoutProspects(workspace: WorkspaceData) {
  return workspace.salesProspects.filter((prospect) => prospect.status === 'checkout_sent')
}

function deliveryAtRisk(workspace: WorkspaceData, now: Date) {
  return workspace.onboarding.filter((record) => {
    const dueAt = Date.parse(record.deliverySlaDueAt)
    const dueSoon = Number.isFinite(dueAt) && dueAt <= now.getTime() + 48 * 60 * 60 * 1000
    return dueSoon && !['customer_confirmed', 'renewal_ready'].includes(record.deliveryStatus)
  })
}

function customerActionLinks(workspace: WorkspaceData) {
  return workspace.revenueRecoveryLinks.filter((link) =>
    ['opened', 'revision_requested', 'callback_requested', 'accepted'].includes(link.status),
  )
}

function renewalEvidenceRecords(workspace: WorkspaceData) {
  return workspace.onboarding.filter(
    (record) => record.renewalEvidenceSummary || record.customerConfirmedAt || record.deliveryStatus === 'customer_confirmed',
  )
}

function checkoutEvidence(item: SalesProspect | SalesCheckoutHandoff) {
  if ('averageJobValue' in item) return `${item.status.replaceAll('_', ' ')}; estimated job value ${dollars(item.averageJobValue)}`
  return `${item.status.replaceAll('_', ' ')} handoff; ${item.planId}; scope hash ${item.scopeAcceptedHash.slice(0, 10)}`
}

function buildCheckoutCommands(workspace: WorkspaceData) {
  const prospectCommands = checkoutProspects(workspace).slice(0, 4).map((prospect) => ({
    priority: 'P0',
    owner: prospect.ownerEmail,
    action: `Call ${prospect.businessName}; confirm the scoped checkout link and close payment or mark lost.`,
    evidence: checkoutEvidence(prospect),
  }))
  const handoffCommands = activeCheckoutHandoffs(workspace).slice(0, 4).map((handoff) => ({
    priority: 'P0',
    owner: handoff.customerEmail,
    action: `Follow up ${handoff.businessName}; do not count revenue until the live Stripe webhook records payment.`,
    evidence: checkoutEvidence(handoff),
  }))
  return [...prospectCommands, ...handoffCommands]
}

function buildDeliveryCommands(records: OnboardingRecord[], now: Date) {
  return records.slice(0, 4).map((record) => {
    const overdue = Date.parse(record.deliverySlaDueAt) < now.getTime()
    return {
      priority: overdue ? 'P0' : 'P1',
      owner: record.deliveryOwnerEmail,
      action:
        record.deliveryStatus === 'sent'
          ? `Ask ${record.businessName} to accept, request revision, or schedule a call from the private onboarding link.`
          : `Move ${record.businessName} to QA-approved first-pack delivery.`,
      evidence: `${record.deliveryStatus.replaceAll('_', ' ')}; SLA ${record.deliverySlaDueAt.slice(0, 10)}`,
    }
  })
}

function buildCustomerActionCommands(links: RevenueRecoveryLink[]) {
  return links.slice(0, 4).map((link) => ({
    priority: link.status === 'accepted' ? 'P1' : 'P2',
    owner: link.customerEmail,
    action:
      link.status === 'accepted'
        ? `Turn ${link.customerName}'s accepted ${link.product === 'bidflow' ? 'proposal' : 'recovery plan'} into scheduled work and outcome evidence.`
        : `Follow up ${link.customerName}'s ${link.status.replaceAll('_', ' ')} customer action before the link expires.`,
    evidence: `${link.businessName}; value ${cents(link.valueCents)}; expires ${link.expiresAt.slice(0, 10)}`,
  }))
}

function buildRenewalCommands(records: OnboardingRecord[]) {
  return records.slice(0, 4).map((record) => ({
    priority: 'P2',
    owner: record.deliveryOwnerEmail,
    action: `Ask ${record.businessName} for renewal, continuation, or a measurable objection after accepted first-pack proof.`,
    evidence: record.renewalEvidenceSummary || `Customer confirmed delivery at ${record.customerConfirmedAt}`,
  }))
}

function buildBlockers(readiness: LaunchReadinessReport, workspace: WorkspaceData) {
  const readinessBlockers = readiness.checks
    .filter((check) => check.severity === 'blocker' && !check.ok)
    .map((check) => `${check.label}: ${check.fix}`)
  const businessBlockers: string[] = []
  if (paidPayments(workspace).length === 0) businessBlockers.push('No live Stripe-paid RevenuePayment rows yet.')
  if (checkoutProspects(workspace).length === 0 && activeCheckoutHandoffs(workspace).length === 0) {
    businessBlockers.push('No checkout-sent prospect or active checkout handoff is waiting for payment.')
  }
  return [...readinessBlockers, ...businessBlockers]
}

function firstTwoPilotTargets() {
  const bidFlow = findBillingPlan('bidflow-growth')
  const reputeLoop = findBillingPlan('reputeloop-growth')
  return [bidFlow, reputeLoop].filter(Boolean).map((plan) => ({
    product: plan!.product,
    planId: plan!.id,
    setupFee: plan!.setupFee,
    monthlyPrice: plan!.monthlyPrice,
    target:
      plan!.product === 'bidflow'
        ? 'One local service company with missed quote or slow estimate leakage.'
        : 'One review-driven local business with unanswered negative reviews or recovery risk.',
  }))
}

function determineMode(readiness: LaunchReadinessReport, summary: LaunchPacket['summary']) {
  if (!readiness.configReadyForLiveSmokeTest) return 'blocked'
  if (summary.paidPilots === 0) return 'ready_for_live_smoke'
  if (summary.deliveryAtRiskCount > 0) return 'delivery_focus'
  if (summary.renewalEvidenceCount > 0) return 'renewal_focus'
  return 'collecting_pilots'
}

export function buildLaunchPacket(workspace: WorkspaceData, env: Env = process.env, now = new Date()): LaunchPacket {
  const readiness = buildLaunchReadiness(env, now.toISOString())
  const paid = paidPayments(workspace)
  const deliveryRisk = deliveryAtRisk(workspace, now)
  const customerActions = customerActionLinks(workspace)
  const renewalEvidence = renewalEvidenceRecords(workspace)
  const summary = {
    paidPilots: paid.length,
    paidBidFlowPilots: paid.filter((payment) => payment.product === 'bidflow').length,
    paidReputeLoopPilots: paid.filter((payment) => payment.product === 'reputeloop').length,
    setupRevenueCents: sumPayments(paid, 'setupRevenueCents'),
    mrrCents: sumPayments(paid, 'mrrCents'),
    openCheckoutCount: checkoutProspects(workspace).length + activeCheckoutHandoffs(workspace).length,
    deliveryAtRiskCount: deliveryRisk.length,
    customerActionCount: customerActions.length,
    renewalEvidenceCount: renewalEvidence.length + workspace.pilotOutcomes.length,
  }

  return {
    generatedAt: now.toISOString(),
    mode: determineMode(readiness, summary),
    summary,
    blockers: buildBlockers(readiness, workspace).slice(0, 12),
    liveUrls: [
      { label: 'Public checkout', url: publicUrl(env.PUBLIC_API_BASE_URL, '/buy') },
      { label: 'Stripe webhook', url: publicUrl(env.PUBLIC_API_BASE_URL, '/api/billing/webhook') },
      { label: 'Launch page', url: publicUrl(env.PUBLIC_API_BASE_URL, '/') },
      { label: 'Customer onboarding pattern', url: publicUrl(env.PUBLIC_API_BASE_URL, '/onboarding/<customerAccessToken>') },
      { label: 'Recovery link pattern', url: publicUrl(env.PUBLIC_API_BASE_URL, '/recovery/<token>') },
    ],
    command: [
      ...buildCheckoutCommands(workspace),
      ...buildDeliveryCommands(deliveryRisk, now),
      ...buildCustomerActionCommands(customerActions),
      ...buildRenewalCommands(renewalEvidence),
    ].slice(0, 12),
    firstTwoPilotTargets: firstTwoPilotTargets(),
    proofRules: [
      'Collection proof must be a paid RevenuePayment row written from a signed live Stripe webhook.',
      'Checkout-sent prospects and active checkout handoffs are pressure, not revenue.',
      'First-pack delivery proof requires QA approval, sent evidence, and customer accept/revision/call response.',
      'Renewal proof requires an outcome ledger entry or customer-confirmed first-pack evidence.',
      'Do not broaden self-serve checkout until live payment, onboarding, delivery acceptance, and manual signoffs exist.',
    ],
    readiness,
  }
}

export function formatLaunchPacket(packet: LaunchPacket) {
  const lines: string[] = []
  lines.push('# Local Growth OS Live Launch Packet')
  lines.push('')
  lines.push(`Generated: ${packet.generatedAt}`)
  lines.push(`Mode: ${packet.mode}`)
  lines.push('')
  lines.push('## Revenue State')
  lines.push(`- Paid pilots: ${packet.summary.paidPilots} (${packet.summary.paidBidFlowPilots} BidFlow, ${packet.summary.paidReputeLoopPilots} ReputeLoop)`)
  lines.push(`- Setup revenue: ${cents(packet.summary.setupRevenueCents)}`)
  lines.push(`- Booked MRR: ${cents(packet.summary.mrrCents)}`)
  lines.push(`- Open checkout pressure: ${packet.summary.openCheckoutCount}`)
  lines.push(`- Delivery risk: ${packet.summary.deliveryAtRiskCount}`)
  lines.push(`- Customer actions: ${packet.summary.customerActionCount}`)
  lines.push(`- Renewal evidence: ${packet.summary.renewalEvidenceCount}`)
  lines.push('')
  lines.push('## Blockers')
  if (packet.blockers.length === 0) {
    lines.push('- No machine-checkable blockers. Keep manual signoffs in force.')
  } else {
    for (const blocker of packet.blockers) lines.push(`- ${blocker}`)
  }
  lines.push('')
  lines.push('## Live URLs')
  for (const item of packet.liveUrls) lines.push(`- ${item.label}: ${item.url}`)
  lines.push('')
  lines.push('## First Two Paid Pilot Targets')
  for (const target of packet.firstTwoPilotTargets) {
    lines.push(`- ${target.planId}: ${target.target} Charge ${dollars(target.setupFee)} setup + ${dollars(target.monthlyPrice)}/month.`)
  }
  lines.push('')
  lines.push('## Today Command')
  if (packet.command.length === 0) {
    lines.push('- Build or import the first prospect list, generate a scoped checkout handoff, and close live Stripe payment.')
  } else {
    for (const item of packet.command) {
      lines.push(`- ${item.priority} ${item.action}`)
      lines.push(`  Owner/evidence: ${item.owner || 'unassigned'}; ${item.evidence}`)
    }
  }
  lines.push('')
  lines.push('## Proof Rules')
  for (const rule of packet.proofRules) lines.push(`- ${rule}`)
  lines.push('')
  lines.push('## Required Manual Signoffs')
  for (const signoff of packet.readiness.manualSignoffs) {
    lines.push(`- ${signoff.label}`)
    lines.push(`  Owner: ${signoff.owner}`)
    lines.push(`  Evidence: ${signoff.evidence}`)
  }
  return lines.join('\n')
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/launchPacket.ts')) {
  const packet = buildLaunchPacket(readWorkspace())
  console.log(formatLaunchPacket(packet))
  if (packet.mode === 'blocked') {
    process.exitCode = 1
  }
}
