import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  analyzeReview,
  buildEstimate,
  buildFeedbackCase,
  generateFollowUps,
  generateProposal,
  generateRecoveryOffer,
  generateReviewResponse,
  scoreLead,
} from '../domain/engines'
import type { AuditLog, Lead, Review, WorkspaceData } from '../domain/types'
import { seedData } from '../data/seed'
import { exportWorkspacePayload } from '../lib/export'

type WorkspaceState = WorkspaceData & {
  activeProduct: 'portfolio' | 'bidflow' | 'reputeloop' | 'onboarding' | 'launch'
  setActiveProduct: (value: WorkspaceState['activeProduct']) => void
  addLead: (input: Omit<Lead, 'id' | 'score' | 'nextStep' | 'createdAt' | 'status'>) => void
  generateLeadAssets: (leadId: string) => void
  markLeadWon: (leadId: string) => void
  addReview: (input: Omit<Review, 'id' | 'riskScore' | 'sentimentScore' | 'status' | 'reviewedAt'>) => void
  generateReviewAssets: (reviewId: string) => void
  approveReviewResponse: (responseId: string) => void
  exportData: () => void
  resetWorkspace: () => void
}

const makeId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

function audit(action: string, entityType: string, entityId: string, summary: string): AuditLog {
  return {
    id: makeId('audit'),
    actor: 'Operator',
    action,
    entityType,
    entityId,
    summary,
    createdAt: new Date().toISOString(),
  }
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      ...seedData,
      activeProduct: 'portfolio',
      setActiveProduct: (value) => set({ activeProduct: value }),
      addLead: (input) => {
        const rawLead = {
          ...input,
          id: makeId('lead'),
          status: 'new' as const,
          createdAt: new Date().toISOString(),
        }
        const scored = { ...rawLead, ...scoreLead(rawLead, get().customers) }
        set((state) => ({
          leads: [scored, ...state.leads],
          auditLogs: [
            audit('created_lead', 'lead', scored.id, `Created and scored ${scored.serviceCategory} lead at ${scored.score}.`),
            ...state.auditLogs,
          ],
        }))
      },
      generateLeadAssets: (leadId) => {
        const state = get()
        const lead = state.leads.find((item) => item.id === leadId)
        if (!lead) return
        const customer = state.customers.find((item) => item.id === lead.customerId)
        if (!customer) return
        const estimate = buildEstimate(lead, state.business)
        const proposal = generateProposal(lead, customer, estimate, state.business)
        const followUps = generateFollowUps(lead, customer, estimate)
        set((current) => ({
          estimates: [estimate, ...current.estimates.filter((item) => item.leadId !== leadId)],
          proposals: [proposal, ...current.proposals.filter((item) => item.leadId !== leadId)],
          followUps: [...followUps, ...current.followUps.filter((item) => item.leadId !== leadId)],
          leads: current.leads.map((item) => (item.id === leadId ? { ...item, status: 'quoted' } : item)),
          auditLogs: [
            audit('generated_bidflow_assets', 'lead', leadId, 'Generated estimate, proposal, and follow-up sequence.'),
            ...current.auditLogs,
          ],
        }))
      },
      markLeadWon: (leadId) => {
        set((state) => ({
          leads: state.leads.map((lead) => (lead.id === leadId ? { ...lead, status: 'won' } : lead)),
          estimates: state.estimates.map((estimate) =>
            estimate.leadId === leadId ? { ...estimate, status: 'accepted' } : estimate,
          ),
          auditLogs: [audit('marked_won', 'lead', leadId, 'Lead marked won and estimate accepted.'), ...state.auditLogs],
        }))
      },
      addReview: (input) => {
        const rawReview = {
          ...input,
          id: makeId('review'),
          reviewedAt: new Date().toISOString(),
        }
        const analyzed = { ...rawReview, ...analyzeReview(rawReview) }
        set((state) => ({
          reviews: [analyzed, ...state.reviews],
          auditLogs: [
            audit('imported_review', 'review', analyzed.id, `Imported ${analyzed.rating}-star review with risk ${analyzed.riskScore}.`),
            ...state.auditLogs,
          ],
        }))
      },
      generateReviewAssets: (reviewId) => {
        const state = get()
        const review = state.reviews.find((item) => item.id === reviewId)
        if (!review) return
        const customer = state.customers.find((item) => item.id === review.customerId)
        if (!customer) return
        const response = generateReviewResponse(review, customer, state.business)
        const caseItem = review.rating <= 3 || review.riskScore >= 50 ? buildFeedbackCase(review, customer) : undefined
        const offer = caseItem ? generateRecoveryOffer(caseItem, customer, state.business) : undefined
        set((current) => ({
          reviewResponses: [response, ...current.reviewResponses.filter((item) => item.reviewId !== reviewId)],
          feedbackCases: caseItem
            ? [caseItem, ...current.feedbackCases.filter((item) => item.reviewId !== reviewId)]
            : current.feedbackCases,
          recoveryOffers: offer
            ? [offer, ...current.recoveryOffers.filter((item) => item.feedbackCaseId !== caseItem?.id)]
            : current.recoveryOffers,
          reviews: current.reviews.map((item) =>
            item.id === reviewId ? { ...item, status: item.riskScore >= 70 ? 'escalated' : 'response_drafted' } : item,
          ),
          auditLogs: [
            audit(
              'generated_reputeloop_assets',
              'review',
              reviewId,
              caseItem ? 'Generated response, recovery case, and offer.' : 'Generated compliant review response.',
            ),
            ...current.auditLogs,
          ],
        }))
      },
      approveReviewResponse: (responseId) => {
        set((state) => ({
          reviewResponses: state.reviewResponses.map((response) =>
            response.id === responseId ? { ...response, status: 'approved' } : response,
          ),
          auditLogs: [
            audit('approved_review_response', 'review_response', responseId, 'Review response approved for posting.'),
            ...state.auditLogs,
          ],
        }))
      },
      exportData: () => exportWorkspacePayload(get()),
      resetWorkspace: () => set({ ...seedData, activeProduct: 'portfolio' }),
    }),
    {
      name: 'local-growth-os-workspace',
      partialize: (state) => {
        const persisted = { ...state }
        delete (persisted as Partial<WorkspaceState>).activeProduct
        return persisted
      },
    },
  ),
)
