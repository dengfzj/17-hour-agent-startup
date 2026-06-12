import { CalendarClock, Check, Download, ExternalLink, FileText, MessageSquareText, Plus, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import { formatCurrency } from '../domain/engines'
import { renderProposalDocument } from '../domain/documents'
import type { Urgency } from '../domain/types'
import { exportTextFile } from '../lib/export'
import { createRecoveryLink } from '../lib/api'

export function BidFlowView() {
  const business = useWorkspaceStore((state) => state.business)
  const customers = useWorkspaceStore((state) => state.customers)
  const leads = useWorkspaceStore((state) => state.leads)
  const estimates = useWorkspaceStore((state) => state.estimates)
  const proposals = useWorkspaceStore((state) => state.proposals)
  const followUps = useWorkspaceStore((state) => state.followUps)
  const addLead = useWorkspaceStore((state) => state.addLead)
  const generateLeadAssets = useWorkspaceStore((state) => state.generateLeadAssets)
  const markLeadWon = useWorkspaceStore((state) => state.markLeadWon)
  const [selectedLeadId, setSelectedLeadId] = useState(leads[0]?.id ?? '')
  const [recoveryLinkUrl, setRecoveryLinkUrl] = useState('')
  const [recoveryLinkStatus, setRecoveryLinkStatus] = useState<string>()
  const [creatingRecoveryLink, setCreatingRecoveryLink] = useState(false)

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? leads[0]
  const customer = customers.find((item) => item.id === selectedLead?.customerId)
  const estimate = estimates.find((item) => item.leadId === selectedLead?.id)
  const proposal = proposals.find((item) => item.leadId === selectedLead?.id)
  const leadFollowUps = followUps.filter((item) => item.leadId === selectedLead?.id)
  const pipelineValue = estimates.reduce((sum, item) => sum + item.total, 0)
  const wonValue = leads
    .filter((lead) => lead.status === 'won')
    .reduce((sum, lead) => sum + (estimates.find((estimateItem) => estimateItem.leadId === lead.id)?.total ?? 0), 0)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const lead = {
      customerId: String(form.get('customerId')),
      serviceCategory: String(form.get('serviceCategory')),
      description: String(form.get('description')),
      budgetMin: Number(form.get('budgetMin')),
      budgetMax: Number(form.get('budgetMax')),
      urgency: String(form.get('urgency')) as Urgency,
      source: 'website' as const,
      locationFit: form.get('locationFit') === 'on',
      repeatCustomer: form.get('repeatCustomer') === 'on',
    }
    addLead(lead)
    event.currentTarget.reset()
  }

  const scoreLabel = useMemo(() => {
    if (!selectedLead) return 'No lead'
    if (selectedLead.score >= 80) return 'Hot'
    if (selectedLead.score >= 55) return 'Qualified'
    if (selectedLead.score >= 30) return 'Nurture'
    return 'Verify'
  }, [selectedLead])

  function handleProposalExport() {
    if (!proposal || !estimate || !customer) return
    const document = renderProposalDocument(business, customer, estimate, proposal)
    exportTextFile(`${proposal.id}.md`, document)
  }

  async function handleCreateRecoveryLink() {
    if (!selectedLead) return
    setCreatingRecoveryLink(true)
    setRecoveryLinkStatus(undefined)
    try {
      const result = await createRecoveryLink({
        sourceType: 'lead',
        sourceId: selectedLead.id,
        createdBy: 'operator@localgrowth.example',
      })
      setRecoveryLinkUrl(result.publicUrl)
      setRecoveryLinkStatus('Recovery link created.')
    } catch (error) {
      setRecoveryLinkStatus(error instanceof Error ? error.message : 'Unable to create recovery link.')
    } finally {
      setCreatingRecoveryLink(false)
    }
  }

  if (!selectedLead || !customer) {
    return <div className="empty-state">Add a lead to start the BidFlow pipeline.</div>
  }

  return (
    <div className="view-stack">
      <section className="section-band">
        <div className="section-heading">
          <div>
            <span className="eyebrow">BidFlow Local</span>
            <h2>Turn service requests into approved work</h2>
          </div>
          <p>
            Score the lead, draft an estimate, produce a proposal, and schedule follow-up before the customer cools down.
          </p>
        </div>
        <div className="kpi-grid">
          <Kpi label="Pipeline value" value={formatCurrency(pipelineValue)} />
          <Kpi label="Won value" value={formatCurrency(wonValue)} />
          <Kpi label="Avg. deal target" value={formatCurrency(business.averageDealSize)} />
          <Kpi label="Monthly lead goal" value={String(business.monthlyLeadGoal)} />
        </div>
      </section>

      <section className="split-layout">
        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Lead queue</span>
            <h2>Prioritized opportunities</h2>
          </div>
          <div className="lead-list">
            {leads.map((lead) => {
              const leadCustomer = customers.find((item) => item.id === lead.customerId)
              return (
                <button
                  className={lead.id === selectedLead.id ? 'list-item active' : 'list-item'}
                  key={lead.id}
                  type="button"
                  onClick={() => setSelectedLeadId(lead.id)}
                >
                  <div>
                    <strong>{lead.serviceCategory}</strong>
                    <span>{leadCustomer?.name}</span>
                  </div>
                  <div className="score-pill">{lead.score}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="section-band lead-detail">
          <div className="detail-header">
            <div>
              <span className="eyebrow">{scoreLabel} lead</span>
              <h2>{selectedLead.serviceCategory}</h2>
              <p>{selectedLead.description}</p>
            </div>
            <div className="large-score">{selectedLead.score}</div>
          </div>
          <div className="next-step">
            <CalendarClock size={18} />
            <span>{selectedLead.nextStep}</span>
          </div>
          <div className="action-row">
            <button type="button" className="primary-button" onClick={() => generateLeadAssets(selectedLead.id)}>
              <Wand2 size={17} />
              Generate revenue pack
            </button>
            <button type="button" className="secondary-button" onClick={() => markLeadWon(selectedLead.id)}>
              <Check size={17} />
              Mark won
            </button>
            {proposal && estimate && (
              <button type="button" className="secondary-button" onClick={handleProposalExport}>
                <Download size={17} />
                Export proposal
              </button>
            )}
            {proposal && estimate && (
              <button type="button" className="secondary-button" disabled={creatingRecoveryLink} onClick={() => void handleCreateRecoveryLink()}>
                <ExternalLink size={17} />
                {creatingRecoveryLink ? 'Creating link' : 'Recovery link'}
              </button>
            )}
          </div>
          {(recoveryLinkUrl || recoveryLinkStatus) && (
            <div className="checkout-handoff-preview">
              <div>
                <span>Customer action link</span>
                <strong>{recoveryLinkStatus}</strong>
              </div>
              {recoveryLinkUrl && (
                <a href={recoveryLinkUrl} target="_blank" rel="noreferrer">
                  {recoveryLinkUrl}
                </a>
              )}
            </div>
          )}

          <div className="artifact-grid">
            <article className="artifact">
              <FileText size={18} />
              <h3>Estimate</h3>
              {estimate ? (
                <>
                  <strong>{formatCurrency(estimate.total)}</strong>
                  <span>
                    {estimate.confidence} confidence · valid until {new Date(estimate.validUntil).toLocaleDateString()}
                  </span>
                  <ul>
                    {estimate.lineItems.map((item) => (
                      <li key={item.id}>
                        {item.name}: {formatCurrency(item.unitPrice)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>No estimate generated yet.</p>
              )}
            </article>
            <article className="artifact">
              <MessageSquareText size={18} />
              <h3>Proposal</h3>
              {proposal ? (
                <>
                  <strong>{proposal.title}</strong>
                  <p>{proposal.recommendedSolution}</p>
                  <span>{proposal.timeline}</span>
                </>
              ) : (
                <p>No proposal generated yet.</p>
              )}
            </article>
          </div>
        </div>
      </section>

      <section className="two-column">
        <form className="section-band form-panel" onSubmit={handleSubmit}>
          <div className="section-heading tight">
            <span className="eyebrow">Capture</span>
            <h2>Add a new paid opportunity</h2>
          </div>
          <label>
            Customer
            <select name="customerId" defaultValue={customers[0]?.id}>
              {customers.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Service category
            <input name="serviceCategory" required placeholder="Emergency plumbing repair" />
          </label>
          <label>
            Job description
            <textarea name="description" required minLength={28} placeholder="Describe scope, urgency, property, and constraints." />
          </label>
          <div className="form-row">
            <label>
              Min budget
              <input type="number" name="budgetMin" required min={0} defaultValue={800} />
            </label>
            <label>
              Max budget
              <input type="number" name="budgetMax" required min={0} defaultValue={2800} />
            </label>
          </div>
          <label>
            Urgency
            <select name="urgency" defaultValue="normal">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="emergency">Emergency</option>
            </select>
          </label>
          <div className="toggle-row">
            <label>
              <input type="checkbox" name="locationFit" defaultChecked />
              In service area
            </label>
            <label>
              <input type="checkbox" name="repeatCustomer" />
              Repeat customer
            </label>
          </div>
          <button type="submit" className="primary-button">
            <Plus size={17} />
            Add and score lead
          </button>
        </form>

        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Follow-up</span>
            <h2>Sequence for selected lead</h2>
          </div>
          <div className="timeline-list">
            {leadFollowUps.map((followUp) => (
              <div className="timeline-item" key={followUp.id}>
                <time>{new Date(followUp.scheduledAt).toLocaleDateString()}</time>
                <div>
                  <strong>{followUp.subject}</strong>
                  <p>{followUp.body}</p>
                  <span>{followUp.channel.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
