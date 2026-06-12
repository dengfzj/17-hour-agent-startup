# Research and Selection Memo

Date: 2026-06-10

## Executive Decision

The first two money-making projects are:

1. **BidFlow Local**: a revenue desk for local service businesses that scores inbound leads, drafts estimates, generates proposals, and schedules follow-up.
2. **ReputeLoop**: a compliant reputation and winback desk that imports reviews, scores public risk, drafts manager-safe replies, opens recovery cases, and estimates repeat-purchase upside.

These were selected because they connect directly to cash: faster quote response can win more service jobs, and better review/recovery operations can protect conversion and repeat revenue.

## Sub-Agent Organization

The work was split like a mid-sized company operating pod:

| Function | Sub-agent role | Output |
|---|---|---|
| Strategy | Market trends researcher | 10 candidate software directions with current evidence, pricing anchors, competitors, and top recommendations. |
| Revenue | Demand and purchase-intent analyst | SMB/ecommerce/creator pain points, alternative prices, willingness-to-pay reasons, and acquisition channels. |
| Investment / Risk | Portfolio reviewer | Weighted scoring model across demand, willingness to pay, competition, build complexity, compliance, CAC, speed, and ceiling. |
| Product / QA | Product director and QA reviewer | Gated the product against "not a demo" criteria and identified build blockers. |
| Engineering | Main implementation agent | Built the local product workbench, rule engines, tests, docs, and launch plan. |

## Market Signals Used

- **Software and AI spend remain strong.** Gartner's public October 2025 forecast expected worldwide IT spending to exceed $6 trillion in 2026, with software and AI-related spend as major drivers. Later 2026 market summaries report further upward revisions, so the macro direction is favorable for narrow workflow software.
- **SMBs are buying practical AI workflows.** Intuit QuickBooks' 2026 AI impact reporting shows small businesses using AI in marketing, service, and admin workflows, but with trust and privacy concerns. This favors narrow, auditable products over generic agents.
- **Reviews are still a buying gate.** BrightLocal's 2026 Local Consumer Review Survey reports that 97% of consumers read reviews for local businesses, making review operations a measurable conversion lever.
- **Review compliance matters.** The FTC final rule announced in August 2024 bans fake reviews and testimonials and allows civil penalties. ReputeLoop therefore avoids review gating, fake reviews, and incentive-for-review workflows.
- **Proposal/RFP automation has validated demand.** RFP and proposal products such as Loopio, Responsive, and AutogenAI show that revenue teams pay for faster, more consistent response workflows. BidFlow adapts that logic to local-service quoting, where setup and acquisition are simpler.

## Candidate Ranking

| Direction | Result | Why |
|---|---|---|
| Local service quote/proposal/follow-up automation | Selected | Clear ROI, low compliance risk, fast pilot sales, simple setup fee path. |
| Compliant review response, recovery, and repeat purchase desk | Selected | Review-driven demand, direct local-business pain, compliance creates differentiation. |
| AI search / GEO brand monitoring | Deferred | Good early trend, but less direct near-term revenue for first customers. |
| Shadow AI / SaaS spend governance | Deferred | Strong B2B pain, but slower sales cycle and more security posture required. |
| Shopify returns/fraud assistant | Deferred | Strong ROI but platform app competition and logistics complexity are higher. |
| Generic AI writing / chatbot / prompt tool | Rejected | High competition, weak moat, platform risk. |
| Medical, legal, tax, hiring, credit, insurance decision AI | Rejected | High compliance and liability burden. |
| Fake review generation or review gating | Rejected | Conflicts with FTC rule and long-term trust. |

## Selected Product One: BidFlow Local

Target customers:

- Home repair, roofing, cleaning, landscaping, field services, small contractors.
- Boutique B2B service firms that still quote by spreadsheet and email.

Paid promise:

- Respond faster to high-intent leads.
- Increase quote-to-job conversion.
- Reduce owner time spent writing estimates and follow-ups.

Pricing hypothesis:

- Starter: $49/month
- Growth: $149/month
- Pro: $299/month
- Setup fee: $299-$999

## Selected Product Two: ReputeLoop

Target customers:

- Local businesses where reviews influence purchase: home services, clinics, beauty, repair, restaurants, fitness.

Paid promise:

- Protect conversion by replying to reviews quickly and safely.
- Escalate risky reviews before public replies make them worse.
- Win back dissatisfied or dormant customers with compliant offers.

Pricing hypothesis:

- Starter: $39/month
- Growth: $99/month
- Pro: $199/month
- Setup fee: $199-$699

## Source Links

- Gartner IT spending forecast, 2025-10-22: https://www.gartner.com/en/newsroom/press-releases/2025-10-22-gartner-forecasts-worldwide-it-spending-to-grow-9-point-8-percent-in-2026-exceeding-6-trillion-dollars-for-the-first-time
- BrightLocal Local Consumer Review Survey 2026: https://www.brightlocal.com/research/local-consumer-review-survey/
- FTC fake reviews final rule announcement, 2024-08-14: https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials
- Federal Register consumer reviews rule, 2024-08-22: https://www.federalregister.gov/documents/2024/08/22/2024-18519/trade-regulation-rule-on-the-use-of-consumer-reviews-and-testimonials
- Intuit QuickBooks AI Impact Report: https://quickbooks.intuit.com/r/small-business-data/ai-impact-report/
- BrightLocal pricing reference: https://www.brightlocal.com/
- Jobber pricing reference: https://getjobber.com/pricing/
