# 真实世界投入计划

记录日期：2026-06-11

## 原则

真实世界部署、推广、销售、收款由你执行。产品当前只提供成熟的本地和生产形态代码、文档、检查命令和操作路径。

## 第 1 步：部署

1. 推送代码到 GitHub/GitLab/Bitbucket。
2. 使用 `render.yaml` 或等效平台部署 Node 服务。
3. 配置 Postgres。
4. 设置 `PUBLIC_API_BASE_URL` 和 `APP_ORIGIN`。
5. 配置 JWT auth。

## 第 2 步：Stripe

1. 配置 live `STRIPE_SECRET_KEY`。
2. 运行 `npm run stripe:bootstrap` 创建或复用价格。
3. 设置 `STRIPE_PRICE_*`。
4. 配置 `STRIPE_WEBHOOK_SECRET`。
5. 把 webhook 指向 `${PUBLIC_API_BASE_URL}/api/billing/webhook`。

## 第 3 步：上线检查

```bash
npm run doctor:production
npm run launch:readiness
npm run launch:smoke -- https://your-public-app.example
npm run launch:packet
```

## 第 4 步：首批销售

1. 用 `docs/examples/prospect-list-template.csv` 准备 50-200 个 prospect。
2. 先找高客单本地服务商卖 BidFlow。
3. 再找评价依赖型商家卖 ReputeLoop。
4. 每个 prospect 必须先有 scope，再创建 handoff。
5. 下载 order form 给客户确认。
6. 客户从 `/buy?handoff=` 进入 Stripe。

## 第 5 步：交付

1. 只在 Stripe webhook paid 后开始交付。
2. 给客户 onboarding 链接。
3. 客户提交 lead CSV、review CSV 或说明。
4. 操作者预览和导入。
5. 生成首包。
6. QA 后发送。
7. 收集客户确认。
8. 记录 outcome ledger。

## 第 6 步：扩展

先证明 3-5 个付费 pilot，再接入 email/SMS/Google 自动化。不要在没有 consent、provider 配置和客户授权前承诺自动发送或自动发布。
