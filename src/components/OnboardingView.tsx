import { CheckCircle2, ClipboardCheck, FileUp, ShieldCheck } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import type { OnboardingRecord, OnboardingSubmission, PublicOnboardingRecord, PublicOnboardingSubmission } from '../domain/types'
import {
  confirmPublicOnboardingDelivery,
  getOnboardingRecords,
  getOnboardingSubmissions,
  getPublicOnboardingRecord,
  generateOnboardingFirstPack,
  getOnboardingDeliveryPack,
  importOnboardingSubmission,
  previewOnboardingSubmissionImport,
  submitPublicOnboardingMaterials,
  updateOnboardingChecklistItem,
  updateOnboardingDelivery,
  updateOnboardingSubmissionStatus,
  updatePublicOnboardingChecklistItem,
} from '../lib/api'
import { exportTextFile } from '../lib/export'

const statusCopy: Record<OnboardingRecord['status'], string> = {
  checkout_started: 'Checkout started',
  paid: 'Payment received',
  workspace_activated: 'Workspace activated',
  materials_submitted: 'Materials submitted for review',
  data_imported: 'Materials submitted for review',
  ready_for_pilot: 'Ready for pilot delivery',
}

const operatorOnlyKeys = new Set(['payment_received', 'workspace_activated'])
const submissionStatusCopy: Record<OnboardingSubmission['status'], string> = {
  submitted: 'Submitted',
  reviewed: 'Reviewed',
  imported: 'Imported',
  rejected: 'Rejected',
}

const materialTypeCopy: Record<OnboardingSubmission['materialType'], string> = {
  lead_csv: 'Lead CSV',
  review_csv: 'Review CSV',
  general_notes: 'Notes',
}

const deliveryStatusCopy: Record<OnboardingRecord['deliveryStatus'], string> = {
  not_started: 'Not started',
  materials_waiting: 'Materials waiting',
  pack_ready: 'Pack ready',
  qa_approved: 'QA approved',
  sent: 'Sent to customer',
  customer_confirmed: 'Customer accepted',
  revision_requested: 'Revision requested',
  call_requested: 'Call requested',
  renewal_ready: 'Renewal ready',
  blocked: 'Blocked',
}

type OnboardingSubmissionListItem = OnboardingSubmission | PublicOnboardingSubmission
type OnboardingRecordListItem = OnboardingRecord | PublicOnboardingRecord

function hasSubmissionBody(submission: OnboardingSubmissionListItem): submission is OnboardingSubmission {
  return 'body' in submission
}

