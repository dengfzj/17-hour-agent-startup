# Revenue Ops Playbook 摘要

记录日期：2026-06-11

## 北极星

首批目标不是大规模 self-serve，而是关闭 3-5 个 paid concierge pilot，并用交付证据证明可续费。

## 每日动作

1. 打开 Launch 页面 revenue command center。
2. 查看 open checkout、delivery risk、customer action、renewal evidence。
3. 优先处理 checkout 未付款、交付即将超时、客户已响应但未跟进的事项。
4. 每次销售动作都写入 sales activity ledger。
5. 每次客户确认或结果都写入 outcome ledger。

## 收入证据规则

- 只有 `RevenuePayment` ledger 才是收款证据。
- `SalesSummary.estimatedPipelineValue` 只是 pipeline 估算。
- `PilotOutcome` 是续费证据，不是收款证据。
- recovery link approval 是客户行动证据，不是收款证据。

## 销售节奏

- 新 prospect：生成 outreach pack。
- qualified/contacted：记录触达。
- scope_sent：创建 checkout handoff。
- checkout_sent：下载 order form 并跟进付款。
- won：等待 onboarding 和交付。

## 续费节奏

客户确认首包后，记录：

- won job
- revived quote
- approved review reply
- recovered customer
- repeat booking
- hours saved

这些 evidence 用于下一次续费或升级沟通。
