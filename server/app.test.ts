import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHmac, generateKeyPairSync } from 'node:crypto'
import { join } from 'node:path'
import { SignJWT, exportSPKI } from 'jose'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { billingPlans } from './plans'
import { JsonWorkspaceRepository } from './storage'

describe('Local Growth OS API', () => {
  let dataPath: string

  beforeEach(() => {
    dataPath = `data/test-workspace-${Math.random().toString(36).slice(2)}.json`
    process.env.WORKSPACE_DATA_PATH = dataPath
    process.env.LOCAL_GROWTH_ALLOW_HEADER_AUTH = 'true'
    delete process.env.NODE_ENV
    delete process.env.APP_ORIGIN
    delete process.env.LOCAL_GROWTH_API_KEY
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.DATABASE_URL
    delete process.env.POSTMARK_TOKEN
    delete process.env.POSTMARK_FROM_EMAIL
    delete process.env.SENDGRID_API_KEY
    delete process.env.SENDGRID_FROM_EMAIL
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_MESSAGING_SERVICE_SID
    delete process.env.GOOGLE_ACCESS_TOKEN
    delete process.env.GOOGLE_ACCOUNT_ID
    delete process.env.GOOGLE_LOCATION_ID
    delete process.env.PUBLIC_ONBOARDING_RATE_WINDOW_MS
    delete process.env.PUBLIC_ONBOARDING_RATE_MAX
    delete process.env.PUBLIC_TOKEN_RATE_WINDOW_MS
    delete process.env.PUBLIC_TOKEN_RATE_MAX
  })

  afterEach(() => {
    rmSync(dataPath, { force: true })
    delete process.env.JWT_PUBLIC_KEY
    delete process.env.JWT_ALGORITHM
    delete process.env.JWT_ISSUER
    delete process.env.JWT_AUDIENCE
    delete process.env.APP_ORIGIN
    delete process.env.GOOGLE_ACCESS_TOKEN
    delete process.env.GOOGLE_ACCOUNT_ID
    delete process.env.GOOGLE_LOCATION_ID
    delete process.env.PUBLIC_ONBOARDING_RATE_WINDOW_MS
    delete process.env.PUBLIC_ONBOARDING_RATE_MAX
    delete process.env.PUBLIC_TOKEN_RATE_WINDOW_MS
    delete process.env.PUBLIC_TOKEN_RATE_MAX
    delete process.env.LOCAL_GROWTH_ALLOW_HEADER_AUTH
    delete process.env.NODE_ENV
  })

  it('reports health without requiring an API key', async () => {
    const response = await request(testApp()).get('/api/health').expect(200)

    expect(response.body.ok).toBe(true)
    expect(response.body.service).toBe('local-growth-os-api')
  })

  it('reports fail-closed integration readiness', async () => {
    const response = await request(testApp()).get('/api/integrations').expect(200)

    expect(response.body.integrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'stripe', configured: false, requiredForRevenue: true }),
        expect.objectContaining({ key: 'database', configured: false, requiredForRevenue: true }),
        expect.objectContaining({ key: 'google_business_profile', configured: false }),
      ]),
    )
  })

  it('returns monetization plans for both selected products', async () => {
    const response = await request(testApp()).get('/api/plans').expect(200)

    expect(response.body.plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'bidflow-growth', monthlyPrice: 149 }),
        expect.objectContaining({ id: 'reputeloop-growth', monthlyPrice: 99 }),
      ]),
    )
  })

  it('generates a revenue pack through the API boundary', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    const leadId = workspace.body.leads[0].id

    const response = await request(app).post(`/api/leads/${leadId}/revenue-pack`).expect(200)

    expect(response.body.estimates[0].leadId).toBe(leadId)
    expect(response.body.proposals[0].leadId).toBe(leadId)
    expect(response.body.followUps.filter((item: { leadId: string }) => item.leadId === leadId)).toHaveLength(5)
    expect(response.body.auditLogs[0].action).toBe('generated_revenue_pack')
  })

  it('creates BidFlow recovery links and records public approval back to the revenue pack', async () => {
    process.env.APP_ORIGIN = 'https://app.example.com'
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    const lead = workspace.body.leads[0]
    const estimate = workspace.body.estimates.find((item: { leadId: string }) => item.leadId === lead.id)
    const proposal = workspace.body.proposals.find((item: { leadId: string }) => item.leadId === lead.id)

    const created = await request(app)
      .post('/api/recovery-links')
      .send({ sourceType: 'lead', sourceId: lead.id, createdBy: 'rep@example.com' })
      .expect(201)

    expect(created.body.publicUrl).toBe(`https://app.example.com/recovery/${created.body.link.token}`)
    expect(created.body.link).toMatchObject({
      product: 'bidflow',
      sourceType: 'lead',
      sourceId: lead.id,
      status: 'created',
      createdBy: 'rep@example.com',
      valueCents: Math.round(estimate.total * 100),
    })
    expect(created.body.workspace.auditLogs[0]).toMatchObject({
      action: 'revenue_recovery_link_created',
      entityType: 'revenue_recovery_link',
      entityId: created.body.link.id,
    })

    const opened = await request(app).get(`/api/public/recovery-link/${created.body.link.token}`).expect(200)
    expect(opened.body.link).toMatchObject({
      id: created.body.link.id,
      product: 'bidflow',
      sourceType: 'lead',
      status: 'opened',
    })
    expect(opened.body.link).not.toHaveProperty('customerEmail')
    expect(opened.body.link).not.toHaveProperty('sourceId')

    const approved = await request(app)
      .post(`/api/public/recovery-link/${created.body.link.token}/respond`)
      .send({ action: 'approve', note: 'Looks good, please schedule it.', email: 'buyer@example.com' })
      .expect(200)

    expect(approved.body.link.status).toBe('accepted')

    const updated = await request(app).get('/api/workspace').expect(200)
    const link = updated.body.revenueRecoveryLinks.find((item: { id: string }) => item.id === created.body.link.id)
    expect(link).toMatchObject({
      status: 'accepted',
      responseAction: 'approve',
      responseNote: 'Looks good, please schedule it.',
      responseEmail: 'buyer@example.com',
    })
    expect(link.openedAt).toEqual(expect.any(String))
    expect(link.respondedAt).toEqual(expect.any(String))
    expect(updated.body.leads.find((item: { id: string }) => item.id === lead.id)).toMatchObject({
      status: 'won',
      nextStep: 'Customer approved the recovery link; schedule work and collect payment/deposit.',
    })
    expect(updated.body.estimates.find((item: { id: string }) => item.id === estimate.id)).toMatchObject({ status: 'accepted' })
    expect(updated.body.proposals.find((item: { id: string }) => item.id === proposal.id)).toMatchObject({ status: 'approved' })
    expect(updated.body.auditLogs[0]).toMatchObject({
      action: 'revenue_recovery_link_responded',
      actor: 'Revenue Recovery Link',
      entityId: created.body.link.id,
    })

    await request(app)
      .post(`/api/public/recovery-link/${created.body.link.token}/respond`)
      .send({ action: 'decline' })
      .expect(409)
  })

  it('creates ReputeLoop recovery links and routes callback requests to the case ledger', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    const caseItem = workspace.body.feedbackCases[0]
    const offer = workspace.body.recoveryOffers.find((item: { feedbackCaseId: string }) => item.feedbackCaseId === caseItem.id)

    const created = await request(app)
      .post('/api/recovery-links')
      .send({ sourceType: 'feedback_case', sourceId: caseItem.id, createdBy: 'manager@example.com' })
      .expect(201)

    expect(created.body.link).toMatchObject({
      product: 'reputeloop',
      sourceType: 'feedback_case',
      sourceId: caseItem.id,
      status: 'created',
      createdBy: 'manager@example.com',
      valueCents: Math.round(Math.max(0, offer.value) * 100),
    })

    const callback = await request(app)
      .post(`/api/public/recovery-link/${created.body.link.token}/respond`)
      .send({ action: 'schedule_callback', note: 'Please call after 3pm.' })
      .expect(200)

    expect(callback.body.link.status).toBe('callback_requested')

    const updated = await request(app).get('/api/workspace').expect(200)
    expect(updated.body.revenueRecoveryLinks.find((item: { id: string }) => item.id === created.body.link.id)).toMatchObject({
      status: 'callback_requested',
      responseAction: 'schedule_callback',
      responseNote: 'Please call after 3pm.',
    })
    expect(updated.body.feedbackCases.find((item: { id: string }) => item.id === caseItem.id)).toMatchObject({
      status: 'waiting_customer',
    })
    expect(updated.body.recoveryOffers.find((item: { id: string }) => item.id === offer.id)).toMatchObject({ status: 'sent' })
  })

  it('rate limits repeated public recovery link token requests', async () => {
    process.env.PUBLIC_TOKEN_RATE_WINDOW_MS = '60000'
    process.env.PUBLIC_TOKEN_RATE_MAX = '2'
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    const caseItem = workspace.body.feedbackCases[0]

    const created = await request(app)
      .post('/api/recovery-links')
      .send({ sourceType: 'feedback_case', sourceId: caseItem.id, createdBy: 'manager@example.com' })
      .expect(201)

    await request(app).get(`/api/public/recovery-link/${created.body.link.token}`).expect(200)
    await request(app).get(`/api/public/recovery-link/${created.body.link.token}`).expect(200)
    const limited = await request(app).get(`/api/public/recovery-link/${created.body.link.token}`).expect(429)
    expect(limited.body.error).toBe('public_recovery_link_rate_limited')
  })

  it('requires a generated revenue pack before creating lead recovery links', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    const lead = workspace.body.leads[0]
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        estimates: workspace.body.estimates.filter((item: { leadId: string }) => item.leadId !== lead.id),
        proposals: workspace.body.proposals.filter((item: { leadId: string }) => item.leadId !== lead.id),
      })
      .expect(200)

    const response = await request(app).post('/api/recovery-links').send({ sourceType: 'lead', sourceId: lead.id }).expect(409)

    expect(response.body.error).toBe('revenue_pack_required')
  })

  it('returns current subscriptions', async () => {
    const response = await request(testApp()).get('/api/subscriptions').expect(200)

    expect(response.body.subscriptions).toEqual([])
  })

  it('returns current paid pilot onboarding records', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_sub_route',
            organizationId: workspace.body.business.id,
            businessName: 'Route Test Roofing',
            ownerEmail: 'owner@route.example',
            product: 'bidflow',
            planId: 'bidflow-growth',
            status: 'workspace_activated',
            stripeCustomerId: 'cus_route',
            stripeSubscriptionId: 'sub_route',
            checklist: [
              { key: 'payment_received', label: 'Payment received through Stripe', done: true },
              { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: false },
            ],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const response = await request(app).get('/api/onboarding').expect(200)

    expect(response.body.onboarding).toEqual([
      expect.objectContaining({
        businessName: 'Route Test Roofing',
        ownerEmail: 'owner@route.example',
        planId: 'bidflow-growth',
        status: 'workspace_activated',
      }),
    ])
  })

  it('updates onboarding checklist items and advances activation status', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    const checklist = [
      { key: 'payment_received', label: 'Payment received through Stripe', done: true },
      { key: 'workspace_activated', label: 'Workspace activated', done: true },
      { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: false },
      { key: 'first_revenue_pack_sent', label: 'Send first approved revenue pack', done: false },
    ]
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_progress',
            organizationId: workspace.body.business.id,
            businessName: 'Progress Roofing',
            ownerEmail: 'owner@progress.example',
            product: 'bidflow',
            planId: 'bidflow-growth',
            status: 'workspace_activated',
            checklist,
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const imported = await request(app)
      .patch('/api/onboarding/onboarding_progress/checklist/customer_materials_submitted')
      .send({ done: true })
      .expect(200)

    expect(imported.body.record).toMatchObject({
      id: 'onboarding_progress',
      status: 'materials_submitted',
      checklist: expect.arrayContaining([expect.objectContaining({ key: 'customer_materials_submitted', done: true })]),
    })

    const ready = await request(app)
      .patch('/api/onboarding/onboarding_progress/checklist/first_revenue_pack_sent')
      .send({ done: true })
      .expect(200)

    expect(ready.body.record).toMatchObject({
      status: 'ready_for_pilot',
      checklist: expect.arrayContaining([expect.objectContaining({ key: 'first_revenue_pack_sent', done: true })]),
    })
    expect(ready.body.workspace.auditLogs[0]).toMatchObject({
      action: 'onboarding_checklist_updated',
      entityId: 'onboarding_progress',
    })
  })

  it('keeps legacy customer data checklist records compatible', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_legacy_data_key',
            organizationId: workspace.body.business.id,
            businessName: 'Legacy Materials HVAC',
            ownerEmail: 'owner@legacy.example',
            product: 'reputeloop',
            planId: 'reputeloop-growth',
            status: 'workspace_activated',
            customerAccessToken: 'legacy_materials_token',
            checklist: [
              { key: 'payment_received', label: 'Payment received through Stripe', done: true },
              { key: 'workspace_activated', label: 'Workspace activated', done: true },
              { key: 'customer_data_imported', label: 'Import customer leads or reviews', done: false },
            ],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const submitted = await request(app)
      .post('/api/public/onboarding/legacy_materials_token/submissions')
      .send({
        submittedByEmail: 'owner@legacy.example',
        materialType: 'general_notes',
        title: 'Legacy setup notes',
        body: 'Access details will be shared on the pilot call.',
      })
      .expect(201)

    expect(submitted.body.record).toMatchObject({
      id: 'onboarding_legacy_data_key',
      status: 'ready_for_pilot',
      checklist: expect.arrayContaining([expect.objectContaining({ key: 'customer_data_imported', done: true })]),
    })
  })

  it('allows customer token access to one onboarding record without workspace credentials', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_customer_token',
            organizationId: workspace.body.business.id,
            businessName: 'Customer Token Roofing',
            ownerEmail: 'owner@token.example',
            product: 'bidflow',
            planId: 'bidflow-growth',
            status: 'workspace_activated',
            customerAccessToken: 'customer_token_123',
            checklist: [
              { key: 'payment_received', label: 'Payment received through Stripe', done: true },
              { key: 'workspace_activated', label: 'Workspace activated', done: true },
              { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: false },
              { key: 'first_response_pack_approved', label: 'Approve first compliant response pack', done: false },
            ],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
          {
            id: 'onboarding_other_customer',
            organizationId: workspace.body.business.id,
            businessName: 'Other Customer',
            ownerEmail: 'owner@other.example',
            product: 'reputeloop',
            planId: 'reputeloop-growth',
            status: 'workspace_activated',
            customerAccessToken: 'customer_token_other',
            checklist: [],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const read = await request(app).get('/api/public/onboarding/customer_token_123').expect(200)
    expect(read.body.record).toMatchObject({
      id: 'onboarding_customer_token',
      businessName: 'Customer Token Roofing',
    })
    expect(read.body.record.customerAccessToken).toBeUndefined()
    expect(read.body.record.stripeCustomerId).toBeUndefined()
    expect(read.body.record.stripeSubscriptionId).toBeUndefined()
    expect(read.body.submissions).toEqual([])

    const updated = await request(app)
      .patch('/api/public/onboarding/customer_token_123/checklist/customer_materials_submitted')
      .send({ done: true })
      .expect(200)
    expect(updated.body.record).toMatchObject({
      id: 'onboarding_customer_token',
      status: 'materials_submitted',
      checklist: expect.arrayContaining([expect.objectContaining({ key: 'customer_materials_submitted', done: true })]),
    })

    const blocked = await request(app)
      .patch('/api/public/onboarding/customer_token_123/checklist/payment_received')
      .send({ done: false })
      .expect(403)
    expect(blocked.body.error).toBe('onboarding_item_not_customer_editable')

    const deliveryBlocked = await request(app)
      .patch('/api/public/onboarding/customer_token_123/checklist/first_response_pack_approved')
      .send({ done: true })
      .expect(403)
    expect(deliveryBlocked.body.error).toBe('onboarding_item_not_customer_editable')

    const fullWorkspace = await request(app).get('/api/workspace').expect(200)
    expect(fullWorkspace.body.auditLogs[0]).toMatchObject({
      action: 'customer_onboarding_checklist_updated',
      actor: 'Customer Onboarding',
      entityId: 'onboarding_customer_token',
    })
    expect(fullWorkspace.body.onboarding.find((item: { id: string }) => item.id === 'onboarding_other_customer')).toMatchObject({
      businessName: 'Other Customer',
    })
  })

  it('accepts customer onboarding materials through a public token without importing records', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_materials',
            organizationId: workspace.body.business.id,
            businessName: 'Materials Roofing',
            ownerEmail: 'owner@materials.example',
            product: 'bidflow',
            planId: 'bidflow-growth',
            status: 'workspace_activated',
            customerAccessToken: 'materials_token_123',
            checklist: [
              { key: 'payment_received', label: 'Payment received through Stripe', done: true },
              { key: 'workspace_activated', label: 'Workspace activated', done: true },
              { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: false },
              { key: 'first_revenue_pack_sent', label: 'Send first approved revenue pack', done: false },
            ],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const before = await request(app).get('/api/workspace').expect(200)
    const submitted = await request(app)
      .post('/api/public/onboarding/materials_token_123/submissions')
      .send({
        submittedByEmail: 'Owner@Materials.Example',
        materialType: 'lead_csv',
        title: 'June lead export',
        body: 'customer_name,email,phone,service_category,description\nAda,ada@example.com,5551112222,Roof repair,Leaking attic',
      })
      .expect(201)

    expect(submitted.body.record).toMatchObject({
      id: 'onboarding_materials',
      status: 'materials_submitted',
      checklist: expect.arrayContaining([expect.objectContaining({ key: 'customer_materials_submitted', done: true })]),
    })
    expect(submitted.body.record.customerAccessToken).toBeUndefined()
    expect(submitted.body.submission).toMatchObject({
      onboardingId: 'onboarding_materials',
      submittedByEmail: 'owner@materials.example',
      materialType: 'lead_csv',
      title: 'June lead export',
      status: 'submitted',
    })
    expect(submitted.body.submission.body).toBeUndefined()
    expect(submitted.body.submissions).toEqual([
      expect.objectContaining({
        id: submitted.body.submission.id,
        title: 'June lead export',
        status: 'submitted',
      }),
    ])

    const after = await request(app).get('/api/workspace').expect(200)
    expect(after.body.leads).toHaveLength(before.body.leads.length)
    expect(after.body.onboardingSubmissions).toHaveLength(1)
    expect(after.body.auditLogs[0]).toMatchObject({
      action: 'customer_onboarding_materials_submitted',
      actor: 'Customer Onboarding',
      entityType: 'onboarding_submission',
    })

    const publicRead = await request(app).get('/api/public/onboarding/materials_token_123').expect(200)
    expect(publicRead.body.submissions).toEqual([
      expect.objectContaining({
        id: submitted.body.submission.id,
        materialType: 'lead_csv',
        title: 'June lead export',
      }),
    ])
    expect(publicRead.body.submissions[0].body).toBeUndefined()
  })

  it('rate limits repeated public onboarding token requests', async () => {
    process.env.PUBLIC_ONBOARDING_RATE_WINDOW_MS = '60000'
    process.env.PUBLIC_ONBOARDING_RATE_MAX = '2'
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_rate_limit',
            organizationId: workspace.body.business.id,
            businessName: 'Rate Limit Plumbing',
            ownerEmail: 'owner@ratelimit.example',
            product: 'bidflow',
            planId: 'bidflow-growth',
            status: 'workspace_activated',
            customerAccessToken: 'rate_limit_token',
            checklist: [
              { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: false },
              { key: 'lead_pipeline_reviewed', label: 'Review first lead pipeline and quote workflow', done: false },
              { key: 'first_revenue_pack_sent', label: 'Send first approved revenue pack', done: false },
            ],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    await request(app).get('/api/public/onboarding/rate_limit_token').expect(200)
    await request(app).get('/api/public/onboarding/rate_limit_token').expect(200)
    const limited = await request(app).get('/api/public/onboarding/rate_limit_token').expect(429)
    expect(limited.body.error).toBe('public_onboarding_rate_limited')
  })

  it('validates and lets operators update onboarding submission status', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_submission_review',
            organizationId: workspace.body.business.id,
            businessName: 'Submission Review HVAC',
            ownerEmail: 'owner@review.example',
            product: 'reputeloop',
            planId: 'reputeloop-growth',
            status: 'workspace_activated',
            customerAccessToken: 'review_submission_token',
            checklist: [
              { key: 'payment_received', label: 'Payment received through Stripe', done: true },
              { key: 'workspace_activated', label: 'Workspace activated', done: true },
              { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: false },
            ],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const invalid = await request(app)
      .post('/api/public/onboarding/review_submission_token/submissions')
      .send({ submittedByEmail: 'owner@review.example', materialType: 'unknown', title: 'Bad', body: 'Nope' })
      .expect(400)
    expect(invalid.body.error).toBe('onboarding_submission_material_type_invalid')

    const submitted = await request(app)
      .post('/api/public/onboarding/review_submission_token/submissions')
      .send({
        submittedByEmail: 'owner@review.example',
        materialType: 'review_csv',
        title: 'Google reviews export',
        body: 'reviewer_name,email,platform,rating,body\nAda,ada@example.com,google,5,Great service',
      })
      .expect(201)

    const list = await request(app).get('/api/onboarding/submissions').expect(200)
    expect(list.body.submissions).toEqual([
      expect.objectContaining({
        id: submitted.body.submission.id,
        status: 'submitted',
        materialType: 'review_csv',
      }),
    ])

    const reviewed = await request(app)
      .patch(`/api/onboarding/submissions/${submitted.body.submission.id}`)
      .send({ status: 'reviewed' })
      .expect(200)
    expect(reviewed.body.submission).toMatchObject({ id: submitted.body.submission.id, status: 'reviewed' })
    expect(reviewed.body.workspace.auditLogs[0]).toMatchObject({
      action: 'onboarding_submission_status_updated',
      entityId: submitted.body.submission.id,
    })
  })

  it('previews and imports onboarding lead submissions only after operator action', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_import_leads',
            organizationId: workspace.body.business.id,
            businessName: 'Import Leads Roofing',
            ownerEmail: 'owner@importleads.example',
            product: 'bidflow',
            planId: 'bidflow-growth',
            status: 'workspace_activated',
            customerAccessToken: 'import_leads_token',
            checklist: [
              { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: false },
              { key: 'lead_pipeline_reviewed', label: 'Review first lead pipeline and quote workflow', done: false },
              { key: 'first_revenue_pack_sent', label: 'Send first approved revenue pack', done: false },
            ],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const submitted = await request(app)
      .post('/api/public/onboarding/import_leads_token/submissions')
      .send({
        submittedByEmail: 'owner@importleads.example',
        materialType: 'lead_csv',
        title: 'Qualified roof leads',
        body: 'customer_name,email,phone,service_category,description,budget_min,budget_max\nAda Lead,ada.lead@example.com,5551112222,Roof repair,Leaking attic after storm,900,2400',
      })
      .expect(201)
    const beforeImport = await request(app).get('/api/workspace').expect(200)

    const preview = await request(app)
      .post(`/api/onboarding/submissions/${submitted.body.submission.id}/preview`)
      .send({})
      .expect(200)
    expect(preview.body).toMatchObject({ imported: 1, skipped: 0, errors: [], writable: true })
    expect((await request(app).get('/api/workspace').expect(200)).body.leads).toHaveLength(beforeImport.body.leads.length)

    const imported = await request(app)
      .post(`/api/onboarding/submissions/${submitted.body.submission.id}/import`)
      .send({})
      .expect(200)
    expect(imported.body).toMatchObject({ imported: 1, skipped: 0, errors: [] })
    expect(imported.body.submission).toMatchObject({ id: submitted.body.submission.id, status: 'imported' })
    expect(imported.body.workspace.leads).toHaveLength(beforeImport.body.leads.length + 1)
    expect(imported.body.workspace.auditLogs[0]).toMatchObject({
      action: 'onboarding_submission_imported',
      entityId: submitted.body.submission.id,
    })

    const firstPack = await request(app)
      .post(`/api/onboarding/submissions/${submitted.body.submission.id}/first-pack`)
      .send({})
      .expect(200)
    const importedLeadId = imported.body.submission.importedRecordIds[0]
    expect(firstPack.body.record).toMatchObject({
      id: 'onboarding_import_leads',
      status: 'ready_for_pilot',
      checklist: expect.arrayContaining([
        expect.objectContaining({ key: 'lead_pipeline_reviewed', done: true }),
        expect.objectContaining({ key: 'first_revenue_pack_sent', done: true }),
      ]),
    })
    expect(firstPack.body.workspace.estimates[0]).toMatchObject({ leadId: importedLeadId })
    expect(firstPack.body.workspace.proposals[0]).toMatchObject({ leadId: importedLeadId })
    expect(firstPack.body.workspace.auditLogs[0]).toMatchObject({
      action: 'onboarding_first_pack_generated',
      entityId: submitted.body.submission.id,
    })

    const delivery = await request(app)
      .get(`/api/onboarding/submissions/${submitted.body.submission.id}/delivery-pack`)
      .expect(200)
    expect(delivery.body.filename).toContain('revenue-pack.md')
    expect(delivery.body.content).toContain('## Estimate')
    expect(delivery.body.content).toContain('Ada Lead')
  })

  it('generates first response packs from imported onboarding review submissions', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_import_reviews',
            organizationId: workspace.body.business.id,
            businessName: 'Import Reviews HVAC',
            ownerEmail: 'owner@importreviews.example',
            product: 'reputeloop',
            planId: 'reputeloop-growth',
            status: 'workspace_activated',
            customerAccessToken: 'import_reviews_token',
            checklist: [
              { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: true },
              { key: 'review_queue_reviewed', label: 'Review first reputation risk queue', done: false },
              { key: 'first_response_pack_approved', label: 'Approve first compliant response pack', done: false },
            ],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const submitted = await request(app)
      .post('/api/public/onboarding/import_reviews_token/submissions')
      .send({
        submittedByEmail: 'owner@importreviews.example',
        materialType: 'review_csv',
        title: 'Recent Google reviews',
        body: 'reviewer_name,email,platform,rating,body\nAda Review,ada.review@example.com,google,2,The team missed the appointment window and I need help.',
      })
      .expect(201)

    const imported = await request(app)
      .post(`/api/onboarding/submissions/${submitted.body.submission.id}/import`)
      .send({})
      .expect(200)
    const importedReviewId = imported.body.submission.importedRecordIds[0]

    const firstPack = await request(app)
      .post(`/api/onboarding/submissions/${submitted.body.submission.id}/first-pack`)
      .send({})
      .expect(200)
    expect(firstPack.body.record).toMatchObject({
      id: 'onboarding_import_reviews',
      status: 'ready_for_pilot',
      checklist: expect.arrayContaining([
        expect.objectContaining({ key: 'review_queue_reviewed', done: true }),
        expect.objectContaining({ key: 'first_response_pack_approved', done: true }),
      ]),
    })
    expect(firstPack.body.workspace.reviewResponses[0]).toMatchObject({ reviewId: importedReviewId })
    expect(firstPack.body.workspace.feedbackCases[0]).toMatchObject({ reviewId: importedReviewId })
    expect(firstPack.body.workspace.auditLogs[0]).toMatchObject({
      action: 'onboarding_first_pack_generated',
      entityId: submitted.body.submission.id,
    })

    const delivery = await request(app)
      .get(`/api/onboarding/submissions/${submitted.body.submission.id}/delivery-pack`)
      .expect(200)
    expect(delivery.body.filename).toContain('recovery-pack.md')
    expect(delivery.body.content).toContain('## Public Reply Draft')
    expect(delivery.body.content).toContain('## Compliance Notes')
  })

  it('rejects onboarding submission import when preview has errors or notes are submitted', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_import_errors',
            organizationId: workspace.body.business.id,
            businessName: 'Import Errors HVAC',
            ownerEmail: 'owner@importerrors.example',
            product: 'reputeloop',
            planId: 'reputeloop-growth',
            status: 'workspace_activated',
            customerAccessToken: 'import_errors_token',
            checklist: [{ key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: false }],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const invalidCsv = await request(app)
      .post('/api/public/onboarding/import_errors_token/submissions')
      .send({
        submittedByEmail: 'owner@importerrors.example',
        materialType: 'review_csv',
        title: 'Broken reviews',
        body: 'reviewer_name,email,platform,rating,body\nAda,ada@example.com,google,9,Great service',
      })
      .expect(201)

    const preview = await request(app)
      .post(`/api/onboarding/submissions/${invalidCsv.body.submission.id}/preview`)
      .send({})
      .expect(200)
    expect(preview.body).toMatchObject({
      imported: 0,
      writable: false,
      errors: [expect.objectContaining({ row: 2, error: 'rating_must_be_1_to_5' })],
    })

    const rejectedImport = await request(app)
      .post(`/api/onboarding/submissions/${invalidCsv.body.submission.id}/import`)
      .send({})
      .expect(422)
    expect(rejectedImport.body.error).toBe('onboarding_submission_import_has_errors')

    const notes = await request(app)
      .post('/api/public/onboarding/import_errors_token/submissions')
      .send({
        submittedByEmail: 'owner@importerrors.example',
        materialType: 'general_notes',
        title: 'Access notes',
        body: 'Customer will send exports after the launch call.',
      })
      .expect(201)
    await request(app).post(`/api/onboarding/submissions/${notes.body.submission.id}/preview`).send({}).expect(400)
    await request(app).post(`/api/onboarding/submissions/${notes.body.submission.id}/import`).send({}).expect(400)
  })

  it('requires first pack generation before downloading onboarding delivery pack', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    const bareLead = {
      id: 'lead_imported_without_pack',
      customerId: workspace.body.customers[0].id,
      serviceCategory: 'Roof repair',
      description: 'Imported lead without generated delivery pack.',
      budgetMin: 500,
      budgetMax: 1500,
      urgency: 'normal',
      source: 'import',
      status: 'new',
      score: 40,
      nextStep: 'Review imported lead.',
      createdAt: '2026-06-10T00:00:00.000Z',
      locationFit: true,
      repeatCustomer: false,
    }
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        leads: [bareLead, ...workspace.body.leads],
        estimates: workspace.body.estimates.filter((item: { leadId: string }) => item.leadId !== bareLead.id),
        proposals: workspace.body.proposals.filter((item: { leadId: string }) => item.leadId !== bareLead.id),
        onboardingSubmissions: [
          {
            id: 'submission_without_pack',
            onboardingId: 'missing_pack_record',
            organizationId: workspace.body.business.id,
            submittedByEmail: 'owner@example.com',
            materialType: 'lead_csv',
            title: 'Imported but no pack',
            body: 'customer_name,description\nAda,Roof leak',
            status: 'imported',
            importedRecordIds: [bareLead.id],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const response = await request(app).get('/api/onboarding/submissions/submission_without_pack/delivery-pack').expect(409)
    expect(response.body.error).toBe('first_pack_not_generated')
  })

  it('tracks first-pack delivery QA, sending, and customer acceptance evidence', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_delivery_chain',
            organizationId: workspace.body.business.id,
            businessName: 'Delivery Chain Roofing',
            ownerEmail: 'owner@deliverychain.example',
            product: 'bidflow',
            planId: 'bidflow-growth',
            status: 'workspace_activated',
            customerAccessToken: 'delivery_chain_token',
            checklist: [
              { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: true },
              { key: 'lead_pipeline_reviewed', label: 'Review first lead pipeline and quote workflow', done: false },
              { key: 'first_revenue_pack_sent', label: 'Send first approved revenue pack', done: false },
            ],
            createdAt: '2026-06-10T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const listed = await request(app).get('/api/onboarding').expect(200)
    expect(listed.body.onboarding[0]).toMatchObject({
      deliveryOwnerEmail: 'owner@deliverychain.example',
      deliveryStatus: 'materials_waiting',
    })
    expect(listed.body.onboarding[0].deliverySlaDueAt).toEqual(expect.any(String))

    const submitted = await request(app)
      .post('/api/public/onboarding/delivery_chain_token/submissions')
      .send({
        submittedByEmail: 'owner@deliverychain.example',
        materialType: 'lead_csv',
        title: 'Recent leads',
        body: 'customer_name,email,phone,service_category,description,budget_min,budget_max,urgency,source\nAda Lead,ada.delivery@example.com,+15125550111,Roof repair,Leak over kitchen,700,2500,high,website',
      })
      .expect(201)
    await request(app).post(`/api/onboarding/submissions/${submitted.body.submission.id}/import`).send({}).expect(200)

    const firstPack = await request(app)
      .post(`/api/onboarding/submissions/${submitted.body.submission.id}/first-pack`)
      .send({})
      .expect(200)
    expect(firstPack.body.record).toMatchObject({
      deliveryStatus: 'pack_ready',
      deliveryPackSummary: 'First BidFlow revenue pack generated and waiting for QA approval.',
    })

    const sentWithoutQa = await request(app)
      .patch('/api/onboarding/onboarding_delivery_chain/delivery')
      .send({
        deliveryStatus: 'sent',
        deliveryPackSentBy: 'ops@example.com',
        deliveryPackSummary: 'Sent first revenue pack to the customer.',
      })
      .expect(409)
    expect(sentWithoutQa.body.error).toBe('delivery_qa_approval_required')

    const qa = await request(app)
      .patch('/api/onboarding/onboarding_delivery_chain/delivery')
      .send({
        deliveryStatus: 'qa_approved',
        deliveryQaApprovedBy: 'qa@example.com',
        deliveryQaNotes: 'Estimate, scope, and follow-up language passed QA.',
      })
      .expect(200)
    expect(qa.body.record).toMatchObject({
      deliveryStatus: 'qa_approved',
      deliveryQaApprovedBy: 'qa@example.com',
      deliveryQaNotes: 'Estimate, scope, and follow-up language passed QA.',
    })
    expect(qa.body.workspace.auditLogs[0]).toMatchObject({ action: 'onboarding_delivery_qa_approved' })

    const sent = await request(app)
      .patch('/api/onboarding/onboarding_delivery_chain/delivery')
      .send({
        deliveryStatus: 'sent',
        deliveryPackSentBy: 'ops@example.com',
        deliveryPackSummary: 'Sent first revenue pack to the customer for approval.',
        renewalEvidenceSummary: 'First pack sent; waiting for customer acceptance before renewal ask.',
      })
      .expect(200)
    expect(sent.body.record).toMatchObject({
      deliveryStatus: 'sent',
      deliveryPackSentBy: 'ops@example.com',
      deliveryPackSummary: 'Sent first revenue pack to the customer for approval.',
      renewalEvidenceSummary: 'First pack sent; waiting for customer acceptance before renewal ask.',
    })
    expect(sent.body.record.deliveryPackSentAt).toEqual(expect.any(String))
    expect(sent.body.workspace.auditLogs[0]).toMatchObject({ action: 'onboarding_delivery_sent' })

    const publicRead = await request(app).get('/api/public/onboarding/delivery_chain_token').expect(200)
    expect(publicRead.body.record).toMatchObject({
      deliveryStatus: 'sent',
      deliveryQaApprovedBy: 'qa@example.com',
      deliveryPackSentBy: 'ops@example.com',
    })
    expect(publicRead.body.record.customerAccessToken).toBeUndefined()
    expect(publicRead.body.record.stripeCustomerId).toBeUndefined()

    const accepted = await request(app)
      .post('/api/public/onboarding/delivery_chain_token/delivery-confirmation')
      .send({
        response: 'accept',
        confirmedByEmail: 'owner@deliverychain.example',
        note: 'Accepted. Please continue with the next quote follow-up.',
      })
      .expect(200)
    expect(accepted.body.record).toMatchObject({
      deliveryStatus: 'customer_confirmed',
      customerDeliveryResponse: 'accept',
      customerConfirmedByEmail: 'owner@deliverychain.example',
      customerConfirmationNote: 'Accepted. Please continue with the next quote follow-up.',
    })
    expect(accepted.body.record.customerConfirmedAt).toEqual(expect.any(String))
    expect(accepted.body.record.renewalEvidenceSummary).toContain('Customer confirmed first delivery pack')

    const updated = await request(app).get('/api/workspace').expect(200)
    expect(updated.body.auditLogs[0]).toMatchObject({
      action: 'customer_delivery_response_recorded',
      actor: 'Customer Onboarding',
    })

    await request(app)
      .post('/api/public/onboarding/delivery_chain_token/delivery-confirmation')
      .send({ response: 'schedule_call', confirmedByEmail: 'owner@deliverychain.example' })
      .expect(409)
  })

  it('records paid pilot outcomes as renewal evidence', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        onboarding: [
          {
            id: 'onboarding_outcome',
            organizationId: workspace.body.business.id,
            businessName: 'Outcome Roofing',
            ownerEmail: 'owner@outcome.example',
            product: 'bidflow',
            planId: 'bidflow-growth',
            status: 'ready_for_pilot',
            checklist: [
              { key: 'payment_received', label: 'Payment received through Stripe', done: true },
              { key: 'workspace_activated', label: 'Workspace activated', done: true },
              { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: true },
              { key: 'lead_pipeline_reviewed', label: 'Review first lead pipeline and quote workflow', done: true },
              { key: 'first_revenue_pack_sent', label: 'Send first approved revenue pack', done: true },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })
      .expect(200)

    const invalid = await request(app)
      .post('/api/onboarding/onboarding_outcome/outcomes')
      .send({ outcomeType: 'won_job', outcomeValue: 1800, evidence: 'short', nextAction: 'renew', recordedBy: 'bad' })
      .expect(400)

    const created = await request(app)
      .post('/api/onboarding/onboarding_outcome/outcomes')
      .send({
        outcomeType: 'won_job',
        outcomeValue: 1800,
        evidence: 'Customer approved the first proposal and booked the roof repair.',
        nextAction: 'Ask for renewal and case study after job completion.',
        recordedBy: 'operator@example.com',
      })
      .expect(201)

    const list = await request(app).get('/api/pilot-outcomes').expect(200)
    const after = await request(app).get('/api/workspace').expect(200)

    expect(invalid.body.error).toBe('pilot_outcome_evidence_required')
    expect(created.body.outcome).toMatchObject({
      onboardingId: 'onboarding_outcome',
      product: 'bidflow',
      businessName: 'Outcome Roofing',
      outcomeType: 'won_job',
      outcomeValue: 1800,
      currency: 'USD',
      recordedBy: 'operator@example.com',
    })
    expect(list.body.outcomes).toHaveLength(1)
    expect(after.body.auditLogs[0]).toMatchObject({
      action: 'pilot_outcome_recorded',
      entityType: 'pilot_outcome',
    })
  })

  it('creates a Stripe portal session for the current workspace subscription customer', async () => {
    const portalCalls: Array<{ customerId: string; returnUrl: string }> = []
    const app = testApp({
      createCustomerPortalSession: async ({ customerId, returnUrl }) => {
        portalCalls.push({ customerId, returnUrl })
        return { ok: true, status: 200, sessionId: 'bps_api_123', url: 'https://billing.stripe.test/session' }
      },
    })
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        subscriptions: [
          {
            id: 'sub_local',
            organizationId: workspace.body.business.id,
            product: 'bidflow',
            planId: 'bidflow-growth',
            stripeCustomerId: 'cus_workspace',
            stripeSubscriptionId: 'sub_workspace',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })
      .expect(200)

    const response = await request(app)
      .post('/api/billing/portal')
      .send({ subscriptionId: 'sub_local', returnUrl: 'https://example.com/account' })
      .expect(200)

    expect(response.body).toMatchObject({
      sessionId: 'bps_api_123',
      url: 'https://billing.stripe.test/session',
      subscriptionId: 'sub_local',
      stripeCustomerId: 'cus_workspace',
    })
    expect(portalCalls).toEqual([{ customerId: 'cus_workspace', returnUrl: 'https://example.com/account' }])
  })

  it('fails closed for billing portal requests when no workspace subscription exists', async () => {
    const response = await request(testApp())
      .post('/api/billing/portal')
      .send({ returnUrl: 'https://example.com/account' })
      .expect(404)

    expect(response.body.error).toBe('subscription_customer_not_found')
  })

  it('does not create fake checkout sessions without Stripe configuration', async () => {
    const response = await request(testApp())
      .post('/api/billing/checkout')
      .send({ planId: 'bidflow-growth', successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel' })
      .expect(503)

    expect(response.body.error).toBe('stripe_not_configured')
    expect(response.body.missing).toContain('STRIPE_PRICE_BIDFLOW_GROWTH')
  })

  it('forwards the paid pilot business profile into checkout creation', async () => {
    const checkoutCalls: unknown[] = []
    process.env.APP_ORIGIN = 'https://app.example.com'
    const app = testApp({
      createCheckoutSession: async (input) => {
        checkoutCalls.push(input)
        return {
          ok: true,
          status: 200,
          sessionId: 'cs_route_profile',
          url: 'https://checkout.stripe.test/profile',
          plan: billingPlans.find((plan) => plan.id === input.planId) ?? billingPlans[0],
        }
      },
    })

    const response = await request(app)
      .post('/api/billing/checkout')
      .send({
        planId: 'reputeloop-growth',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
        customerEmail: 'owner@example.com',
        businessName: 'Parker Roof Co',
        businessWebsite: 'https://parker.example',
        businessCity: 'Austin',
        businessState: 'TX',
        industry: 'Roofing',
        pilotScopeAccepted: true,
        humanReviewAccepted: true,
        termsAccepted: true,
        privacyAccepted: true,
        refundPolicyAccepted: true,
      })
      .expect(200)

    expect(response.body).toMatchObject({
      sessionId: 'cs_route_profile',
      url: 'https://checkout.stripe.test/profile',
      plan: expect.objectContaining({ id: 'reputeloop-growth' }),
    })
    expect(checkoutCalls[0]).toMatchObject({
      planId: 'reputeloop-growth',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
      customerEmail: 'owner@example.com',
      organizationId: 'org_evergreen',
      userId: 'local-owner',
      businessName: 'Parker Roof Co',
      businessWebsite: 'https://parker.example',
      businessCity: 'Austin',
      businessState: 'TX',
      industry: 'Roofing',
    })
  })

  it('creates public paid-pilot checkout sessions without exposing workspace APIs', async () => {
    process.env.APP_ORIGIN = 'https://app.example.com'
    const checkoutCalls: unknown[] = []
    const app = testApp({
      createCheckoutSession: async (input) => {
        checkoutCalls.push(input)
        return {
          ok: true,
          status: 200,
          sessionId: 'cs_public_profile',
          url: 'https://checkout.stripe.test/public',
          plan: billingPlans.find((plan) => plan.id === input.planId) ?? billingPlans[0],
        }
      },
    })

    const response = await request(app)
      .post('/api/public/checkout')
      .send({
        planId: 'bidflow-growth',
        successUrl: 'https://app.example.com/buy?checkout=success',
        cancelUrl: 'https://app.example.com/buy?checkout=cancelled',
        customerEmail: 'owner@public.example',
        businessName: 'Public Checkout Roofing',
        businessWebsite: 'https://public.example',
        businessCity: 'Austin',
        businessState: 'TX',
        industry: 'Roofing',
        pilotScopeAccepted: true,
        humanReviewAccepted: true,
        termsAccepted: true,
        privacyAccepted: true,
        refundPolicyAccepted: true,
      })
      .expect(200)

    expect(response.body).toMatchObject({
      sessionId: 'cs_public_profile',
      url: 'https://checkout.stripe.test/public',
      plan: expect.objectContaining({ id: 'bidflow-growth' }),
    })
    expect(checkoutCalls[0]).toMatchObject({
      planId: 'bidflow-growth',
      customerEmail: 'owner@public.example',
      businessName: 'Public Checkout Roofing',
      pilotScopeAccepted: true,
      humanReviewAccepted: true,
      termsAccepted: true,
      privacyAccepted: true,
      refundPolicyAccepted: true,
      organizationId: 'org_evergreen',
      userId: 'public-checkout',
    })
  })

  it('requires scoped checkout handoffs for public checkout in production by default', async () => {
    process.env.NODE_ENV = 'production'
    process.env.APP_ORIGIN = 'https://app.example.com'
    const app = testApp({
      createCheckoutSession: async () => ({
        ok: true,
        status: 200,
        sessionId: 'cs_should_not_create',
        url: 'https://checkout.stripe.test/self-serve',
        plan: billingPlans[0],
      }),
    })

    const response = await request(app)
      .post('/api/public/checkout')
      .send({
        planId: 'bidflow-growth',
        successUrl: 'https://app.example.com/buy?checkout=success',
        cancelUrl: 'https://app.example.com/buy?checkout=cancelled',
        customerEmail: 'owner@public.example',
        businessName: 'Public Checkout Roofing',
        pilotScopeAccepted: true,
        humanReviewAccepted: true,
        termsAccepted: true,
        privacyAccepted: true,
        refundPolicyAccepted: true,
      })
      .expect(403)

    expect(response.body.error).toBe('public_self_serve_checkout_disabled')
  })

  it('creates prospect-specific checkout handoffs after scope approval', async () => {
    process.env.APP_ORIGIN = 'https://app.example.com'
    const app = testApp()
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,quote_leak_signal,average_job_value',
          'Handoff Roofing,owner@handoff.example,+15125550111,https://handoff.example,Austin,TX,Roofing,67,4.2,"estimate form has no follow-up timeline",2400',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id

    const premature = await request(app)
      .post(`/api/sales-prospects/${prospectId}/checkout-handoff`)
      .send({ createdBy: 'rep@example.com' })
      .expect(400)
    expect(premature.body.error).toBe('checkout_handoff_scope_required')

    await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'manual',
        outcome: 'scope_sent',
        summary: 'Sent paid pilot scope with clear operator-reviewed deliverables.',
        nextStep: 'Generate the checkout link after approval.',
        ownerEmail: 'rep@example.com',
      })
      .expect(201)

    const created = await request(app)
      .post(`/api/sales-prospects/${prospectId}/checkout-handoff`)
      .send({ createdBy: 'rep@example.com' })
      .expect(201)

    expect(created.body.handoff).toMatchObject({
      prospectId,
      businessName: 'Handoff Roofing',
      customerEmail: 'owner@handoff.example',
      product: 'bidflow',
      planId: 'bidflow-growth',
      status: 'sent',
      createdBy: 'rep@example.com',
      scopeSource: 'sales_activity',
      scopeSummary: expect.stringContaining('Sent paid pilot scope'),
    })
    expect(created.body.handoff.scopeAcceptedHash).toMatch(/^[a-f0-9]{24}$/)
    expect(created.body.handoff.expiresAt).toEqual(expect.any(String))
    expect(created.body.handoff.checkoutUrl).toContain('https://app.example.com/buy?handoff=')
    expect(created.body.activity).toMatchObject({ outcome: 'checkout_sent', channel: 'manual' })
    expect(created.body.prospect).toMatchObject({ status: 'checkout_sent', nextTouch: 'hold' })
    expect(created.body.workspace.auditLogs[0]).toMatchObject({
      action: 'sales_checkout_handoff_created',
      entityType: 'sales_checkout_handoff',
      entityId: created.body.handoff.id,
    })

    const list = await request(app).get(`/api/sales-prospects/${prospectId}/checkout-handoffs`).expect(200)
    expect(list.body.handoffs).toHaveLength(1)
    expect(list.body.handoffs[0].id).toBe(created.body.handoff.id)

    const orderForm = await request(app)
      .get(`/api/sales-prospects/${prospectId}/checkout-handoff/order-form?handoffId=${created.body.handoff.id}`)
      .expect(200)
    expect(orderForm.body.filename).toContain('handoff-roofing-paid-pilot-order-form.md')
    expect(orderForm.body.handoff.id).toBe(created.body.handoff.id)
    expect(orderForm.body.content).toContain('Paid Pilot Order Form')
    expect(orderForm.body.content).toContain('Prepared for: Handoff Roofing')
    expect(orderForm.body.content).toContain('Product: BidFlow Local')
    expect(orderForm.body.content).toContain('Setup fee: $499')
    expect(orderForm.body.content).toContain('Monthly subscription: $149 / month')
    expect(orderForm.body.content).toContain('First invoice target: $648')
    expect(orderForm.body.content).toContain(created.body.handoff.scopeAcceptedHash)
    expect(orderForm.body.content).toContain(created.body.handoff.checkoutUrl)
    expect(orderForm.body.content).toContain('Revenue is recognized only after Stripe webhook confirms paid.')
    expect(orderForm.body.content).toContain('No automated email, SMS, or Google Business Profile actions are promised')
    expect(orderForm.body.content).not.toContain(prospectId)
    expect(orderForm.body.content).not.toContain('org_evergreen')
    expect(orderForm.body.content).not.toContain('stripeCheckoutSessionId')
    expect(orderForm.body.content).not.toContain('stripeCustomerId')
    const workspaceAfterOrderForm = await request(app).get('/api/workspace').expect(200)
    expect(workspaceAfterOrderForm.body.auditLogs[0]).toMatchObject({ action: 'sales_checkout_handoff_created' })

    const publicRead = await request(app).get(`/api/public/checkout-handoff/${created.body.handoff.token}`).expect(200)
    expect(publicRead.body.handoff).toMatchObject({
      id: created.body.handoff.id,
      token: created.body.handoff.token,
      businessName: 'Handoff Roofing',
      planId: 'bidflow-growth',
      status: 'sent',
      expiresAt: created.body.handoff.expiresAt,
      scopeSummary: expect.stringContaining('Sent paid pilot scope'),
      scopeSource: 'sales_activity',
      scopeAcceptedHash: created.body.handoff.scopeAcceptedHash,
    })
    expect(publicRead.body.handoff.prospectId).toBeUndefined()
    expect(publicRead.body.handoff.checkoutUrl).toBeUndefined()

    const duplicate = await request(app)
      .post(`/api/sales-prospects/${prospectId}/checkout-handoff`)
      .send({ createdBy: 'rep@example.com' })
      .expect(409)
    expect(duplicate.body.error).toBe('checkout_handoff_already_active')
  })

  it('rate limits repeated public checkout handoff token requests', async () => {
    process.env.APP_ORIGIN = 'https://app.example.com'
    process.env.PUBLIC_TOKEN_RATE_WINDOW_MS = '60000'
    process.env.PUBLIC_TOKEN_RATE_MAX = '2'
    const app = testApp()
    const imported = await request(app)
      .post('/api/import/prospects')
      .type('text/csv')
      .send(
        [
          'business_name,owner_name,owner_email,website,city,state,industry,average_job_value,employee_count,google_review_count,average_rating,quote_leak_signal,recent_review_issue,notes',
          'Rate Limit Roofing,Rae,owner@ratelimitroof.example,https://ratelimitroof.example,Austin,TX,roofing,1250,12,80,4.6,Delayed callbacks,,',
        ].join('\n'),
      )
      .expect(200)
    const prospectId = imported.body.prospects[0].id
    await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'manual',
        outcome: 'scope_sent',
        summary: 'Sent paid pilot scope to owner.',
        nextStep: 'Generate checkout handoff.',
        ownerEmail: 'rep@example.com',
      })
      .expect(201)
    const created = await request(app)
      .post(`/api/sales-prospects/${prospectId}/checkout-handoff`)
      .send({ createdBy: 'rep@example.com' })
      .expect(201)

    await request(app).get(`/api/public/checkout-handoff/${created.body.handoff.token}`).expect(200)
    await request(app).get(`/api/public/checkout-handoff/${created.body.handoff.token}`).expect(200)
    const limited = await request(app).get(`/api/public/checkout-handoff/${created.body.handoff.token}`).expect(429)
    expect(limited.body.error).toBe('public_checkout_handoff_rate_limited')
  })

  it('creates public Stripe checkout sessions from prospect checkout handoffs', async () => {
    process.env.APP_ORIGIN = 'https://app.example.com'
    const checkoutCalls: unknown[] = []
    const app = testApp({
      createCheckoutSession: async (input) => {
        checkoutCalls.push(input)
        return {
          ok: true,
          status: 200,
          sessionId: 'cs_handoff_public',
          url: 'https://checkout.stripe.test/handoff',
          plan: billingPlans.find((plan) => plan.id === input.planId) ?? billingPlans[0],
        }
      },
    })
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,recent_review_issue,average_job_value',
          'Review Handoff,owner@review-handoff.example,+15125550112,https://review-handoff.example,Austin,TX,Restaurant,23,3.6,"unanswered reviews mention slow service",350',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id
    await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'manual',
        outcome: 'scope_sent',
        summary: 'Sent ReputeLoop pilot scope after owner review call.',
        nextStep: 'Send checkout handoff link.',
      })
      .expect(201)
    const handoffResponse = await request(app)
      .post(`/api/sales-prospects/${prospectId}/checkout-handoff`)
      .send({ createdBy: 'rep@example.com' })
      .expect(201)
    const handoff = handoffResponse.body.handoff

    const checkoutPayload = {
      planId: handoff.planId,
      successUrl: 'https://app.example.com/buy?checkout=success',
      cancelUrl: 'https://app.example.com/buy?checkout=cancelled',
      customerEmail: handoff.customerEmail,
      businessName: handoff.businessName,
      businessWebsite: handoff.businessWebsite,
      businessCity: handoff.businessCity,
      businessState: handoff.businessState,
      industry: handoff.industry,
      checkoutHandoffToken: handoff.token,
      pilotScopeAccepted: true,
      humanReviewAccepted: true,
      termsAccepted: true,
      privacyAccepted: true,
      refundPolicyAccepted: true,
    }

    const response = await request(app).post('/api/public/checkout').send(checkoutPayload).expect(200)

    expect(response.body).toMatchObject({
      sessionId: 'cs_handoff_public',
      url: 'https://checkout.stripe.test/handoff',
      plan: expect.objectContaining({ id: 'reputeloop-growth' }),
    })
    expect(checkoutCalls[0]).toMatchObject({
      planId: 'reputeloop-growth',
      customerEmail: 'owner@review-handoff.example',
      businessName: 'Review Handoff',
      prospectId,
      checkoutHandoffId: handoff.id,
      pilotScopeSummary: handoff.scopeSummary,
      pilotScopeHash: handoff.scopeAcceptedHash,
      organizationId: 'org_evergreen',
      userId: 'public-checkout',
      idempotencyKey: `checkout_handoff_${handoff.id}`,
    })
    const repeated = await request(app).post('/api/public/checkout').send(checkoutPayload).expect(200)
    expect(repeated.body).toMatchObject({
      sessionId: 'cs_handoff_public',
      url: 'https://checkout.stripe.test/handoff',
      plan: expect.objectContaining({ id: 'reputeloop-growth' }),
    })
    expect(checkoutCalls).toHaveLength(1)

    const workspace = await request(app).get('/api/workspace').expect(200)
    const savedHandoff = workspace.body.salesCheckoutHandoffs.find((item: { id: string }) => item.id === handoff.id)
    expect(savedHandoff).toMatchObject({
      checkoutUrl: handoff.checkoutUrl,
      stripeCheckoutSessionId: 'cs_handoff_public',
      stripeCheckoutUrl: 'https://checkout.stripe.test/handoff',
    })

    const mismatch = await request(app)
      .post('/api/public/checkout')
      .send({
        planId: handoff.planId,
        successUrl: 'https://app.example.com/buy?checkout=success',
        cancelUrl: 'https://app.example.com/buy?checkout=cancelled',
        customerEmail: handoff.customerEmail,
        businessName: 'Wrong Business',
        checkoutHandoffToken: handoff.token,
        pilotScopeAccepted: true,
        humanReviewAccepted: true,
        termsAccepted: true,
        privacyAccepted: true,
        refundPolicyAccepted: true,
      })
      .expect(409)
    expect(mismatch.body.error).toBe('checkout_handoff_profile_mismatch')
  })

  it('prevents concurrent public checkout session creation for the same handoff', async () => {
    process.env.APP_ORIGIN = 'https://app.example.com'
    const checkoutCalls: unknown[] = []
    let releaseCheckout!: () => void
    const checkoutGate = new Promise<void>((resolve) => {
      releaseCheckout = resolve
    })
    const app = testApp({
      createCheckoutSession: async (input) => {
        checkoutCalls.push(input)
        await checkoutGate
        return {
          ok: true,
          status: 200,
          sessionId: 'cs_handoff_concurrent',
          url: 'https://checkout.stripe.test/handoff-concurrent',
          plan: billingPlans.find((plan) => plan.id === input.planId) ?? billingPlans[0],
        }
      },
    })
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,recentReviewIssue,average_job_value',
          'Concurrent Handoff,owner@concurrent-handoff.example,+15125550113,https://concurrent-handoff.example,Austin,TX,Roofing,31,4.1,"slow estimates",1800',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id
    await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'manual',
        outcome: 'scope_sent',
        summary: 'Sent scoped paid pilot for concurrent checkout test.',
        nextStep: 'Send checkout handoff link.',
      })
      .expect(201)
    const handoff = (
      await request(app)
        .post(`/api/sales-prospects/${prospectId}/checkout-handoff`)
        .send({ createdBy: 'rep@example.com' })
        .expect(201)
    ).body.handoff
    const checkoutPayload = {
      planId: handoff.planId,
      successUrl: 'https://app.example.com/buy?checkout=success',
      cancelUrl: 'https://app.example.com/buy?checkout=cancelled',
      customerEmail: handoff.customerEmail,
      businessName: handoff.businessName,
      checkoutHandoffToken: handoff.token,
      pilotScopeAccepted: true,
      humanReviewAccepted: true,
      termsAccepted: true,
      privacyAccepted: true,
      refundPolicyAccepted: true,
    }

    const first = request(app).post('/api/public/checkout').send(checkoutPayload)
    const firstResponsePromise = first.then((response) => response)
    while (checkoutCalls.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const second = await request(app).post('/api/public/checkout').send(checkoutPayload).expect(409)
    releaseCheckout()
    const firstResponse = await firstResponsePromise
    expect(firstResponse.status).toBe(200)

    expect(second.body.error).toBe('checkout_handoff_checkout_in_progress')
    expect(firstResponse.body).toMatchObject({
      sessionId: 'cs_handoff_concurrent',
      url: 'https://checkout.stripe.test/handoff-concurrent',
    })
    expect(checkoutCalls).toHaveLength(1)
  })

  it('rejects expired checkout handoff lookup and public checkout', async () => {
    process.env.APP_ORIGIN = 'https://app.example.com'
    const checkoutCalls: unknown[] = []
    const app = testApp({
      createCheckoutSession: async (input) => {
        checkoutCalls.push(input)
        return {
          ok: true,
          status: 200,
          sessionId: 'cs_expired_handoff',
          url: 'https://checkout.stripe.test/expired',
          plan: billingPlans.find((plan) => plan.id === input.planId) ?? billingPlans[0],
        }
      },
    })
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        salesCheckoutHandoffs: [
          {
            id: 'handoff_expired',
            token: 'expired_handoff_token',
            prospectId: 'prospect_expired',
            organizationId: workspace.body.business.id,
            businessName: 'Expired Handoff Roofing',
            customerEmail: 'owner@expired-handoff.example',
            businessWebsite: 'https://expired-handoff.example',
            businessCity: 'Austin',
            businessState: 'TX',
            industry: 'Roofing',
            product: 'bidflow',
            planId: 'bidflow-growth',
            checkoutUrl: 'https://app.example.com/buy?handoff=expired_handoff_token',
            scopeSummary: 'Expired scoped BidFlow pilot.',
            scopeSource: 'prospect_notes',
            scopeAcceptedHash: 'hash_expired_scope',
            status: 'sent',
            createdBy: 'rep@example.com',
            expiresAt: '2026-01-01T00:00:00.000Z',
            sentAt: '2025-12-25T00:00:00.000Z',
            createdAt: '2025-12-25T00:00:00.000Z',
            updatedAt: '2025-12-25T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const lookup = await request(app).get('/api/public/checkout-handoff/expired_handoff_token').expect(410)
    expect(lookup.body.error).toBe('checkout_handoff_not_active')

    const checkout = await request(app)
      .post('/api/public/checkout')
      .send({
        planId: 'bidflow-growth',
        successUrl: 'https://app.example.com/buy?checkout=success',
        cancelUrl: 'https://app.example.com/buy?checkout=cancelled',
        customerEmail: 'owner@expired-handoff.example',
        businessName: 'Expired Handoff Roofing',
        checkoutHandoffToken: 'expired_handoff_token',
        pilotScopeAccepted: true,
        humanReviewAccepted: true,
        termsAccepted: true,
        privacyAccepted: true,
        refundPolicyAccepted: true,
      })
      .expect(410)
    expect(checkout.body.error).toBe('checkout_handoff_not_active')
    expect(checkoutCalls).toHaveLength(0)
  })

  it('validates public checkout required fields and return URL origin', async () => {
    process.env.APP_ORIGIN = 'https://app.example.com'
    const app = testApp()

    const missing = await request(app)
      .post('/api/public/checkout')
      .send({
        planId: 'bidflow-growth',
        successUrl: 'https://app.example.com/buy?checkout=success',
        cancelUrl: 'https://app.example.com/buy?checkout=cancelled',
      })
      .expect(400)
    const missingAcknowledgements = await request(app)
      .post('/api/public/checkout')
      .send({
        planId: 'bidflow-growth',
        successUrl: 'https://app.example.com/buy?checkout=success',
        cancelUrl: 'https://app.example.com/buy?checkout=cancelled',
        customerEmail: 'owner@public.example',
        businessName: 'Public Checkout Roofing',
      })
      .expect(400)
    const badOrigin = await request(app)
      .post('/api/public/checkout')
      .send({
        planId: 'bidflow-growth',
        successUrl: 'https://evil.example/success',
        cancelUrl: 'https://app.example.com/buy?checkout=cancelled',
        customerEmail: 'owner@public.example',
        businessName: 'Public Checkout Roofing',
        pilotScopeAccepted: true,
        humanReviewAccepted: true,
        termsAccepted: true,
        privacyAccepted: true,
        refundPolicyAccepted: true,
      })
      .expect(400)

    expect(missing.body.error).toBe('customer_email_and_business_required')
    expect(missingAcknowledgements.body.error).toBe('pilot_checkout_acknowledgements_required')
    expect(badOrigin.body.error).toBe('billing_url_origin_not_allowed')
  })

  it('rejects checkout and portal return URLs outside APP_ORIGIN', async () => {
    process.env.APP_ORIGIN = 'https://app.example.com'
    const app = testApp()

    const checkout = await request(app)
      .post('/api/billing/checkout')
      .send({
        planId: 'bidflow-growth',
        successUrl: 'https://evil.example/success',
        cancelUrl: 'https://app.example.com/cancel',
      })
      .expect(400)

    const portal = await request(app)
      .post('/api/billing/portal')
      .send({ returnUrl: 'https://evil.example/account' })
      .expect(400)

    expect(checkout.body.error).toBe('billing_url_origin_not_allowed')
    expect(portal.body.error).toBe('billing_url_origin_not_allowed')
  })

  it('handles duplicate Stripe webhook events idempotently', async () => {
    const app = testApp({
      verifyStripeWebhook: () => ({
        ok: true,
        event: {
          id: 'evt_duplicate_checkout',
          type: 'checkout.session.completed',
          data: {
            object: {
              subscription: 'sub_duplicate',
              customer: 'cus_duplicate',
              payment_status: 'paid',
              customer_details: { email: 'owner@duplicate.example' },
              metadata: {
                plan_id: 'bidflow-growth',
                product: 'bidflow',
                organization_id: 'org_evergreen',
                business_name: 'Duplicate Roofing',
              },
            },
          },
        } as never,
      }),
    })

    const first = await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'test')
      .set('content-type', 'application/json')
      .send('{}')
      .expect(200)
    const second = await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'test')
      .set('content-type', 'application/json')
      .send('{}')
      .expect(200)
    const workspace = await request(app).get('/api/workspace').expect(200)

    expect(first.body.changed).toBe(true)
    expect(second.body).toMatchObject({ changed: false, duplicate: true })
    expect(workspace.body.subscriptions).toHaveLength(1)
    expect(workspace.body.onboarding).toHaveLength(1)
    expect(workspace.body.auditLogs.filter((log: { entityId: string }) => log.entityId === 'evt_duplicate_checkout')).toHaveLength(1)
  })

  it('marks prospect checkout handoffs paid from Stripe webhook metadata', async () => {
    process.env.APP_ORIGIN = 'https://app.example.com'
    const stripeEventRef: { event?: unknown } = {}
    const app = testApp({
      verifyStripeWebhook: () => ({
        ok: true,
        event: stripeEventRef.event as never,
      }),
    })
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,quote_leak_signal,average_job_value',
          'Paid Handoff Roofing,owner@paid-handoff.example,+15125550113,https://paid-handoff.example,Austin,TX,Roofing,81,4.3,"quote form has no follow-up timeline",2600',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id
    await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'manual',
        outcome: 'scope_sent',
        summary: 'Sent paid BidFlow pilot scope to owner.',
        nextStep: 'Create checkout handoff and collect payment.',
      })
      .expect(201)
    const handoffResponse = await request(app)
      .post(`/api/sales-prospects/${prospectId}/checkout-handoff`)
      .send({ createdBy: 'rep@example.com' })
      .expect(201)
    const handoff = handoffResponse.body.handoff

    stripeEventRef.event = {
      id: 'evt_paid_handoff_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_paid_handoff',
          subscription: 'sub_paid_handoff',
          customer: 'cus_paid_handoff',
          amount_total: 64800,
          currency: 'usd',
          payment_status: 'paid',
          invoice: 'in_paid_handoff',
          payment_intent: 'pi_paid_handoff',
          customer_details: { email: 'owner@paid-handoff.example' },
          metadata: {
            plan_id: 'bidflow-growth',
            product: 'bidflow',
            organization_id: 'org_evergreen',
            business_name: 'Paid Handoff Roofing',
            owner_email: 'owner@paid-handoff.example',
            prospect_id: prospectId,
            checkout_handoff_id: handoff.id,
            pilot_scope_hash: handoff.scopeAcceptedHash,
          },
        },
      },
    }

    const webhook = await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'test')
      .set('content-type', 'application/json')
      .send('{}')
      .expect(200)
    const workspace = await request(app).get('/api/workspace').expect(200)

    expect(webhook.body.changed).toBe(true)
    expect(workspace.body.subscriptions[0]).toMatchObject({
      stripeSubscriptionId: 'sub_paid_handoff',
      stripeCustomerId: 'cus_paid_handoff',
      planId: 'bidflow-growth',
    })
    expect(workspace.body.onboarding[0]).toMatchObject({
      stripeSubscriptionId: 'sub_paid_handoff',
      ownerEmail: 'owner@paid-handoff.example',
    })
    expect(workspace.body.salesCheckoutHandoffs[0]).toMatchObject({
      id: handoff.id,
      status: 'paid',
      stripeCheckoutSessionId: 'cs_paid_handoff',
      stripeCustomerId: 'cus_paid_handoff',
      stripeSubscriptionId: 'sub_paid_handoff',
      onboardingId: workspace.body.onboarding[0].id,
    })
    expect(workspace.body.salesProspects.find((prospect: { id: string }) => prospect.id === prospectId)).toMatchObject({
      status: 'won',
      nextTouch: 'hold',
    })
    expect(workspace.body.salesActivities[0]).toMatchObject({
      prospectId,
      outcome: 'won',
      summary: expect.stringContaining('Stripe payment confirmed'),
    })
    expect(workspace.body.revenuePayments[0]).toMatchObject({
      organizationId: 'org_evergreen',
      product: 'bidflow',
      planId: 'bidflow-growth',
      businessName: 'Paid Handoff Roofing',
      customerEmail: 'owner@paid-handoff.example',
      currency: 'USD',
      grossCollectedCents: 64800,
      setupRevenueCents: 49900,
      mrrCents: 14900,
      planMonthlyPriceSnapshotCents: 14900,
      planSetupFeeSnapshotCents: 49900,
      amountSource: 'stripe_session',
      paymentSource: 'sales_checkout_handoff',
      paymentStatus: 'paid',
      status: 'paid',
      source: 'stripe_checkout',
      stripeEventId: 'evt_paid_handoff_checkout',
      stripeCheckoutSessionId: 'cs_paid_handoff',
      stripeCustomerId: 'cus_paid_handoff',
      stripeSubscriptionId: 'sub_paid_handoff',
      stripeInvoiceId: 'in_paid_handoff',
      stripePaymentIntentId: 'pi_paid_handoff',
      prospectId,
      checkoutHandoffId: handoff.id,
      onboardingId: workspace.body.onboarding[0].id,
      metadataSnapshot: expect.objectContaining({
        plan_id: 'bidflow-growth',
        checkout_handoff_id: handoff.id,
        pilot_scope_hash: handoff.scopeAcceptedHash,
      }),
    })
    expect(workspace.body.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'stripe_subscription_event', entityId: 'evt_paid_handoff_checkout' }),
        expect.objectContaining({ action: 'sales_checkout_paid', entityId: handoff.id }),
        expect.objectContaining({ action: 'revenue_payment_recorded', entityId: workspace.body.revenuePayments[0].id }),
      ]),
    )
    const payments = await request(app).get('/api/revenue-payments').expect(200)
    expect(payments.body.payments).toHaveLength(1)

    const revenueSummary = await request(app)
      .get('/api/revenue-summary?since=2026-01-01T00:00:00.000Z&until=2030-01-01T00:00:00.000Z')
      .expect(200)
    expect(revenueSummary.body.summary).toMatchObject({
      paidPilots: 1,
      setupRevenueCents: 49900,
      mrrCents: 14900,
      grossCollectedCents: 64800,
      byProduct: [expect.objectContaining({ product: 'bidflow', paidPilots: 1 })],
      bySource: [expect.objectContaining({ source: 'sales_checkout_handoff', paidPilots: 1 })],
    })

    const inactive = await request(app).get(`/api/public/checkout-handoff/${handoff.token}`).expect(410)
    expect(inactive.body.error).toBe('checkout_handoff_not_active')
  })

  it('does not fulfill subscriptions, onboarding, handoffs, or revenue for unpaid checkout sessions', async () => {
    process.env.APP_ORIGIN = 'https://app.example.com'
    const stripeEventRef: { event?: unknown } = {}
    const app = testApp({
      verifyStripeWebhook: () => ({
        ok: true,
        event: stripeEventRef.event as never,
      }),
    })
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,quote_leak_signal,average_job_value',
          'Unpaid Handoff Roofing,owner@unpaid-handoff.example,+15125550114,https://unpaid-handoff.example,Austin,TX,Roofing,77,4.2,"quote form has no follow-up timeline",2400',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id
    await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'manual',
        outcome: 'scope_sent',
        summary: 'Sent unpaid checkout regression scope to owner.',
        nextStep: 'Create checkout handoff and wait for paid Stripe confirmation.',
      })
      .expect(201)
    const handoff = (
      await request(app)
        .post(`/api/sales-prospects/${prospectId}/checkout-handoff`)
        .send({ createdBy: 'rep@example.com' })
        .expect(201)
    ).body.handoff

    stripeEventRef.event = {
      id: 'evt_unpaid_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_unpaid',
          subscription: 'sub_unpaid',
          customer: 'cus_unpaid',
          amount_total: 64800,
          currency: 'usd',
          payment_status: 'unpaid',
          metadata: {
            plan_id: 'bidflow-growth',
            product: 'bidflow',
            organization_id: 'org_evergreen',
            business_name: 'Unpaid Handoff Roofing',
            owner_email: 'owner@unpaid-handoff.example',
            prospect_id: prospectId,
            checkout_handoff_id: handoff.id,
          },
        },
      },
    }

    const webhook = await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'test')
      .set('content-type', 'application/json')
      .send('{}')
      .expect(200)
    const workspace = await request(app).get('/api/workspace').expect(200)
    const payments = await request(app).get('/api/revenue-payments').expect(200)
    const summary = await request(app).get('/api/revenue-summary').expect(200)

    expect(webhook.body).toMatchObject({ changed: false, duplicate: false })
    expect(payments.body.payments).toHaveLength(0)
    expect(summary.body.summary).toMatchObject({ paidPilots: 0, setupRevenueCents: 0, mrrCents: 0, grossCollectedCents: 0 })
    expect(workspace.body.subscriptions).toHaveLength(0)
    expect(workspace.body.onboarding).toHaveLength(0)
    const savedHandoff = workspace.body.salesCheckoutHandoffs.find((item: { id: string }) => item.id === handoff.id)
    expect(savedHandoff).toMatchObject({ status: 'sent' })
    expect(savedHandoff).not.toHaveProperty('stripeCustomerId')
    expect(savedHandoff).not.toHaveProperty('stripeSubscriptionId')
    expect(savedHandoff).not.toHaveProperty('onboardingId')
    expect(workspace.body.salesProspects.find((prospect: { id: string }) => prospect.id === prospectId)).toMatchObject({
      status: 'checkout_sent',
      nextTouch: 'hold',
    })
    expect(workspace.body.auditLogs.some((log: { action: string; entityId: string }) => log.action === 'sales_checkout_paid' && log.entityId === handoff.id)).toBe(false)
  })

  it('removes refunded and disputed payments from revenue summary without deleting evidence', async () => {
    let stripeEvent: unknown = {
      id: 'evt_revenue_paid_for_refund',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_revenue_refund',
          subscription: 'sub_revenue_refund',
          customer: 'cus_revenue_refund',
          amount_total: 64800,
          currency: 'usd',
          payment_status: 'paid',
          invoice: 'in_revenue_refund',
          payment_intent: 'pi_revenue_refund',
          latest_charge: 'ch_revenue_refund',
          metadata: {
            plan_id: 'bidflow-growth',
            product: 'bidflow',
            organization_id: 'org_evergreen',
            business_name: 'Refunded Roofing',
            owner_email: 'owner@refunded.example',
          },
        },
      },
    }
    const app = testApp({
      verifyStripeWebhook: () => ({
        ok: true,
        event: stripeEvent as never,
      }),
    })

    await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'test')
      .set('content-type', 'application/json')
      .send('{}')
      .expect(200)
    let summary = await request(app).get('/api/revenue-summary').expect(200)
    expect(summary.body.summary).toMatchObject({ paidPilots: 1, grossCollectedCents: 64800 })

    stripeEvent = {
      id: 'evt_revenue_refunded',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_revenue_refund',
          payment_intent: 'pi_revenue_refund',
          invoice: 'in_revenue_refund',
        },
      },
    }
    await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'test')
      .set('content-type', 'application/json')
      .send('{}')
      .expect(200)

    const payments = await request(app).get('/api/revenue-payments').expect(200)
    expect(payments.body.payments[0]).toMatchObject({
      businessName: 'Refunded Roofing',
      status: 'refunded',
      statusReason: 'charge.refunded',
      refundedAt: expect.any(String),
    })
    summary = await request(app).get('/api/revenue-summary').expect(200)
    expect(summary.body.summary).toMatchObject({ paidPilots: 0, setupRevenueCents: 0, mrrCents: 0, grossCollectedCents: 0 })
    const workspace = await request(app).get('/api/workspace').expect(200)
    expect(workspace.body.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'revenue_payment_refunded', entityId: payments.body.payments[0].id }),
      ]),
    )

    stripeEvent = {
      id: 'evt_revenue_disputed_after_refund',
      type: 'charge.dispute.created',
      data: {
        object: {
          charge: {
            id: 'ch_revenue_refund',
            payment_intent: 'pi_revenue_refund',
          },
        },
      },
    }
    await request(app)
      .post('/api/billing/webhook')
      .set('stripe-signature', 'test')
      .set('content-type', 'application/json')
      .send('{}')
      .expect(200)
    const disputed = await request(app).get('/api/revenue-payments').expect(200)
    expect(disputed.body.payments[0]).toMatchObject({
      status: 'disputed',
      statusReason: 'charge.dispute.created',
      disputedAt: expect.any(String),
    })
  })

  it('fails closed when Stripe webhook signing is not configured', async () => {
    const response = await request(testApp())
      .post('/api/billing/webhook')
      .set('stripe-signature', 'test')
      .set('content-type', 'application/json')
      .send('{}')
      .expect(503)

    expect(response.body.error).toBe('stripe_webhook_not_configured')
  })

  it('serves the built frontend when static hosting is enabled', async () => {
    const staticDir = `data/test-static-${Math.random().toString(36).slice(2)}`
    mkdirSync(staticDir, { recursive: true })
    writeFileSync(join(staticDir, 'index.html'), '<!doctype html><div id="root">Local Growth OS</div>')
    writeFileSync(join(staticDir, 'asset.txt'), 'asset-ok')

    const app = createApp(new JsonWorkspaceRepository(dataPath), {}, { serveStaticFrontend: true, staticDir })
    await request(app).get('/asset.txt').expect(200, 'asset-ok')
    const root = await request(app).get('/').expect(200)
    const nested = await request(app).get('/launch/billing').expect(200)
    await request(app).get('/api/unknown').expect(404)

    expect(root.text).toContain('Local Growth OS')
    expect(nested.text).toContain('Local Growth OS')
    rmSync(staticDir, { recursive: true, force: true })
  })

  it('imports lead CSV through the API boundary', async () => {
    const csv = [
      'customer_name,email,phone,service_category,description,budget_min,budget_max,urgency,source',
      'Riley Watts,riley@example.com,+15125550177,Emergency plumbing,"Water under the sink and needs a same-day quote",500,1800,emergency,phone',
    ].join('\n')

    const response = await request(testApp()).post('/api/import/leads').send({ csv }).expect(200)

    expect(response.body.imported).toBe(1)
    expect(response.body.leads[0]).toMatchObject({
      serviceCategory: 'Emergency plumbing',
      source: 'phone',
      status: 'new',
    })
    expect(response.body.workspace.customers.find((customer: { email: string }) => customer.email === 'riley@example.com')).toMatchObject({
      consentEmail: false,
      consentSms: false,
    })
    expect(response.body.workspace.auditLogs[0].action).toBe('csv_leads_imported')
  })

  it('imports review CSV through the API boundary and returns row-level errors', async () => {
    const csv = [
      'reviewer_name,email,platform,rating,body,external_review_id',
      'Parker Chen,parker@example.com,google,2,"The crew missed the window and nobody replied.",review-api-1',
      'Bad Rating,bad@example.com,google,6,"Invalid rating",review-api-2',
    ].join('\n')

    const response = await request(testApp()).post('/api/import/reviews').set('content-type', 'text/csv').send(csv).expect(207)

    expect(response.body.imported).toBe(1)
    expect(response.body.errors).toEqual([{ row: 3, error: 'rating_must_be_1_to_5' }])
    expect(response.body.reviews[0]).toMatchObject({
      externalReviewId: 'review-api-1',
      platform: 'google',
      rating: 2,
      status: 'needs_response',
    })
    expect(response.body.workspace.auditLogs[0].action).toBe('csv_reviews_imported')
  })

  it('imports, lists, and advances sales prospects through the API boundary', async () => {
    const app = testApp()
    const csv = [
      'business_name,owner_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,recent_review_issue,quote_leak_signal,average_job_value,fit_score,next_touch,notes',
      'Austin Roof & Repair,Maria Owner,maria@example.com,+15125550101,https://example-roof.example,Austin,TX,Roofing,84,4.3,"unanswered 2-star review mentions no callback","quote form has no timeline or expectation copy",1800,,,"BidFlow first"',
      'Quiet Lawn Care,Jordan Owner,jordan@example.com,,https://quiet-lawn.example,Austin,TX,Landscaping,8,4.9,,,220,,,',
    ].join('\n')

    const imported = await request(app).post('/api/import/prospects').send({ csv }).expect(200)
    const prospectId = imported.body.prospects[0].id

    expect(imported.body.imported).toBe(2)
    expect(imported.body.prospects[0]).toMatchObject({
      businessName: 'Austin Roof & Repair',
      nextTouch: 'call',
      status: 'new',
    })
    expect(imported.body.prospects[1]).toMatchObject({
      businessName: 'Quiet Lawn Care',
    })
    expect(imported.body.workspace.salesProspects[0].businessName).toBe('Quiet Lawn Care')
    expect(imported.body.workspace.auditLogs[0].action).toBe('csv_prospects_imported')

    const list = await request(app).get('/api/sales-prospects').expect(200)
    expect(list.body.prospects).toHaveLength(2)

    const updated = await request(app)
      .patch(`/api/sales-prospects/${prospectId}`)
      .send({ status: 'contacted', nextTouch: 'email', notes: 'Left voicemail and sent pilot scope.' })
      .expect(200)
    expect(updated.body.prospect).toMatchObject({
      id: prospectId,
      status: 'contacted',
      nextTouch: 'email',
      notes: 'Left voicemail and sent pilot scope.',
    })
    expect(updated.body.prospect.lastContactedAt).toEqual(expect.any(String))
    expect(updated.body.workspace.auditLogs[0]).toMatchObject({
      action: 'sales_prospect_updated',
      entityType: 'sales_prospect',
      entityId: prospectId,
    })
  })

  it('keeps operator imports from overwriting concurrent atomic updates', async () => {
    const repository = new JsonWorkspaceRepository(dataPath)
    const app = createApp(repository)
    const csv = [
      'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,average_job_value',
      'Concurrent Roofing,owner@concurrent.example,+15125550166,https://concurrent.example,Austin,TX,Roofing,42,4.4,1500',
    ].join('\n')
    let releaseAuditUpdate!: () => void
    let auditUpdateStarted!: () => void
    const auditStarted = new Promise<void>((resolve) => {
      auditUpdateStarted = resolve
    })
    const auditCanFinish = new Promise<void>((resolve) => {
      releaseAuditUpdate = resolve
    })
    const auditUpdate = repository.update(async (workspace) => {
      auditUpdateStarted()
      await auditCanFinish
      return {
        workspace: {
          ...workspace,
          auditLogs: [
            {
              id: 'audit_concurrent_external_update',
              actor: 'test',
              action: 'concurrent_external_update',
              entityType: 'workspace',
              entityId: 'local-growth-os',
              summary: 'Simulated webhook update during operator import.',
              createdAt: '2026-06-11T00:00:00.000Z',
            },
            ...workspace.auditLogs,
          ],
        },
        result: 'audit_concurrent_external_update',
      }
    })
    await auditStarted

    const importRequest = request(app).post('/api/import/prospects').send({ csv })
    await new Promise((resolve) => setTimeout(resolve, 20))
    releaseAuditUpdate()

    const [imported] = await Promise.all([importRequest.expect(200), auditUpdate])
    expect(imported.body.prospects[0]).toMatchObject({ businessName: 'Concurrent Roofing' })

    const workspace = await repository.read()
    expect(workspace.auditLogs.map((log) => log.id)).toContain('audit_concurrent_external_update')
    expect(workspace.salesProspects.map((prospect) => prospect.businessName)).toContain('Concurrent Roofing')
  })

  it('validates sales prospect updates', async () => {
    const app = testApp()
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,average_job_value',
          'Validation Roofing,owner@validation.example,+15125550103,https://validation.example,Austin,TX,Roofing,55,4.2,1250',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id

    const badStatus = await request(app).patch(`/api/sales-prospects/${prospectId}`).send({ status: 'maybe' }).expect(400)
    expect(badStatus.body.error).toBe('sales_prospect_status_invalid')

    const badTouch = await request(app).patch(`/api/sales-prospects/${prospectId}`).send({ nextTouch: 'fax' }).expect(400)
    expect(badTouch.body.error).toBe('sales_prospect_next_touch_invalid')

    const missing = await request(app).patch('/api/sales-prospects/prospect_missing').send({ status: 'contacted' }).expect(404)
    expect(missing.body.error).toBe('sales_prospect_not_found')
  })

  it('records sales activity, advances the prospect, and filters the activity ledger', async () => {
    const app = testApp()
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,average_job_value',
          'Activity Roofing,owner@activity.example,+15125550106,https://activity.example,Austin,TX,Roofing,61,4.1,1800',
          'Other Electric,owner@other.example,+15125550107,https://other.example,Austin,TX,Electrical,44,4.5,900',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id

    const recorded = await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'email',
        outcome: 'sent',
        summary: 'Sent tailored BidFlow pilot email to owner.',
        nextStep: 'Call owner within two business days.',
        ownerEmail: 'rep@example.com',
        occurredAt: '2026-06-09T16:00:00.000Z',
      })
      .expect(201)

    expect(recorded.body.activity).toMatchObject({
      prospectId,
      businessName: 'Activity Roofing',
      channel: 'email',
      outcome: 'sent',
      ownerEmail: 'rep@example.com',
    })
    expect(recorded.body.prospect).toMatchObject({
      id: prospectId,
      status: 'contacted',
      nextTouch: 'call',
      lastContactedAt: '2026-06-09T16:00:00.000Z',
    })
    expect(recorded.body.workspace.auditLogs[0]).toMatchObject({
      action: 'sales_activity_recorded',
      entityType: 'sales_activity',
      entityId: recorded.body.activity.id,
    })

    const allActivities = await request(app).get('/api/sales-activities').expect(200)
    expect(allActivities.body.activities).toHaveLength(1)

    const filtered = await request(app)
      .get(`/api/sales-activities?prospectId=${encodeURIComponent(prospectId)}&since=2026-06-09T00:00:00.000Z&until=2026-06-10T00:00:00.000Z`)
      .expect(200)
    expect(filtered.body.activities.map((activity: { id: string }) => activity.id)).toEqual([recorded.body.activity.id])

    const filteredOut = await request(app)
      .get(`/api/sales-activities?prospectId=${encodeURIComponent(prospectId)}&since=2026-06-10T00:00:00.000Z`)
      .expect(200)
    expect(filteredOut.body.activities).toHaveLength(0)
  })

  it('validates sales activity input and keeps status advancement one-way', async () => {
    const app = testApp()
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,average_job_value',
          'One Way Roofing,owner@oneway.example,+15125550108,https://oneway.example,Austin,TX,Roofing,72,4.4,2100',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id

    const badChannel = await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'fax',
        outcome: 'sent',
        summary: 'Sent outreach.',
        nextStep: 'Call owner.',
        ownerEmail: 'rep@example.com',
      })
      .expect(400)
    expect(badChannel.body.error).toBe('sales_activity_channel_invalid')

    const badEmail = await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'email',
        outcome: 'sent',
        summary: 'Sent outreach.',
        nextStep: 'Call owner.',
        ownerEmail: 'not-an-email',
      })
      .expect(400)
    expect(badEmail.body.error).toBe('sales_activity_owner_email_invalid')

    const badDate = await request(app)
      .get('/api/sales-activities?since=not-a-date')
      .expect(400)
    expect(badDate.body.error).toBe('sales_activity_since_invalid')

    const missing = await request(app)
      .post('/api/sales-prospects/prospect_missing/activities')
      .send({
        channel: 'email',
        outcome: 'sent',
        summary: 'Sent outreach.',
        nextStep: 'Call owner.',
      })
      .expect(404)
    expect(missing.body.error).toBe('sales_prospect_not_found')

    const scopeSent = await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'manual',
        outcome: 'scope_sent',
        summary: 'Sent paid pilot scope to owner.',
        nextStep: 'Send checkout link after verbal approval.',
        occurredAt: '2026-06-10T16:00:00.000Z',
      })
      .expect(201)
    expect(scopeSent.body.prospect.status).toBe('scope_sent')
    expect(scopeSent.body.prospect.nextTouch).toBe('hold')

    const oldNoResponse = await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'email',
        outcome: 'no_response',
        summary: 'Backfilled older no-response touch.',
        nextStep: 'Keep current scope follow-up active.',
        occurredAt: '2026-06-08T16:00:00.000Z',
      })
      .expect(201)
    expect(oldNoResponse.body.prospect.status).toBe('scope_sent')
    expect(oldNoResponse.body.prospect.lastContactedAt).toBe('2026-06-10T16:00:00.000Z')
  })

  it('summarizes sales activity, funnel, management metrics, and next actions', async () => {
    const app = testApp()
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,average_job_value',
          'Summary Roofing,owner@summary.example,+15125550109,https://summary.example,Austin,TX,Roofing,88,4.1,2000',
          'Summary HVAC,owner@summary-hvac.example,+15125550110,https://summary-hvac.example,Austin,TX,HVAC,65,4.4,1500',
        ].join('\n'),
      })
      .expect(200)
    const [roofingId, hvacId] = imported.body.prospects.map((prospect: { id: string }) => prospect.id)

    await request(app)
      .post(`/api/sales-prospects/${roofingId}/activities`)
      .send({
        channel: 'email',
        outcome: 'sent',
        summary: 'Sent first tailored email.',
        nextStep: 'Call tomorrow.',
        occurredAt: '2026-06-09T10:00:00.000Z',
      })
      .expect(201)
    await request(app)
      .post(`/api/sales-prospects/${roofingId}/activities`)
      .send({
        channel: 'call',
        outcome: 'call_booked',
        summary: 'Owner replied and booked a call.',
        nextStep: 'Prepare discovery questions.',
        occurredAt: '2026-06-10T10:00:00.000Z',
      })
      .expect(201)
    await request(app)
      .post(`/api/sales-prospects/${hvacId}/activities`)
      .send({
        channel: 'manual',
        outcome: 'checkout_sent',
        summary: 'Sent checkout after scope approval.',
        nextStep: 'Confirm payment.',
        occurredAt: '2026-06-10T12:00:00.000Z',
      })
      .expect(201)
    await request(app)
      .post(`/api/sales-prospects/${hvacId}/activities`)
      .send({
        channel: 'manual',
        outcome: 'won',
        summary: 'Payment confirmed through live pilot checkout.',
        nextStep: 'Open onboarding.',
        occurredAt: '2026-06-11T12:00:00.000Z',
      })
      .expect(201)

    const summaryResponse = await request(app)
      .get('/api/sales-summary?since=2026-06-09T00:00:00.000Z&until=2026-06-12T00:00:00.000Z')
      .expect(200)

    expect(summaryResponse.body.workspace).toBeUndefined()
    expect(summaryResponse.body.summary.activity).toMatchObject({
      total: 4,
      emailsSent: 1,
      callsLogged: 1,
      callsBooked: 1,
      checkoutsSent: 1,
      wins: 1,
    })
    expect(summaryResponse.body.summary.funnel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'call_booked', count: 1, estimatedPipelineValue: 2000 }),
        expect.objectContaining({ status: 'won', count: 1, estimatedPipelineValue: 1500 }),
      ]),
    )
    expect(summaryResponse.body.summary.management).toMatchObject({
      importedProspects: 2,
      activeProspects: 1,
      checkoutOpen: 0,
      estimatedPipelineValue: 2000,
      wonPipelineValueEstimate: 1500,
      winRateFromContacted: 50,
      checkoutToWonRate: 100,
    })
    expect(summaryResponse.body.summary.weekly[0].activity.total).toBe(4)
    expect(summaryResponse.body.summary.nextActions[0]).toMatchObject({
      prospectId: roofingId,
      businessName: 'Summary Roofing',
      status: 'call_booked',
    })

    const filtered = await request(app)
      .get('/api/sales-summary?since=2026-06-10T11:00:00.000Z&until=2026-06-10T13:00:00.000Z')
      .expect(200)
    expect(filtered.body.summary.activity).toMatchObject({ total: 1, checkoutsSent: 1, wins: 0 })
    expect(filtered.body.summary.funnel.find((item: { status: string }) => item.status === 'won').count).toBe(1)

    const invalidSince = await request(app).get('/api/sales-summary?since=not-a-date').expect(400)
    expect(invalidSince.body.error).toBe('sales_summary_since_invalid')

    const invalidRange = await request(app)
      .get('/api/sales-summary?since=2026-06-12T00:00:00.000Z&until=2026-06-10T00:00:00.000Z')
      .expect(400)
    expect(invalidRange.body.error).toBe('sales_summary_range_invalid')
  })

  it('builds a revenue command center from payment, sales, delivery, and customer action evidence', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)
    await request(app)
      .put('/api/workspace')
      .send({
        ...workspace.body,
        salesProspects: [
          {
            id: 'prospect_command_checkout',
            organizationId: workspace.body.business.id,
            businessName: 'Command Roofing',
            ownerName: 'Casey Owner',
            ownerEmail: 'casey@command.example',
            phone: '+15125550100',
            website: 'https://command.example',
            city: 'Austin',
            state: 'TX',
            industry: 'Roofing',
            googleReviewCount: 65,
            averageRating: 4.2,
            recentReviewIssue: 'unanswered review mentions no callback',
            quoteLeakSignal: 'estimate form has no follow-up promise',
            averageJobValue: 2400,
            fitScore: 88,
            nextTouch: 'call',
            status: 'checkout_sent',
            notes: 'Buyer has scoped pilot link.',
            lastContactedAt: '2026-06-09T00:00:00.000Z',
            createdAt: '2026-06-08T00:00:00.000Z',
            updatedAt: '2026-06-09T00:00:00.000Z',
          },
        ],
        salesCheckoutHandoffs: [
          {
            id: 'handoff_command',
            token: 'handoff_command_token',
            prospectId: 'prospect_command_checkout',
            organizationId: workspace.body.business.id,
            businessName: 'Command Roofing',
            customerEmail: 'casey@command.example',
            businessWebsite: 'https://command.example',
            businessCity: 'Austin',
            businessState: 'TX',
            industry: 'Roofing',
            product: 'bidflow',
            planId: 'bidflow-growth',
            checkoutUrl: 'https://app.example.com/buy?handoff=handoff_command_token',
            scopeSummary: 'Command Roofing scoped BidFlow pilot.',
            scopeSource: 'prospect_notes',
            scopeAcceptedHash: 'hash_command_scope',
            status: 'sent',
            createdBy: 'rep@example.com',
            sentAt: '2026-06-09T00:00:00.000Z',
            createdAt: '2026-06-09T00:00:00.000Z',
            updatedAt: '2026-06-09T00:00:00.000Z',
          },
        ],
        onboarding: [
          {
            id: 'onboarding_command_delivery',
            organizationId: workspace.body.business.id,
            businessName: 'Command Delivery',
            ownerEmail: 'owner@commanddelivery.example',
            product: 'bidflow',
            planId: 'bidflow-growth',
            status: 'ready_for_pilot',
            deliveryOwnerEmail: 'ops@example.com',
            deliverySlaDueAt: '2026-06-10T00:00:00.000Z',
            deliveryStatus: 'sent',
            deliveryPackSentAt: '2026-06-09T00:00:00.000Z',
            deliveryPackSentBy: 'ops@example.com',
            deliveryPackSummary: 'First pack sent; waiting for acceptance.',
            checklist: [
              { key: 'payment_received', label: 'Payment received through Stripe', done: true },
              { key: 'workspace_activated', label: 'Workspace activated', done: true },
              { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: true },
            ],
            createdAt: '2026-06-08T00:00:00.000Z',
            updatedAt: '2026-06-09T00:00:00.000Z',
          },
          {
            id: 'onboarding_command_renewal',
            organizationId: workspace.body.business.id,
            businessName: 'Command Renewal',
            ownerEmail: 'owner@commandrenewal.example',
            product: 'reputeloop',
            planId: 'reputeloop-growth',
            status: 'ready_for_pilot',
            deliveryOwnerEmail: 'success@example.com',
            deliverySlaDueAt: '2026-06-20T00:00:00.000Z',
            deliveryStatus: 'customer_confirmed',
            customerConfirmedAt: '2026-06-10T00:00:00.000Z',
            customerConfirmedByEmail: 'owner@commandrenewal.example',
            renewalEvidenceSummary: 'Customer accepted first recovery pack.',
            checklist: [
              { key: 'payment_received', label: 'Payment received through Stripe', done: true },
              { key: 'workspace_activated', label: 'Workspace activated', done: true },
              { key: 'customer_materials_submitted', label: 'Customer materials submitted for review', done: true },
            ],
            createdAt: '2026-06-08T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
          },
        ],
        revenueRecoveryLinks: [
          {
            id: 'recovery_link_command',
            token: 'recovery_command_token',
            organizationId: workspace.body.business.id,
            product: 'bidflow',
            sourceType: 'lead',
            sourceId: workspace.body.leads[0].id,
            customerId: workspace.body.customers[0].id,
            customerName: workspace.body.customers[0].name,
            customerEmail: workspace.body.customers[0].email,
            businessName: workspace.body.business.name,
            title: 'Command proposal',
            summary: 'Customer accepted command proposal.',
            callToAction: 'Approve or request changes.',
            valueCents: 240000,
            currency: workspace.body.business.currency,
            status: 'accepted',
            createdBy: 'rep@example.com',
            createdAt: '2026-06-09T00:00:00.000Z',
            updatedAt: '2026-06-10T00:00:00.000Z',
            expiresAt: '2026-06-30T00:00:00.000Z',
          },
        ],
      })
      .expect(200)

    const response = await request(app).get('/api/revenue-command').expect(200)

    expect(response.body.command.northStar).toMatchObject({
      openCheckoutCount: 2,
      deliveryAtRiskCount: 1,
      customerActionCount: 1,
      renewalEvidenceCount: 1,
    })
    expect(response.body.command.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lane: 'collect_payment', sourceId: 'prospect_command_checkout', priority: 'critical' }),
        expect.objectContaining({ lane: 'delivery', sourceId: 'onboarding_command_delivery' }),
        expect.objectContaining({ lane: 'customer_action', sourceId: 'recovery_link_command' }),
        expect.objectContaining({ lane: 'renewal', sourceId: 'onboarding_command_renewal' }),
      ]),
    )
    expect(response.body.command.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'no_paid_pilots' })]))
  })

  it('generates and downloads manual sales outreach packs for qualified prospects', async () => {
    const app = testApp()
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,recent_review_issue,quote_leak_signal,average_job_value,notes',
          'Scope Ready Roofing,Morgan Owner,morgan@example.com,+15125550104,https://scope-ready.example,Austin,TX,Roofing,91,4.2,"unanswered review mentions no callback","estimate form has no follow-up timeline",2200,"BidFlow first"',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id

    const generated = await request(app).post(`/api/sales-prospects/${prospectId}/outreach-pack`).send({}).expect(201)

    expect(generated.body.pack).toMatchObject({
      prospectId,
      businessName: 'Scope Ready Roofing',
      product: 'bidflow',
      status: 'draft',
    })
    expect(generated.body.pack.emailBody).toContain('15-minute fit call')
    expect(generated.body.pack.pilotScopeDraft).toContain('Paid Pilot Scope Draft')
    expect(generated.body.prospect.status).toBe('qualified')
    expect(generated.body.workspace.auditLogs[0]).toMatchObject({
      action: 'sales_outreach_pack_generated',
      entityType: 'sales_outreach_pack',
      entityId: generated.body.pack.id,
    })

    const latest = await request(app).get(`/api/sales-prospects/${prospectId}/outreach-pack`).expect(200)
    expect(latest.body.pack.id).toBe(generated.body.pack.id)

    const document = await request(app).get(`/api/sales-prospects/${prospectId}/outreach-pack/download`).expect(200)
    expect(document.body.filename).toContain('scope-ready-roofing-outreach-pack.md')
    expect(document.body.content).toContain('Sales Outreach Pack')
    expect(document.body.content).toContain('Pilot Scope Draft')
    expect(document.body.content).toContain('Do not send this message as an automated campaign')
  })

  it('handles missing sales outreach pack records', async () => {
    const app = testApp()
    await request(app).post('/api/sales-prospects/prospect_missing/outreach-pack').send({}).expect(404)

    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,average_job_value',
          'No Pack Yet,owner@nopack.example,+15125550105,https://nopack.example,Austin,TX,Cleaning,31,4.6,700',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id
    const missingDownload = await request(app).get(`/api/sales-prospects/${prospectId}/outreach-pack/download`).expect(409)
    expect(missingDownload.body.error).toBe('sales_outreach_pack_not_found')
  })

  it('requires a checkout handoff before downloading a paid pilot order form', async () => {
    const app = testApp()
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,average_job_value',
          'No Order Form Yet,owner@noorder.example,+15125550106,https://noorder.example,Austin,TX,HVAC,42,4.4,1200',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id

    const missing = await request(app).get(`/api/sales-prospects/${prospectId}/checkout-handoff/order-form`).expect(409)

    expect(missing.body.error).toBe('sales_checkout_handoff_not_found')
  })

  it('does not download a payment order form for inactive checkout handoffs', async () => {
    const app = testApp()
    const imported = await request(app)
      .post('/api/import/prospects')
      .send({
        csv: [
          'business_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,quote_leak_signal,average_job_value',
          'Paid Order Roofing,owner@paidorder.example,+15125550107,https://paidorder.example,Austin,TX,Roofing,67,4.2,"estimate form has no follow-up timeline",2400',
        ].join('\n'),
      })
      .expect(200)
    const prospectId = imported.body.prospects[0].id
    await request(app)
      .post(`/api/sales-prospects/${prospectId}/activities`)
      .send({
        channel: 'manual',
        outcome: 'scope_sent',
        summary: 'Sent paid pilot scope.',
        nextStep: 'Collect payment.',
      })
      .expect(201)
    const created = await request(app)
      .post(`/api/sales-prospects/${prospectId}/checkout-handoff`)
      .send({ createdBy: 'rep@example.com' })
      .expect(201)

    const workspace = await request(app).get('/api/workspace').expect(200)
    const paidWorkspace = {
      ...workspace.body,
      salesCheckoutHandoffs: workspace.body.salesCheckoutHandoffs.map((handoff: { id: string }) =>
        handoff.id === created.body.handoff.id ? { ...handoff, status: 'paid', paidAt: new Date().toISOString() } : handoff,
      ),
    }
    await request(app).put('/api/workspace').send(paidWorkspace).expect(200)

    const inactive = await request(app)
      .get(`/api/sales-prospects/${prospectId}/checkout-handoff/order-form?handoffId=${created.body.handoff.id}`)
      .expect(410)

    expect(inactive.body.error).toBe('checkout_handoff_not_active')
  })

  it('blocks SMS when customer consent is missing', async () => {
    const response = await request(testApp())
      .post('/api/messages/send')
      .send({
        customerId: 'cust_bryce',
        channel: 'sms',
        body: 'Checking in on your quote.',
        purpose: 'follow_up',
      })
      .expect(422)

    expect(response.body.error).toBe('sms_consent_missing')
  })

  it('records failed outbound message attempts when provider config is missing', async () => {
    const app = testApp()
    const response = await request(app)
      .post('/api/messages/send')
      .send({
        customerId: 'cust_maria',
        channel: 'email',
        subject: 'Your quote',
        body: 'Your quote is ready.',
        purpose: 'follow_up',
      })
      .expect(503)

    expect(response.body.error).toBe('email_not_configured')
    expect(response.body.outboundMessage).toMatchObject({
      customerId: 'cust_maria',
      channel: 'email',
      status: 'failed',
      failureReason: 'email_not_configured',
    })
    const workspace = await request(app).get('/api/workspace').expect(200)
    expect(workspace.body.outboundMessages[0].failureReason).toBe('email_not_configured')
  })

  it('handles email unsubscribe webhooks and blocks future email sends', async () => {
    const app = testApp()
    const unsubscribe = await request(app)
      .post('/api/webhooks/email/unsubscribe')
      .send({ email: 'maria@example.com', source: 'postmark' })
      .expect(200)

    expect(unsubscribe.body.customerId).toBe('cust_maria')
    const workspace = await request(app).get('/api/workspace').expect(200)
    expect(workspace.body.customers.find((customer: { id: string }) => customer.id === 'cust_maria').consentEmail).toBe(false)
    expect(workspace.body.consentEvents[0]).toMatchObject({ channel: 'email', action: 'unsubscribe' })

    const send = await request(app)
      .post('/api/messages/send')
      .send({
        customerId: 'cust_maria',
        channel: 'email',
        subject: 'Your quote',
        body: 'Your quote is ready.',
        purpose: 'follow_up',
      })
      .expect(422)
    expect(send.body.error).toBe('email_consent_missing')
  })

  it('requires a shared email webhook secret when configured', async () => {
    process.env.EMAIL_WEBHOOK_SECRET = 'email-webhook-secret'
    const app = testApp()

    await request(app).post('/api/webhooks/email/unsubscribe').send({ email: 'maria@example.com' }).expect(403)
    await request(app)
      .post('/api/webhooks/email/unsubscribe')
      .set('x-local-growth-webhook-secret', 'wrong-secret')
      .send({ email: 'maria@example.com' })
      .expect(403)
    const unsubscribe = await request(app)
      .post('/api/webhooks/email/unsubscribe')
      .set('authorization', 'Bearer email-webhook-secret')
      .send({ email: 'maria@example.com', source: 'postmark' })
      .expect(200)

    expect(unsubscribe.body.customerId).toBe('cust_maria')
  })

  it('handles Twilio STOP and START inbound webhooks', async () => {
    const app = testApp()
    await request(app)
      .post('/api/webhooks/twilio/inbound')
      .type('form')
      .send({ From: '+1 512 555 0140', Body: 'STOP' })
      .expect(200)
    let workspace = await request(app).get('/api/workspace').expect(200)
    expect(workspace.body.customers.find((customer: { id: string }) => customer.id === 'cust_maria').consentSms).toBe(false)

    await request(app)
      .post('/api/webhooks/twilio/inbound')
      .type('form')
      .send({ From: '+15125550140', Body: 'START' })
      .expect(200)
    workspace = await request(app).get('/api/workspace').expect(200)
    expect(workspace.body.customers.find((customer: { id: string }) => customer.id === 'cust_maria').consentSms).toBe(true)
    expect(workspace.body.consentEvents[0]).toMatchObject({ channel: 'sms', action: 'resubscribe' })
  })

  it('requires a valid Twilio signature when inbound auth token is configured', async () => {
    process.env.TWILIO_AUTH_TOKEN = 'twilio-auth-token'
    const app = testApp()
    const params = { From: '+1 512 555 0140', Body: 'STOP' }
    const url = 'http://127.0.0.1/api/webhooks/twilio/inbound'
    const validSignature = createTwilioSignature(url, params, process.env.TWILIO_AUTH_TOKEN)

    await request(app).post('/api/webhooks/twilio/inbound').type('form').send(params).expect(403)
    await request(app)
      .post('/api/webhooks/twilio/inbound')
      .set('x-twilio-signature', 'bad-signature')
      .type('form')
      .send(params)
      .expect(403)
    await request(app)
      .post('/api/webhooks/twilio/inbound')
      .set('host', '127.0.0.1')
      .set('x-twilio-signature', validSignature)
      .type('form')
      .send(params)
      .expect(200)
  })

  it('imports Google Business Profile reviews through the API boundary', async () => {
    const app = testApp({
      importGoogleReviews: async () => ({
        ok: true,
        reviews: [
          {
            externalReviewId: 'accounts/123/locations/456/reviews/rev_api',
            platform: 'google',
            rating: 1,
            body: 'Nobody returned my call after the service window was missed.',
            reviewerName: 'Jordan Lee',
            reviewedAt: '2026-06-09T12:00:00Z',
          },
        ],
        nextPageToken: undefined,
      }),
    })

    const response = await request(app).post('/api/google/reviews/import').expect(200)

    expect(response.body.imported).toBe(1)
    expect(response.body.reviews[0]).toMatchObject({
      externalReviewId: 'accounts/123/locations/456/reviews/rev_api',
      platform: 'google',
      rating: 1,
      status: 'needs_response',
    })
    const importedCustomer = response.body.workspace.customers.find(
      (customer: { source: string; name: string }) => customer.source === 'google_business_profile' && customer.name === 'Jordan Lee',
    )
    expect(importedCustomer).toMatchObject({
      name: 'Jordan Lee',
      source: 'google_business_profile',
      consentEmail: false,
      consentSms: false,
    })
    expect(response.body.workspace.auditLogs[0].action).toBe('google_reviews_imported')
  })

  it('posts Google replies and updates local review response state', async () => {
    const postedReplies: Array<{ reviewName: string; comment: string }> = []
    const app = testApp({
      importGoogleReviews: async () => ({
        ok: true,
        reviews: [
          {
            externalReviewId: 'accounts/123/locations/456/reviews/rev_reply',
            platform: 'google',
            rating: 2,
            body: 'The crew was late and the estimate changed.',
            reviewerName: 'Morgan Park',
            reviewedAt: '2026-06-09T12:00:00Z',
          },
        ],
        nextPageToken: undefined,
      }),
      replyToGoogleReview: async (reviewName, comment) => {
        postedReplies.push({ reviewName, comment })
        return { ok: true, updateTime: '2026-06-10T02:00:00Z' }
      },
    })
    const importResponse = await request(app).post('/api/google/reviews/import').expect(200)
    const reviewId = importResponse.body.reviews[0].id
    const packResponse = await request(app).post(`/api/reviews/${reviewId}/response-pack`).expect(200)
    const responseId = packResponse.body.reviewResponses[0].id

    const replyResponse = await request(app)
      .post(`/api/google/reviews/${reviewId}/reply`)
      .send({ responseId })
      .expect(200)

    expect(replyResponse.body).toMatchObject({ ok: true, responseId, updateTime: '2026-06-10T02:00:00Z' })
    expect(postedReplies[0].reviewName).toBe('accounts/123/locations/456/reviews/rev_reply')
    const workspace = await request(app).get('/api/workspace').expect(200)
    expect(workspace.body.reviews.find((review: { id: string }) => review.id === reviewId).status).toBe('responded')
    expect(workspace.body.reviewResponses.find((item: { id: string }) => item.id === responseId).status).toBe('posted')
    expect(workspace.body.auditLogs[0].action).toBe('google_review_reply_posted')
  })

  it('fails closed when Google review import is not configured', async () => {
    const response = await request(testApp()).post('/api/google/reviews/import').expect(503)

    expect(response.body.error).toBe('google_business_not_configured')
    expect(response.body.missing).toContain('GOOGLE_ACCESS_TOKEN')
  })

  it('requires an API key when configured', async () => {
    process.env.LOCAL_GROWTH_API_KEY = 'secret'
    await request(testApp()).get('/api/workspace').expect(401)
    await request(testApp()).get('/api/workspace').set('x-api-key', 'secret').expect(200)
  })

  it('fails closed in production until JWT auth and CORS origin are configured', async () => {
    process.env.NODE_ENV = 'production'
    process.env.LOCAL_GROWTH_ALLOW_HEADER_AUTH = 'true'
    delete process.env.APP_ORIGIN
    delete process.env.JWT_PUBLIC_KEY
    delete process.env.JWT_ISSUER
    delete process.env.JWT_AUDIENCE

    const response = await request(testApp()).get('/api/workspace').expect(503)

    expect(response.body).toMatchObject({
      error: 'production_runtime_not_configured',
      missing: expect.arrayContaining(['JWT_PUBLIC_KEY', 'JWT_ISSUER', 'JWT_AUDIENCE', 'APP_ORIGIN', 'LOCAL_GROWTH_ALLOW_HEADER_AUTH']),
    })
  })

  it('keeps public pricing available in production while protecting operator APIs', async () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.NODE_ENV = 'production'
    process.env.APP_ORIGIN = 'https://local-growth.example'
    process.env.JWT_PUBLIC_KEY = await exportSPKI(publicKey)
    process.env.JWT_ALGORITHM = 'RS256'
    process.env.JWT_ISSUER = 'https://auth.local-growth.example'
    process.env.JWT_AUDIENCE = 'local-growth-os'
    delete process.env.LOCAL_GROWTH_ALLOW_HEADER_AUTH

    const plans = await request(testApp()).get('/api/plans').expect(200)
    expect(plans.body.plans.map((plan: { id: string }) => plan.id)).toContain('bidflow-growth')
    await request(testApp()).get('/api/workspace').expect(401)
  })

  it('blocks full workspace overwrite and reset in production even for owner JWTs', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.NODE_ENV = 'production'
    process.env.APP_ORIGIN = 'https://local-growth.example'
    process.env.JWT_PUBLIC_KEY = await exportSPKI(publicKey)
    process.env.JWT_ALGORITHM = 'RS256'
    process.env.JWT_ISSUER = 'https://auth.local-growth.example'
    process.env.JWT_AUDIENCE = 'local-growth-os'
    delete process.env.LOCAL_GROWTH_ALLOW_HEADER_AUTH
    const token = await new SignJWT({ role: 'owner', organization_id: 'org_evergreen' })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('owner_user')
      .setIssuer('https://auth.local-growth.example')
      .setAudience('local-growth-os')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey)
    const app = testApp()

    const workspace = await request(app).get('/api/workspace').set('authorization', `Bearer ${token}`).expect(200)
    const overwrite = await request(app)
      .put('/api/workspace')
      .set('authorization', `Bearer ${token}`)
      .send(workspace.body)
      .expect(403)
    const reset = await request(app).post('/api/workspace/reset').set('authorization', `Bearer ${token}`).expect(403)

    expect(overwrite.body.error).toBe('workspace_overwrite_disabled_in_production')
    expect(reset.body.error).toBe('workspace_reset_disabled_in_production')
  })

  it('disables header-derived identity when local header auth is not explicitly enabled', async () => {
    delete process.env.LOCAL_GROWTH_ALLOW_HEADER_AUTH

    const response = await request(testApp()).get('/api/workspace').expect(503)

    expect(response.body).toMatchObject({ error: 'local_header_auth_disabled' })
  })

  it('blocks cross-organization requests', async () => {
    await request(testApp()).get('/api/workspace').set('x-organization-id', 'other_org').expect(403)
  })

  it('allows staff to read and create packs but blocks billing and message sends', async () => {
    const app = testApp()
    const staffHeaders = { 'x-user-role': 'staff', 'x-organization-id': 'org_evergreen' }
    const workspace = await request(app).get('/api/workspace').set(staffHeaders).expect(200)
    const leadId = workspace.body.leads[0].id

    await request(app).post(`/api/leads/${leadId}/revenue-pack`).set(staffHeaders).expect(200)
    await request(app)
      .post('/api/billing/checkout')
      .set(staffHeaders)
      .send({ planId: 'bidflow-growth', successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel' })
      .expect(403)
    await request(app)
      .post('/api/messages/send')
      .set(staffHeaders)
      .send({
        customerId: 'cust_maria',
        channel: 'email',
        body: 'Checking in on your quote.',
        purpose: 'follow_up',
      })
      .expect(403)
  })

  it('blocks staff from overwriting the full workspace', async () => {
    const app = testApp()
    const workspace = await request(app).get('/api/workspace').expect(200)

    await request(app).put('/api/workspace').set('x-user-role', 'staff').send(workspace.body).expect(403)
  })

  it('requires and verifies JWT when JWT_PUBLIC_KEY is configured', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.JWT_PUBLIC_KEY = await exportSPKI(publicKey)
    process.env.JWT_ALGORITHM = 'RS256'
    process.env.JWT_ISSUER = 'local-growth-test'
    process.env.JWT_AUDIENCE = 'local-growth-api'
    const token = await new SignJWT({ role: 'manager', organization_id: 'org_evergreen' })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('user_manager')
      .setIssuer('local-growth-test')
      .setAudience('local-growth-api')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey)

    await request(testApp()).get('/api/workspace').expect(401)
    await request(testApp()).get('/api/workspace').set('authorization', `Bearer ${token}`).expect(200)
    await request(testApp())
      .post('/api/billing/checkout')
      .set('authorization', `Bearer ${token}`)
      .send({ planId: 'bidflow-growth', successUrl: 'https://example.com/success', cancelUrl: 'https://example.com/cancel' })
      .expect(403)
  })

  function testApp(services?: Parameters<typeof createApp>[1]) {
    return createApp(new JsonWorkspaceRepository(dataPath), services)
  }

  function createTwilioSignature(url: string, params: Record<string, string>, authToken: string) {
    const payload =
      url.replace(/^http:\/\//, 'https://') +
      Object.keys(params)
        .sort()
        .map((key) => `${key}${params[key]}`)
        .join('')
    return createHmac('sha1', authToken).update(payload).digest('base64')
  }
})
