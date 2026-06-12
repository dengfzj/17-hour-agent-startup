import { createHash } from 'node:crypto'
import { analyzeReview, scoreLead } from '../src/domain/engines'
import type { Customer, Lead, Review, ReviewPlatform, SalesProspect, Urgency, WorkspaceData } from '../src/domain/types'

export type ImportError = {
  row: number
  error: string
}

export type ImportResult<T> = {
  imported: number
  skipped: number
  errors: ImportError[]
  records: T[]
  workspace: WorkspaceData
}

type CsvRow = Record<string, string>

const urgencyValues = new Set<Urgency>(['low', 'normal', 'high', 'emergency'])
const leadSources = new Set<Lead['source']>(['website', 'phone', 'referral', 'ad', 'import', 'manual'])
const reviewPlatforms = new Set<ReviewPlatform>(['google', 'yelp', 'facebook', 'internal', 'other'])
const prospectTouches = new Set<SalesProspect['nextTouch']>(['email', 'call', 'linkedin', 'partner', 'hold'])

export function importProspectsCsv(workspace: WorkspaceData, csv: string): ImportResult<SalesProspect> {
  const parsed = parseCsv(csv)
  if (!parsed.ok) {
    return { imported: 0, skipped: 0, errors: parsed.errors, records: [], workspace }
  }

  const errors: ImportError[] = []
  const prospects = [...workspace.salesProspects]
  const imported: SalesProspect[] = []
  const knownProspectKeys = new Set(workspace.salesProspects.map((prospect) => prospectDedupeKey(prospect)))

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2
    const businessName = read(row, ['business_name', 'business', 'company'])
    const ownerEmail = read(row, ['owner_email', 'email'])
    const website = read(row, ['website', 'url'])
    const city = read(row, ['city'])
    const state = read(row, ['state'])
    const industry = read(row, ['industry', 'vertical'])
    if (!businessName) {
      errors.push({ row: rowNumber, error: 'business_name_required' })
      return
    }
    if (!ownerEmail && !website && !read(row, ['phone'])) {
      errors.push({ row: rowNumber, error: 'prospect_contact_required' })
      return
    }

    const baseProspect = {
      id: stableId('prospect_csv', `${businessName}:${ownerEmail}:${website}`),
      organizationId: workspace.business.id,
      businessName,
      ownerName: read(row, ['owner_name', 'contact_name', 'name']),
      ownerEmail,
      phone: read(row, ['phone']),
      website,
      city,
      state,
      industry,
      googleReviewCount: parseInteger(read(row, ['google_review_count', 'review_count']), 0),
      averageRating: parseDecimal(read(row, ['average_rating', 'rating']), 0),
      recentReviewIssue: read(row, ['recent_review_issue', 'review_issue']),
      quoteLeakSignal: read(row, ['quote_leak_signal', 'quote_signal']),
      averageJobValue: parseMoney(read(row, ['average_job_value', 'job_value']), 0),
      notes: read(row, ['notes']),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const score = scoreProspect(baseProspect)
    const prospect: SalesProspect = {
      ...baseProspect,
      fitScore: parseInteger(read(row, ['fit_score']), score.fitScore),
      nextTouch: parseProspectTouch(read(row, ['next_touch']), score.nextTouch),
      status: 'new',
    }
    const dedupeKey = prospectDedupeKey(prospect)
    if (knownProspectKeys.has(dedupeKey)) {
      return
    }

    prospects.unshift(prospect)
    imported.push(prospect)
    knownProspectKeys.add(dedupeKey)
  })

  return {
    imported: imported.length,
    skipped: parsed.rows.length - imported.length - errors.length,
    errors,
    records: imported,
    workspace: { ...workspace, salesProspects: prospects },
  }
}

