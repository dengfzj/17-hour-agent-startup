import 'dotenv/config'
import Stripe from 'stripe'
import { billingPlans, type BillingPlan } from './plans'

type StripeRequestOptions = {
  idempotencyKey?: string
}

export type StripeCatalogClient = {
  products: {
    create: (params: Stripe.ProductCreateParams, options?: StripeRequestOptions) => Promise<Stripe.Product>
    update: (id: string, params: Stripe.ProductUpdateParams, options?: StripeRequestOptions) => Promise<Stripe.Product>
  }
  prices: {
    list: (params: Stripe.PriceListParams) => Promise<{ data: Stripe.Price[] }>
    create: (params: Stripe.PriceCreateParams, options?: StripeRequestOptions) => Promise<Stripe.Price>
  }
}

export type StripeCatalogItem = {
  planId: string
  productId: string
  priceId: string
  stripePriceEnv: string
  lookupKey: string
  createdProduct: boolean
  createdPrice: boolean
}

export function createStripeCatalogClient(secretKey = process.env.STRIPE_SECRET_KEY): StripeCatalogClient {
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is required to bootstrap Stripe products and prices.')
  }

  return new Stripe(secretKey, {
    apiVersion: '2026-05-27.dahlia',
  })
}

export async function bootstrapStripeCatalog(client: StripeCatalogClient, plans: BillingPlan[] = billingPlans) {
  const items: StripeCatalogItem[] = []
  for (const plan of plans) {
    const product = await createOrUpdateProduct(client, plan)
    const price = await createOrReuseMonthlyPrice(client, plan, product.id)
    items.push({
      planId: plan.id,
      productId: product.id,
      priceId: price.price.id,
      stripePriceEnv: plan.stripePriceEnv,
      lookupKey: price.lookupKey,
      createdProduct: product.created,
      createdPrice: price.created,
    })
  }

  return {
    items,
    env: Object.fromEntries(items.map((item) => [item.stripePriceEnv, item.priceId])),
  }
}

function productIdForPlan(plan: BillingPlan) {
  return `local_growth_os_${plan.id.replaceAll('-', '_')}`
}

function lookupKeyForPlan(plan: BillingPlan) {
  return `local_growth_os_${plan.id}_monthly_usd`
}

async function createOrUpdateProduct(client: StripeCatalogClient, plan: BillingPlan) {
  const productId = productIdForPlan(plan)
  const params = {
    id: productId,
    name: plan.name,
    description: plan.promise,
    metadata: {
      app: 'local_growth_os',
      plan_id: plan.id,
      product: plan.product,
      included_locations: String(plan.includedLocations),
      included_contacts: String(plan.includedContacts),
    },
  } satisfies Stripe.ProductCreateParams

  try {
    const product = await client.products.create(params, { idempotencyKey: `local-growth-os-product-${plan.id}` })
    return { ...product, created: true }
  } catch (error) {
    if (!isResourceAlreadyExists(error)) throw error
    const product = await client.products.update(
      productId,
      {
        name: params.name,
        description: params.description,
        metadata: params.metadata,
      },
      { idempotencyKey: `local-growth-os-product-update-${plan.id}` },
    )
    return { ...product, created: false }
  }
}

async function createOrReuseMonthlyPrice(client: StripeCatalogClient, plan: BillingPlan, productId: string) {
  const lookupKey = lookupKeyForPlan(plan)
  const unitAmount = plan.monthlyPrice * 100
  const existing = await client.prices.list({ active: true, lookup_keys: [lookupKey], limit: 10 })
  const matching = existing.data.find(
    (price) =>
      price.currency === 'usd' &&
      price.unit_amount === unitAmount &&
      price.recurring?.interval === 'month' &&
      (typeof price.product === 'string' ? price.product === productId : price.product?.id === productId),
  )
  if (matching) return { price: matching, lookupKey, created: false }

  if (existing.data.length > 0) {
    throw new Error(
      `Active Stripe price with lookup_key ${lookupKey} exists but does not match ${unitAmount} usd/month for ${productId}. Archive or rename it before bootstrapping.`,
    )
  }

  const price = await client.prices.create(
    {
      currency: 'usd',
      unit_amount: unitAmount,
      recurring: { interval: 'month' },
      product: productId,
      lookup_key: lookupKey,
      nickname: `${plan.name} monthly`,
      metadata: {
        app: 'local_growth_os',
        plan_id: plan.id,
        product: plan.product,
        setup_fee_usd: String(plan.setupFee),
      },
    },
    { idempotencyKey: `local-growth-os-price-${plan.id}-monthly-usd` },
  )

  return { price, lookupKey, created: true }
}

function isResourceAlreadyExists(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'resource_already_exists',
  )
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/stripeCatalog.ts')) {
  try {
    const result = await bootstrapStripeCatalog(createStripeCatalogClient())
    console.log('# Paste these values into Render or your production environment:')
    for (const item of result.items) {
      console.log(`${item.stripePriceEnv}=${item.priceId}`)
    }
    console.log('')
    for (const item of result.items) {
      console.log(`${item.createdPrice ? 'CREATED' : 'REUSED'} ${item.planId} ${item.lookupKey} -> ${item.priceId}`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
