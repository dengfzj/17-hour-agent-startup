import { ArrowLeft, FileCheck2, ShieldCheck } from 'lucide-react'

const pages = {
  'pilot-terms': {
    title: 'Managed Pilot Terms',
    eyebrow: 'Pilot terms',
    intro:
      'These terms describe the managed BidFlow Local and ReputeLoop pilot workflow: setup, subscription, onboarding, human review, and delivery boundaries.',
    sections: [
      {
        title: 'Pilot Scope',
        items: [
          'Each purchase covers one selected workflow, one business profile, one primary location, and the plan limits shown at checkout.',
          'Setup includes onboarding, material review, CSV preview/import when clean, and one first delivery pack for the selected product.',
          'BidFlow delivery packs are draft estimates, proposal language, and follow-up sequences. Final pricing and scope remain the customer operator responsibility.',
          'ReputeLoop delivery packs are draft review replies, recovery notes, and winback suggestions. Public replies and offers require manager approval.',
        ],
      },
      {
        title: 'Human Approval',
        items: [
          'The product does not automatically send SMS, send email, publish review replies, issue refunds, or bind quotes from customer-submitted materials.',
          'High-risk review language, legal threats, discrimination, safety issues, refunds, or liability admissions require manager review before any external use.',
          'Generated content is an operations draft, not legal, tax, accounting, insurance, hiring, credit, or medical advice.',
        ],
      },
      {
        title: 'Billing',
        items: [
          'Checkout charges the setup fee plus the selected monthly subscription through Stripe.',
          'The customer can cancel the monthly plan through the billing portal after production portal configuration is complete, or through written operator support.',
          'A signed order form or statement of work can override these pilot terms for a specific customer.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy and Consent',
    eyebrow: 'Data handling',
    intro:
      'This page describes how pilot data is handled during onboarding, lead/review import, generated packs, and messaging consent workflows.',
    sections: [
      {
        title: 'Data Collected',
        items: [
          'Checkout collects business name, owner email, website, location, industry, selected plan, Stripe subscription references, and onboarding status.',
          'Onboarding may collect lead CSV, review CSV, or setup notes submitted by the customer through a private token link.',
          'Operators can generate estimates, proposal drafts, review replies, recovery cases, and audit logs from imported customer materials.',
        ],
      },
      {
        title: 'Use and Protection',
        items: [
          'Submitted materials are used to deliver the selected pilot workflow and should not include passwords, API keys, payment card data, or unrelated sensitive records.',
          'Public onboarding token pages show customer-safe summaries only; full submitted material bodies are limited to the internal operator queue.',
          'Production deployment must use managed database storage, access control, backups, and provider credentials before real customer data is processed.',
        ],
      },
      {
        title: 'Consent',
        items: [
          'Outbound email and SMS require customer consent before provider send attempts are made.',
          'Email unsubscribe and Twilio STOP/START inbound routes update consent state and audit records.',
          'Review workflows must not create fake reviews, gate review requests, or incentivize positive reviews.',
        ],
      },
    ],
  },
  refunds: {
    title: 'Refund and Cancellation Policy',
    eyebrow: 'Billing policy',
    intro:
      'This policy keeps the paid pilot commercially clear while leaving room for written customer-specific agreements.',
    sections: [
      {
        title: 'Setup Fee',
        items: [
          'The setup fee covers onboarding, configuration, material review, and first-pack implementation labor.',
          'If work has not started and no onboarding materials have been reviewed, the operator may issue a setup refund on written request.',
          'After implementation work begins, setup refunds are handled case by case or under the signed customer order form.',
        ],
      },
      {
        title: 'Monthly Subscription',
        items: [
          'The monthly subscription renews through Stripe unless canceled.',
          'Cancellation stops future renewals. Access and service obligations can continue through the paid period unless a written agreement says otherwise.',
          'The operator should confirm cancellation, export any agreed delivery materials, and record final pilot outcomes.',
        ],
      },
      {
        title: 'Disputes',
        items: [
          'Customers should contact the operator before filing a payment dispute so delivery records, onboarding status, and refund options can be reviewed.',
          'Stripe records, onboarding submissions, import previews, first-pack timestamps, and delivery-pack approvals are retained as pilot evidence.',
        ],
      },
    ],
  },
} as const

const policyReferences = [
  {
    label: 'FTC Consumer Reviews and Testimonials Rule',
    href: 'https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers',
  },
  {
    label: 'FTC CAN-SPAM compliance guide',
    href: 'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business',
  },
  {
    label: 'FCC TCPA consent revocation order',
    href: 'https://docs.fcc.gov/public/attachments/FCC-24-24A1.pdf',
  },
  {
    label: 'Stripe Customer Portal documentation',
    href: 'https://docs.stripe.com/customer-management',
  },
]

export function LegalView({ pageKey }: { pageKey: string }) {
  const page = pages[pageKey as keyof typeof pages] ?? pages['pilot-terms']

  return (
    <main className="public-legal-shell">
      <section className="section-band legal-page">
        <a className="back-link" href="/buy">
          <ArrowLeft size={16} />
          Back to checkout
        </a>
        <div className="section-heading">
          <div>
            <span className="eyebrow">{page.eyebrow}</span>
            <h2>{page.title}</h2>
          </div>
          <p>{page.intro}</p>
        </div>
        <div className="legal-stack">
          {page.sections.map((section) => (
            <section key={section.title} className="legal-section">
              <div className="panel-title">
                <ShieldCheck size={16} />
                <h3>{section.title}</h3>
              </div>
              <ul className="decision-list">
                {section.items.map((item) => (
                  <li key={item}>
                    <FileCheck2 size={17} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="api-status">
          Operator note: broad self-serve launch still requires counsel-approved terms, privacy policy, refund language, and consent copy.
        </div>
        <div className="legal-references">
          <h3>Policy references</h3>
          <div>
            {policyReferences.map((reference) => (
              <a key={reference.href} href={reference.href} target="_blank" rel="noreferrer">
                {reference.label}
              </a>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