export function importLeadsCsv(workspace: WorkspaceData, csv: string): ImportResult<Lead> {
  const parsed = parseCsv(csv)
  if (!parsed.ok) {
    return { imported: 0, skipped: 0, errors: parsed.errors, records: [], workspace }
  }

  const errors: ImportError[] = []
  const customers = [...workspace.customers]
  const leads = [...workspace.leads]
  const imported: Lead[] = []
  const knownLeadKeys = new Set(workspace.leads.map((lead) => leadDedupeKey(lead.customerId, lead.serviceCategory, lead.description)))

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2
    const name = read(row, ['customer_name', 'name', 'customer', 'full_name'])
    const description = read(row, ['description', 'lead_description', 'details', 'request'])
    const serviceCategory = read(row, ['service_category', 'service', 'category']) || 'General service'
    if (!name) {
      errors.push({ row: rowNumber, error: 'customer_name_required' })
      return
    }
    if (!description) {
      errors.push({ row: rowNumber, error: 'description_required' })
      return
    }

    const customer = upsertImportCustomer(customers, {
      name,
      email: read(row, ['email', 'customer_email']),
      phone: read(row, ['phone', 'customer_phone']),
      source: read(row, ['customer_source', 'source']) || 'CSV import',
      lastInteractionAt: read(row, ['last_interaction_at', 'created_at']) || new Date().toISOString(),
    })
    const rawLead = {
      id: stableId('lead_csv', `${customer.id}:${serviceCategory}:${description}`),
      customerId: customer.id,
      serviceCategory,
      description,
      budgetMin: parseMoney(read(row, ['budget_min', 'min_budget', 'budget_low']), 0),
      budgetMax: parseMoney(read(row, ['budget_max', 'max_budget', 'budget_high']), 0),
      urgency: parseUrgency(read(row, ['urgency', 'priority'])),
      source: parseLeadSource(read(row, ['lead_source', 'source'])),
      status: 'new' as const,
      createdAt: read(row, ['created_at', 'received_at']) || new Date().toISOString(),
      locationFit: parseBoolean(read(row, ['location_fit', 'in_service_area']), true),
      repeatCustomer: parseBoolean(read(row, ['repeat_customer', 'repeat']), false),
    }
    if (rawLead.budgetMax > 0 && rawLead.budgetMin > rawLead.budgetMax) {
      errors.push({ row: rowNumber, error: 'budget_min_greater_than_budget_max' })
      return
    }

    const dedupeKey = leadDedupeKey(rawLead.customerId, rawLead.serviceCategory, rawLead.description)
    if (knownLeadKeys.has(dedupeKey)) {
      return
    }

    const scored = { ...rawLead, ...scoreLead(rawLead, customers) }
    leads.unshift(scored)
    imported.push(scored)
    knownLeadKeys.add(dedupeKey)
  })

  return {
    imported: imported.length,
    skipped: parsed.rows.length - imported.length - errors.length,
    errors,
    records: imported,
    workspace: { ...workspace, customers, leads },
  }
}

export function importReviewsCsv(workspace: WorkspaceData, csv: string): ImportResult<Review> {
  const parsed = parseCsv(csv)
  if (!parsed.ok) {
    return { imported: 0, skipped: 0, errors: parsed.errors, records: [], workspace }
  }

  const errors: ImportError[] = []
  const customers = [...workspace.customers]
  const reviews = [...workspace.reviews]
  const imported: Review[] = []
  const knownReviewKeys = new Set(workspace.reviews.map((review) => reviewDedupeKey(review)))

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2
    const reviewerName = read(row, ['reviewer_name', 'customer_name', 'name', 'reviewer'])
    const body = read(row, ['body', 'review', 'comment', 'text'])
    if (!reviewerName) {
      errors.push({ row: rowNumber, error: 'reviewer_name_required' })
      return
    }
    if (!body) {
      errors.push({ row: rowNumber, error: 'review_body_required' })
      return
    }

    const rating = parseRating(read(row, ['rating', 'stars', 'star_rating']))
    if (!rating) {
      errors.push({ row: rowNumber, error: 'rating_must_be_1_to_5' })
      return
    }

    const externalReviewId = read(row, ['external_review_id', 'review_id', 'google_review_name'])
    const platform = parseReviewPlatform(read(row, ['platform', 'source']))
    const customer = upsertImportCustomer(customers, {
      name: reviewerName,
      email: read(row, ['email', 'customer_email']),
      phone: read(row, ['phone', 'customer_phone']),
      source: `${platform} CSV import`,
      lastInteractionAt: read(row, ['reviewed_at', 'created_at']) || new Date().toISOString(),
    })
    const rawReview = {
      id: stableId('review_csv', `${platform}:${externalReviewId || `${customer.id}:${rating}:${body}`}`),
      customerId: customer.id,
      externalReviewId: externalReviewId || undefined,
      platform,
      rating,
      body,
      reviewerName,
      reviewedAt: read(row, ['reviewed_at', 'created_at', 'date']) || new Date().toISOString(),
    }
    const dedupeKey = reviewDedupeKey(rawReview)
    if (knownReviewKeys.has(dedupeKey)) {
      return
    }

    const analyzed = { ...rawReview, ...analyzeReview(rawReview) }
    reviews.unshift(analyzed)
    imported.push(analyzed)
    knownReviewKeys.add(dedupeKey)
  })

  return {
    imported: imported.length,
    skipped: parsed.rows.length - imported.length - errors.length,
    errors,
    records: imported,
    workspace: { ...workspace, customers, reviews },
  }
}

export function parseCsv(csv: string): { ok: true; rows: CsvRow[] } | { ok: false; errors: ImportError[] } {
  if (!csv.trim()) {
    return { ok: false, errors: [{ row: 0, error: 'csv_empty' }] }
  }

  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    const nextChar = csv[index + 1]
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1
      row.push(field)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      field = ''
      continue
    }

    field += char
  }

  if (inQuotes) {
    return { ok: false, errors: [{ row: rows.length + 1, error: 'unterminated_quoted_field' }] }
  }

  row.push(field)
  if (row.some((value) => value.trim())) rows.push(row)

  const [headerRow, ...bodyRows] = rows
  if (!headerRow?.length) {
    return { ok: false, errors: [{ row: 1, error: 'csv_header_required' }] }
  }

  const headers = headerRow.map(normalizeHeader)
  if (headers.some((header) => !header)) {
    return { ok: false, errors: [{ row: 1, error: 'csv_headers_cannot_be_blank' }] }
  }

  return {
    ok: true,
    rows: bodyRows.map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])),
    ),
  }
}

