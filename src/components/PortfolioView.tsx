import { CheckCircle2, ExternalLink, TrendingUp, XCircle } from 'lucide-react'
import { useWorkspaceStore } from '../store/workspace'

const rejectedDirections = [
  'Generic AI writing tools: weak switching cost and platform feature risk.',
  'Medical, legal, tax, hiring, credit, or insurance decision automation: high liability and compliance load.',
  'Fake review generation, review gating, or paid positive reviews: directly conflicts with FTC enforcement.',
  'Crypto trading signals or return-promise products: trust cost and regulatory risk are too high for this build.',
]

export function PortfolioView() {
  const directions = useWorkspaceStore((state) => state.directions)
  const sources = useWorkspaceStore((state) => state.researchSources)
  const auditLogs = useWorkspaceStore((state) => state.auditLogs)

  return (
    <div className="view-stack">
      <section className="section-band">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Selection memo</span>
            <h2>Two products chosen for immediate paid pilots</h2>
          </div>
          <p>
            The portfolio favors narrow B2B workflows with measurable revenue impact, low compliance exposure, and fast
            owner-led sales cycles.
          </p>
        </div>

        <div className="direction-grid">
          {directions.map((direction) => (
            <article className="direction-card" key={direction.id}>
              <div className="direction-score">
                <TrendingUp size={20} />
                <strong>{direction.weightedScore}</strong>
              </div>
              <h3>{direction.name}</h3>
              <p>{direction.whyNow}</p>
              <dl className="compact-dl">
                <div>
                  <dt>Target</dt>
                  <dd>{direction.targetCustomers}</dd>
                </div>
                <div>
                  <dt>Price anchor</dt>
                  <dd>{direction.priceAnchor}</dd>
                </div>
              </dl>
              <div className="score-bars">
                <Score label="Market" value={direction.marketScore} />
                <Score label="Payment" value={direction.willingnessToPayScore} />
                <Score label="Build" value={direction.buildComplexityScore} />
                <Score label="Compliance" value={direction.complianceScore} />
              </div>
              <ul className="risk-list">
                {direction.risks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="two-column">
        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Rejected</span>
            <h2>Directions deliberately avoided</h2>
          </div>
          <ul className="decision-list">
            {rejectedDirections.map((item) => (
              <li key={item}>
                <XCircle size={17} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="section-band">
          <div className="section-heading tight">
            <span className="eyebrow">Evidence</span>
            <h2>Research sources</h2>
          </div>
          <div className="source-list">
            {sources.map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" key={source.url} className="source-link">
                <div>
                  <strong>{source.publisher}</strong>
                  <span>
                    {source.title} · {source.date}
                  </span>
                  <p>{source.note}</p>
                </div>
                <ExternalLink size={16} />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading tight">
          <span className="eyebrow">Traceability</span>
          <h2>Working log</h2>
        </div>
        <div className="audit-table">
          {auditLogs.slice(0, 8).map((log) => (
            <div className="audit-row" key={log.id}>
              <CheckCircle2 size={17} />
              <div>
                <strong>{log.action}</strong>
                <span>{log.summary}</span>
              </div>
              <time>{new Date(log.createdAt).toLocaleString()}</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-row">
      <span>{label}</span>
      <div className="score-track">
        <div style={{ width: `${value * 20}%` }} />
      </div>
      <strong>{value}/5</strong>
    </div>
  )
}
