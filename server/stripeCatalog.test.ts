import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { billingPlans } from './plans'
import { bootstrapStripeCatalog, type StripeCatalogClient } from './stripeCatalog'

describe('Stripe catalog bootstrap', () => {
  it('creates deterministic products and monthly prices for every billing plan', async () => {
    const calls: unknown[] = []
    const result = await bootstrapStripeCatalog(fakeCatalogClient(calls))

    expect(result.items).toHaveLength(billingPlans.length)
    expect(result.env.STRIPE_PRICE_BIDFLOW_GROWTH).toBe('price_bidflow_growth')
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'product.create',
          params: expect.objectContaining({ id: 'local_growth_os_bidflow_growth', name: 'BidFlow Growth' }),
          options: { idempotencyKey: 'local-growth-os-product-bidflow-growth' },
        }),
        expect.objectContaining({
          kind: 'price.create',
          params: expect.objectContaining({
            lookup_key: 'local_growth_os_bidflow-growth_monthly_usd',
            unit_amount: 14900,
            recurring: { interval: 'month' },
          }),
        }),
      ]),
    )
  })

  it('reuses active monthly prices that already match the lookup key', async () => {
    const calls: unknown[] = []
    const result = await bootstrapStripeCatalog(fakeCatalogClient(calls, { reusePrices: true }))

    expect(result.items.every((item) => !item.createdPrice)).toBe(true)
    expect(calls.filter((call) => (call as { kind: string }).kind === 'price.create')).toHaveLength(0)
  })
})

function fakeCatalogClient(calls: unknown[], options: { reusePrices?: boolean } = {}): StripeCatalogClient {
  return {
    products: {
      create: async (params, requestOptions) => {
        calls.push({ kind: 'product.create', params, options: requestOptions })
        return { id: String(params.id), object: 'product', name: String(params.name) } as Stripe.Product
      },
      update: async (id, params, requestOptions) => {
        calls.push({ kind: 'product.update', id, params, options: requestOptions })
        return { id, object: 'product', name: String(params.name) } as Stripe.Product
      },
    },
    prices: {
      list: async (params) => {
        calls.push({ kind: 'price.list', params })
        if (!options.reusePrices) return { data: [] }
        const plan = billingPlans.find((item) => params.lookup_keys?.[0] === `local_growth_os_${item.id}_monthly_usd`)
        if (!plan) return { data: [] }
        return {
          data: [
            {
              id: `price_${plan.id.replaceAll('-', '_')}`,
              object: 'price',
              active: true,
              currency: 'usd',
              lookup_key: params.lookup_keys?.[0],
              product: `local_growth_os_${plan.id.replaceAll('-', '_')}`,
              recurring: { interval: 'month' },
              unit_amount: plan.monthlyPrice * 100,
            } as Stripe.Price,
          ],
        }
      },
      create: async (params, requestOptions) => {
        calls.push({ kind: 'price.create', params, options: requestOptions })
        return {
          id: `price_${String(params.lookup_key).replace('local_growth_os_', '').replace('_monthly_usd', '').replaceAll('-', '_')}`,
          object: 'price',
          currency: params.currency,
          lookup_key: params.lookup_key,
          product: params.product,
          recurring: params.recurring,
          unit_amount: params.unit_amount,
        } as Stripe.Price
      },
    },
  }
}
