import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Mail,
  PhoneCall,
  Rocket,
  Settings,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import { formatCurrency } from '../domain/engines'
import type {
  OnboardingRecord,
  PilotOutcome,
  RevenueCommandCenter,
  RevenuePayment,
  RevenueSummary,
  SalesActivity,
  SalesCheckoutHandoff,
  SalesOutreachPack,
  SalesProspect,
  SalesSummary,
  SubscriptionRecord,
} from '../domain/types'
import { exportTextFile } from '../lib/export'
import {
  createBillingPortalSession,
  createCheckoutSession,
  createPilotOutcome,
  createSalesActivity,
  createSalesCheckoutHandoff,
  generateSalesOutreachPack,
  getBillingPlans,
  getIntegrationStatuses,
  getOnboardingRecords,
  getPilotOutcomes,
  getRevenuePayments,
  getRevenueCommand,
  getRevenueSummary,
  getSalesActivities,
  getSalesCheckoutHandoffOrderForm,
  getSalesCheckoutHandoffs,
  getSalesOutreachPackDocument,
  getSalesProspects,
  getSalesSummary,
  getSubscriptions,
  importSalesProspectsCsv,
  updateOnboardingChecklistItem,
  type BillingPlan,
  type IntegrationStatus,
} from '../lib/api'

type SalesActivityForm = {
  channel: SalesActivity['channel']
  outcome: SalesActivity['outcome']
  summary: string
  nextStep: string
  ownerEmail: string
}

const launchSteps = [
  {
    title: 'Pick one beachhead city and vertical',
    body: 'Start with Austin home services because the seed workflow already models emergency repair, office maintenance, and seasonal work.',
  },
  {
    title: 'Sell paid pilots before broad launch',
    body: 'Offer a 14-day setup sprint with a monthly plan. Charge setup to filter serious customers and fund integration work.',
  },
  {
    title: 'Connect outbound channels',
    body: 'Use Google Maps, local SEO agencies, trade groups, and cold email to find owners with weak review response or slow quote flow.',
  },
  {
    title: 'Install integrations after contract',
    body: 'Connect Stripe, email, SMS, Google Business Profile, and calendar only for the first paying vertical to avoid waste.',
  },
]

const productionGates = [
  'Authentication, organization isolation, roles, and billing owner permissions.',
  'Stripe subscriptions, invoices, customer portal, tax settings, and failed payment handling.',
  'Postmark or SendGrid for email with unsubscribe; Twilio for SMS with consent and STOP handling.',
  'Google Business Profile review import/reply and customer-safe webhook logging.',
  'Server database, encrypted secrets, backup/restore, audit logs, and admin support tooling.',
  'Terms, privacy policy, acceptable use policy, review compliance policy, and human approval SOP.',
]

const outcomeTypes: Array<{ value: PilotOutcome['outcomeType']; label: string }> = [
  { value: 'won_job', label: 'Won job' },
  { value: 'revived_quote', label: 'Revived quote' },
  { value: 'approved_review_reply', label: 'Approved review reply' },
  { value: 'recovered_customer', label: 'Recovered customer' },
  { value: 'repeat_booking', label: 'Repeat booking' },
  { value: 'hours_saved', label: 'Hours saved' },
  { value: 'other', label: 'Other' },
]

const deliveryStatusCopy: Record<OnboardingRecord['deliveryStatus'], string> = {
  not_started: 'not started',
  materials_waiting: 'materials waiting',
  pack_ready: 'pack ready',
  qa_approved: 'QA approved',
  sent: 'sent',
  customer_confirmed: 'customer accepted',
  revision_requested: 'revision requested',
  call_requested: 'call requested',
  renewal_ready: 'renewal ready',
  blocked: 'blocked',
}

const salesActivityChannels: Array<{ value: SalesActivity['channel']; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Call' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'partner', label: 'Partner' },
  { value: 'manual', label: 'Manual' },
]

const salesActivityOutcomes: Array<{ value: SalesActivity['outcome']; label: string }> = [
  { value: 'sent', label: 'Sent' },
  { value: 'left_voicemail', label: 'Left voicemail' },
  { value: 'replied', label: 'Replied' },
  { value: 'call_booked', label: 'Call booked' },
  { value: 'scope_sent', label: 'Scope sent' },
  { value: 'checkout_sent', label: 'Checkout sent' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'no_response', label: 'No response' },
]

const defaultSalesActivityForm: SalesActivityForm = {
  channel: 'email',
  outcome: 'sent',
  summary: '',
  nextStep: 'Call owner within two business days.',
  ownerEmail: '',
}

function formatCents(cents: number) {
  return formatCurrency(cents / 100)
}

