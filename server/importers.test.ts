import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import { importLeadsCsv, importProspectsCsv, importReviewsCsv, parseCsv } from './importers'

describe('CSV importers', () => {
  it('parses quoted CSV fields with commas and CRLF rows', () => {
    const parsed = parseCsv('name,description\r\n"Ada Lane","Roof leak, urgent"\r\n')

    expect(parsed).toEqual({
      ok: true,
      rows: [{ name: 'Ada Lane', description: 'Roof leak, urgent' }],
    })
  })

  it('imports lead rows, creates non-consented customers, scores leads, and skips duplicates', () => {
    const csv = [
      'customer_name,email,phone,service_category,description,budget_min,budget_max,urgency,source,repeat_customer',
      'Nora Field,nora@example.com,+15125550155,Roof repair,"Leak after hail, wants quote today",900,4200,high,website,true',
      'Nora Field,nora@example.com,+15125550155,Roof repair,"Leak after hail, wants quote today",900,4200,high,website,true',
    ].join('\n')

    const result = importLeadsCsv(seedData, csv)

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.errors).toEqual([])
    expect(result.records[0]).toMatchObject({
      serviceCategory: 'Roof repair',
      source: 'website',
      repeatCustomer: true,
      status: 'new',
    })
    expect(result.records[0].score).toBeGreaterThan(0)
    expect(result.workspace.customers.find((customer) => customer.email === 'nora@example.com')).toMatchObject({
      consentEmail: false,
      consentSms: false,
      tags: ['csv-import'],
    })
  })

  it('imports review rows, creates risk-scored reviews, and reports row errors', () => {
    const csv = [
      'reviewer_name,email,platform,rating,body,external_review_id,reviewed_at',
      'Kai Stone,kai@example.com,google,1,"Nobody replied about my refund and I may call an attorney.",google-review-1,2026-06-10T10:00:00Z',
      'Broken Row,broken@example.com,google,9,"Bad rating",google-review-2,2026-06-10T10:00:00Z',
    ].join('\n')

    const result = importReviewsCsv(seedData, csv)

    expect(result.imported).toBe(1)
    expect(result.errors).toEqual([{ row: 3, error: 'rating_must_be_1_to_5' }])
    expect(result.records[0]).toMatchObject({
      externalReviewId: 'google-review-1',
      platform: 'google',
      rating: 1,
      status: 'escalated',
    })
    expect(result.records[0].riskScore).toBeGreaterThanOrEqual(70)
  })

  it('imports and scores sales prospects while skipping duplicates and bad rows', () => {
    const csv = [
      'business_name,owner_name,owner_email,phone,website,city,state,industry,google_review_count,average_rating,recent_review_issue,quote_leak_signal,average_job_value,fit_score,next_touch,notes',
      'Austin Roof & Repair,Maria Owner,maria@example.com,+15125550101,https://example-roof.example,Austin,TX,Roofing,84,4.3,"unanswered 2-star review mentions no callback","quote form has no timeline or expectation copy",1800,,,"BidFlow first"',
      'Austin Roof & Repair,Maria Owner,maria@example.com,+15125550101,https://example-roof.example,Austin,TX,Roofing,84,4.3,"duplicate","duplicate",1800,,,',
      'No Contact Owner,,,,,Austin,TX,HVAC,12,4.9,,,250,,,',
      ',Missing Business,missing@example.com,+15125550102,https://missing.example,Austin,TX,HVAC,12,4.9,,,250,,,',
    ].join('\n')

    const result = importProspectsCsv(seedData, csv)

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.errors).toEqual([
      { row: 4, error: 'prospect_contact_required' },
      { row: 5, error: 'business_name_required' },
    ])
    expect(result.records[0]).toMatchObject({
      businessName: 'Austin Roof & Repair',
      ownerEmail: 'maria@example.com',
      city: 'Austin',
      state: 'TX',
      industry: 'Roofing',
      status: 'new',
      nextTouch: 'call',
    })
    expect(result.records[0].fitScore).toBeGreaterThanOrEqual(90)
    expect(result.workspace.salesProspects).toHaveLength(1)
  })
})