export function OnboardingView({ accessToken }: { accessToken?: string }) {
  const [records, setRecords] = useState<OnboardingRecordListItem[]>([])
  const [submissions, setSubmissions] = useState<OnboardingSubmissionListItem[]>([])
  const [apiState, setApiState] = useState<'loading' | 'ready' | 'offline'>('loading')
  const [action, setAction] = useState<string>()
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const [deliveryResponse, setDeliveryResponse] = useState<'accept' | 'request_revision' | 'schedule_call'>('accept')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [preview, setPreview] = useState<{
    submissionId: string
    imported: number
    skipped: number
    errors: Array<{ row: number; error: string }>
    writable: boolean
  }>()

  useEffect(() => {
    let canceled = false

    if (accessToken) {
      getPublicOnboardingRecord(accessToken)
        .then((response) => {
          if (canceled) return
          setRecords([response.record])
          setSubmissions(response.submissions)
          setApiState('ready')
        })
        .catch(() => {
          if (canceled) return
          setSubmissions([])
          setApiState('offline')
        })
    } else {
      Promise.all([getOnboardingRecords(), getOnboardingSubmissions()])
        .then(([onboardingResponse, submissionsResponse]) => {
          if (canceled) return
          setRecords(onboardingResponse.onboarding)
          setSubmissions(submissionsResponse.submissions)
          setApiState('ready')
        })
        .catch(() => {
          if (canceled) return
          setApiState('offline')
        })
    }

    return () => {
      canceled = true
    }
  }, [accessToken])

  const updateChecklist = async (recordId: string, itemKey: string, done: boolean) => {
    setError(undefined)
    setSuccess(undefined)
    setPreview(undefined)
    setAction(`${recordId}:${itemKey}`)
    try {
      if (accessToken) {
        const result = await updatePublicOnboardingChecklistItem(accessToken, itemKey, done)
        setRecords([result.record])
      } else {
        const result = await updateOnboardingChecklistItem(recordId, itemKey, done)
        setRecords(result.onboarding)
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update onboarding.')
    } finally {
      setAction(undefined)
    }
  }

  const submitMaterials = async (event: FormEvent<HTMLFormElement>, record: OnboardingRecordListItem) => {
    event.preventDefault()
    if (!accessToken) return

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setError(undefined)
    setSuccess(undefined)
    setPreview(undefined)
    setAction(`submit:${record.id}`)
    try {
      const result = await submitPublicOnboardingMaterials(accessToken, {
        submittedByEmail: String(form.get('submittedByEmail')),
        materialType: String(form.get('materialType')) as OnboardingSubmission['materialType'],
        title: String(form.get('title')),
        body: String(form.get('body')),
      })
      formElement.reset()
      setRecords([result.record])
      setSubmissions(result.submissions)
      setSuccess('Materials submitted for operator review.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit materials.')
    } finally {
      setAction(undefined)
    }
  }

  const updateSubmissionStatus = async (submissionId: string, status: OnboardingSubmission['status']) => {
    setError(undefined)
    setSuccess(undefined)
    setPreview(undefined)
    setAction(`submission:${submissionId}`)
    try {
      const result = await updateOnboardingSubmissionStatus(submissionId, status)
      setSubmissions(result.submissions)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update submission.')
    } finally {
      setAction(undefined)
    }
  }

  const previewSubmission = async (submissionId: string) => {
    setError(undefined)
    setSuccess(undefined)
    setAction(`preview:${submissionId}`)
    try {
      const result = await previewOnboardingSubmissionImport(submissionId)
      setPreview({
        submissionId,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
        writable: result.writable,
      })
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Unable to preview submission import.')
    } finally {
      setAction(undefined)
    }
  }

  const importSubmission = async (submissionId: string) => {
    setError(undefined)
    setSuccess(undefined)
    setAction(`import:${submissionId}`)
    try {
      const result = await importOnboardingSubmission(submissionId)
      setSubmissions(result.submissions)
      setPreview({
        submissionId,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
        writable: false,
      })
      setSuccess(`Imported ${result.imported} records from submitted materials.`)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Unable to import submission.')
    } finally {
      setAction(undefined)
    }
  }

  const generateFirstPack = async (submissionId: string) => {
    setError(undefined)
    setSuccess(undefined)
    setAction(`first-pack:${submissionId}`)
    try {
      const result = await generateOnboardingFirstPack(submissionId)
      setRecords(result.onboarding)
      setSuccess('Generated first pack and advanced onboarding checks.')
    } catch (packError) {
      setError(packError instanceof Error ? packError.message : 'Unable to generate first pack.')
    } finally {
      setAction(undefined)
    }
  }

  const downloadDeliveryPack = async (submissionId: string) => {
    setError(undefined)
    setSuccess(undefined)
    setAction(`download:${submissionId}`)
    try {
      const result = await getOnboardingDeliveryPack(submissionId)
      exportTextFile(result.filename, result.content)
      setSuccess('Downloaded first delivery pack.')
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Unable to download delivery pack.')
    } finally {
      setAction(undefined)
    }
  }

  const approveDeliveryQa = async (record: OnboardingRecordListItem) => {
    if (accessToken) return
    setError(undefined)
    setSuccess(undefined)
    setAction(`delivery-qa:${record.id}`)
    try {
      const result = await updateOnboardingDelivery(record.id, {
        deliveryStatus: 'qa_approved',
        deliveryOwnerEmail: record.deliveryOwnerEmail,
        deliveryQaApprovedBy: record.deliveryOwnerEmail,
        deliveryQaNotes: 'First delivery pack reviewed against the operator QA checklist.',
      })
      setRecords(result.onboarding)
      setSuccess('QA approval recorded for first delivery.')
    } catch (deliveryError) {
      setError(deliveryError instanceof Error ? deliveryError.message : 'Unable to record QA approval.')
    } finally {
      setAction(undefined)
    }
  }

  const markDeliverySent = async (record: OnboardingRecordListItem) => {
    if (accessToken) return
    setError(undefined)
    setSuccess(undefined)
    setAction(`delivery-sent:${record.id}`)
    try {
      const result = await updateOnboardingDelivery(record.id, {
        deliveryStatus: 'sent',
        deliveryOwnerEmail: record.deliveryOwnerEmail,
        deliveryPackSentBy: record.deliveryOwnerEmail,
        deliveryPackSummary:
          record.product === 'bidflow'
            ? 'First approved revenue pack sent for customer review and quote action.'
            : 'First approved response and recovery pack sent for customer review.',
        renewalEvidenceSummary: `First delivery pack sent to ${record.businessName}; awaiting customer acceptance.`,
      })
      setRecords(result.onboarding)
      setSuccess('Delivery sent evidence recorded.')
    } catch (deliveryError) {
      setError(deliveryError instanceof Error ? deliveryError.message : 'Unable to mark delivery sent.')
    } finally {
      setAction(undefined)
    }
  }

  const confirmDelivery = async (event: FormEvent<HTMLFormElement>, record: OnboardingRecordListItem) => {
    event.preventDefault()
    if (!accessToken) return
    const form = new FormData(event.currentTarget)
    setError(undefined)
    setSuccess(undefined)
    setAction(`delivery-confirm:${record.id}`)
    try {
      const result = await confirmPublicOnboardingDelivery(accessToken, {
        response: deliveryResponse,
        confirmedByEmail: String(form.get('confirmedByEmail')),
        note: deliveryNote,
      })
      setRecords([result.record])
      setSubmissions(result.submissions)
      setSuccess('Delivery response recorded for the operator.')
      setDeliveryNote('')
    } catch (deliveryError) {
      setError(deliveryError instanceof Error ? deliveryError.message : 'Unable to record delivery response.')
    } finally {
      setAction(undefined)
    }
  }

  return (
    <div className="view-stack">
      <section className="section-band">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Customer onboarding</span>
            <h2>Paid pilot activation</h2>
          </div>
          <p>Track payment-confirmed setup, materials submitted for review, and the first human-approved pilot pack.</p>
        </div>
        <div className={apiState === 'ready' ? 'api-status ready' : 'api-status'}>
          <span>{apiState === 'ready' ? 'Onboarding connected' : apiState === 'offline' ? 'API offline' : 'Loading onboarding'}</span>
          <strong>{apiState === 'ready' ? `${records.length} paid pilot records` : 'Start the API to continue'}</strong>
        </div>
        {error && <div className="api-status">{error}</div>}
        {success && <div className="api-status ready">{success}</div>}
      </section>

      {records.length === 0 && apiState === 'ready' && (
        <section className="section-band">
          <div className="empty-state">No paid pilot onboarding is waiting yet.</div>
        </section>
      )}

      {records.map((record) => {
        const completed = record.checklist.filter((item) => item.done).length
        const nextOpenItem = record.checklist.find((item) => !item.done)
        const recordSubmissions = submissions.filter((submission) => submission.onboardingId === record.id)
        return (
          <section className="section-band" key={record.id}>
            <div className="customer-onboarding-header">
              <div>
                <span className="eyebrow">{record.product}</span>
                <h2>{record.businessName}</h2>
                <p>
                  {record.ownerEmail} · {record.planId} · {statusCopy[record.status]}
                </p>
              </div>
              <div className="activation-score">
                <strong>
                  {completed}/{record.checklist.length}
                </strong>
                <span>steps complete</span>
              </div>
            </div>

            <div className="onboarding-next-step">
              <FileUp size={19} />
              <div>
                <strong>{nextOpenItem ? nextOpenItem.label : 'Pilot is ready for first delivery'}</strong>
                <span>
                  {nextOpenItem
                    ? 'Confirm this only after the requested materials or first-pack review are actually complete.'
                    : 'Review the first approved pack with the customer before turning on broader automation.'}
                </span>
              </div>
            </div>

            <div className="delivery-evidence-panel">
              <div>
                <span>Delivery owner</span>
                <strong>{record.deliveryOwnerEmail}</strong>
              </div>
              <div>
                <span>SLA due</span>
                <strong>{new Date(record.deliverySlaDueAt).toLocaleDateString()}</strong>
              </div>
              <div>
                <span>Delivery status</span>
                <strong>{deliveryStatusCopy[record.deliveryStatus]}</strong>
              </div>
              {record.deliveryPackSummary && (
                <p className="span-3">{record.deliveryPackSummary}</p>
              )}
              {record.customerConfirmationNote && (
                <p className="span-3">{record.customerConfirmationNote}</p>
              )}
              {!accessToken && (
                <div className="delivery-actions span-3">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={action === `delivery-qa:${record.id}` || record.deliveryStatus !== 'pack_ready'}
                    onClick={() => void approveDeliveryQa(record)}
                  >
                    {action === `delivery-qa:${record.id}` ? 'Recording QA' : 'QA approve'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={
                      action === `delivery-sent:${record.id}` ||
                      !['qa_approved', 'sent', 'customer_confirmed', 'revision_requested', 'call_requested'].includes(record.deliveryStatus)
                    }
                    onClick={() => void markDeliverySent(record)}
                  >
                    {action === `delivery-sent:${record.id}` ? 'Recording sent' : 'Mark sent'}
                  </button>
                </div>
              )}
            </div>

            <div className="customer-checklist">
              {record.checklist.map((item) => {
                const locked = operatorOnlyKeys.has(item.key)
                return (
                  <div className={item.done ? 'customer-check done' : 'customer-check'} key={item.key}>
                    <CheckCircle2 size={18} />
                    <div>
                      <strong>{item.label}</strong>
                      <span>
                        {locked
                          ? 'Verified from payment or workspace setup.'
                          : item.done
                            ? 'Confirmed and waiting for operator review where required.'
                            : 'Waiting for submitted materials or first-pack review.'}
                      </span>
                    </div>
                    {!locked && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={action === `${record.id}:${item.key}`}
                        onClick={() => void updateChecklist(record.id, item.key, !item.done)}
                      >
                        {item.done
                          ? 'Undo'
                          : item.key === 'customer_materials_submitted' || item.key === 'customer_data_imported'
                            ? 'Confirm submitted'
                            : 'Confirm reviewed'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {accessToken ? (
              <>
                <form className="onboarding-material-form" onSubmit={(event) => void submitMaterials(event, record)}>
                  <div className="section-heading tight">
                    <span className="eyebrow">Materials</span>
                    <h2>Submit materials for review</h2>
                  </div>
                  <div className="form-row">
                    <label>
                      Email
                      <input name="submittedByEmail" type="email" required defaultValue={record.ownerEmail} />
                    </label>
                    <label>
                      Type
                      <select name="materialType" defaultValue={record.product === 'bidflow' ? 'lead_csv' : 'review_csv'}>
                        <option value="lead_csv">Lead CSV</option>
                        <option value="review_csv">Review CSV</option>
                        <option value="general_notes">Notes</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Title
                    <input name="title" required maxLength={120} placeholder="June leads export" />
                  </label>
                  <label>
                    Details
                    <textarea name="body" required maxLength={20000} placeholder="Paste CSV rows, review exports, or access notes." />
                  </label>
                  <button className="primary-button" type="submit" disabled={action === `submit:${record.id}`}>
                    {action === `submit:${record.id}` ? 'Submitting' : 'Submit for review'}
                  </button>
                </form>
                {record.deliveryStatus === 'sent' && (
                  <form className="onboarding-material-form" onSubmit={(event) => void confirmDelivery(event, record)}>
                    <div className="section-heading tight">
                      <span className="eyebrow">First delivery</span>
                      <h2>Respond to delivery</h2>
                    </div>
                    <label>
                      Email
                      <input name="confirmedByEmail" type="email" required defaultValue={record.ownerEmail} />
                    </label>
                    <label>
                      Response
                      <select
                        value={deliveryResponse}
                        onChange={(event) => setDeliveryResponse(event.target.value as 'accept' | 'request_revision' | 'schedule_call')}
                      >
                        <option value="accept">Accept delivery</option>
                        <option value="request_revision">Request revision</option>
                        <option value="schedule_call">Schedule call</option>
                      </select>
                    </label>
                    <label>
                      Note
                      <textarea
                        value={deliveryNote}
                        maxLength={1000}
                        placeholder="Add acceptance note, revision request, or preferred callback time."
                        onChange={(event) => setDeliveryNote(event.target.value)}
                      />
                    </label>
                    <button className="primary-button" type="submit" disabled={action === `delivery-confirm:${record.id}`}>
                      {action === `delivery-confirm:${record.id}` ? 'Recording' : 'Send delivery response'}
                    </button>
                  </form>
                )}
              </>
            ) : (
              <div className="onboarding-submission-list">
                <div className="section-heading tight">
                  <span className="eyebrow">Submitted materials</span>
                  <h2>{recordSubmissions.length} customer submissions</h2>
                </div>
                {recordSubmissions.map((submission) => (
                  <div className="submission-row" key={submission.id}>
                    <div>
                      <strong>{submission.title}</strong>
                      <span>
                        {materialTypeCopy[submission.materialType]} · {submission.submittedByEmail} ·{' '}
                        {submissionStatusCopy[submission.status]}
                      </span>
                      <p>
                        {hasSubmissionBody(submission)
                          ? submission.body.slice(0, 220)
                          : `Submitted ${new Date(submission.createdAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <select
                      value={submission.status}
                      disabled={action === `submission:${submission.id}`}
                      onChange={(event) =>
                        void updateSubmissionStatus(submission.id, event.target.value as OnboardingSubmission['status'])
                      }
                    >
                      <option value="submitted">Submitted</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="imported">Imported</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    {hasSubmissionBody(submission) && submission.materialType !== 'general_notes' && (
                      <div className="submission-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={action === `preview:${submission.id}`}
                          onClick={() => void previewSubmission(submission.id)}
                        >
                          {action === `preview:${submission.id}` ? 'Previewing' : 'Preview'}
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={action === `import:${submission.id}` || submission.status === 'imported'}
                          onClick={() => void importSubmission(submission.id)}
                        >
                          {action === `import:${submission.id}` ? 'Importing' : 'Import'}
                        </button>
                        {submission.status === 'imported' && (
                          <>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={action === `first-pack:${submission.id}`}
                              onClick={() => void generateFirstPack(submission.id)}
                            >
                              {action === `first-pack:${submission.id}` ? 'Generating' : 'First pack'}
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={action === `download:${submission.id}`}
                              onClick={() => void downloadDeliveryPack(submission.id)}
                            >
                              {action === `download:${submission.id}` ? 'Downloading' : 'Download pack'}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {preview?.submissionId === submission.id && (
                      <div className={preview.errors.length ? 'submission-preview warning' : 'submission-preview'}>
                        <strong>
                          {preview.imported} ready · {preview.skipped} skipped · {preview.errors.length} errors
                        </strong>
                        {preview.errors.slice(0, 3).map((item) => (
                          <span key={`${item.row}:${item.error}`}>
                            Row {item.row}: {item.error}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {recordSubmissions.length === 0 && <p className="muted-note">No customer materials have been submitted yet.</p>}
              </div>
            )}
          </section>
        )
      })}

      <section className="two-column">
        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Customer-safe actions</span>
            <h2>What can be confirmed here</h2>
          </div>
          <ul className="decision-list">
            <li>
              <ClipboardCheck size={17} />
              <span>Customer lead or review data has been submitted for review.</span>
            </li>
            <li>
              <ClipboardCheck size={17} />
              <span>The first revenue or reputation pack has been reviewed with the customer.</span>
            </li>
            <li>
              <ClipboardCheck size={17} />
              <span>Contact details and service scope are ready for human-managed delivery.</span>
            </li>
          </ul>
        </div>
        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Guardrails</span>
            <h2>Still requires human approval</h2>
          </div>
          <ul className="decision-list">
            <li>
              <ShieldCheck size={17} />
              <span>Binding quotes, public review replies, SMS sends, and refund offers.</span>
            </li>
            <li>
              <ShieldCheck size={17} />
              <span>Google Business Profile access and provider credentials.</span>
            </li>
            <li>
              <ShieldCheck size={17} />
              <span>Claims about recovered revenue before attribution is verified.</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
