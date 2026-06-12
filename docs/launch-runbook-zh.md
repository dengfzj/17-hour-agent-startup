# Launch Runbook 摘要

记录日期：2026-06-11

## 目的

本 runbook 用于把 Local Growth OS 从本地产品推进到真实 paid concierge pilot 的上线前检查。

## 必要环境

- `NODE_ENV=production`
- `DATABASE_URL`
- `PUBLIC_API_BASE_URL`
- `APP_ORIGIN`
- `JWT_PUBLIC_KEY`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_*`

## 检查顺序

```bash
npm run doctor:production
npm run launch:readiness
npm run launch:smoke -- https://your-public-app.example
npm run launch:packet
```

## scoped pilot 默认规则

- `ENABLE_PUBLIC_SELF_SERVE_CHECKOUT=false`
- 只向已经确认 scope 的 prospect 发送 `/buy?handoff=`。
- 下载 order form 后再发给客户。
- provider advisories 未完成时，只能承诺人工 email/call/CSV 导入，不承诺自动 email/SMS/Google。

## 上线前阻塞项

- 非 HTTPS 公网 URL。
- 缺 Postgres。
- 缺 JWT 生产配置。
- 缺 live Stripe。
- 缺 webhook secret。
- 缺 `price_` plan IDs。

## 上线后首日

1. 导入 prospect list。
2. 记录每次销售活动。
3. scope_sent 后创建 checkout handoff。
4. 下载并发送 order form。
5. 等 Stripe webhook paid。
6. 进入 onboarding 和首包交付。
