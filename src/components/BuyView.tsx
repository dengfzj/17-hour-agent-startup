import { CreditCard, FileText, ShieldCheck, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatCurrency } from '../domain/engines'
import { createPublicCheckoutSession, getPublicCheckoutHandoff } from '../lib/api'
import type { PublicSalesCheckoutHandoff } from '../domain/types'

const offers = [
  {
    planId: 'bidflow-growth',
    product: 'BidFlow Local',
    icon: FileText,
    monthly: 149,
    setup: 499,
    promise: 'Recover missed quote revenue with scored leads, estimate drafts, proposals, and follow-up packs.',
  },
  {
    planId: 'reputeloop-growth',
    product: 'ReputeLoop',
    icon: Star,
    monthly: 99,
    setup: 399,
    promise: 'Protect review conversion with risk scoring, compliant response drafts, and winback recovery packs.',
  },
] as const

export function BuyView() {
  const [planId, setPlanId] = useState<(typeof offers)[number]['planId']>('bidflow-growth')
  const [handoff, setHandoff] = useState<PublicSalesCheckoutHandoff>()
  const [profile, setProfile] = useState({
    businessName: '',
    customerEmail: '',
    businessWebsite: '',
    businessCity: '',
    businessState: '',
    industry: '',
  })
  const [acknowledgements, setAcknowledgements] = useState({
    pilotScopeAccepted: false,
    humanReviewAccepted: false,
    termsAccepted: false,
    privacyAccepted: false,
    refundPolicyAccepted: false,
  })
  const [status, setStatus] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const selectedOffer = offers.find((offer) => offer.planId === planId) ?? offers[0]
  const readyToCheckout =
    Boolean(profile.businessName && profile.customerEmail) && Object.values(acknowledgements).every((accepted) => accepted)
  const handoffToken = new URLSearchParams(window.location.search).get('handoff') ?? ''

  useEffect(() => {
    if (!handoffToken) return
    let canceled = false
    getPublicCheckoutHandoff(handoffToken)
      .then(({ handoff: nextHandoff }) => {
        if (canceled) return
        setHandoff(nextHandoff)
        setPlanId(nextHandoff.planId as (typeof offers)[number]['planId'])
        setProfile({
          businessName: nextHandoff.businessName,
          customerEmail: nextHandoff.customerEmail,
          businessWebsite: nextHandoff.businessWebsite,
          businessCity: nextHandoff.businessCity,
          businessState: nextHandoff.businessState,
          industry: nextHandoff.industry,
        })
      })
      .catch((error) => {
        if (!canceled) setStatus(error instanceof Error ? error.message : 'Unable to load checkout handoff.')
      })
    return () => {
      canceled = true
    }
  }, [handoffToken])

  const startCheckout = async () => {
    setStatus(undefined)
    setSubmitting(true)
    try {
      const origin = window.location.origin
      const result = await createPublicCheckoutSession({
        planId,
        successUrl: `${origin}/buy?checkout=success&plan=${encodeURIComponent(planId)}`,
        cancelUrl: `${origin}/buy?checkout=cancelled&plan=${encodeURIComponent(planId)}`,
        ...profile,
        ...acknowledgements,
        checkoutHandoffToken: handoffToken || undefined,
      })
      if (!result.url) throw new Error('Stripe did not return a Checkout URL.')
      window.location.assign(result.url)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to start checkout.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="public-buy-shell">
      <section className="section-band">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Paid pilot checkout</span>
            <h2>Start a managed local growth pilot</h2>
          </div>
          <p>Choose one focused workflow, pay setup plus the first monthly plan through Stripe, then complete onboarding.</p>
        </div>
        {status && <div className="api-status">{status}</div>}
        {handoff && (
          <div className="api-status ready">
            <span>Prospect-specific checkout</span>
            <strong>{handoff.businessName}</strong>
          </div>
        )}
        <div className="buy-grid">
          {offers.map((offer) => {
            const Icon = offer.icon
            return (
              <button
                type="button"
                className={offer.planId === planId ? 'buy-offer active' : 'buy-offer'}
                key={offer.planId}
                disabled={Boolean(handoff)}
                onClick={() => setPlanId(offer.planId)}
              >
                <Icon size={20} />
                <strong>{offer.product}</strong>
                <span>{offer.promise}</span>
                <b>
                  {formatCurrency(offer.monthly)}/mo + {formatCurrency(offer.setup)} setup
                </b>
              </button>
            )
          })}
        </div>
      </section>

      <section className="two-column">
        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Business profile</span>
            <h2>Checkout details</h2>
          </div>
          {handoff && (
            <div className="scope-confirmation">
              <span>Accepted pilot scope</span>
              <strong>{handoff.scopeSummary}</strong>
              <small>
                Source: {handoff.scopeSource.replaceAll('_', ' ')} · Evidence hash {handoff.scopeAcceptedHash}
              </small>
            </div>
          )}
          <div className="checkout-profile public">
            <label>
              Business
              <input
                required
                value={profile.businessName}
                readOnly={Boolean(handoff)}
                onChange={(event) => setProfile((current) => ({ ...current, businessName: event.target.value }))}
              />
            </label>
            <label>
              Owner email
              <input
                required
                type="email"
                value={profile.customerEmail}
                readOnly={Boolean(handoff)}
                onChange={(event) => setProfile((current) => ({ ...current, customerEmail: event.target.value }))}
              />
            </label>
            <label>
              Website
              <input
                value={profile.businessWebsite}
                readOnly={Boolean(handoff)}
                onChange={(event) => setProfile((current) => ({ ...current, businessWebsite: event.target.value }))}
              />
            </label>
            <label>
              Industry
                <input
                  value={profile.industry}
                  readOnly={Boolean(handoff)}
                  onChange={(event) => setProfile((current) => ({ ...current, industry: event.target.value }))}
                />
            </label>
            <div className="form-row">
              <label>
                City
                <input
                  value={profile.businessCity}
                  readOnly={Boolean(handoff)}
                  onChange={(event) => setProfile((current) => ({ ...current, businessCity: event.target.value }))}
                />
              </label>
              <label>
                State
                <input
                  value={profile.businessState}
                  readOnly={Boolean(handoff)}
                  onChange={(event) => setProfile((current) => ({ ...current, businessState: event.target.value }))}
                />
              </label>
            </div>
          </div>
          <div className="checkout-acknowledgements" aria-label="Checkout acknowledgements">
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.pilotScopeAccepted}
                onChange={(event) =>
                  setAcknowledgements((current) => ({ ...current, pilotScopeAccepted: event.target.checked }))
                }
              />
              {handoff
                ? 'I accept the pilot scope displayed above for this paid handoff.'
                : 'I have a written pilot scope or qualified fit conversation for this workflow.'}
            </label>
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.humanReviewAccepted}
                onChange={(event) =>
                  setAcknowledgements((current) => ({ ...current, humanReviewAccepted: event.target.checked }))
                }
              />
              I understand submitted materials are operator-reviewed before import, sending, or public replies.
            </label>
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.termsAccepted}
                onChange={(event) => setAcknowledgements((current) => ({ ...current, termsAccepted: event.target.checked }))}
              />
              <span>
                I accept the{' '}
                <a href="/legal/pilot-terms" target="_blank" rel="noreferrer">
                  pilot terms
                </a>{' '}
                for setup, monthly subscription, deliverables, and manual approval.
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.privacyAccepted}
                onChange={(event) => setAcknowledgements((current) => ({ ...current, privacyAccepted: event.target.checked }))}
              />
              <span>
                I accept the{' '}
                <a href="/legal/privacy" target="_blank" rel="noreferrer">
                  privacy handling
                </a>{' '}
                for submitted lead, review, and business materials.
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.refundPolicyAccepted}
                onChange={(event) =>
                  setAcknowledgements((current) => ({ ...current, refundPolicyAccepted: event.target.checked }))
                }
              />
              <span>
                I accept the{' '}
                <a href="/legal/refunds" target="_blank" rel="noreferrer">
                  refund and cancellation policy
                </a>{' '}
                for a managed pilot.
              </span>
            </label>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={submitting || !readyToCheckout}
            onClick={() => void startCheckout()}
          >
            <CreditCard size={17} />
            {submitting ? 'Opening Checkout' : `Checkout for ${selectedOffer.product}`}
          </button>
        </div>

        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">After payment</span>
            <h2>What happens next</h2>
          </div>
          <ul className="decision-list">
            <li>
              <ShieldCheck size={17} />
              <span>Stripe webhook confirms payment and creates a private onboarding link.</span>
            </li>
            <li>
              <ShieldCheck size={17} />
              <span>You submit lead or review materials for operator review.</span>
            </li>
            <li>
              <ShieldCheck size={17} />
              <span>The first pack is reviewed before any public reply, SMS, or binding quote is sent.</span>
            </li>
          </ul>
        </div>
      </section>
    </main>
  )
}
