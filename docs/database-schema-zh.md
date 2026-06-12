# 数据库架构摘要

记录日期：2026-06-11

## 当前持久化路线

当前产品支持两种持久化：

- 本地 JSON workspace。
- Postgres JSONB workspace bridge。

生产建议先使用 Postgres JSONB bridge，等付费 pilot 验证后再拆分 normalized tables。

## 关键对象

- `BusinessProfile`
- `Customer`
- `Lead`
- `Review`
- `SalesProspect`
- `SalesOutreachPack`
- `SalesActivity`
- `SalesCheckoutHandoff`
- `SubscriptionRecord`
- `RevenuePayment`
- `OnboardingRecord`
- `OnboardingSubmission`
- `PilotOutcome`
- `AuditLog`

## 并发和证据保护

- JSON repository 在进程内串行化更新。
- Postgres repository 使用事务和 row lock。
- Stripe webhook、public token 写入、checkout handoff 创建、CSV import、delivery update 和 outcome update 使用 atomic repository update。
- 生产禁用 full workspace overwrite/reset。

## 后续 normalized schema

当真实 paid pilot 证明需求后，优先拆：

1. organizations
2. users
3. customers
4. sales_prospects
5. sales_checkout_handoffs
6. revenue_payments
7. onboarding_records
8. onboarding_submissions
9. pilot_outcomes
10. audit_logs

## 迁移文件

- `db/migrations/001_workspace_jsonb.sql`