function upsertImportCustomer(
  customers: Customer[],
  input: { name: string; email?: string; phone?: string; source: string; lastInteractionAt: string },
) {
  const existing = customers.find((customer) => {
    const emailMatch = input.email && customer.email.toLowerCase() === input.email.toLowerCase()
    const phoneMatch = input.phone && normalizePhone(customer.phone) === normalizePhone(input.phone)
    return emailMatch || phoneMatch
  })
  if (existing) return existing

  const customer: Customer = {
    id: stableId('cust_csv', `${input.email || ''}:${input.phone || ''}:${input.name}`),
    name: input.name,
    email: input.email || '',
    phone: input.phone || '',
    source: input.source,
    tags: ['csv-import'],
    consentEmail: false,
    consentSms: false,
    lifetimeValue: 0,
    lastInteractionAt: input.lastInteractionAt,
  }
  customers.push(customer)
  return customer
}

function read(row: CsvRow, names: string[]) {
  for (const name of names) {
    const value = row[normalizeHeader(name)]
    if (value?.trim()) return value.trim()
  }
  return ''
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash('sha1').update(value.toLowerCase()).digest('hex').slice(0, 18)}`
}

function parseMoney(value: string, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function parseInteger(value: string, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback
}

function parseDecimal(value: string, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
}

function parseRating(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : undefined
}

function parseUrgency(value: string): Urgency {
  const normalized = value.toLowerCase()
  return urgencyValues.has(normalized as Urgency) ? (normalized as Urgency) : 'normal'
}

function parseLeadSource(value: string): Lead['source'] {
  const normalized = value.toLowerCase().replace(/\s+/g, '_')
  return leadSources.has(normalized as Lead['source']) ? (normalized as Lead['source']) : 'import'
}

function parseReviewPlatform(value: string): ReviewPlatform {
  const normalized = value.toLowerCase().replace(/\s+/g, '_')
  return reviewPlatforms.has(normalized as ReviewPlatform) ? (normalized as ReviewPlatform) : 'other'
}

function parseBoolean(value: string, fallback: boolean) {
  if (!value) return fallback
  const normalized = value.toLowerCase()
  if (['true', 'yes', 'y', '1'].includes(normalized)) return true
  if (['false', 'no', 'n', '0'].includes(normalized)) return false
  return fallback
}

function parseProspectTouch(value: string, fallback: SalesProspect['nextTouch']) {
  const normalized = value.toLowerCase().replace(/\s+/g, '_')
  return prospectTouches.has(normalized as SalesProspect['nextTouch']) ? (normalized as SalesProspect['nextTouch']) : fallback
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function leadDedupeKey(customerId: string, serviceCategory: string, description: string) {
  return `${customerId}:${serviceCategory.trim().toLowerCase()}:${description.trim().toLowerCase()}`
}

function reviewDedupeKey(review: Pick<Review, 'customerId' | 'platform' | 'externalReviewId' | 'rating' | 'body'>) {
  return review.externalReviewId
    ? `${review.platform}:${review.externalReviewId}`
    : `${review.customerId}:${review.platform}:${review.rating}:${review.body.trim().toLowerCase()}`
}

function prospectDedupeKey(prospect: Pick<SalesProspect, 'businessName' | 'ownerEmail' | 'website'>) {
  return `${prospect.businessName.trim().toLowerCase()}:${prospect.ownerEmail.trim().toLowerCase()}:${prospect.website.trim().toLowerCase()}`
}

function scoreProspect(
  prospect: Pick<
    SalesProspect,
    'googleReviewCount' | 'averageRating' | 'recentReviewIssue' | 'quoteLeakSignal' | 'averageJobValue' | 'ownerEmail' | 'phone'
  >,
) {
  const reviewIssue = prospect.recentReviewIssue.toLowerCase()
  const quoteSignal = prospect.quoteLeakSignal.toLowerCase()
  let fitScore = 35
  if (prospect.googleReviewCount >= 30) fitScore += 12
  if (prospect.googleReviewCount >= 75) fitScore += 8
  if (prospect.averageRating > 0 && prospect.averageRating < 4.5) fitScore += 8
  if (prospect.averageJobValue >= 500) fitScore += 12
  if (prospect.averageJobValue >= 1500) fitScore += 8
  if (/(unanswered|late|refund|attorney|no callback|poor communication|slow)/.test(reviewIssue)) fitScore += 12
  if (/(quote|estimate|callback|follow.?up|no timeline|slow)/.test(quoteSignal)) fitScore += 12
  if (prospect.ownerEmail) fitScore += 4
  if (prospect.phone) fitScore += 4

  const cappedScore = Math.min(100, fitScore)
  const nextTouch: SalesProspect['nextTouch'] =
    cappedScore >= 80 && prospect.phone ? 'call' : cappedScore >= 65 && prospect.ownerEmail ? 'email' : cappedScore >= 50 ? 'linkedin' : 'hold'
  return { fitScore: cappedScore, nextTouch }
}
