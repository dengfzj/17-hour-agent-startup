import { AlertTriangle, Check, Download, ExternalLink, MessageCircleReply, Plus, ShieldAlert, Wand2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import { formatCurrency } from '../domain/engines'
import { renderRecoveryDocument } from '../domain/documents'
import { exportTextFile } from '../lib/export'
import { createRecoveryLink } from '../lib/api'

export function ReputeLoopView() {
  const business = useWorkspaceStore((state) => state.business)
  const customers = useWorkspaceStore((state) => state.customers)
  const reviews = useWorkspaceStore((state) => state.reviews)
  const responses = useWorkspaceStore((state) => state.reviewResponses)
  const feedbackCases = useWorkspaceStore((state) => state.feedbackCases)
  const recoveryOffers = useWorkspaceStore((state) => state.recoveryOffers)
  const campaigns = useWorkspaceStore((state) => state.campaigns)
  const addReview = useWorkspaceStore((state) => state.addReview)
  const generateReviewAssets = useWorkspaceStore((state) => state.generateReviewAssets)
  const approveReviewResponse = useWorkspaceStore((state) => state.approveReviewResponse)
  const [selectedReviewId, setSelectedReviewId] = useState(reviews[0]?.id ?? '')
  const [recoveryLinkUrl, setRecoveryLinkUrl] = useState('')
  const [recoveryLinkStatus, setRecoveryLinkStatus] = useState<string>()
  const [creatingRecoveryLink, setCreatingRecoveryLink] = useState(false)

  const selectedReview = reviews.find((review) => review.id === selectedReviewId) ?? reviews[0]
  const customer = customers.find((item) => item.id === selectedReview?.customerId)
  const response = responses.find((item) => item.reviewId === selectedReview?.id)
  const caseItem = feedbackCases.find((item) => item.reviewId === selectedReview?.id)
  const offer = caseItem ? recoveryOffers.find((item) => item.feedbackCaseId === caseItem.id) : undefined
  const averageRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
  const highRiskCount = reviews.filter((review) => review.riskScore >= 70).length
  const activeRevenue = campaigns.reduce((sum, campaign) => sum + campaign.projectedRevenue, 0)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    addReview({
      customerId: String(form.get('customerId')),
      platform: 'google',
      rating: Number(form.get('rating')),
      body: String(form.get('body')),
      reviewerName: String(form.get('reviewerName')),
    })
    event.currentTarget.reset()
  }

  function handleRecoveryExport() {
    if (!response || !customer) return
    const document = renderRecoveryDocument(business, customer, selectedReview, response, offer)
    exportTextFile(`${selectedReview.id}-recovery-pack.md`, document)
  }

  async function handleCreateRecoveryLink() {
    if (!caseItem) return
    setCreatingRecoveryLink(true)
    setRecoveryLinkStatus(undefined)
    try {
      const result = await createRecoveryLink({
        sourceType: 'feedback_case',
        sourceId: caseItem.id,
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

  if (!selectedReview || !customer) {
    return <div className="empty-state">Import a review to start ReputeLoop.</div>
  }

  return (
    <div className="view-stack">
      <section className="section-band">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ReputeLoop</span>
            <h2>Protect reviews and recover lost customers</h2>
          </div>
          <p>
            Detect public risk, draft compliant responses, open recovery cases, and estimate repeat revenue from approved
            campaigns.
          </p>
        </div>
        <div className="kpi-grid">
          <Kpi label="Average rating" value={averageRating.toFixed(1)} />
          <Kpi label="High-risk reviews" value={String(highRiskCount)} />
          <Kpi label="Monthly review goal" value={String(business.monthlyReviewGoal)} />
          <Kpi label="Campaign upside" value={formatCurrency(activeRevenue)} />
        </div>
      </section>

      <section className="split-layout">
        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Inbox</span>
            <h2>Review risk queue</h2>
          </div>
          <div className="lead-list">
            {reviews.map((review) => (
              <button
                className={review.id === selectedReview.id ? 'list-item active' : 'list-item'}
                key={review.id}
                type="button"
                onClick={() => setSelectedReviewId(review.id)}
              >
                <div>
                  <strong>
                    {review.rating} stars on {review.platform}
                  </strong>
                  <span>{review.reviewerName}</span>
                </div>
                <div className={review.riskScore >= 70 ? 'score-pill danger' : 'score-pill'}>{review.riskScore}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="section-band lead-detail">
          <div className="detail-header">
            <div>
              <span className="eyebrow">{selectedReview.status.replace('_', ' ')}</span>
              <h2>{selectedReview.reviewerName}</h2>
              <p>{selectedReview.body}</p>
            </div>
            <div className={selectedReview.riskScore >= 70 ? 'large-score danger' : 'large-score'}>
              {selectedReview.riskScore}
            </div>
          </div>

          <div className="compliance-box">
            <ShieldAlert size={18} />
            <span>
              {selectedReview.riskScore >= 70
                ? 'Manager approval required. Keep the response public-safe and move the conversation offline.'
                : 'Draft may be approved after checking customer consent and platform policy.'}
            </span>
          </div>

          <div className="action-row">
            <button type="button" className="primary-button" onClick={() => generateReviewAssets(selectedReview.id)}>
              <Wand2 size={17} />
              Generate response pack
            </button>
            {response && (
              <button type="button" className="secondary-button" onClick={() => approveReviewResponse(response.id)}>
                <Check size={17} />
                Approve reply
              </button>
            )}
            {response && (
              <button type="button" className="secondary-button" onClick={handleRecoveryExport}>
                <Download size={17} />
                Export recovery pack
              </button>
            )}
            {caseItem && offer && (
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
              <MessageCircleReply size={18} />
              <h3>Public reply draft</h3>
              {response ? (
                <>
                  <p>{response.body}</p>
                  <span>{response.status}</span>
                  <ul>
                    {response.complianceNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>No response generated yet.</p>
              )}
            </article>
            <article className="artifact">
              <AlertTriangle size={18} />
              <h3>Recovery offer</h3>
              {caseItem && offer ? (
                <>
                  <strong>
                    {caseItem.severity} · winback score {caseItem.winbackScore}
                  </strong>
                  <p>{offer.message}</p>
                  <span>
                    {offer.offerType} {offer.value ? `· ${formatCurrency(offer.value)}` : ''}
                  </span>
                </>
              ) : (
                <p>No recovery case required for this review.</p>
              )}
            </article>
          </div>
        </div>
      </section>

      <section className="two-column">
        <form className="section-band form-panel" onSubmit={handleSubmit}>
          <div className="section-heading tight">
            <span className="eyebrow">Import</span>
            <h2>Add a customer review</h2>
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
            Reviewer name
            <input name="reviewerName" required placeholder="Public reviewer name" />
          </label>
          <label>
            Rating
            <select name="rating" defaultValue="5">
              <option value="5">5 stars</option>
              <option value="4">4 stars</option>
              <option value="3">3 stars</option>
              <option value="2">2 stars</option>
              <option value="1">1 star</option>
            </select>
          </label>
          <label>
            Review body
            <textarea name="body" required minLength={16} placeholder="Paste the public review text." />
          </label>
          <button type="submit" className="primary-button">
            <Plus size={17} />
            Import and analyze
          </button>
        </form>

        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Compliance</span>
            <h2>Operating rules</h2>
          </div>
          <ul className="decision-list">
            <li>
              <Check size={17} />
              <span>Ask every customer for honest feedback without filtering unhappy customers out.</span>
            </li>
            <li>
              <Check size={17} />
              <span>Never offer discounts, refunds, or gifts in exchange for a positive review.</span>
            </li>
            <li>
              <Check size={17} />
              <span>Keep legal, safety, discrimination, and refund disputes in a manager approval queue.</span>
            </li>
            <li>
              <Check size={17} />
              <span>Respect email and SMS consent before sending winback or repeat-purchase campaigns.</span>
            </li>
          </ul>
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
