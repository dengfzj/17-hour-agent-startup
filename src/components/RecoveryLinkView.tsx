import { useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, MessageSquareText, PhoneCall, XCircle } from 'lucide-react'
import type { PublicRevenueRecoveryLink } from '../domain/types'
import { getPublicRecoveryLink, respondToRecoveryLink } from '../lib/api'
import { formatCurrency } from '../domain/engines'

type RecoveryAction = 'approve' | 'request_revision' | 'schedule_callback' | 'decline'

const actionLabels: Record<RecoveryAction, string> = {
  approve: 'Approve',
  request_revision: 'Request revision',
  schedule_callback: 'Schedule callback',
  decline: 'Decline',
}

const actionIcons = {
  approve: CheckCircle2,
  request_revision: MessageSquareText,
  schedule_callback: PhoneCall,
  decline: XCircle,
}

export function RecoveryLinkView({ token }: { token: string }) {
  const [link, setLink] = useState<PublicRevenueRecoveryLink>()
  const [selectedAction, setSelectedAction] = useState<RecoveryAction>('approve')
  const [note, setNote] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let canceled = false
    getPublicRecoveryLink(token)
      .then(({ link: nextLink }) => {
        if (!canceled) setLink(nextLink)
      })
      .catch((error) => {
        if (!canceled) setStatus(error instanceof Error ? error.message : 'Unable to load recovery link.')
      })
    return () => {
      canceled = true
    }
  }, [token])

  const submitResponse = async () => {
    setStatus(undefined)
    setSubmitting(true)
    try {
      const result = await respondToRecoveryLink(token, { action: selectedAction, note, email })
      setLink(result.link)
      setStatus('Response recorded. The operator will follow up from this recovery record.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to record response.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!link) {
    return (
      <main className="public-buy-shell">
        <section className="section-band">
          <div className="api-status">{status ?? 'Loading recovery link...'}</div>
        </section>
      </main>
    )
  }

  const responseClosed = ['accepted', 'revision_requested', 'callback_requested', 'declined'].includes(link.status)

  return (
    <main className="public-buy-shell">
      <section className="section-band recovery-public">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{link.product === 'bidflow' ? 'BidFlow approval link' : 'ReputeLoop recovery link'}</span>
            <h2>{link.title}</h2>
          </div>
          <p>{link.businessName} prepared this action link for {link.customerName}.</p>
        </div>
        {status && <div className={status.startsWith('Response recorded') ? 'api-status ready' : 'api-status'}>{status}</div>}
        <div className="recovery-summary">
          <div>
            <span>Estimated value</span>
            <strong>{formatCurrency(link.valueCents / 100)}</strong>
          </div>
          <div>
            <span>Expires</span>
            <strong>{new Date(link.expiresAt).toLocaleDateString()}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{link.status.replaceAll('_', ' ')}</strong>
          </div>
        </div>
        <div className="scope-confirmation">
          <span>Recommended action</span>
          <strong>{link.callToAction}</strong>
          <small>{link.summary}</small>
        </div>
        {!responseClosed ? (
          <div className="recovery-action-panel">
            <div className="action-choice-grid">
              {(Object.keys(actionLabels) as RecoveryAction[]).map((action) => {
                const Icon = actionIcons[action]
                return (
                  <button
                    key={action}
                    type="button"
                    className={selectedAction === action ? 'choice-button active' : 'choice-button'}
                    onClick={() => setSelectedAction(action)}
                  >
                    <Icon size={17} />
                    <span>{actionLabels[action]}</span>
                  </button>
                )
              })}
            </div>
            <label>
              Contact email
              <input value={email} type="email" placeholder="you@example.com" onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Note
              <textarea value={note} placeholder="Add timing, revision details, or decline reason." onChange={(event) => setNote(event.target.value)} />
            </label>
            <button type="button" className="primary-button" disabled={submitting} onClick={() => void submitResponse()}>
              <CalendarClock size={17} />
              {submitting ? 'Recording' : `Submit: ${actionLabels[selectedAction]}`}
            </button>
          </div>
        ) : (
          <div className="api-status ready">
            <span>Response already recorded</span>
            <strong>{link.status.replaceAll('_', ' ')}</strong>
          </div>
        )}
      </section>
    </main>
  )
}
