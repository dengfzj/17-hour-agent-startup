import type { ProductKey } from '../src/domain/types'

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

export const billingPlans: BillingPlan[] = [
  {
    id: 'bidflow-starter',
    product: 'bidflow',
    name: 'BidFlow Starter',
    monthlyPrice: 49,
    setupFee: 299,
    includedLocations: 1,
    includedContacts: 250,
    promise: 'Score leads and draft revenue packs for one local service workflow.',
    stripePriceEnv: 'STRIPE_PRICE_BIDFLOW_STARTER',
  },
  {
    id: 'bidflow-growth',
    product: 'bidflow',
    name: 'BidFlow Growth',
    monthlyPrice: 149,
    setupFee: 499,
    includedLocations: 1,
    includedContacts: 1000,
    promise: 'Add higher-volume quoting, proposal follow-up, and weekly revenue reporting.',
    stripePriceEnv: 'STRIPE_PRICE_BIDFLOW_GROWTH',
  },
  {
    id: 'bidflow-pro',
    product: 'bidflow',
    name: 'BidFlow Pro',
    monthlyPrice: 299,
    setupFee: 999,
    includedLocations: 3,
    includedContacts: 5000,
    promise: 'Multi-location quote operations with owner-level pipeline controls.',
    stripePriceEnv: 'STRIPE_PRICE_BIDFLOW_PRO',
  },
  {
    id: 'reputeloop-starter',
    product: 'reputeloop',
    name: 'ReputeLoop Starter',
    monthlyPrice: 39,
    setupFee: 199,
    includedLocations: 1,
    includedContacts: 250,
    promise: 'Draft compliant review replies and recovery tasks for one location.',
    stripePriceEnv: 'STRIPE_PRICE_REPUTELOOP_STARTER',
  },
  {
    id: 'reputeloop-growth',
    product: 'reputeloop',
    name: 'ReputeLoop Growth',
    monthlyPrice: 99,
    setupFee: 399,
    includedLocations: 1,
    includedContacts: 1000,
    promise: 'Add winback offers, campaign planning, and review risk reporting.',
    stripePriceEnv: 'STRIPE_PRICE_REPUTELOOP_GROWTH',
  },
  {
    id: 'reputeloop-pro',
    product: 'reputeloop',
    name: 'ReputeLoop Pro',
    monthlyPrice: 199,
    setupFee: 699,
    includedLocations: 3,
    includedContacts: 5000,
    promise: 'Multi-location review recovery with manager approval workflows.',
    stripePriceEnv: 'STRIPE_PRICE_REPUTELOOP_PRO',
  },
]

export function findBillingPlan(planId: string) {
  return billingPlans.find((plan) => plan.id === planId)
}

export function getPlanReadiness(planId: string, env = process.env) {
  const plan = findBillingPlan(planId)
  if (!plan) {
    return { plan: undefined, configured: false, missing: ['plan'] }
  }

  const missing = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', plan.stripePriceEnv].filter((key) => !env[key])
  return { plan, configured: missing.length === 0, missing }
}
