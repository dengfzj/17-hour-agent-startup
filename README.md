# Local Growth OS: 17-Hour Agent Startup

[中文](./README.zh-CN.md) | [English](./README.en.md)

This repository is the open-source artifact of a roughly 17-hour Codex / GPT-5.5 autonomous business-building experiment.

I asked an AI agent to research current market signals, choose two product ideas that could plausibly make money, design them, build them, test them, document them, and keep going until the result looked closer to a real paid-pilot deliverable than a demo.

The result is **Local Growth OS**, a local-business revenue workbench with two product directions:

- **BidFlow Local**: lead scoring, estimates, proposals, quote follow-up, customer confirmation, and paid-pilot handoff.
- **ReputeLoop**: review risk scoring, compliant reply drafts, recovery cases, winback offers, and paid-pilot handoff.

This is published as an AI-agent long-task field record, not as a validated SaaS business.

中文说明见 [README.zh-CN.md](./README.zh-CN.md). English documentation is available in [README.en.md](./README.en.md).

Latest update notes: [中文](./docs/update-2026-06-14-zh.md) | [English](./docs/update-2026-06-14-en.md).

Quick local start:

```bash
npm install
npm run dev:full
```

Open the UI at `http://127.0.0.1:5173`. Check the API at `http://127.0.0.1:8787/api/health`.

License: [MIT](./LICENSE)