export function LaunchView() {
  const business = useWorkspaceStore((state) => state.business)
  const directions = useWorkspaceStore((state) => state.directions)
  const campaigns = useWorkspaceStore((state) => state.campaigns)
  const auditLogs = useWorkspaceStore((state) => state.auditLogs)
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([])
  const [revenuePayments, setRevenuePayments] = useState<RevenuePayment[]>([])
  const [revenueCommand, setRevenueCommand] = useState<RevenueCommandCenter>()
  const [revenueSummary, setRevenueSummary] = useState<RevenueSummary>()
  const [onboarding, setOnboarding] = useState<OnboardingRecord[]>([])
  const [outcomes, setOutcomes] = useState<PilotOutcome[]>([])
  const [prospects, setProspects] = useState<SalesProspect[]>([])
  const [salesActivities, setSalesActivities] = useState<SalesActivity[]>([])
  const [salesSummary, setSalesSummary] = useState<SalesSummary>()
  const [outreachPacks, setOutreachPacks] = useState<Record<string, SalesOutreachPack>>({})
  const [checkoutHandoffs, setCheckoutHandoffs] = useState<Record<string, SalesCheckoutHandoff[]>>({})
  const [activityForms, setActivityForms] = useState<Record<string, SalesActivityForm>>({})
  const [apiState, setApiState] = useState<'loading' | 'ready' | 'offline'>('loading')
  const [billingAction, setBillingAction] = useState<string>()
  const [onboardingAction, setOnboardingAction] = useState<string>()
  const [outcomeAction, setOutcomeAction] = useState(false)
  const [prospectAction, setProspectAction] = useState<string>()
  const [billingError, setBillingError] = useState<string>()
  const [prospectCsv, setProspectCsv] = useState('')
  const [outcomeForm, setOutcomeForm] = useState({
    onboardingId: '',
    outcomeType: 'won_job' as PilotOutcome['outcomeType'],
    outcomeValue: 0,
    evidence: '',
    nextAction: '',
    recordedBy: '',
  })
  const [checkoutProfile, setCheckoutProfile] = useState({
    businessName: business.name,
    customerEmail: '',
    businessWebsite: business.website,
    businessCity: business.city,
    businessState: business.state,
    industry: business.industry,
  })
  const campaignUpside = campaigns.reduce((sum, campaign) => sum + campaign.projectedRevenue, 0)
  const summaryActivity = salesSummary?.activity
  const management = salesSummary?.management
  const displayFunnelStatuses: SalesProspect['status'][] = ['new', 'contacted', 'call_booked', 'scope_sent', 'checkout_sent', 'won', 'lost']

  const syncSalesSummary = async () => {
    const summary = await getSalesSummary()
    setSalesSummary(summary.summary)
  }

  useEffect(() => {
    let canceled = false
    Promise.all([
      getBillingPlans(),
      getIntegrationStatuses(),
      getSubscriptions(),
      getRevenuePayments(),
      getRevenueCommand(),
      getRevenueSummary(),
      getOnboardingRecords(),
      getPilotOutcomes(),
      getSalesProspects(),
      getSalesActivities(),
      getSalesSummary(),
    ])
      .then(
        ([
          planResponse,
          integrationResponse,
          subscriptionResponse,
          paymentResponse,
          revenueCommandResponse,
          revenueSummaryResponse,
          onboardingResponse,
          outcomeResponse,
          prospectResponse,
          activityResponse,
          summaryResponse,
        ]) => {
          if (canceled) return
          setPlans(planResponse.plans)
          setIntegrations(integrationResponse.integrations)
          setSubscriptions(subscriptionResponse.subscriptions)
          setRevenuePayments(paymentResponse.payments)
          setRevenueCommand(revenueCommandResponse.command)
          setRevenueSummary(revenueSummaryResponse.summary)
          setOnboarding(onboardingResponse.onboarding)
          setOutcomes(outcomeResponse.outcomes)
          setProspects(prospectResponse.prospects)
          setSalesActivities(activityResponse.activities)
          setSalesSummary(summaryResponse.summary)
          setOutcomeForm((current) => ({
            ...current,
            onboardingId: current.onboardingId || onboardingResponse.onboarding[0]?.id || '',
          }))
          setApiState('ready')
        },
      )
      .catch(() => {
        if (canceled) return
        setApiState('offline')
      })

    return () => {
      canceled = true
    }
  }, [])

  const startCheckout = async (planId: string) => {
    setBillingError(undefined)
    setBillingAction(`checkout:${planId}`)
    try {
      const origin = window.location.origin
      const result = await createCheckoutSession({
        planId,
        successUrl: `${origin}/?billing=success&plan=${encodeURIComponent(planId)}`,
        cancelUrl: `${origin}/?billing=cancelled&plan=${encodeURIComponent(planId)}`,
        customerEmail: checkoutProfile.customerEmail || undefined,
        businessName: checkoutProfile.businessName,
        businessWebsite: checkoutProfile.businessWebsite,
        businessCity: checkoutProfile.businessCity,
        businessState: checkoutProfile.businessState,
        industry: checkoutProfile.industry,
      })
      if (!result.url) {
        throw new Error('Stripe did not return a Checkout URL.')
      }
      window.location.assign(result.url)
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to start checkout.')
    } finally {
      setBillingAction(undefined)
    }
  }

  const openBillingPortal = async (subscriptionId: string) => {
    setBillingError(undefined)
    setBillingAction(`portal:${subscriptionId}`)
    try {
      const result = await createBillingPortalSession({
        subscriptionId,
        returnUrl: `${window.location.origin}/?billing=portal-return`,
      })
      window.location.assign(result.url)
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to open billing portal.')
    } finally {
      setBillingAction(undefined)
    }
  }

  const updateChecklistItem = async (recordId: string, itemKey: string, done: boolean) => {
    setBillingError(undefined)
    setOnboardingAction(`${recordId}:${itemKey}`)
    try {
      const result = await updateOnboardingChecklistItem(recordId, itemKey, done)
      setOnboarding(result.onboarding)
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to update onboarding checklist.')
    } finally {
      setOnboardingAction(undefined)
    }
  }

  const recordPilotOutcome = async () => {
    setBillingError(undefined)
    setOutcomeAction(true)
    try {
      if (!outcomeForm.onboardingId) throw new Error('Choose a paid pilot onboarding record first.')
      const result = await createPilotOutcome(outcomeForm.onboardingId, {
        outcomeType: outcomeForm.outcomeType,
        outcomeValue: Number(outcomeForm.outcomeValue),
        evidence: outcomeForm.evidence,
        nextAction: outcomeForm.nextAction,
        recordedBy: outcomeForm.recordedBy,
      })
      setOutcomes(result.outcomes)
      setOutcomeForm((current) => ({
        ...current,
        outcomeValue: 0,
        evidence: '',
        nextAction: '',
      }))
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to record pilot outcome.')
    } finally {
      setOutcomeAction(false)
    }
  }

  const importProspects = async () => {
    setBillingError(undefined)
    setProspectAction('import')
    try {
      const result = await importSalesProspectsCsv(prospectCsv)
      const next = await getSalesProspects()
      setProspects(next.prospects)
      await syncSalesSummary()
      setProspectCsv('')
      if (result.errors.length) {
        setBillingError(`Imported ${result.imported} prospects with ${result.errors.length} row errors.`)
      }
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to import prospects.')
    } finally {
      setProspectAction(undefined)
    }
  }

  const updateActivityForm = (prospectId: string, patch: Partial<SalesActivityForm>) => {
    setActivityForms((current) => ({
      ...current,
      [prospectId]: {
        ...defaultSalesActivityForm,
        ...current[prospectId],
        ...patch,
      },
    }))
  }

  const recordSalesActivity = async (prospect: SalesProspect, override?: Partial<SalesActivityForm>) => {
    const form = {
      ...defaultSalesActivityForm,
      ...activityForms[prospect.id],
      ...override,
    }
    setBillingError(undefined)
    setProspectAction(`${prospect.id}:activity`)
    try {
      const result = await createSalesActivity(prospect.id, form)
      setProspects(result.prospects)
      setSalesActivities(result.activities)
      await syncSalesSummary()
      setActivityForms((current) => ({
        ...current,
        [prospect.id]: {
          ...defaultSalesActivityForm,
          ownerEmail: form.ownerEmail,
        },
      }))
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to record sales activity.')
    } finally {
      setProspectAction(undefined)
    }
  }

  const createCheckoutHandoff = async (prospect: SalesProspect) => {
    setBillingError(undefined)
    setProspectAction(`${prospect.id}:checkout-handoff`)
    try {
      const result = await createSalesCheckoutHandoff(prospect.id, { createdBy: 'operator@localgrowth.example' })
      setProspects(result.prospects)
      setSalesActivities(result.activities)
      setCheckoutHandoffs((current) => ({ ...current, [prospect.id]: result.handoffs }))
      await syncSalesSummary()
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to create checkout handoff.')
    } finally {
      setProspectAction(undefined)
    }
  }

  const loadCheckoutHandoffs = async (prospect: SalesProspect) => {
    setBillingError(undefined)
    setProspectAction(`${prospect.id}:checkout-handoffs`)
    try {
      const result = await getSalesCheckoutHandoffs(prospect.id)
      setCheckoutHandoffs((current) => ({ ...current, [prospect.id]: result.handoffs }))
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to load checkout handoffs.')
    } finally {
      setProspectAction(undefined)
    }
  }

  const downloadCheckoutOrderForm = async (prospect: SalesProspect, handoff?: SalesCheckoutHandoff) => {
    setBillingError(undefined)
    setProspectAction(`${prospect.id}:order-form`)
    try {
      const result = await getSalesCheckoutHandoffOrderForm(prospect.id, handoff?.id)
      setCheckoutHandoffs((current) => ({ ...current, [prospect.id]: [result.handoff, ...(current[prospect.id] ?? []).filter((item) => item.id !== result.handoff.id)] }))
      exportTextFile(result.filename, result.content)
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to download order form.')
    } finally {
      setProspectAction(undefined)
    }
  }

  const generateOutreachPack = async (prospect: SalesProspect) => {
    setBillingError(undefined)
    setProspectAction(`${prospect.id}:pack`)
    try {
      const result = await generateSalesOutreachPack(prospect.id)
      setProspects(result.prospects)
      setOutreachPacks((current) => ({ ...current, [prospect.id]: result.pack }))
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to generate outreach pack.')
    } finally {
      setProspectAction(undefined)
    }
  }

  const downloadOutreachPack = async (prospect: SalesProspect) => {
    setBillingError(undefined)
    setProspectAction(`${prospect.id}:download`)
    try {
      const result = await getSalesOutreachPackDocument(prospect.id, outreachPacks[prospect.id]?.id)
      setOutreachPacks((current) => ({ ...current, [prospect.id]: result.pack }))
      exportTextFile(result.filename, result.content)
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Unable to download outreach pack.')
    } finally {
      setProspectAction(undefined)
    }
  }

  return (
    <div className="view-stack">
      <section className="section-band">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Go-to-market command</span>
            <h2>First 30 days to real revenue</h2>
          </div>
          <p>
            The product should be sold as a managed revenue system first, then converted into pure SaaS as the repeatable
            workflow hardens.
          </p>
        </div>
        <div className={apiState === 'ready' ? 'api-status ready' : 'api-status'}>
          <span>{apiState === 'ready' ? 'API connected' : apiState === 'offline' ? 'API offline' : 'Checking API'}</span>
          <strong>
            {apiState === 'ready'
              ? `${integrations.filter((item) => item.configured).length}/${integrations.length} production integrations configured`
              : 'Start npm run api for live readiness checks'}
          </strong>
        </div>
        {billingError && <div className="api-status">{billingError}</div>}
        <div className="metric-strip sales-review-strip">
          <div className="metric">
            <span>{salesSummary ? `${new Date(salesSummary.period.since).toLocaleDateString()} - ${new Date(salesSummary.period.until).toLocaleDateString()}` : 'Sales period'}</span>
            <strong>{summaryActivity?.total ?? 0}</strong>
          </div>
          <div className="metric">
            <span>Email sent</span>
            <strong>{summaryActivity?.emailsSent ?? 0}</strong>
          </div>
          <div className="metric">
            <span>Calls logged</span>
            <strong>{summaryActivity?.callsLogged ?? 0}</strong>
          </div>
          <div className="metric">
            <span>Reply / call / scope / checkout</span>
            <strong>
              {summaryActivity?.replies ?? 0}/{summaryActivity?.callsBooked ?? 0}/{summaryActivity?.scopesSent ?? 0}/
              {summaryActivity?.checkoutsSent ?? 0}
            </strong>
          </div>
        </div>
        {salesSummary && (
          <div className="sales-management-panel">
            <div>
              <span>Recommended focus</span>
              <strong>{salesSummary.recommendedFocus}</strong>
            </div>
            <div>
              <span>Active / stale</span>
              <strong>
                {management?.activeProspects ?? 0}/{management?.staleProspects ?? 0}
              </strong>
            </div>
            <div>
              <span>Estimated pipeline</span>
              <strong>{formatCurrency(management?.estimatedPipelineValue ?? 0)}</strong>
            </div>
            <div>
              <span>Win / checkout-to-win</span>
              <strong>
                {management?.winRateFromContacted ?? 0}%/{management?.checkoutToWonRate ?? 0}%
              </strong>
            </div>
          </div>
        )}
        {revenueSummary && (
          <div className="revenue-evidence-panel">
            <div>
              <span>Stripe evidence</span>
              <strong>{revenueSummary.paidPilots} paid pilots</strong>
            </div>
            <div>
              <span>Setup revenue</span>
              <strong>{formatCents(revenueSummary.setupRevenueCents)}</strong>
            </div>
            <div>
              <span>Active MRR booked</span>
              <strong>{formatCents(revenueSummary.mrrCents)}</strong>
            </div>
            <div>
              <span>Gross collected</span>
              <strong>{formatCents(revenueSummary.grossCollectedCents)}</strong>
            </div>
          </div>
        )}
        <div className="launch-grid">
          <PricingCard
            name="BidFlow Local"
            icon={<BadgeDollarSign size={20} />}
            tiers={['Starter $49/mo', 'Growth $149/mo', 'Pro $299/mo']}
            setup="$299-$999 setup"
            promise="Recover missed quote revenue and reduce owner follow-up time."
          />
          <PricingCard
            name="ReputeLoop"
            icon={<Rocket size={20} />}
            tiers={['Starter $39/mo', 'Growth $99/mo', 'Pro $199/mo']}
            setup="$199-$699 setup"
            promise="Protect review conversion and win back customers before churn sticks."
          />
          <div className="revenue-card">
            <span>Modeled campaign upside</span>
            <strong>{formatCurrency(campaignUpside)}</strong>
            <p>Use this number in sales conversations as an estimate, then replace it with real attribution data.</p>
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading tight">
          <span className="eyebrow">Execution</span>
          <h2>Launch sequence</h2>
        </div>
        <div className="step-grid">
          {launchSteps.map((step, index) => (
            <article className="step-card" key={step.title}>
              <div>{index + 1}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading tight">
          <span className="eyebrow">Revenue command</span>
          <h2>Today&apos;s operating focus</h2>
        </div>
        {revenueCommand ? (
          <>
            <div className="command-focus">
              <strong>{revenueCommand.focus}</strong>
              <span>Generated {new Date(revenueCommand.generatedAt).toLocaleString()}</span>
            </div>
            <div className="revenue-evidence-panel">
              <div>
                <span>Paid pilots</span>
                <strong>{revenueCommand.northStar.paidPilots}</strong>
              </div>
              <div>
                <span>Setup revenue</span>
                <strong>{formatCents(revenueCommand.northStar.setupRevenueCents)}</strong>
              </div>
              <div>
                <span>Open checkout</span>
                <strong>{revenueCommand.northStar.openCheckoutCount}</strong>
              </div>
              <div>
                <span>Delivery risk</span>
                <strong>{revenueCommand.northStar.deliveryAtRiskCount}</strong>
              </div>
              <div>
                <span>Customer actions</span>
                <strong>{revenueCommand.northStar.customerActionCount}</strong>
              </div>
              <div>
                <span>Renewal evidence</span>
                <strong>{revenueCommand.northStar.renewalEvidenceCount}</strong>
              </div>
            </div>
            {revenueCommand.blockers.length > 0 && (
              <div className="command-blockers">
                <strong>Blockers</strong>
                {revenueCommand.blockers.map((blocker) => (
                  <div key={blocker.id}>
                    <span>{blocker.title}</span>
                    <p>{blocker.detail}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="command-action-list">
              {revenueCommand.actions.slice(0, 8).map((action) => (
                <div className={`command-action ${action.priority}`} key={action.id}>
                  <span>
                    {action.priority} · {action.lane.replaceAll('_', ' ')}
                  </span>
                  <strong>{action.title}</strong>
                  <p>{action.detail}</p>
                  <small>{action.nextStep}</small>
                </div>
              ))}
              {revenueCommand.actions.length === 0 && (
                <p className="muted-note">No command actions yet. Import prospects or close a checkout handoff to start the loop.</p>
              )}
            </div>
          </>
        ) : (
          <p className="muted-note">Start the API to see the revenue command center.</p>
        )}
      </section>

      <section className="two-column">
        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Sales motion</span>
            <h2>Outbound script</h2>
          </div>
          <div className="script-box">
            <Mail size={18} />
            <p>
              Subject: quick idea to recover missed service jobs. I noticed many local service teams lose money between
              the first call, estimate, review response, and follow-up. We built a small operating desk that scores leads,
              drafts estimates, schedules follow-ups, and flags risky reviews. Would it be worth a 15-minute review of
              where quotes or reviews are leaking revenue?
            </p>
          </div>
          <div className="script-box">
            <PhoneCall size={18} />
            <p>
              Call opener: We help local service companies respond faster to high-intent requests and stop reviews from
              turning into lost repeat business. If I can show two missed revenue spots from your public presence, would
              you consider a paid pilot?
            </p>
          </div>
        </div>

        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Production gates</span>
            <h2>Before charging strangers at scale</h2>
          </div>
          <ul className="decision-list">
            {productionGates.map((gate) => (
              <li key={gate}>
                <Settings size={17} />
                <span>{gate}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="two-column">
        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Prospecting</span>
            <h2>Import qualified businesses</h2>
          </div>
          <div className="form-panel">
            <label>
              Prospect CSV
              <textarea
                value={prospectCsv}
                placeholder="Paste rows from docs/examples/prospect-list-template.csv"
                onChange={(event) => setProspectCsv(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="primary-button"
              disabled={apiState !== 'ready' || prospectAction === 'import' || !prospectCsv.trim()}
              onClick={() => void importProspects()}
            >
              <CheckCircle2 size={17} />
              {prospectAction === 'import' ? 'Importing' : 'Import prospects'}
            </button>
          </div>
        </div>

        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Pipeline</span>
            <h2>Qualified prospect queue</h2>
          </div>
          {salesSummary && (
            <div className="sales-funnel-grid">
              {displayFunnelStatuses.map((status) => {
                const bucket = salesSummary.funnel.find((item) => item.status === status)
                return (
                  <div key={status}>
                    <span>{status.replaceAll('_', ' ')}</span>
                    <strong>{bucket?.count ?? 0}</strong>
                    <small>{formatCurrency(bucket?.estimatedPipelineValue ?? 0)}</small>
                  </div>
                )
              })}
            </div>
          )}
          {salesSummary && salesSummary.nextActions.length > 0 && (
            <div className="needs-action-list">
              <strong>Needs action</strong>
              {salesSummary.nextActions.slice(0, 5).map((item) => (
                <div key={item.prospectId}>
                  <span>
                    {item.businessName} · {item.status.replaceAll('_', ' ')} · score {item.fitScore}
                  </span>
                  <p>{item.reason}</p>
                </div>
              ))}
            </div>
          )}
          <div className="prospect-list">
            {prospects.slice(0, 10).map((prospect) => {
              const activityForm = {
                ...defaultSalesActivityForm,
                ...activityForms[prospect.id],
              }
              const recentActivities = salesActivities.filter((activity) => activity.prospectId === prospect.id).slice(0, 3)
              const handoffs = checkoutHandoffs[prospect.id] ?? []
              const latestHandoff = handoffs[0]
              const canCreateCheckoutHandoff = prospect.status === 'scope_sent' || prospect.status === 'checkout_sent'

              return (
                <div className="prospect-row" key={prospect.id}>
                  <div>
                    <strong>{prospect.businessName}</strong>
                    <span>
                      {prospect.industry || 'Unknown industry'} · {prospect.city}, {prospect.state} · score {prospect.fitScore}
                    </span>
                    <p>{prospect.quoteLeakSignal || prospect.recentReviewIssue || prospect.notes}</p>
                    {outreachPacks[prospect.id] && (
                      <div className="outreach-pack-preview">
                        <strong>
                          {outreachPacks[prospect.id].product === 'bidflow' ? 'BidFlow Local' : 'ReputeLoop'} outreach pack
                        </strong>
                        <span>{outreachPacks[prospect.id].pilotPriceSummary}</span>
                        <p>{outreachPacks[prospect.id].nextStep}</p>
                      </div>
                    )}
                    {latestHandoff && (
                      <div className="checkout-handoff-preview">
                        <div>
                          <span>{latestHandoff.status.replaceAll('_', ' ')}</span>
                          <strong>{latestHandoff.planId}</strong>
                        </div>
                        <p>{latestHandoff.scopeSummary}</p>
                        <small>
                          {latestHandoff.scopeSource.replaceAll('_', ' ')} · {latestHandoff.scopeAcceptedHash}
                        </small>
                        <a href={latestHandoff.checkoutUrl} target="_blank" rel="noreferrer">
                          {latestHandoff.checkoutUrl}
                        </a>
                      </div>
                    )}
                    <div className="sales-activity-form">
                      <label>
                        Channel
                        <select
                          value={activityForm.channel}
                          onChange={(event) =>
                            updateActivityForm(prospect.id, { channel: event.target.value as SalesActivity['channel'] })
                          }
                        >
                          {salesActivityChannels.map((channel) => (
                            <option value={channel.value} key={channel.value}>
                              {channel.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Outcome
                        <select
                          value={activityForm.outcome}
                          onChange={(event) =>
                            updateActivityForm(prospect.id, { outcome: event.target.value as SalesActivity['outcome'] })
                          }
                        >
                          {salesActivityOutcomes.map((outcome) => (
                            <option value={outcome.value} key={outcome.value}>
                              {outcome.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="span-2">
                        Summary
                        <input
                          value={activityForm.summary}
                          placeholder="Sent tailored email with BidFlow leak analysis."
                          onChange={(event) => updateActivityForm(prospect.id, { summary: event.target.value })}
                        />
                      </label>
                      <label className="span-2">
                        Next step
                        <input
                          value={activityForm.nextStep}
                          placeholder="Book discovery call or send checkout link."
                          onChange={(event) => updateActivityForm(prospect.id, { nextStep: event.target.value })}
                        />
                      </label>
                      <label>
                        Owner email
                        <input
                          type="email"
                          value={activityForm.ownerEmail}
                          placeholder="rep@example.com"
                          onChange={(event) => updateActivityForm(prospect.id, { ownerEmail: event.target.value })}
                        />
                      </label>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={Boolean(prospectAction) || !activityForm.summary.trim() || !activityForm.nextStep.trim()}
                        onClick={() => void recordSalesActivity(prospect)}
                      >
                        <CheckCircle2 size={15} />
                        {prospectAction === `${prospect.id}:activity` ? 'Logging' : 'Log activity'}
                      </button>
                    </div>
                    {recentActivities.length > 0 && (
                      <div className="sales-activity-feed">
                        {recentActivities.map((activity) => (
                          <div key={activity.id}>
                            <strong>
                              {activity.channel} · {activity.outcome.replaceAll('_', ' ')}
                            </strong>
                            <span>{new Date(activity.occurredAt).toLocaleDateString()}</span>
                            <p>{activity.summary}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="prospect-actions">
                    <span>{prospect.status.replaceAll('_', ' ')}</span>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={Boolean(prospectAction)}
                      onClick={() => void generateOutreachPack(prospect)}
                    >
                      <FileText size={15} />
                      {prospectAction === `${prospect.id}:pack` ? 'Generating' : 'Pack'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={Boolean(prospectAction)}
                      onClick={() => void downloadOutreachPack(prospect)}
                    >
                      <Download size={15} />
                      {prospectAction === `${prospect.id}:download` ? 'Downloading' : 'Scope'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={Boolean(prospectAction)}
                      onClick={() =>
                        void recordSalesActivity(prospect, {
                          channel: 'email',
                          outcome: 'sent',
                          summary: `Sent tailored outreach email to ${prospect.businessName}.`,
                          nextStep: 'Call owner within two business days.',
                          ownerEmail: activityForm.ownerEmail,
                        })
                      }
                    >
                      Email sent
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={Boolean(prospectAction)}
                      onClick={() => void loadCheckoutHandoffs(prospect)}
                    >
                      <ExternalLink size={15} />
                      {prospectAction === `${prospect.id}:checkout-handoffs` ? 'Loading' : 'Links'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={Boolean(prospectAction) || !canCreateCheckoutHandoff}
                      onClick={() =>
                        void createCheckoutHandoff(prospect)
                      }
                    >
                      <CreditCard size={15} />
                      {prospectAction === `${prospect.id}:checkout-handoff` ? 'Creating' : 'Checkout link'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={Boolean(prospectAction) || !latestHandoff}
                      onClick={() => void downloadCheckoutOrderForm(prospect, latestHandoff)}
                    >
                      <Download size={15} />
                      {prospectAction === `${prospect.id}:order-form` ? 'Downloading' : 'Order form'}
                    </button>
                  </div>
                </div>
              )
            })}
            {apiState === 'ready' && prospects.length === 0 && (
              <p className="muted-note">No prospects imported yet. Start with the 200-business list template.</p>
            )}
          </div>
        </div>
      </section>

      <section className="two-column">
        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Live plans</span>
            <h2>API pricing catalog</h2>
          </div>
          <div className="checkout-profile">
            <label>
              Business
              <input
                value={checkoutProfile.businessName}
                onChange={(event) => setCheckoutProfile((current) => ({ ...current, businessName: event.target.value }))}
              />
            </label>
            <label>
              Owner email
              <input
                type="email"
                value={checkoutProfile.customerEmail}
                placeholder="owner@example.com"
                onChange={(event) => setCheckoutProfile((current) => ({ ...current, customerEmail: event.target.value }))}
              />
            </label>
            <label>
              Website
              <input
                value={checkoutProfile.businessWebsite}
                onChange={(event) => setCheckoutProfile((current) => ({ ...current, businessWebsite: event.target.value }))}
              />
            </label>
            <div className="form-row">
              <label>
                City
                <input
                  value={checkoutProfile.businessCity}
                  onChange={(event) => setCheckoutProfile((current) => ({ ...current, businessCity: event.target.value }))}
                />
              </label>
              <label>
                State
                <input
                  value={checkoutProfile.businessState}
                  onChange={(event) => setCheckoutProfile((current) => ({ ...current, businessState: event.target.value }))}
                />
              </label>
            </div>
            <label>
              Industry
              <input
                value={checkoutProfile.industry}
                onChange={(event) => setCheckoutProfile((current) => ({ ...current, industry: event.target.value }))}
              />
            </label>
          </div>
          <div className="plan-list">
            {(plans.length ? plans : []).map((plan) => (
              <div className="plan-row" key={plan.id}>
                <div>
                  <strong>{plan.name}</strong>
                  <span>{plan.promise}</span>
                </div>
                <div className="plan-action">
                  <div>
                    <strong>{formatCurrency(plan.monthlyPrice)}/mo</strong>
                    <span>{formatCurrency(plan.setupFee)} setup</span>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={apiState !== 'ready' || billingAction === `checkout:${plan.id}`}
                    onClick={() => void startCheckout(plan.id)}
                    title="Start Stripe Checkout"
                  >
                    <CreditCard size={16} />
                    {billingAction === `checkout:${plan.id}` ? 'Opening' : 'Checkout'}
                  </button>
                </div>
              </div>
            ))}
            {apiState !== 'ready' && <p className="muted-note">Live plan data appears when the API is running.</p>}
          </div>
        </div>

        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Readiness</span>
            <h2>Revenue integration status</h2>
          </div>
          <div className="integration-list">
            {integrations.map((integration) => (
              <div className="integration-row" key={integration.key}>
                <div className={integration.configured ? 'status-dot ready' : 'status-dot'} />
                <div>
                  <strong>{integration.label}</strong>
                  <span>{integration.configured ? 'Configured' : integration.nextAction}</span>
                </div>
              </div>
            ))}
            {apiState !== 'ready' && <p className="muted-note">Start the API to see Stripe, email, SMS, database, and Google readiness.</p>}
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading tight">
          <span className="eyebrow">Billing state</span>
          <h2>Active subscriptions</h2>
        </div>
        <div className="plan-list">
          {subscriptions.map((subscription) => (
            <div className="plan-row" key={subscription.id}>
              <div>
                <strong>{subscription.planId}</strong>
                <span>
                  {subscription.product} · {subscription.status} · {subscription.stripeSubscriptionId}
                </span>
              </div>
              <div className="plan-action">
                <div>
                  <strong>{subscription.status}</strong>
                  <span>
                    {subscription.currentPeriodEnd
                      ? `Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                      : 'No period end yet'}
                  </span>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={billingAction === `portal:${subscription.id}`}
                  onClick={() => void openBillingPortal(subscription.id)}
                  title="Open Stripe billing portal"
                >
                  <ExternalLink size={16} />
                  {billingAction === `portal:${subscription.id}` ? 'Opening' : 'Manage'}
                </button>
              </div>
            </div>
          ))}
          {apiState === 'ready' && subscriptions.length === 0 && (
            <p className="muted-note">No Stripe subscription events have been received yet.</p>
          )}
          {apiState !== 'ready' && <p className="muted-note">Start the API to see subscription state.</p>}
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading tight">
          <span className="eyebrow">Revenue evidence</span>
          <h2>Payment ledger</h2>
        </div>
        <div className="payment-ledger">
          {revenuePayments.slice(0, 8).map((payment) => (
            <div className="payment-row" key={payment.id}>
              <div>
                <strong>{payment.businessName}</strong>
                <span>
                  {payment.planId} · {payment.paymentSource.replaceAll('_', ' ')} · {payment.status} ·{' '}
                  {new Date(payment.receivedAt).toLocaleDateString()}
                </span>
                {payment.statusReason && <small>{payment.statusReason}</small>}
                <small>{payment.stripeCheckoutSessionId}</small>
              </div>
              <div>
                <span>Setup</span>
                <strong>{formatCents(payment.setupRevenueCents)}</strong>
              </div>
              <div>
                <span>MRR</span>
                <strong>{formatCents(payment.mrrCents)}</strong>
              </div>
              <div>
                <span>Gross</span>
                <strong>{formatCents(payment.grossCollectedCents)}</strong>
              </div>
            </div>
          ))}
          {apiState === 'ready' && revenuePayments.length === 0 && (
            <p className="muted-note">No Stripe-paid revenue evidence yet. Checkout-sent prospects are not counted here.</p>
          )}
          {apiState !== 'ready' && <p className="muted-note">Start the API to see verified payment evidence.</p>}
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading tight">
          <span className="eyebrow">Paid pilot onboarding</span>
          <h2>Workspace activation queue</h2>
        </div>
        <div className="onboarding-list">
          {onboarding.map((record) => {
            const completed = record.checklist.filter((item) => item.done).length
            return (
              <div className="onboarding-row" key={record.id}>
                <div>
                  <strong>{record.businessName}</strong>
                  <span>
                    {record.ownerEmail} · {record.planId} · {record.status.replaceAll('_', ' ')}
                  </span>
                  <span>
                    Delivery: {deliveryStatusCopy[record.deliveryStatus]} · owner {record.deliveryOwnerEmail} · SLA{' '}
                    {new Date(record.deliverySlaDueAt).toLocaleDateString()}
                  </span>
                  {record.renewalEvidenceSummary && <p>{record.renewalEvidenceSummary}</p>}
                  {record.customerAccessToken && (
                    <span>{`${window.location.origin}/onboarding/${record.customerAccessToken}`}</span>
                  )}
                </div>
                <div className="checklist-progress">
                  <strong>
                    {completed}/{record.checklist.length}
                  </strong>
                  <span>activation checks</span>
                </div>
                <ul>
                  {record.checklist.map((item) => (
                    <li key={item.key} className={item.done ? 'done' : undefined}>
                      <CheckCircle2 size={15} />
                      <span>{item.label}</span>
                      <button
                        type="button"
                        className="secondary-button icon-button"
                        disabled={onboardingAction === `${record.id}:${item.key}`}
                        onClick={() => void updateChecklistItem(record.id, item.key, !item.done)}
                        title={item.done ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {item.done ? 'Undo' : 'Done'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          {apiState === 'ready' && onboarding.length === 0 && (
            <p className="muted-note">No paid pilot onboarding records have been created yet.</p>
          )}
          {apiState !== 'ready' && <p className="muted-note">Start the API to see onboarding activation state.</p>}
        </div>
      </section>

      <section className="two-column">
        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Pilot proof</span>
            <h2>Record customer outcome</h2>
          </div>
          <div className="checkout-profile outcome-form">
            <label>
              Paid pilot
              <select
                value={outcomeForm.onboardingId}
                onChange={(event) => setOutcomeForm((current) => ({ ...current, onboardingId: event.target.value }))}
              >
                <option value="">Choose onboarding record</option>
                {onboarding.map((record) => (
                  <option value={record.id} key={record.id}>
                    {record.businessName} · {record.planId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Outcome
              <select
                value={outcomeForm.outcomeType}
                onChange={(event) =>
                  setOutcomeForm((current) => ({ ...current, outcomeType: event.target.value as PilotOutcome['outcomeType'] }))
                }
              >
                {outcomeTypes.map((outcomeType) => (
                  <option value={outcomeType.value} key={outcomeType.value}>
                    {outcomeType.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Value
              <input
                type="number"
                min="0"
                value={outcomeForm.outcomeValue}
                onChange={(event) => setOutcomeForm((current) => ({ ...current, outcomeValue: Number(event.target.value) }))}
              />
            </label>
            <label>
              Recorded by
              <input
                type="email"
                value={outcomeForm.recordedBy}
                placeholder="operator@example.com"
                onChange={(event) => setOutcomeForm((current) => ({ ...current, recordedBy: event.target.value }))}
              />
            </label>
            <label className="span-2">
              Evidence
              <textarea
                value={outcomeForm.evidence}
                placeholder="Customer approved proposal, won job invoice, approved review reply, recovered conversation, or time-savings note."
                onChange={(event) => setOutcomeForm((current) => ({ ...current, evidence: event.target.value }))}
              />
            </label>
            <label className="span-2">
              Next action
              <input
                value={outcomeForm.nextAction}
                placeholder="Renew, ask for case study, deliver next pack, or schedule review."
                onChange={(event) => setOutcomeForm((current) => ({ ...current, nextAction: event.target.value }))}
              />
            </label>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={outcomeAction || apiState !== 'ready'}
            onClick={() => void recordPilotOutcome()}
          >
            <CheckCircle2 size={17} />
            {outcomeAction ? 'Recording' : 'Record outcome'}
          </button>
        </div>

        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Outcome ledger</span>
            <h2>Renewal evidence</h2>
          </div>
          <div className="outcome-list">
            {outcomes.map((outcome) => (
              <div className="outcome-row" key={outcome.id}>
                <div>
                  <strong>{outcome.businessName}</strong>
                  <span>
                    {outcome.outcomeType.replaceAll('_', ' ')} ·{' '}
                    {outcome.outcomeType === 'hours_saved' ? `${outcome.outcomeValue} hours` : formatCurrency(outcome.outcomeValue)}
                  </span>
                  <p>{outcome.evidence}</p>
                </div>
                <span>{new Date(outcome.occurredAt).toLocaleDateString()}</span>
              </div>
            ))}
            {apiState === 'ready' && outcomes.length === 0 && (
              <p className="muted-note">No pilot outcomes recorded yet. Do not claim recovered revenue until this ledger has evidence.</p>
            )}
            {apiState !== 'ready' && <p className="muted-note">Start the API to see outcome evidence.</p>}
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading tight">
          <span className="eyebrow">Board decision</span>
          <h2>Why these two remain the active bets</h2>
        </div>
        <div className="comparison-table">
          <div className="comparison-head">
            <span>Product</span>
            <span>Weighted score</span>
            <span>Monetization</span>
            <span>Risk handling</span>
          </div>
          {directions.map((direction) => (
            <div className="comparison-row" key={direction.id}>
              <strong>{direction.name}</strong>
              <span>{direction.weightedScore}/100</span>
              <span>{direction.priceAnchor}</span>
              <span>{direction.risks[0]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading tight">
          <span className="eyebrow">Trace</span>
          <h2>Recent operating log</h2>
        </div>
        <div className="audit-table">
          {auditLogs.slice(0, 10).map((log) => (
            <div className="audit-row" key={log.id}>
              <CheckCircle2 size={17} />
              <div>
                <strong>{log.entityType}</strong>
                <span>{log.summary}</span>
              </div>
              <ArrowRight size={16} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function PricingCard({
  name,
  icon,
  tiers,
  setup,
  promise,
}: {
  name: string
  icon: React.ReactNode
  tiers: string[]
  setup: string
  promise: string
}) {
  return (
    <article className="pricing-card">
      <div className="pricing-title">
        {icon}
        <h3>{name}</h3>
      </div>
      <p>{promise}</p>
      <ul>
        {tiers.map((tier) => (
          <li key={tier}>{tier}</li>
        ))}
      </ul>
      <strong>{setup}</strong>
    </article>
  )
}
