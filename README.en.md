# Local Growth OS: A 17-Hour AI Autonomous Business-Building Experiment

Language: [中文](./README.zh-CN.md) | **English**

> I gave Codex / GPT-5.5 an open-ended task:
>
> “Spin up sub-agents, research current market trends, pick two money-making product ideas, design the products, build them, test them, and keep going until they look like real deliverables instead of demos.”
>
> Then it ran for roughly 17 hours.
>
> My main job was not writing code. I mostly watched, interrupted, constrained the scope, reviewed the output, and tried to stop it from expanding forever. Just getting it to brake and converge took about an hour.

This repository is the raw output of that experiment.

I did not polish it into a normal startup repository. I did not rewrite it into a clean commercial SaaS launch. I am open-sourcing it as an experiment: a real artifact showing what happens when a modern AI coding agent is allowed to run a long, open-ended “build something that could make money” task.

## What This Experiment Is

This is an experiment in AI agent autonomy.

The original goal was roughly:

- search the web for current trends and market signals;
- use multiple sub-agents for business research;
- use other sub-agents for critique, review, and validation;
- choose two business directions that could plausibly make money;
- design the products;
- build the frontend, backend, data model, and operating workflow;
- add tests, documentation, work logs, and delivery notes;
- produce a realistic next-step plan for taking the products into the real world;
- avoid making a shallow demo.

The AI eventually converged on a system called **Local Growth OS**.

It is not a single small tool. It is a local-business revenue workbench with two product directions:

1. **BidFlow Local**
   A workflow for local service businesses: lead scoring, estimates, proposals, quote follow-up, customer confirmation, and paid-pilot handoff.
2. **ReputeLoop**
   A workflow for reputation-dependent local businesses: review risk scoring, compliant public reply drafts, recovery cases, winback offers, and paid-pilot handoff.

## Why I Am Open-Sourcing It

I think this repository is more interesting as an AI experiment than as a polished commercial product.

It helps explore questions like:

- Can an AI agent work on a long-running product task?
- How does it break down a vague “make money” prompt?
- What markets does it choose?
- How does it coordinate research, engineering, review, and documentation?
- Does it overbuild?
- Can it write code, tests, product docs, launch docs, and work logs by itself?
- What does the human still need to do?
- How close is “AI builds a business” to reality?

My current take: AI is very strong at expansion, synthesis, implementation, documentation, and workflow design. But it is also prone to scope creep, over-engineering, and mistaking product-shaped output for business validation.

The hard parts are still real-world customers, sales, payments, delivery, trust, compliance, and responsibility.

So the point of this repo is not “AI made money for me.” The point is:

> AI spent about 17 hours generating a product-shaped operating system for two money-oriented local-business workflows, and this repository preserves the result.

## What It Produced

The AI produced:

- React / TypeScript / Vite frontend;
- Express API;
- local JSON workspace persistence;
- Postgres JSONB persistence bridge;
- BidFlow Local workflow;
- ReputeLoop workflow;
- Launch page;
- Buy page;
- Onboarding page;
- Recovery page;
- Legal pages;
- runtime Chinese/English UI switching;
- Stripe Checkout / Webhook boundaries;
- paid pilot order forms;
- delivery evidence;
- revenue ledger;
- outcome ledger;
- production readiness checks;
- launch runbook;
- bilingual documentation;
- work logs and audit notes.

The current quality gates for this snapshot are:

```bash
npm run lint
npm test
npm run build
```

Latest local validation result:

- 18 test files passed;
- 135 tests passed;
- production build passed.

## What It Did Not Do

This experiment did not complete real-world business operations.

The AI did not:

- deploy the app to a public production URL;
- configure a real Stripe account;
- create real Stripe products, prices, webhooks, or portal settings;
- contact real customers;
- send real sales emails;
- run ads;
- collect real payments;
- modify a real Google Business Profile;
- publish real review replies;
- deliver work to real paying customers.

All customer, payment, webhook, and provider behavior stayed inside local code, tests, mocks, fixtures, or documentation.

So please do not read this as “AI successfully launched a business.” A more accurate description is:

> AI generated a codebase and operating workflow that looks suitable for a controlled paid concierge pilot, but the real-world business work has not happened yet.

## The Interesting Part

The most interesting part is not a single page or feature. It is the overall business workflow the AI tried to construct:

```text
Market research
  ↓
Product selection
  ↓
Product definition
  ↓
Engineering implementation
  ↓
Sales workflow
  ↓
Payment handoff
  ↓
Customer onboarding
  ↓
First delivery pack
  ↓
Customer outcome tracking
  ↓
Renewal evidence
```

It did not stop at “make a web app.” It tried to model the entire chain from prospecting to payment to delivery evidence.

That is what makes the experiment interesting: the AI was not just building software; it was attempting to build a small-company operating system.

## The Two Product Directions

### BidFlow Local

Target users: local service businesses.

Typical problems:

- leads come in but response is slow;
- quotes are sent but not followed up;
- proposals are unclear;
- owners forget second touches;
- high-value jobs leak out of the funnel.

The AI-designed solution includes:

- lead import;
- lead scoring;
- estimate generation;
- proposal generation;
- follow-up recommendations;
- recovery links;
- paid pilot handoff;
- onboarding;
- first-pack delivery;
- outcome ledger.

### ReputeLoop

Target users: local businesses that depend on reviews and local reputation.

Typical problems:

- negative reviews are not handled quickly;
- replies sound generic or risky;
- customer recovery has no process;
- owners do not know which reviews are high-risk;
- local reputation affects conversion.

The AI-designed solution includes:

- review import;
- risk scoring;
- compliant reply drafts;
- feedback cases;
- recovery offers;
- Google Business Profile adapter;
- recovery links;
- onboarding;
- first-pack delivery;
- outcome ledger.

## Tech Stack

- Frontend: React 19, Vite, TypeScript, Zustand, Dexie, Recharts, Lucide React
- Backend: Node.js, Express 5, TypeScript, Zod, Jose, Stripe, pg
- Quality: Vitest, Testing Library, Supertest, ESLint, Playwright

## Running Locally

Requirements:

- Node.js 20.19+, 22.12+, or 24+
- npm

Install dependencies:

```bash
npm install
```

Run frontend and API together:

```bash
npm run dev:full
```

This starts two local services:

- Frontend: `http://127.0.0.1:5173`
- API health check: `http://127.0.0.1:8787/api/health`

In local development, `npm run api` is intentionally API-only. Opening `http://127.0.0.1:8787/` directly is expected to return an API 404 page instead of the frontend. Use `5173` for the UI.

You can also run the two services separately:

```bash
npm run api
npm run dev
```

Production-style single service:

```bash
npm run build
npm run start
```

In production-style mode, the backend serves the built frontend from `dist/` and exposes the API from the same service.

The app includes a global Chinese/English toggle. Language preference is stored locally in the browser and does not rewrite user-entered business data, CSV contents, emails, URLs, or numeric values.

## Environment

Copy the example file and configure only what you need:

```bash
cp .env.example .env
```

Local development can use the default JSON workspace. Before a real pilot or deployment, configure `PUBLIC_API_BASE_URL`, `APP_ORIGIN`, `DATABASE_URL`, production JWT settings, a live Stripe key, Stripe webhook secret, and `STRIPE_PRICE_*`. Configure email, SMS, or Google review provider variables only when those capabilities are actually promised.

## Quality Checks

```bash
npm run lint
npm test
npm run build
npm run doctor:production
npm run launch:readiness
npm run launch:smoke -- https://your-public-app.example
npm run launch:packet
npm run stripe:bootstrap
```

Passing these checks does not mean the product has made money. It only means the codebase is closer to being deployable and pilot-ready.

## Documentation

- [2026-06-14 update note](./docs/update-2026-06-14-en.md)
- [Product manual](./docs/product-manual-en.md)
- [Real-world launch plan](./docs/real-world-launch-plan-en.md)
- [Launch runbook](./docs/launch-runbook-en.md)
- [Revenue operations playbook](./docs/revenue-ops-playbook-en.md)
- [Research and selection memo](./docs/research-and-selection-en.md)
- [Database schema](./docs/database-schema-en.md)
- [Final delivery brief](./docs/final-delivery-en.md)
- [Documentation index](./docs/documentation-index-en.md)

Chinese documentation is also available in `docs/*-zh.md`.

## Open Source Notes

This repository is published as-is as an experimental artifact.

You can treat it as:

- an AI agent long-task sample;
- an autonomous product development case study;
- a business-research-plus-engineering artifact;
- a half-finished local-business growth SaaS;
- a human-AI collaboration record;
- a Codex / GPT-5.5 long-running work sample.

You should not treat it as:

- a validated business model;
- a product that has already made money;
- a mature public self-serve SaaS;
- a compliance-reviewed marketing automation platform;
- an unattended AI business.

## Important Before Deployment

Before using or deploying this project, check:

- `.env` and secrets are removed;
- Stripe is configured intentionally;
- webhooks are real and reachable;
- JWT / auth is production-ready;
- Postgres is configured;
- email, SMS, and Google Business Profile integrations are authorized;
- legal terms, privacy policy, and refund policy match your jurisdiction;
- test data, mock data, private tokens, and internal notes are not accidentally exposed.

## Compliance Boundaries

- Do not generate fake reviews.
- Do not gate review requests to only happy customers.
- Do not offer discounts, refunds, or benefits in exchange for positive reviews.
- Do not publish high-risk public replies without human approval.
- Do not send SMS or email campaigns without consent and unsubscribe handling.
- Public token links expose only customer-safe views; production multi-instance deployments should use edge/WAF/Redis-backed rate limiting.

## My Takeaway

This experiment made the boundary clearer for me.

AI can already do a surprising amount of product management, research, engineering, documentation, and QA work. It can push a vague idea into something that looks like a product very quickly.

But it does not replace the human responsibility layer.

It does not automatically create customer trust. It does not validate a market. It does not collect real revenue by itself. It does not take legal responsibility. It does not operate a business in the real world.

This repository is a field record of that boundary.

## License

This project is open source under the [MIT License](./LICENSE).
