import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardCheck,
  Download,
  FileText,
  Languages,
  Megaphone,
  Milestone,
  RefreshCcw,
  ShieldCheck,
  Star,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import { formatCurrency } from '../domain/engines'
import { languageStorageKey, readInitialLanguage, useRuntimeLocalization, type UiLanguage } from '../lib/i18n'
import { BidFlowView } from './BidFlowView'
import { BuyView } from './BuyView'
import { LaunchView } from './LaunchView'
import { LegalView } from './LegalView'
import { OnboardingView } from './OnboardingView'
import { PortfolioView } from './PortfolioView'
import { RecoveryLinkView } from './RecoveryLinkView'
import { ReputeLoopView } from './ReputeLoopView'

const navItems = [
  { key: 'portfolio', label: 'Portfolio', icon: BarChart3 },
  { key: 'bidflow', label: 'BidFlow', icon: FileText },
  { key: 'reputeloop', label: 'ReputeLoop', icon: Star },
  { key: 'onboarding', label: 'Onboarding', icon: Milestone },
  { key: 'launch', label: 'Launch', icon: Megaphone },
] as const

export function AppShell() {
  const [language, setLanguage] = useState<UiLanguage>(readInitialLanguage)
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  const isPublicBuy = pathname === '/buy'
  const legalPageKey = pathname.startsWith('/legal/') ? decodeURIComponent(pathname.split('/').filter(Boolean)[1] ?? '') : undefined
  const publicOnboardingToken =
    pathname.startsWith('/onboarding/')
      ? decodeURIComponent(pathname.split('/').filter(Boolean)[1] ?? '')
      : undefined
  const publicRecoveryToken =
    pathname.startsWith('/recovery/')
      ? decodeURIComponent(pathname.split('/').filter(Boolean)[1] ?? '')
      : undefined
  const activeProduct = useWorkspaceStore((state) => state.activeProduct)
  const setActiveProduct = useWorkspaceStore((state) => state.setActiveProduct)
  const exportData = useWorkspaceStore((state) => state.exportData)
  const resetWorkspace = useWorkspaceStore((state) => state.resetWorkspace)
  const business = useWorkspaceStore((state) => state.business)
  const leads = useWorkspaceStore((state) => state.leads)
  const estimates = useWorkspaceStore((state) => state.estimates)
  const reviews = useWorkspaceStore((state) => state.reviews)
  const campaigns = useWorkspaceStore((state) => state.campaigns)

  const openPipeline = leads.filter((lead) => !['won', 'lost'].includes(lead.status)).length
  const quotedValue = estimates.reduce((sum, estimate) => sum + estimate.total, 0)
  const reviewRisk = reviews.filter((review) => review.riskScore >= 50).length
  const projectedCampaignRevenue = campaigns.reduce((sum, campaign) => sum + campaign.projectedRevenue, 0)

  useRuntimeLocalization(language)

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language)
  }, [language])

  const toggleLanguage = () => setLanguage((current) => (current === 'zh' ? 'en' : 'zh'))

  if (isPublicBuy) {
    return (
      <>
        <LanguageToggle language={language} onToggle={toggleLanguage} publicMode />
        <BuyView />
      </>
    )
  }

  if (legalPageKey) {
    return (
      <>
        <LanguageToggle language={language} onToggle={toggleLanguage} publicMode />
        <LegalView pageKey={legalPageKey} />
      </>
    )
  }

  if (publicOnboardingToken) {
    return (
      <>
        <LanguageToggle language={language} onToggle={toggleLanguage} publicMode />
        <main className="public-onboarding-shell">
          <OnboardingView accessToken={publicOnboardingToken} />
        </main>
      </>
    )
  }

  if (publicRecoveryToken) {
    return (
      <>
        <LanguageToggle language={language} onToggle={toggleLanguage} publicMode />
        <RecoveryLinkView token={publicRecoveryToken} />
      </>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">LG</div>
          <div>
            <span className="eyebrow">Local Growth OS</span>
            <h1>{business.name}</h1>
          </div>
        </div>

        <nav className="product-nav" aria-label="Product views">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                className={clsx('nav-button', activeProduct === item.key && 'active')}
                type="button"
                onClick={() => setActiveProduct(item.key)}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-panel">
          <div className="panel-title">
            <ShieldCheck size={16} />
            <span>Commercial Guardrails</span>
          </div>
          <p>Human approval remains required for binding quotes, public review replies, SMS sends, and recovery offers.</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">{business.industry}</span>
            <h2>Revenue operations cockpit</h2>
          </div>
          <div className="topbar-actions">
            <LanguageToggle language={language} onToggle={toggleLanguage} />
            <button type="button" className="icon-button" onClick={exportData} title="Export workspace JSON">
              <Download size={18} />
            </button>
            <button type="button" className="icon-button" onClick={resetWorkspace} title="Reset sample workspace">
              <RefreshCcw size={18} />
            </button>
          </div>
        </header>

        <section className="metric-strip" aria-label="Business metrics">
          <Metric icon={<BriefcaseBusiness size={18} />} label="Open pipeline" value={String(openPipeline)} />
          <Metric icon={<FileText size={18} />} label="Quoted value" value={formatCurrency(quotedValue)} />
          <Metric icon={<ShieldCheck size={18} />} label="Review risk queue" value={String(reviewRisk)} />
          <Metric icon={<ClipboardCheck size={18} />} label="Campaign upside" value={formatCurrency(projectedCampaignRevenue)} />
        </section>

        {activeProduct === 'portfolio' && <PortfolioView />}
        {activeProduct === 'bidflow' && <BidFlowView />}
        {activeProduct === 'reputeloop' && <ReputeLoopView />}
        {activeProduct === 'onboarding' && <OnboardingView />}
        {activeProduct === 'launch' && <LaunchView />}
      </main>
    </div>
  )
}

function LanguageToggle({
  language,
  onToggle,
  publicMode = false,
}: {
  language: UiLanguage
  onToggle: () => void
  publicMode?: boolean
}) {
  const nextLabel = language === 'zh' ? 'EN' : '中文'
  const title = language === 'zh' ? 'Switch to English' : 'Switch to Chinese'

  return (
    <button
      type="button"
      className={clsx('language-toggle', publicMode && 'public-language-toggle')}
      onClick={onToggle}
      title={title}
      aria-label={title}
    >
      <Languages size={16} />
      <span>{nextLabel}</span>
    </button>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}
